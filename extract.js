// Extrakce textu a označených slov (bold / highlight anotace / barevné pozadí) z PDF pomocí pdf.js.
// Funguje v prohlížeči i v Node (dostane objekt pdfjs a načtený dokument).
const BOLD_RE = /bold|black|heavy|semibold|demi|extrabold/i;

function isHighlightColor(r, g, b) {
  // žlutá/zelená/růžová/oranžová/azurová zvýrazňovací barva: jasná a sytá, ne bílá/šedá/černá
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max > 0.6 && max - min > 0.25;
}

function overlap(a, b) { // a,b = [x0,y0,x1,y1]; podíl plochy a, která leží v b
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / ((a[2] - a[0]) * (a[3] - a[1]) || 1);
}

async function pageFillRects(pdfjs, page) {
  const { OPS } = pdfjs;
  const ops = await page.getOperatorList();
  const rects = [];
  let ctm = [1, 0, 0, 1, 0, 0], fill = [0, 0, 0];
  const stack = [];
  let pendingPath = null;
  const FILL_OPS = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke];
  const paint = (mm) => {
    if (!isHighlightColor(...fill)) return;
    const m = ctm, [x0, y0, x1, y1] = mm;
    const pts = [[x0, y0], [x1, y1]].map(([x, y]) => [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]]);
    const r = [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])];
    if (r[2] - r[0] < 300 && r[3] - r[1] < 40) rects.push(r); // zahodit velké plochy (pozadí)
  };
  const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === OPS.save) stack.push([ctm, fill]);
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) [ctm, fill] = s; }
    else if (fn === OPS.transform) ctm = mul(ctm, a);
    else if (fn === OPS.setFillRGBColor) {
      if (typeof a[0] === 'string') { const h = a[0].replace('#', ''); fill = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255); }
      else fill = Array.from(a).map((v) => (v > 1 ? v / 255 : v));
    } else if (fn === OPS.setFillGray) fill = [a[0], a[0], a[0]].map((v) => (v > 1 ? v / 255 : v));
    else if (fn === OPS.constructPath) {
      // pdf.js 4.x: a = [ops, coords, minMax], malování zvlášť; pdf.js 6.x: a = [paintOp, [path], minMax]
      const mm = a[2];
      if (typeof a[0] === 'number') { if (FILL_OPS.includes(a[0]) && mm) paint(mm); }
      else if (mm) pendingPath = mm;
    } else if (FILL_OPS.includes(fn)) { if (pendingPath) paint(pendingPath); pendingPath = null; }
    else if (fn === OPS.endPath || fn === OPS.stroke || fn === OPS.closeStroke) pendingPath = null;
  }
  return rects;
}

export async function extractPdf(pdfjs, doc) {
  const pages = [];
  for (let pn = 1; pn <= doc.numPages; pn++) {
    const page = await doc.getPage(pn);
    const tc = await page.getTextContent();
    let rects = [], boldFonts = {};
    try { rects = await pageFillRects(pdfjs, page); } catch (e) { console.warn('rects', e); }
    for (const it of tc.items) {
      if (!it.fontName || it.fontName in boldFonts) continue;
      let name = tc.styles[it.fontName]?.fontFamily || '';
      try { const f = page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null; if (f) name = (f.name || '') + ' ' + name + (f.bold ? ' bold' : ''); } catch {}
      boldFonts[it.fontName] = BOLD_RE.test(name);
    }
    const annots = (await page.getAnnotations()).filter((a) => a.subtype === 'Highlight');
    const annBoxes = [];
    for (const a of annots) {
      const q = a.quadPoints;
      if (q && q.length) {
        const arr = Array.isArray(q[0]) || q[0]?.x !== undefined ? q.flat() : q;
        // quadPoints: pole bodů {x,y} po 4 nebo čísla po 8
        const pts = typeof arr[0] === 'number' ? Array.from({ length: arr.length / 2 }, (_, i) => ({ x: arr[2*i], y: arr[2*i+1] })) : arr;
        for (let i = 0; i + 3 < pts.length; i += 4) {
          const xs = pts.slice(i, i + 4).map((p) => p.x), ys = pts.slice(i, i + 4).map((p) => p.y);
          annBoxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
        }
      } else annBoxes.push(a.rect);
    }
    // slova s pozicemi
    const words = [];
    let text = '';
    for (const it of tc.items) {
      if (it.str === undefined) continue;
      const x = it.transform[4], y = it.transform[5], h = it.height || Math.abs(it.transform[3]) || 10;
      const len = it.str.length || 1, cw = it.width / len;
      const bold = !!boldFonts[it.fontName];
      const re = /\S+/g; let m;
      while ((m = re.exec(it.str))) {
        const x0 = x + m[0].length * 0 + m.index * cw, x1 = x0 + m[0].length * cw;
        const box = [x0, y - h * 0.2, x1, y + h * 0.8];
        const hl = annBoxes.some((b) => overlap(box, b) > 0.4) || rects.some((r) => overlap(box, r) > 0.5);
        words.push({ w: m[0], bold, hl, start: text.length });
        text += m[0] + ' ';
      }
      if (it.hasEOL) text += '\n';
    }
    pages.push({ words, text });
  }
  return buildResult(pages);
}

const clean = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

function buildResult(pages) {
  // Pokud je tučných slov moc (nadpisy, celé odstavce), bold se nepovažuje za značku slov.
  const all = pages.flatMap((p) => p.words);
  const boldRatio = all.filter((w) => w.bold).length / Math.max(1, all.length);
  const hlCount = all.filter((w) => w.hl).length;
  const useBold = boldRatio < 0.25;
  const marks = [];
  let fullText = '';
  pages.forEach((p, pi) => {
    // odstavce/věty
    const base = fullText.length;
    const flat = p.words.map((w) => w.w).join(' ');
    let i = 0;
    while (i < p.words.length) {
      const w = p.words[i];
      const marked = w.hl || (useBold && w.bold);
      if (!marked) { i++; continue; }
      const kind = w.hl ? 'highlight' : 'bold';
      let j = i;
      while (j + 1 < p.words.length && (p.words[j + 1].hl || (useBold && p.words[j + 1].bold)) && (p.words[j + 1].hl ? 'highlight' : 'bold') === kind) j++;
      const phrase = clean(p.words.slice(i, j + 1).map((x) => x.w).join(' '));
      // věta: od předchozí tečky po další
      let s = i; while (s > 0 && !/[.!?]["”')]?$/.test(p.words[s - 1].w)) s--;
      let e = j; while (e < p.words.length - 1 && !/[.!?]["”')]?$/.test(p.words[e].w)) e++;
      const sentence = p.words.slice(s, e + 1).map((x) => x.w).join(' ');
      if (phrase.length > 1) marks.push({ phrase, sentence, kind, page: pi + 1 });
      i = j + 1;
    }
    fullText += p.words.map((w) => w.w).join(' ') + '\n\n';
  });
  // odstranit duplicity
  const seen = new Set();
  const uniq = marks.filter((m) => { const k = m.phrase.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return { text: fullText.trim(), marks: uniq, stats: { boldRatio, hlCount, useBold } };
}
