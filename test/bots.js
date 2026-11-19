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

(() => {
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
  // Encerrar (Expert): sob pressão encerra com mão razoável, e nunca com mão ruim
  {
    const { room, h, b } = setup('expert');
    h.hand.splice(2); b.turns = 4;
    let ends = 0;
    for (let i = 0; i < 200; i++) { for (const id of b.hand) b.memory[id] = 2; if (Bot.shouldEnd(b, room)) ends++; }   // soma 8
    assert.ok(ends > 60, `Expert encerra sob pressão (${ends}/200)`);
    for (let i = 0; i < 100; i++) { for (const id of b.hand) b.memory[id] = 9; assert.ok(!Bot.shouldEnd(b, room)); }
  }
  console.log('OK: estratégias dos bots (Expert, Valete, Dama, encerrar).');
})();
