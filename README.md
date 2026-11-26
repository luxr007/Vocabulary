# Slovíčka – PWA na procvičování angličtiny

Data (články, slova, věty, překlady) jsou v `data/data.json`, kterou po každém PDF aktualizuje Claude.
Appka je při startu načte a **pokrok v procvičování drží v telefonu** (IndexedDB), takže aktualizace dat ho nesmaže.

Postup: pošlu PDF Claudovi → ten extrahuje označená slova (`tools/extract.mjs`: zvýrazňovač, anotace, tučné), přeloží je a pushne `data/data.json` → v appce klepnu „Načíst nová data" (nebo ji otevřu znovu).

Stack: čisté HTML/JS, IndexedDB, service worker, Web Speech API. Lokálně: `python3 -m http.server`.
