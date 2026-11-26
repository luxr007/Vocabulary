# Slovíčka – PWA na procvičování angličtiny z článků

Statická appka (bez serveru). Vše se ukládá v IndexedDB v telefonu.

- **Stack:** čisté HTML/JS (ES moduly), pdf.js 4.10 (lokálně v `lib/`), IndexedDB, service worker (offline), Web Speech API.
- **Extrakce z PDF (`extract.js`):** tři zdroje značek: (1) Highlight anotace (zvýrazňovač v PDF čtečce), (2) vyplněné žluté/barevné obdélníky pod textem (tisk z Wordu/prohlížeče), (3) tučné písmo (název fontu). Tučné se ignoruje, pokud je ho >25 % textu (nadpisy). Netestováno na sken/foto PDF (tam by bylo potřeba OCR).
- **Překlad:** MyMemory (zdarma, kvalita střední), v appce jde opravit klepnutím na slovo v seznamu.
- **Opakování:** vlastní SRS (znovu/těžké/dobře/snadné, interval roste), střídá se EN→CS a CS→EN s větou (cloze).
- **Testy:** `tools/make.py` vyrobí testovací PDF, `tools/test.mjs` ověří extrakci, `tools/e2e.mjs` projde appku v Chrome.
- Spuštění lokálně: `python3 -m http.server` v této složce.
