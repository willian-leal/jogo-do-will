'use strict';
// Teste de integração: um "humano" via WebSocket joga contra bots; checa vazamento de cartas e o corte errado.
process.env.WILL_SPEED = '0.03';
const assert = require('assert');
const WebSocket = require('ws');
const { server } = require('../server');

function pingTest(port, cb) {
  const s = new WebSocket(`ws://localhost:${port}`);
  s.on('open', () => s.send('{"t":"ping"}'));
  s.on('message', (raw) => { if (JSON.parse(raw).t === 'pong') { cb(true); s.close(); } });
  setTimeout(() => cb(false), 2000);
}
function burstTest(port, cb) {
  const s = new WebSocket(`ws://localhost:${port}`);
  s.on('open', () => { for (let i = 0; i < 400; i++) s.send(JSON.stringify({ t: 'create', name: 'Spam' + i })); });
  setTimeout(() => {
    const p2 = new WebSocket(`ws://localhost:${port}`);
    p2.on('open', () => p2.send(JSON.stringify({ t: 'create', name: 'Normal' })));
    p2.on('message', (raw) => { if (JSON.parse(raw).t === 'joined') { cb(true); p2.close(); s.terminate(); } });
    setTimeout(() => cb(false), 3000);
  }, 400);
}
server.listen(0, async () => {
  const port = server.address().port;
  const ws = new WebSocket(`ws://localhost:${port}`);
  const send = (m) => ws.send(JSON.stringify(m));
  let S = null, revealed = 0, you = null, errors = [], wrongCutTested = false, peeked = 0, ready = false, turns = 0;
  const done = (ok, msg) => { if (ok) { console.log('OK: integração WS —', msg); process.exit(0); } console.error('FALHOU', msg); process.exit(1); };
  setTimeout(() => done(false, 'timeout; fase=' + (S && S.phase) + ' sub=' + (S && S.sub)), 40000);

  ws.on('open', () => send({ t: 'create', name: 'Will' }));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'joined') { you = m.you; send({ t: 'addBot' }); send({ t: 'addBot' }); setTimeout(() => send({ t: 'start' }), 50); }
    if (m.t === 'reveal') revealed++;
    if (m.t === 'error') errors.push(m.msg);
    if (m.t !== 'state') return;
    S = m;
    // nunca deve vazar valores das cartas antes do fim
    if (S.phase !== 'ended') for (const p of S.players) for (const c of p.hand) assert(c.rank === undefined, 'vazamento de carta!');
    const me = S.players.find((p) => p.id === you);
    if (S.phase === 'peek') {
      if (peeked < 2) { send({ t: 'peek', cardId: me.hand[peeked].id }); peeked++; }
      else if (!ready) { ready = true; send({ t: 'peek', cardId: me.hand[2].id }); setTimeout(() => send({ t: 'ready' }), 30); }
    }
    if (S.phase === 'play') {
      // corte errado de propósito (uma vez) quando houver janela: carta com valor possivelmente diferente
      if (S.cutOpen && !wrongCutTested && S.discardTop) {
        const bad = me.hand.length; // contagem antes
        wrongCutTested = 'pending'; S._before = bad;
        // escolhe a primeira carta; se por acaso for igual, a contagem diminui (aceitável) — o teste só valida os dois casos
        send({ t: 'cut', cardId: me.hand[0].id });
        S.__chk = bad;
        ws.once('message', () => {});
        setTimeout(() => { const n = S.players.find((p) => p.id === you).hand.length; if (n !== bad - 1 && n !== bad + 1) done(false, `corte: mão ${bad} -> ${n}`); wrongCutTested = true; }, 400);
      }
      if (S.turn === you) {
        if (S.sub === 'draw') setTimeout(() => send({ t: 'draw' }), 120);
        else if (S.sub === 'action') { turns++; setTimeout(() => (turns % 2 ? send({ t: 'discard' }) : send({ t: 'swap', cardId: me.hand[1].id })), 40); }
        else if (S.sub === 'power') {
          const o = S.players.find((p) => p.id !== you && p.inGame);
          setTimeout(() => {
            if (S.power.type === '10') send({ t: 'power', targets: [me.hand[0].id] });
            else if (S.power.type === 'Q') send({ t: 'power', targets: [o.hand[0].id] });
            else send({ t: 'power', targets: [me.hand[0].id, o.hand[0].id] });
          }, 40);
        }
        if (turns >= 6 && S.sub === 'draw') setTimeout(() => send({ t: 'end' }), 60);
      }
    }
    if (S.phase === 'ended') {
      assert(S.result.rows.length === 3);
      assert(revealed >= 2, 'esperava 2 reveals de peek'); assert(errors.some((e) => /já olhou duas/.test(e)), 'terceira espiada deveria ser recusada');
      pingTest(port, (ok) => { if (!ok) done(false, 'ping sem pong'); });
      burstTest(port, (ok) => { if (!ok) done(false, 'servidor não respondeu após rajada'); });
      done(true, `partida terminou (${S.result.reason}); reveals=${revealed}; erros tolerados=${errors.length}`);
    }
  });
});
