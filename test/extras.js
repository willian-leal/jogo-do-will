'use strict';
// Testes de relógio por turno, configurações, reações e vitórias da sala.
const assert = require('assert');
const { Room, GameError } = require('../game');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const throws = (fn) => assert.throws(fn, (e) => e instanceof GameError);

function mk(speed) {
  const room = new Room('X', { speed, minRounds: 0 });
  const ps = [];
  for (let i = 0; i < 3; i++) { const p = room.addPlayer({ name: 'P' + i }); p.connected = true; p.sent = []; p.send = (m) => p.sent.push(m); ps.push(p); }
  return { room, ps };
}

(async () => {
  // configurações: só o anfitrião, só fora da partida, valores válidos
  {
    const { room, ps } = mk(0.01);
    throws(() => room.setting(ps[1].id, 30));
    throws(() => room.setting(ps[0].id, 45));
    room.setting(ps[0].id, 30); assert.strictEqual(room.turnTime, 30);
    room.startGame(ps.map((p) => p.id)); ps.forEach((p) => room.ready(p.id));
    throws(() => room.setting(ps[0].id, 60));  // durante a partida não
    assert.strictEqual(room.view(ps[0]).turnTime, 30);
    room.destroy();
  }
  // relógio: se o humano da vez não joga, o piloto automático joga por ele e a vez passa
  {
    const { room, ps } = mk(0.02);
    room.turnTime = 5;                            // 5 s * 0.02 = 100 ms
    room.startGame(ps.map((p) => p.id)); ps.forEach((p) => room.ready(p.id));
    const first = room.current(), seq = room.turnSeq;
    assert(room.view(first).turnMs > 0);
    await sleep(1500);
    assert(room.turnSeq > seq, 'a vez deveria ter passado sozinha');
    assert(room.log.some((l) => /Tempo esgotado/.test(l.msg)));
    assert(room.phase === 'play', 'o autopilot de humano não pode encerrar a partida');
    assert(first.sent.some((m) => m.t === 'fx' && m.list.some((f) => f.k === 'timeout')));
    room.destroy();
  }
  // reações: só emojis permitidos e com limite de frequência
  {
    const { room, ps } = mk(0.01);
    room.startGame(ps.map((p) => p.id));
    const count = () => ps[1].sent.filter((m) => m.t === 'fx' && m.list.some((f) => f.k === 'react')).length;
    room.react(ps[0], '👍'); room.react(ps[0], '👍'); room.react(ps[0], '💣');
    assert.strictEqual(count(), 1);
    await sleep(750); room.react(ps[0], '🔥'); assert.strictEqual(count(), 2);
    room.destroy();
  }
  // vitórias acumulam entre partidas; empate não conta
  {
    const { room, ps } = mk(0.0001);
    room.startGame(ps.map((p) => p.id)); ps.forEach((p) => room.ready(p.id));
    room.turnIdx = 0; room.beginTurn();
    ps.forEach((p, i) => { p.hand.splice(1); room.cards.get(p.hand[0]).rank = String(2 + i * 3); room.cards.get(p.hand[0]).suit = 'S'; });
    room.endVoluntary(ps[0].id);
    assert.strictEqual(room.view(ps[0]).players[0].wins, 1);
    room.start(ps[0].id);
    assert.strictEqual(room.view(ps[0]).players[0].wins, 1, 'vitórias persistem na sala');
    room.destroy();
  }
  // campeonato de 3 rodadas: pontos acumulam, o campeão ganha 1 vitória só no fim; espectador entra no meio
  {
    const { room, ps } = mk(0.0001);
    room.setting(ps[0].id, { rounds: 3 });
    room.start(ps[0].id);
    const late = room.addPlayer({ name: 'Late' }); late.connected = true; late.send = () => {};
    assert.strictEqual(late.inGame, false, 'quem entra no meio só assiste');
    assert.doesNotThrow(() => room.view(late));
    const finish = (pts) => {
      ps.forEach((p) => room.ready(p.id));
      room.turnIdx = 0; room.beginTurn();
      ps.forEach((p, i) => { p.hand.splice(1); const c = room.cards.get(p.hand[0]); c.rank = String(pts[i]); c.suit = 'S'; });
      room.endVoluntary(ps[0].id);
    };
    finish([2, 5, 9]);                                           // rodada 1
    assert.strictEqual(room.result.series.done, false); assert.strictEqual(room.view(ps[0]).players[0].wins, 0);
    throws(() => room.setting(ps[0].id, { rounds: 5 }));         // não troca no meio do campeonato
    room.start(ps[0].id); assert.strictEqual(room.roundNo, 2); assert(!room.parts().includes(late));
    finish([9, 3, 4]);                                           // rodada 2: totais 11, 8, 13
    room.start(ps[0].id);
    finish([8, 6, 4]);                                           // rodada 3: totais 19, 14, 17 -> P1 campeão
    const sr = room.result.series;
    assert.strictEqual(sr.done, true); assert.deepStrictEqual(sr.winners, [ps[1].id]);
    assert.strictEqual(room.view(ps[1]).players[1].wins, 1);
    room.start(ps[0].id);                                        // novo campeonato: zera e inclui quem estava assistindo
    assert.strictEqual(room.roundNo, 1); assert(room.parts().includes(late));
    room.destroy();
  }
  // mesa rápida e personalidades dos bots
  {
    const { room, ps } = mk(0.01);
    room.setting(ps[0].id, { fast: true });
    assert.strictEqual(room.fast, true); assert.strictEqual(room.turnTime, 20);
    assert.strictEqual(room.view(ps[0]).lockFull, 1300);
    room.setting(ps[0].id, { fast: false }); assert.strictEqual(room.view(ps[0]).lockFull, 2200);
    const Bot = require('../bot');
    const mkb = (trait) => Bot.params({ level: 'medio', trait });
    assert(mkb('afobado').react[0] < mkb('equilibrado').react[0], 'afobado reage mais rápido');
    assert(mkb('cauteloso').end.prob < mkb('equilibrado').end.prob, 'cauteloso encerra menos');
    assert(Bot.TRAITS.includes(room.addPlayer({ name: 'B', bot: true }).trait));
    room.destroy();
  }
  // frases rápidas: aceita as da lista, ignora texto livre
  {
    const { room, ps } = mk(0.01);
    const seen = []; ps[1].send = (m) => { if (m.t === 'fx') seen.push(...m.list); };
    room.react(ps[0], 'Revanche?'); room.lastReact = {}; room.react(ps[0], 'texto livre qualquer');
    assert(seen.some((f) => f.k === 'react' && f.emoji === 'Revanche?'), 'frase pronta chega aos outros');
    assert(!seen.some((f) => f.emoji === 'texto livre qualquer'), 'texto livre é ignorado');
    room.destroy();
  }
  // voltar ao início guarda a vaga por mais tempo que uma queda de conexão
  {
    const { room, ps } = mk(1);
    const delays = []; room.after = (ms, fn) => delays.push({ ms, fn });
    room.disconnect(ps[1], { away: true }); room.disconnect(ps[2]);
    assert.strictEqual(delays[0].ms, 30 * 60 * 1000, 'vaga guardada por 30 min');
    assert.strictEqual(delays[1].ms, 60 * 1000, 'queda de conexão: 60 s');
    delays[1].fn(); assert(!room.players.includes(ps[2]), 'vaga liberada depois da tolerância');
    room.reconnected(ps[1]); assert.strictEqual(ps[1].away, false);
    delays[0].fn(); assert(room.players.includes(ps[1]), 'quem voltou não perde a vaga');
    room.destroy();
  }
  console.log('OK: extras (relógio, configurações, reações, vitórias, vaga guardada).');
  process.exit(0);
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
