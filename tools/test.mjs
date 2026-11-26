import * as pdfjs from '/home/user/app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdf } from '/home/user/app/public/extract.js';
import fs from 'fs';
for (const f of process.argv.slice(2)) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(f)), useSystemFonts: false }).promise;
  const r = await extractPdf(pdfjs, doc);
  console.log(f, JSON.stringify(r.stats), r.marks.map(m => `${m.phrase}[${m.kind}]`).join(', '));
}
