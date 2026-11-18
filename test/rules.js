'use strict';
// Testes determinísticos das regras do manual (cartas "armadas" à mão).
const assert = require('assert');
const { Room, GameError, points } = require('../game');

function setup(n = 3, speed = 0.0001) {
  const room = new Room('R', { speed });
  const ps = [];
  for (let i = 0; i < n; i++) { const p = room.addPlayer({ name: 'P' + i }); p.connected = true; p.sent = []; p.send = (m) => p.sent.push(m); ps.push(p); }
  room.startGame(ps.map((p) => p.id));
  ps.forEach((p) => room.ready(p.id));
  assert.strictEqual(room.phase, 'play');
  room.turnIdx = 0; room.beginTurn(); room.lockUntil = 0;
  return { room, ps };
}
const setCard = (room, id, rank, suit) => { const c = room.cards.get(id); c.rank = rank; c.suit = suit; };
const throws = (fn, re) => assert.throws(fn, (e) => e instanceof GameError && (!re || re.test(e.message)));
const give = (room, p, i, rank, suit) => setCard(room, p.hand[i], rank, suit);
function stackDraw(room, rank, suit) { const id = room.draw[room.draw.length - 1]; setCard(room, id, rank, suit); return id; }

// 1. pontuação
assert.strictEqual(points({ rank: 'A', suit: 'S' }), 1);
assert.strictEqual(points({ rank: 'J', suit: 'S' }), 11);
assert.strictEqual(points({ rank: 'Q', suit: 'H' }), 12);
assert.strictEqual(points({ rank: 'K', suit: 'S' }), 13);
assert.strictEqual(points({ rank: 'K', suit: 'C' }), 13);
assert.strictEqual(points({ rank: 'K', suit: 'H' }), 0);
assert.strictEqual(points({ rank: 'K', suit: 'D' }), 0);
assert.strictEqual(points({ rank: '10', suit: 'D' }), 10);

// 2. preparação: 4 cartas cada, só 2 espiadas, 1 baralho p/ 2 jogadores e 2 p/ 3+
{
  const room = new Room('P', { speed: 0.0001 });
  const a = room.addPlayer({ name: 'A' }), b = room.addPlayer({ name: 'B' });
  a.connected = b.connected = true; a.send = b.send = () => {};
  room.startGame([a.id, b.id]);
  assert.strictEqual(room.decks, 1); assert.strictEqual(room.cards.size, 52);
  assert(a.hand.length === 4 && b.hand.length === 4);
  const reveals = []; a.send = (m) => m.t === 'reveal' && reveals.push(m);
  room.peek(a.id, a.hand[0]); room.peek(a.id, a.hand[1]);
  throws(() => room.peek(a.id, a.hand[2]), /duas/);
  assert.strictEqual(reveals.length, 2);
  throws(() => room.peek(a.id, b.hand[0]), /ready|suas|duas/);
  const { room: r3 } = setup(3); assert.strictEqual(r3.decks, 2); assert.strictEqual(r3.cards.size, 104);
}

// 3. compra/descarte/troca e vez
{
  const { room, ps } = setup(3);
  throws(() => room.doDraw(ps[1].id), /vez/);
  room.doDraw(ps[0].id);
  throws(() => room.endVoluntary(ps[0].id));                      // depois de comprar não pode encerrar
  const drawn = ps[0].drawn;
  const old = ps[0].hand[2];
  stackDraw; give(room, ps[0], 2, '4', 'S');
  room.swap(ps[0].id, old);
  assert.strictEqual(ps[0].hand[2], drawn);                       // a comprada entra no lugar
  assert.strictEqual(room.discard[room.discard.length - 1], old); // a antiga vai ao descarte
  assert.strictEqual(ps[0].hand.length, 4);
  assert.strictEqual(room.current(), ps[1]);
}

// 4. corte certo, só o primeiro vale, e errado = +1 carta
{
  const { room, ps } = setup(3);
  stackDraw(room, '5', 'S'); room.doDraw(ps[0].id); room.discardDrawn(ps[0].id);
  give(room, ps[1], 0, '5', 'H'); give(room, ps[2], 0, '5', 'D'); give(room, ps[2], 1, '9', 'D');
  room.lockUntil = 0;
  room.cut(ps[2].id, ps[2].hand[0]);
  assert.strictEqual(ps[2].hand.length, 3);
  throws(() => room.cut(ps[1].id, ps[1].hand[0]), /cortou|cortar/); // segundo corte não vale
  // outro descarte, corte errado
  room.lockUntil = 0;
  stackDraw(room, '6', 'S'); room.doDraw(ps[1].id); room.discardDrawn(ps[1].id);
  give(room, ps[0], 0, '7', 'S');
  room.cut(ps[0].id, ps[0].hand[0]);
  assert.strictEqual(ps[0].hand.length, 5);                        // 4 + punição
  assert(ps[0].sent.some((m) => m.t === 'toast'));
  // quem erra pode tentar de novo; corte sem janela é recusado
  room.lockUntil = 0; room.doDraw(ps[2].id);
  throws(() => room.cut(ps[0].id, ps[0].hand[0]), /descarte|janela|vez/);
}

// 5. Reis: preto != vermelho; mesma cor corta
{
  const { room, ps } = setup(3);
  stackDraw(room, 'K', 'S'); room.doDraw(ps[0].id); room.discardDrawn(ps[0].id);
  give(room, ps[1], 0, 'K', 'H');
  room.cut(ps[1].id, ps[1].hand[0]);
  assert.strictEqual(ps[1].hand.length, 5);                        // K vermelho (0) != K preto (13)
  room.lockUntil = 0;
  stackDraw(room, 'K', 'H'); room.doDraw(ps[1].id); room.discardDrawn(ps[1].id);
  give(room, ps[2], 0, 'K', 'D');
  room.cut(ps[2].id, ps[2].hand[0]);
  assert.strictEqual(ps[2].hand.length, 3);                        // K♥ corta K♦
}

// 6. autocorte
{
  const { room, ps } = setup(3);
  give(room, ps[0], 1, '7', 'C');
  stackDraw(room, '7', 'D'); room.doDraw(ps[0].id); room.discardDrawn(ps[0].id);
  room.cut(ps[0].id, ps[0].hand[1]);
  assert.strictEqual(ps[0].hand.length, 3);
  const n = room.discard.length; assert.strictEqual(room.discard[n - 1] !== room.discard[n - 2], true);
}

// 7. esvaziar a mão encerra na hora e contabiliza
{
  const { room, ps } = setup(2);
  ps[1].hand.splice(1); // sobra 1 carta
  give(room, ps[1], 0, '3', 'S');
  stackDraw(room, '3', 'H'); room.doDraw(ps[0].id); room.discardDrawn(ps[0].id);
  room.cut(ps[1].id, ps[1].hand[0]);
  assert.strictEqual(room.phase, 'ended'); assert.strictEqual(room.result.reason, 'empty');
  assert.deepStrictEqual(room.result.winners, [ps[1].id]);
  assert.strictEqual(room.result.rows.find((r) => r.id === ps[1].id).points, 0);
}

// 8. poderes
{
  const { room, ps } = setup(3);
  // 10: revela carta própria só para o jogador, é opcional
  give(room, ps[0], 3, '10', 'S'); stackDraw(room, '2', 'S'); room.doDraw(ps[0].id);
  room.swap(ps[0].id, ps[0].hand[3]);
  assert.strictEqual(room.sub, 'power');
  throws(() => room.power(ps[0].id, [ps[1].hand[0]]), /sua/);
  ps[0].sent.length = 0; ps[1].sent.length = 0;
  room.power(ps[0].id, [ps[0].hand[0]]);
  assert(ps[0].sent.some((m) => m.t === 'reveal') && !ps[1].sent.some((m) => m.t === 'reveal'));
  assert.strictEqual(room.current(), ps[1]);
  // Q: espiar só outro jogador
  room.lockUntil = 0;
  stackDraw(room, 'Q', 'S'); room.doDraw(ps[1].id); room.discardDrawn(ps[1].id);
  throws(() => room.power(ps[1].id, [ps[1].hand[0]]), /outro/);
  ps[2].sent.length = 0; ps[1].sent.length = 0;
  room.power(ps[1].id, [ps[2].hand[0]]);
  assert(ps[1].sent.some((m) => m.t === 'reveal') && !ps[2].sent.some((m) => m.t === 'reveal'));
  // J: troca entre dois jogadores diferentes (inclusive outros dois), nunca dois do mesmo
  room.lockUntil = 0;
  stackDraw(room, 'J', 'S'); room.doDraw(ps[2].id); room.discardDrawn(ps[2].id);
  throws(() => room.power(ps[2].id, [ps[2].hand[0], ps[2].hand[1]]), /diferentes/);
  const a = ps[0].hand[1], b = ps[1].hand[2];
  room.power(ps[2].id, [a, b]);
  assert.strictEqual(ps[0].hand[1], b); assert.strictEqual(ps[1].hand[2], a);
  assert.strictEqual(ps[0].hand.length, 4);
  // poder pode ser ignorado
  room.lockUntil = 0;
  stackDraw(room, 'Q', 'H'); room.doDraw(ps[0].id); room.discardDrawn(ps[0].id);
  room.skipPower(ps[0].id); assert.strictEqual(room.current(), ps[1]);
}

// 9. encerramento voluntário: só no início da vez, antes de comprar
{
  const { room, ps } = setup(3);
  throws(() => room.endVoluntary(ps[1].id), /vez/);
  room.endVoluntary(ps[0].id);
  assert.strictEqual(room.phase, 'ended'); assert.strictEqual(room.result.reason, 'voluntary');
}

// 10. desempate: menos cartas vence; depois empate real
{
  const { room, ps } = setup(2);
  ps[0].hand.splice(2); ps[1].hand.splice(3);
  give(room, ps[0], 0, '5', 'S'); give(room, ps[0], 1, '5', 'H'); // 10 pts, 2 cartas
  give(room, ps[1], 0, '4', 'S'); give(room, ps[1], 1, '3', 'S'); give(room, ps[1], 2, '3', 'H'); // 10 pts, 3 cartas
  room.endVoluntary(ps[0].id);
  assert.deepStrictEqual(room.result.winners, [ps[0].id]); assert.strictEqual(room.result.tie, false);
  const { room: r2, ps: q } = setup(2);
  q[0].hand.splice(2); q[1].hand.splice(2);
  give(r2, q[0], 0, '5', 'S'); give(r2, q[0], 1, '5', 'H'); give(r2, q[1], 0, '6', 'S'); give(r2, q[1], 1, '4', 'S');
  r2.endVoluntary(q[0].id);
  assert.strictEqual(r2.result.tie, true);
  r2.hostId = q[0].id; r2.start(q[0].id, { extra: true });          // rodada extra só com os empatados
  assert.strictEqual(r2.phase, 'peek'); assert.strictEqual(r2.parts().length, 2);
}

// 11. pilha de compras esgotada é reembaralhada com o descarte
{
  const { room, ps } = setup(2);
  const top = room.draw.length; room.discard.push(...room.draw.splice(0, top - 1)); // deixa 1 carta na compra
  stackDraw(room, '2', 'S'); room.doDraw(ps[0].id); room.discardDrawn(ps[0].id);
  room.lockUntil = 0; room.doDraw(ps[1].id);
  assert(room.draw.length > 0); room.checkInvariant();
}

// 12. pegar o topo do descarte (em vez de comprar da pilha)
{
  const { room, ps } = setup(3);
  throws(() => room.takeDiscard(ps[0].id), /descarte/i);                  // descarte vazio
  stackDraw(room, '5', 'H'); room.doDraw(ps[0].id); room.discardDrawn(ps[0].id);   // P0 descarta 5♥
  assert.strictEqual(room.turnIdx, 1); assert(room.cutWindow);
  throws(() => room.takeDiscard(ps[1].id), /Calma/);                      // respeita a janela de corte
  room.lockUntil = 0;
  throws(() => room.takeDiscard(ps[2].id), /inválida|vez/i);              // só quem está na vez
  const before = room.draw.length, topId = room.discard[room.discard.length - 1];
  room.takeDiscard(ps[1].id);
  assert.strictEqual(room.draw.length, before);                           // pilha de compra intacta
  assert.strictEqual(ps[1].drawn, topId); assert.strictEqual(ps[1].drawnFrom, 'discard');
  assert.strictEqual(room.cutWindow, null);                               // fecha a janela de corte
  assert.strictEqual(room.discard.length, 0);
  assert.strictEqual(room.view(ps[1]).drawn.rank, '5'); assert.strictEqual(room.view(ps[1]).drawnFrom, 'discard');
  assert.strictEqual(room.view(ps[0]).drawn, null);
  throws(() => room.discardDrawn(ps[1].id), /troque/i);                   // não pode devolver
  give(room, ps[1], 0, 'Q', 'S');
  const out = ps[1].hand[0];
  room.swap(ps[1].id, out);
  assert.strictEqual(ps[1].drawnFrom, null);
  assert.strictEqual(room.discard[room.discard.length - 1], out);         // a trocada vai para o descarte
  assert.strictEqual(room.sub, 'power'); assert.strictEqual(room.pending.type, 'Q');  // e o poder da Dama dispara
  room.checkInvariant();
}
{
  // piloto automático nunca trava com carta do descarte
  const { room, ps } = setup(2);
  stackDraw(room, '9', 'C'); room.doDraw(ps[0].id); room.discardDrawn(ps[0].id);
  room.lockUntil = 0; room.takeDiscard(ps[1].id);
  const Bot = require('../bot');
  const d = Bot.chooseAction(room, ps[1]);
  assert.strictEqual(d.type, 'swap'); assert(ps[1].hand.includes(d.cardId));
  room.swap(ps[1].id, d.cardId); room.checkInvariant();
}
console.log('OK: regras do manual (12 grupos de verificações).');
