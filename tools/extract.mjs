// Použití: node tools/extract.mjs clanek.pdf > marks.json   (potřebuje: npm i pdfjs-dist@4.10.38)
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdf } from './extract.js';
import fs from 'fs';
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])) }).promise;
console.log(JSON.stringify(await extractPdf(pdfjs, doc), null, 1));
