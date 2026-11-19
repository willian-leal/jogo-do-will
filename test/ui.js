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
  const click = async (sel) => { if (sel !== '[data-act=closeoverlay]' && await p.evaluate(() => { const o = document.querySelector('#overlay'); return !o.hidden && !!o.querySelector('.trophy'); })) return false; /* resultado na tela: não clicar por baixo dele */ const r = await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; }, sel); if (!r) return false; try { await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.up(); } catch (_) { try { await p.mouse.up(); } catch (__) { /* ignora */ } } return true; };
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
    // joga só tocando/arrastando as cartas (sem botões de ação): compra, descarta; encerra no 4º turno
    let turns = 0, tookDiscard = 0, dragged = 0; const t0 = Date.now();
    const center = (s) => p.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, s);
    assert(!(await p.$('#actions [data-act=draw]')), 'botão de comprar não aparece por padrão');
    while (Date.now() - t0 < 90000) {
      const st = await p.evaluate(() => ({ end: !!document.querySelector('#actions [data-act=end], #actions button[disabled]'), canEnd: !!document.querySelector('#actions [data-act=end]'), skip: !!document.querySelector('#actions [data-act=skip]'), msg: document.querySelector('#msg').textContent, ended: !document.querySelector('#overlay').hidden && !!document.querySelector('#overlay .trophy') }));
      if (st.ended) break;
      if (/pegou do descarte/.test(st.msg)) { await click('#me .card:nth-child(3)'); await sleep(250); continue; }
      if (st.end) {                                   // minha vez, fase de comprar
        if (turns > 3 && st.canEnd) { await click('#actions [data-act=end]'); await sleep(400); await click('#overlay [data-act=endyes]'); await sleep(1200); continue; }
        turns++;
        if (turns === 2 && !tookDiscard && await p.$('#discardPile .card:not(.slot)')) { tookDiscard++; await click('#discardPile .card'); await sleep(2600); continue; }
        if (turns === 3 && !dragged) {
          const a = await center('#drawPile .card'), b = await center('#me .card:nth-child(2)');
          await p.mouse.move(a.x, a.y); await p.mouse.down();
          for (let i = 1; i <= 8; i++) await p.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8);
          assert(await p.$('.dragclone'), 'arrastar deveria criar a carta fantasma');
          await p.mouse.up(); dragged++;
          await sleep(3200); continue;
        }
        await click('#drawPile .card'); await sleep(2600); continue;
      }
      if (/Toque numa carta sua para trocar/.test(st.msg)) { await click('#discardPile'); await sleep(250); continue; }
      if (st.skip) await click('#actions [data-act=skip]');
      await sleep(150);
    }
    if (!(await p.$('#overlay .trophy'))) console.error('ESTADO FINAL', turns, tookDiscard, dragged, await p.evaluate(() => document.querySelector('#msg').textContent + ' | ' + [...document.querySelectorAll('#actions [data-act]')].map((e) => e.dataset.act)));
    assert(await p.$('#overlay .trophy'), 'tela de resultado deveria aparecer');
    assert(dragged >= 1, 'deveria ter testado o arrastar');
    assert(tookDiscard >= 1, 'deveria ter pego do descarte e trocado (fluxo forçado)');
    const stats = JSON.parse(await p.evaluate(() => localStorage.getItem('will_stats')));
    assert(stats && stats.games === 1 && stats.rounds === 1, 'estatísticas locais registradas: ' + JSON.stringify(stats));
    // acessibilidade
    await click('[data-act=closeoverlay]'); await click('#menuBtn'); await click('#menu [data-act=a11y]');
    await p.evaluate(() => { const i = document.querySelector('[data-a11y=rm]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); });
    assert(await p.evaluate(() => document.documentElement.classList.contains('rm')), 'reduzir animações aplica a classe');
    // voltar ao início depois do resultado
    await click('[data-act=closeoverlay]');
    assert(await p.$('#actions [data-act=away]'), 'botão Voltar ao início na mesa após o fim');
    await click('#actions [data-act=away]'); await sleep(600);
    assert(await p.evaluate(() => !document.querySelector('#home').hidden && document.querySelector('#overlay').hidden), 'voltou à tela inicial');
    assert(await p.evaluate(() => !document.querySelector('#backBtn').hidden && /Voltar à sala/.test(document.querySelector('#backBtn').textContent)), 'botão Voltar à sala na home');
    await click('#backBtn'); await sleep(800);
    assert(await p.evaluate(() => !document.querySelector('#game').hidden), 'reentrou na mesma sala sem novo convite');
    assert.deepStrictEqual(errs, [], 'sem erros de JS');
    console.log('OK: UI no navegador (treino, dicas, teclado/aria, resultado, estatísticas, acessibilidade).');
    await b.close(); process.exit(0);
  } catch (e) { await fail(e.message); }
});
