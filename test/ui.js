'use strict';
// Teste de interface no navegador (precisa de Chrome; sem ele, é ignorado). CHROME_PATH pode apontar o executável.
process.env.WILL_SPEED = '0.08';
const fs = require('fs');
const assert = require('assert');
const chrome = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (_) { /* opcional */ }
if (!chrome || !puppeteer) { console.log('IGNORADO: teste de UI (Chrome ou puppeteer-core não encontrados).'); process.exit(0); }
const { server } = require('../server');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

server.listen(0, async () => {
  const port = server.address().port;
  const b = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'], headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  p.on('dialog', (d) => d.accept());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const click = async (sel) => { const r = await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; }, sel); if (!r) return false; try { await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.up(); } catch (_) { try { await p.mouse.up(); } catch (__) { /* ignora */ } } return true; };
  const fail = async (m) => { console.error('FALHOU:', m, errs); await b.close(); process.exit(1); };
  try {
    await p.goto(`http://localhost:${port}/`); await sleep(400);
    await p.type('#nameInput', 'Tester');
    await click('[data-act=practice]');                                  // sala de treino: já começa com 2 bots
    await p.waitForSelector('#game:not([hidden]) #me .card', { timeout: 8000 });
    assert(await p.$eval('#coach', (e) => !e.hidden && /Toque em 2/.test(e.textContent)), 'dica de memorização deveria aparecer');
    await click('[data-act=tipok]');
    assert(await p.$eval('#coach', (e) => e.hidden), 'dica some ao clicar Entendi');
    // teclado: cartas são focáveis e têm rótulo
    assert(await p.$eval('#me .card', (e) => e.tabIndex === 0 && /carta/.test(e.getAttribute('aria-label'))), 'cartas focáveis com aria-label');
    await click('#me .card:nth-child(1)'); await click('#me .card:nth-child(2)'); await sleep(200);
    await click('[data-act=ready]');
    // joga: compra, descarta; encerra no 4º turno
    let turns = 0, tookDiscard = 0; const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      const st = await p.evaluate(() => ({ act: [...document.querySelectorAll('#actions [data-act]')].map((e) => e.dataset.act), ended: !document.querySelector('#overlay').hidden && !!document.querySelector('#overlay .trophy') }));
      if (st.ended) break;
      const forced = await p.evaluate(() => /pegou do descarte/.test(document.querySelector('#msg').textContent) && !document.querySelector('#actions [data-act=discard]'));
      if (forced) { tookDiscard++; await click('#me .card:nth-child(3)'); await sleep(200); continue; }
      if (st.act.includes('draw') && turns >= 1 && !tookDiscard && st.act.includes('takediscard')) { await click('#actions [data-act=takediscard]'); await sleep(2600); continue; }
      if (st.act.includes('draw')) { turns++; if (turns > 3 && st.act.includes('end')) await click('#actions [data-act=end]'); else await click('#actions [data-act=draw]'); }
      else if (st.act.includes('discard')) await click('#actions [data-act=discard]');
      else if (st.act.includes('skip')) await click('#actions [data-act=skip]');
      await sleep(150);
    }
    assert(await p.$('#overlay .trophy'), 'tela de resultado deveria aparecer');
    assert(tookDiscard >= 1, 'deveria ter pego do descarte e trocado (fluxo forçado)');
    const stats = JSON.parse(await p.evaluate(() => localStorage.getItem('will_stats')));
    assert(stats && stats.games === 1 && stats.rounds === 1, 'estatísticas locais registradas: ' + JSON.stringify(stats));
    // acessibilidade
    await click('[data-act=closeoverlay]'); await click('#menuBtn'); await click('#menu [data-act=a11y]');
    await p.evaluate(() => { const i = document.querySelector('[data-a11y=rm]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); });
    assert(await p.evaluate(() => document.documentElement.classList.contains('rm')), 'reduzir animações aplica a classe');
    assert.deepStrictEqual(errs, [], 'sem erros de JS');
    console.log('OK: UI no navegador (treino, dicas, teclado/aria, resultado, estatísticas, acessibilidade).');
    await b.close(); process.exit(0);
  } catch (e) { await fail(e.message); }
});
