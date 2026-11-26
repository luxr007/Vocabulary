const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- IndexedDB ----------
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open('slovicka', 1);
  r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('articles', { keyPath: 'id' }); d.createObjectStore('words', { keyPath: 'id' }); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (store, mode, fn) => { const d = await dbp; return new Promise((res, rej) => { const t = d.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
const all = (s) => tx(s, 'readonly', (o) => o.getAll());
const get = (s, id) => tx(s, 'readonly', (o) => o.get(id));
const put = (s, v) => tx(s, 'readwrite', (o) => o.put(v));
const del = (s, id) => tx(s, 'readwrite', (o) => o.delete(id));

// ---------- překlad (MyMemory, zdarma; lze ručně opravit) ----------
async function translate(text) {
  try {
    const r = await fetch('https://api.mymemory.translated.net/get?langpair=en|cs&q=' + encodeURIComponent(text));
    const j = await r.json();
    const t = j.responseData?.translatedText || '';
    return /MYMEMORY|QUERY LENGTH/i.test(t) ? '' : t;
  } catch { return ''; }
}

// ---------- opakování (SRS) ----------
const DAY = 864e5;
function grade(w, g) { // g: 0 znovu, 1 těžké, 2 dobře, 3 snadné
  const now = Date.now();
  w.reps = w.reps || 0; w.ease = w.ease || 2.3; w.interval = w.interval || 0;
  if (g === 0) { w.lapses = (w.lapses || 0) + 1; w.interval = 0; w.due = now + 10 * 60e3; w.ease = Math.max(1.3, w.ease - 0.2); w.reps = 0; return; }
  const base = w.interval === 0 ? 1 : w.interval;
  w.interval = g === 1 ? Math.max(1, Math.round(base * 1.2)) : g === 2 ? (w.reps === 0 ? 1 : Math.round(base * w.ease)) : Math.round(Math.max(base, 1) * w.ease * 1.5 + 1);
  w.ease = Math.max(1.3, w.ease + (g === 3 ? 0.1 : g === 1 ? -0.1 : 0));
  w.reps++; w.due = now + w.interval * DAY;
}
const isDue = (w) => (w.due || 0) <= Date.now();

// ---------- řeč ----------
function speak(text, lang = 'en-US', rate = 0.9) {
  return new Promise((res) => {
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = rate;
    const v = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').startsWith(lang.slice(0, 2)) && (lang !== 'en-US' || /en[-_]US/.test(v.lang)));
    if (v) u.voice = v;
    u.onend = u.onerror = () => res(); speechSynthesis.speak(u);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- data z repozitáře (data/data.json), pokrok zůstává v telefonu ----------
async function syncData(force) {
  try {
    const r = await fetch('data/data.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw 0;
    const data = await r.json();
    const old = new Map((await all('words')).map((w) => [w.id, w]));
    const keep = new Set(); let added = 0;
    for (const a of data.articles) {
      await put('articles', { id: a.id, title: a.title, text: a.text, added: a.added ? Date.parse(a.added) : 0 });
      for (const w of a.words) {
        const id = a.id + ':' + w.phrase.toLowerCase(); keep.add(id);
        const o = old.get(id); if (!o) added++;
        await put('words', { due: 0, ...(o || {}), id, articleId: a.id, phrase: w.phrase, sentence: w.sentence, cs: w.cs, kind: w.kind || 'data', added: o?.added || Date.now() });
      }
    }
    const aids = new Set(data.articles.map((a) => a.id));
    for (const a of await all('articles')) if (!aids.has(a.id)) await del('articles', a.id);
    for (const [id, w] of old) if (w.kind !== 'manual' && !keep.has(id)) await del('words', id);
    return added ? `Přidáno ${added} nových slov` : 'Nic nového';
  } catch { return force ? 'Data se nepodařilo načíst (offline?)' : ''; }
}

// ---------- router ----------
const routes = { articles: pArticles, words: pWords, practice: pPractice, listen: pListen, article: pArticle };
async function route() {
  stopListen();
  const [, name = 'articles', arg] = location.hash.split('/');
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.go === '#/' + name));
  view.innerHTML = '';
  await (routes[name] || pArticles)(arg);
  const due = (await all('words')).filter(isDue).length; $('#dueBadge').textContent = due || '';
}
addEventListener('hashchange', route);
document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => (location.hash = b.dataset.go)));

// ---------- Články ----------
async function pArticles() {
  const arts = (await all('articles')).reverse(); const words = await all('words');
  view.innerHTML = `<h1>Články</h1>
  <p class="muted">Nové články přidává Claude: pošli mu PDF a on aktualizuje data.</p>
  <button class="btn sec sm" id="sync">↻ Načíst nová data</button><div id="status"></div>
  ${arts.map((a) => `<div class="card" data-id="${a.id}"><b>${esc(a.title)}</b><div class="muted">${words.filter((w) => w.articleId === a.id).length} slov · ${new Date(a.added).toLocaleDateString('cs')}</div></div>`).join('') || '<p class="muted">Zatím žádné články.</p>'}`;
  view.querySelectorAll('.card').forEach((c) => (c.onclick = () => (location.hash = '#/article/' + c.dataset.id)));
  $('#sync').onclick = async () => { $('#sync').textContent = 'Načítám…'; const n = await syncData(true); $('#status').textContent = n; setTimeout(route, 800); };
}

async function pArticle(id) {
  const a = await get('articles', id); if (!a) return (location.hash = '#/articles');
  const words = (await all('words')).filter((w) => w.articleId === id);
  const set = new Map(words.map((w) => [w.phrase.toLowerCase(), w]));
  // zvýraznit známé fráze v textu
  const tokens = a.text.split(/(\s+)/);
  const html = tokens.map((t) => {
    if (/^\s*$/.test(t)) return t;
    const bare = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    const hit = [...set.keys()].some((k) => k === bare.toLowerCase() || k.split(' ').includes(bare.toLowerCase()));
    return `<span class="w${hit ? ' m' : ''}" data-w="${esc(bare)}">${hit ? '<mark>' + esc(t) + '</mark>' : esc(t)}</span>`;
  }).join('');
  view.innerHTML = `<div class="row"><button class="btn sec sm" onclick="location.hash='#/articles'">‹ Zpět</button><span class="sp"></span><button class="btn sec sm" id="read">🔊 Číst</button></div>
  <h1>${esc(a.title)}</h1><p class="muted">Klepni na slovo pro překlad a přidání do slovíček.</p><div class="reader">${html}</div><div id="pop"></div>`;
  let reading = false;
  $('#read').onclick = async () => {
    if (reading) { speechSynthesis.cancel(); reading = false; $('#read').textContent = '🔊 Číst'; return; }
    reading = true; $('#read').textContent = '⏹ Stop';
    for (const p of a.text.split(/(?<=[.!?])\s+/)) { if (!reading) break; await speak(p, 'en-US', 0.95); }
    reading = false; $('#read').textContent = '🔊 Číst';
  };
  view.querySelector('.reader').onclick = async (e) => {
    const s = e.target.closest('.w'); if (!s) return; const word = s.dataset.w; if (!word) return;
    const ex = [...set.values()].find((w) => w.phrase.toLowerCase() === word.toLowerCase());
    const sentence = (a.text.split(/(?<=[.!?])\s+/).find((x) => x.includes(word)) || word).replace(/\s+/g, ' ');
    const pop = $('#pop'); pop.innerHTML = `<div class="pop"><b>${esc(word)}</b> <span id="tr" class="muted">${ex ? esc(ex.cs) : 'překládám…'}</span><div class="row" style="margin-top:8px"><button class="btn sm sec" id="sp">🔊</button>${ex ? '<span class="muted">už je ve slovíčkách</span>' : '<button class="btn sm grn" id="addw">＋ Přidat</button>'}<span class="sp"></span><button class="btn sm sec" id="x">✕</button></div></div>`;
    $('#x').onclick = () => (pop.innerHTML = ''); $('#sp').onclick = () => speak(word);
    let cs = ex ? ex.cs : await translate(word); if (!ex) $('#tr').textContent = cs.toLowerCase();
    if ($('#addw')) $('#addw').onclick = async () => { await tx('words', 'readwrite', (o) => o.put({ id: 'm' + Date.now(), phrase: word, sentence, articleId: id, kind: 'manual', cs: cs.toLowerCase(), due: 0, added: Date.now() })); pop.innerHTML = ''; pArticle(id); };
  };
}

// ---------- Slovíčka ----------
async function pWords() {
  const ws = (await all('words')).sort((a, b) => b.added - a.added);
  view.innerHTML = `<h1>Slovíčka (${ws.length})</h1>${ws.map((w) => `<div class="card" data-id="${w.id}"><div class="row"><b>${esc(w.phrase)}</b><span class="sp"></span><span class="muted">${isDue(w) ? 'k procvičení' : 'za ' + Math.max(1, Math.round((w.due - Date.now()) / DAY)) + ' d'}</span></div><div>${esc(w.cs) || '<span class="muted">bez překladu</span>'}</div><div class="muted">${esc(w.sentence)}</div></div>`).join('') || '<p class="muted">Zatím nic.</p>'}`;
  view.querySelectorAll('.card').forEach((c) => (c.onclick = async () => {
    const w = await get('words', c.dataset.id);
    const n = prompt(`Český překlad pro „${w.phrase}“ (prázdné = smazat slovo):`, w.cs);
    if (n === null) return; if (n === '') await del('words', w.id); else { w.cs = n; await put('words', w); } pWords();
  }));
}

// ---------- Procvičování ----------
async function pPractice() {
  const due = (await all('words')).filter(isDue).sort(() => Math.random() - 0.5);
  if (!due.length) { view.innerHTML = '<h1>Procvičování</h1><div class="card">🎉 Dnes máš hotovo. Žádná slova k opakování.</div>'; return; }
  const total = due.length; let i = 0;
  const blank = (s, p) => s.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '_____');
  const mark = (s, p) => esc(s).replace(new RegExp(esc(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), (m) => `<mark>${m}</mark>`);
  function show() {
    if (!due.length) { view.innerHTML = '<h1>Hotovo 🎉</h1><div class="card">Všechna dnešní slova jsou projitá.</div>'; route(); return; }
    const w = due[0]; const prod = (w.reps || 0) % 2 === 1 && w.cs; // lichá opakování: z češtiny do angličtiny
    view.innerHTML = `<div class="bar"><i style="width:${((total - due.length) / total) * 100}%"></i></div>
    <div class="card" style="margin-top:20px">${prod ? `<div class="big">${esc(w.cs)}</div><div class="sent">${esc(blank(w.sentence, w.phrase))}</div>` : `<div class="big">${esc(w.phrase)}</div><div class="sent">${mark(w.sentence, w.phrase)}</div>`}
    <div id="ans"></div></div><div id="btns"><button class="btn" style="width:100%" id="rev">Ukázat odpověď</button></div>`;
    if (!prod) speak(w.phrase);
    $('#rev').onclick = () => {
      $('#ans').innerHTML = `<hr><div class="big" style="font-size:24px">${prod ? esc(w.phrase) : esc(w.cs) || '—'}</div><div class="row" style="justify-content:center"><button class="btn sm sec" id="sp">🔊 ${prod ? 'slovo' : 'věta'}</button></div>`;
      $('#sp').onclick = () => speak(prod ? w.phrase : w.sentence);
      $('#btns').innerHTML = `<div class="row"><button class="btn red sp" data-g="0">Znovu</button><button class="btn org sp" data-g="1">Těžké</button><button class="btn grn sp" data-g="2">Dobře</button><button class="btn sp" data-g="3">Snadné</button></div>`;
      $('#btns').querySelectorAll('button').forEach((b) => (b.onclick = async () => { grade(w, +b.dataset.g); await put('words', w); due.shift(); if (+b.dataset.g === 0) due.push(w); show(); }));
    };
  }
  show();
}

// ---------- Poslech (prototyp; v autě viz návrh MP3 etapy) ----------
let listening = false, lock = null;
function stopListen() { listening = false; speechSynthesis.cancel(); lock?.release?.().catch(() => {}); lock = null; }
async function pListen() {
  const ws = await all('words');
  view.innerHTML = `<h1>Poslech slovíček</h1><div class="card"><p>Čte: <b>slovo → věta → pauza → český význam</b>.</p>
  <label><input type="checkbox" id="onlyDue"> jen slova k opakování</label>
  <div class="row" style="margin:12px 0"><button class="btn" id="go">▶ Spustit</button><button class="btn sec" id="stop">⏹</button></div><div id="now" class="big" style="font-size:22px"></div><div id="nows" class="sent"></div></div>
  <p class="muted">⚠️ Prototyp: iPhone při zamčené obrazovce přehrávání z webu zastaví. Pro auto navrhuji další etapu s MP3 soubory (spouští se z aplikace Soubory/Hudba, hraje i při zamčeném telefonu).</p>`;
  $('#stop').onclick = () => { stopListen(); $('#now').textContent = ''; };
  $('#go').onclick = async () => {
    let list = ws.filter((w) => !$('#onlyDue').checked || isDue(w)); if (!list.length) return;
    list = list.sort(() => Math.random() - 0.5); stopListen(); listening = true;
    try { lock = await navigator.wakeLock?.request('screen'); } catch {}
    for (let k = 0; listening; k = (k + 1) % list.length) {
      const w = list[k]; $('#now').textContent = w.phrase; $('#nows').textContent = w.sentence;
      await speak(w.phrase); if (!listening) break; await sleep(500);
      await speak(w.sentence, 'en-US', 0.85); if (!listening) break; await sleep(2500);
      $('#now').textContent = w.phrase + ' = ' + w.cs; if (w.cs) await speak(w.cs, 'cs-CZ', 1); await sleep(1200);
    }
  };
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
speechSynthesis.getVoices();
syncData().then(route);
route();
