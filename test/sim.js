'use strict';
// Simula partidas completas só com bots e verifica invariantes (nenhuma carta some ou duplica).
const { Room, points } = require('../game');
const assert = require('assert');
const LV = ['facil', 'medio', 'dificil', 'expert'];

function playOne(n, i) {
  return new Promise((resolve, reject) => {
    const room = new Room('T' + i, { speed: 0.004, onChange: (r) => { try { r.checkInvariant(); } catch (e) { reject(e); } } });
    const ps = [];
    for (let k = 0; k < n; k++) ps.push(room.addPlayer({ name: 'B' + k, bot: true, level: LV[(k + i) % 4] }));
    room.hostId = ps[0].id;
    const t0 = Date.now();
    room.startGame(ps.map((p) => p.id));
    const iv = setInterval(() => {
      if (room.phase === 'ended') {
        clearInterval(iv); room.destroy();
        const r = room.result;
        try {
          assert(r.rows.length === n);
          for (const row of r.rows) assert.strictEqual(row.points, row.cards.reduce((s, c) => s + points(c), 0));
          const min = Math.min(...r.rows.map((x) => x.points));
          assert(r.rows.filter((x) => r.winners.includes(x.id)).every((x) => x.points === min));
          r.turns = room.turnSeq; resolve(r);
        } catch (e) { reject(e); }
      } else if (Date.now() - t0 > 60000) { clearInterval(iv); room.destroy(); reject(new Error(`timeout n=${n} fase=${room.phase} sub=${room.sub}`)); }
    }, 5);
  });
}

(async () => {
  const jobs = [];
  for (let i = 0; i < 120; i++) jobs.push(playOne(2 + (i % 7), i));
  const res = await Promise.all(jobs);
  const by = { empty: 0, voluntary: 0, deck: 0 }; let ties = 0;
  res.forEach((r) => { by[r.reason]++; if (r.tie) ties++; });
  const avg = res.reduce((s, r) => s + r.turns, 0) / res.length;
  console.log('OK: 120 partidas simuladas.', by, 'empates:', ties, '· turnos/partida (média):', avg.toFixed(1));
  process.exit(0);
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
