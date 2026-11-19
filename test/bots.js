'use strict';
// Estratégia dos bots: nível Expert e uso inteligente dos poderes.
const assert = require('assert');
const { Room } = require('../game');
const Bot = require('../bot');

function setup(level) {
  const room = new Room('B', { speed: 0.001, minRounds: 0 });
  const h = room.addPlayer({ name: 'Humano' }); h.connected = true; h.send = () => {};
  room.addBot(h.id, level); room.addBot(h.id, 'medio');
  const [, b, c] = room.players;
  room.startGame(room.players.map((p) => p.id));
  for (const p of room.players) p.memory = {};        // tira a memória aleatória do início
  return { room, h, b, c };
}
const withVal = (room, hand, pointsWanted) => hand.find((id) => require('../game').points(room.cards.get(id)) === pointsWanted);

(async () => {
  assert.ok(Bot.LEVELS.includes('expert') && Bot.LEVEL_NAMES.expert === 'Expert');

  // Valete (Expert): humano com 2 cartas e bot conhece uma carta própria alta → entrega-a ao humano
  {
    const { room, h, b } = setup('expert');
    h.hand.splice(2);                                   // humano quase acabando (devolve as cartas só para o teste)
    const high = b.hand.find((id) => require('../game').points(room.cards.get(id)) >= 8) ?? b.hand[0];
    b.memory[high] = 11;
    const d = Bot.choosePower(room, b, 'J');
    assert.ok(!d.skip && d.targets[0] === high && h.hand.includes(d.targets[1]), 'Expert entrega carta alta a quem tem poucas cartas');
  }
  // Valete (Expert), sem carta alta: embaralha a mão de quem está perto de acabar com a de outro adversário
  {
    const { room, h, b, c } = setup('expert');
    h.hand.splice(2);
    const d = Bot.choosePower(room, b, 'J');
    assert.ok(!d.skip && h.hand.includes(d.targets[0]) && c.hand.includes(d.targets[1]), 'Expert embaralha a mão do líder');
  }
  // Valete (Expert): leva uma carta baixa que sabe onde está
  {
    const { room, h, b } = setup('expert');
    const lowId = h.hand[0]; h.memory = {}; b.memory[lowId] = 1; b.memory[b.hand[0]] = 12;
    const d = Bot.choosePower(room, b, 'J');
    assert.deepStrictEqual(d.targets, [b.hand[0], lowId]);
  }
  // Valete em Médio continua ao acaso/sem carta alta conhecida → pula
  {
    const { room, b } = setup('medio');
    assert.ok(Bot.choosePower(room, b, 'J').skip);
  }
  // Dama (Difícil+): espia carta desconhecida de quem tem menos cartas
  {
    const { room, h, b, c } = setup('dificil');
    h.hand.splice(2);
    for (let i = 0; i < 20; i++) { const d = Bot.choosePower(room, b, 'Q'); assert.ok(h.hand.includes(d.targets[0])); }
    for (const id of h.hand) b.memory[id] = 5;           // já conhece as do humano → vai para o outro
    const d = Bot.choosePower(room, b, 'Q'); assert.ok(c.hand.includes(d.targets[0]));
  }
  // Encerrar: só com certeza de que ganha (soma + folga abaixo da estimativa pessimista de todos os adversários)
  {
    const { room, h, b, c } = setup('expert');
    b.turns = 6;
    const sure = () => { let n = 0; for (let i = 0; i < 100; i++) { for (const id of b.hand) b.memory[id] = 1; if (Bot.shouldEnd(b, room)) n++; } return n; };
    assert.ok(sure() >= 85, 'Expert encerra quase sempre que está claramente à frente (soma 4 contra mãos de 4 cartas)');
    h.hand.splice(1); c.hand.splice(1);                  // adversários com 1 carta cada: estimativa pessimista 4,5
    assert.strictEqual(sure(), 0, 'não encerra se um adversário com 1 carta pode ter menos que soma + folga');
    for (const id of h.hand) b.memory[id] = 0;           // sabe que a carta do humano vale 0
    assert.strictEqual(sure(), 0, 'nem se sabe que o adversário tem 0');
    for (const o of [h, c]) for (const id of o.hand) b.memory[id] = 20;
    // memória das cartas dos adversários é reposta dentro de sure(); testa com valor alto fixo
    let n = 0; for (let i = 0; i < 50; i++) { for (const id of b.hand) b.memory[id] = 1; for (const o of [h, c]) for (const id of o.hand) b.memory[id] = 13; if (Bot.shouldEnd(b, room)) n++; }
    assert.ok(n >= 42, 'encerra quando sabe que os adversários têm cartas altas');
    for (let i = 0; i < 50; i++) { for (const id of b.hand) b.memory[id] = 9; assert.ok(!Bot.shouldEnd(b, room)); }   // mão ruim: nunca
  }
  // Mão com carta desconhecida: Difícil/Expert não encerram
  {
    const { room, b } = setup('expert'); b.turns = 6; b.memory = {};
    for (let i = 0; i < 50; i++) { b.memory = {}; for (const id of b.hand.slice(1)) b.memory[id] = 0; assert.ok(!Bot.shouldEnd(b, room)); }
  }
  // Os bots NÃO enxergam cartas escondidas: em partidas completas, cada leitura de valor feita por funções do bot
  // só pode ser da carta que ele tem na mão como comprada (p.drawn) ou do topo do descarte (públicos).
  {
    const Bot2 = Bot; const reads = { total: 0, bad: [] };
    const names = ['chooseAction', 'choosePower', 'wantDiscard', 'cutCandidate', 'shouldEnd'];
    const orig = {}; let ctx = null;
    for (const n of names) { orig[n] = Bot2[n]; Bot2[n] = function (...a) { const prev = ctx; ctx = { fn: n, p: a[n === 'cutCandidate' || n === 'shouldEnd' ? 0 : 1] || a[0], room: a[n === 'chooseAction' || n === 'choosePower' || n === 'wantDiscard' ? 0 : 1] }; try { return orig[n].apply(this, a); } finally { ctx = prev; } }; }
    const rooms = [];
    for (let g = 0; g < 6; g++) {
      const room = new Room('A' + g, { speed: 0.003, minRounds: 0 });
      const first = room.addPlayer({ name: 'B0', bot: true, level: ['facil', 'medio', 'dificil', 'expert'][g % 4] });
      room.hostId = first.id;
      for (let k = 1; k < 4; k++) room.addPlayer({ name: 'B' + k, bot: true, level: ['expert', 'dificil', 'medio'][k - 1] });
      room.startGame(room.players.map((p) => p.id));
      const get = room.cards.get.bind(room.cards);
      room.cards.get = (id) => {
        if (ctx) {
          reads.total++;
          const p = ctx.p, top = room.discard[room.discard.length - 1];
          if (!(id === p.drawn || id === top)) reads.bad.push(`${ctx.fn}: leu carta ${id} escondida`);
        }
        return get(id);
      };
      rooms.push(room);
    }
    return new Promise((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (rooms.every((r) => r.phase === 'ended') || Date.now() - t0 > 40000) {
          clearInterval(iv); rooms.forEach((r) => r.destroy());
          for (const n of names) Bot2[n] = orig[n];
          assert.ok(rooms.every((r) => r.phase === 'ended'), 'partidas terminaram');
          assert.ok(reads.total > 100, `auditoria leu valores (${reads.total})`);
          assert.deepStrictEqual(reads.bad, [], 'um bot leu o valor de uma carta que não podia ver');
          console.log(`OK: auditoria — ${reads.total} leituras de valor pelos bots, todas de cartas visíveis para eles.`);
          resolve();
        }
      }, 20);
    });
  }
  console.log('OK: estratégias dos bots (Expert, Valete, Dama, encerrar).');
  process.exit(0);
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
