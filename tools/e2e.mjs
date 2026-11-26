import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 800 } });
p.on('console', m => m.type()==='error' && console.log('CONSOLE', m.text()));
p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.route('**/api.mymemory.translated.net/**', r => { const q = new URL(r.request().url()).searchParams.get('q'); r.fulfill({ json: { responseData: { translatedText: 'překlad-' + q } } }); });
await p.goto('http://localhost:8766/');
await p.waitForSelector('.card');



await p.click('.card');
await p.waitForSelector('.reader', { timeout: 15000 });
console.log('marked in reader:', await p.locator('.reader mark').count());
await p.click('nav [data-go="#/practice"]');
await p.waitForSelector('#rev'); await p.screenshot({ path: '/tmp/s2.png' });
await p.click('#rev'); await p.click('[data-g="2"]');
console.log((await p.locator('main').innerText()).slice(0,80).replace(/\n/g,' | '));
await b.close();
