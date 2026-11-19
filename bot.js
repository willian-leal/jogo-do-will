'use strict';
/** Inteligência dos bots. Cada jogador guarda p.memory = { cardId: pontos } do que viu. */

const LEVELS = ['facil', 'medio', 'dificil', 'expert'];
const LEVEL_NAMES = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil', expert: 'Expert' };

const PARAMS = {
  // misremember: chance de memorizar valor errado · forget: esquecer por turno · react: janela de reação ao corte (ms)
  // A dificuldade vem da memória e da estratégia, NÃO da velocidade: todos os níveis reagem e jogam em ritmo humano.
  // think: multiplicador do tempo de pensar · end: {turns, est, prob} para encerrar · margin: ganho mínimo para trocar
  // smart: 0 = poderes ao acaso · 1 = Dama mira cartas desconhecidas do adversário mais perto de ganhar e o Valete se livra de carta alta · 2 = também usa o Valete para atrapalhar quem tem poucas cartas
  facil:   { misremember: 0.16, forget: 0.08, react: [1800, 3600], think: 1.1, end: { turns: 6, est: 4, prob: 0.15 }, margin: 4, blind: 3, smart: 0 },
  medio:   { misremember: 0.06, forget: 0.03, react: [1700, 3400], think: 1.0,  end: { turns: 5, est: 5, prob: 0.25 }, margin: 3, blind: 4, smart: 0 },
  dificil: { misremember: 0.015, forget: 0.01, react: [1600, 3200], think: 1.0,  end: { turns: 5, est: 5, prob: 0.40 }, margin: 2, blind: 5, smart: 1 },
  expert:  { misremember: 0.004, forget: 0.003, react: [1500, 3000], think: 1.0, end: { turns: 4, est: 5, prob: 0.60 }, margin: 2, blind: 6, smart: 2 },
};
// personalidades: dão variedade sem mudar o nível de dificuldade
const TRAITS = ['equilibrado', 'afobado', 'cauteloso'];
const randomTrait = () => TRAITS[Math.floor(Math.random() * TRAITS.length)];
const cache = new Map();
function params(p) {
  const key = `${p.level}|${p.trait}`;
  if (cache.has(key)) return cache.get(key);
  const base = PARAMS[p.level] || PARAMS.medio;
  const q = { ...base, react: [...base.react], end: { ...base.end } };
  if (p.trait === 'afobado') { // reage rápido e se confunde mais; encerra cedo
    q.react = [q.react[0] * 0.85, q.react[1] * 0.85]; q.misremember *= 1.8; q.end.prob = Math.min(0.9, q.end.prob * 1.5); q.think *= 0.9;
  } else if (p.trait === 'cauteloso') { // pensa mais, esquece menos, só encerra com folga
    q.forget *= 0.7; q.end.turns += 1; q.end.prob *= 0.6; q.think *= 1.15;
  }
  cache.set(key, q);
  return q;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pts = (room, id) => require('./game').points(room.cards.get(id));

function decay(p) {
  const f = params(p).forget;
  for (const id of Object.keys(p.memory)) if (Math.random() < f) delete p.memory[id];
}
const known = (p) => p.hand.filter((id) => p.memory[id] !== undefined);
const unknown = (p) => p.hand.filter((id) => p.memory[id] === undefined);

/** Carta da mão que o bot acredita ter o mesmo valor do descarte. */
function cutCandidate(p, value) {
  for (const id of p.hand) if (p.memory[id] === value) return id;
  return null;
}

function estimate(p) {
  let s = 0;
  for (const id of p.hand) s += p.memory[id] !== undefined ? p.memory[id] : 6.8;
  return s;
}

function shouldEnd(p, room) {
  decay(p);
  const e = params(p).end, est = estimate(p);
  // só encerra quando tem boa certeza: poucas cartas desconhecidas e soma baixa
  if (unknown(p).length > 1) return false;
  if (params(p).smart >= 2 && room) {
    // Expert: se alguém está a poucas cartas de acabar, encerra antes com uma mão razoável; com mão ruim não arrisca
    const threat = room.parts().some((o) => o !== p && o.hand.length <= 2);
    if (est > 9) return false;
    if (threat && p.turns >= 3 && est <= 8 && Math.random() < 0.7) return true;
  }
  if (p.turns >= e.turns && est <= e.est && Math.random() < e.prob) return true;
  if (p.hand.length <= 2 && p.turns >= e.turns - 1 && est <= e.est + 2 && Math.random() < e.prob * 0.7) return true;
  return false;
}

// vale a pena pegar o topo do descarte (carta pública) em vez de arriscar a pilha?
function wantDiscard(room, p) {
  if (!room.discard.length) return false;
  const P = params(p);
  const v = pts(room, room.discard[room.discard.length - 1]);
  const k = known(p), u = unknown(p);
  const hv = k.length ? Math.max(...k.map((id) => p.memory[id])) : -1;
  let ok = false;
  if (v <= 2) ok = (hv > v + 1) || u.length > 0;
  else if (hv >= v + P.margin + 1) ok = true;
  else if (u.length && v <= Math.min(P.blind, 4)) ok = true;
  return ok && Math.random() < (p.level === 'facil' ? 0.4 : p.level === 'expert' ? 0.95 : 0.85);
}

function powerUseful(room, p, rank, hv) {
  const others = room.parts().filter((o) => o !== p && o.hand.length);
  if (rank === '10') return unknown(p).length > 0;
  if (rank === 'Q') return others.some((o) => o.hand.some((id) => p.memory[id] === undefined));
  if (rank === 'J') return others.length > 0 && (hv >= 8 || others.some((o) => o.hand.length <= 2));
  return false;
}

function chooseAction(room, p) {
  const P = params(p);
  const drawnId = p.drawn;
  if (p.drawnFrom === 'discard') {
    // veio do descarte: é obrigatório trocar por uma carta da mão
    const vv = pts(room, drawnId); p.memory[drawnId] = vv;
    const kk = known(p).filter((id) => id !== drawnId).sort((a, b) => p.memory[b] - p.memory[a]);
    if (kk.length && p.memory[kk[0]] > vv) return { type: 'swap', cardId: kk[0] };
    const uu = unknown(p).filter((id) => id !== drawnId);
    return { type: 'swap', cardId: pick(uu.length ? uu : p.hand) };
  }
  const v = pts(room, drawnId);
  p.memory[drawnId] = v;
  const k = known(p).filter((id) => id !== drawnId);
  const u = unknown(p).filter((id) => id !== drawnId);
  const highest = k.sort((a, b) => p.memory[b] - p.memory[a])[0];
  const hv = highest !== undefined ? p.memory[highest] : -1;

  // vai cortar com a igual logo depois? então só descarta a comprada
  if (k.some((id) => p.memory[id] === v)) return { type: 'discard' };

  // carta de poder útil agora (Dificil e Expert): descarta para usar o poder em vez de guardar a carta
  if (P.smart >= 1 && powerUseful(room, p, room.cards.get(drawnId).rank, hv)) return { type: 'discard' };

  if (v <= 2) {
    if (highest !== undefined && hv > v + 1) return { type: 'swap', cardId: highest };
    if (u.length) return { type: 'swap', cardId: pick(u) };
  }
  if (highest !== undefined && hv >= v + P.margin) return { type: 'swap', cardId: highest };
  if (u.length && v <= P.blind) return { type: 'swap', cardId: pick(u) };
  return { type: 'discard' };
}

const fewest = (list) => { const m = Math.min(...list.map((o) => o.hand.length)); return pick(list.filter((o) => o.hand.length === m)); };
// carta do adversário cujo valor o bot já viu (por Dama, descarte ou por ter sido sua antes de uma troca)
const seenOf = (o, p) => o.hand.filter((id) => p.memory[id] !== undefined);

function choosePower(room, p, type) {
  const P = params(p);
  const others = room.parts().filter((o) => o !== p && o.hand.length);
  if (type === '10') {
    const u = unknown(p);
    return { targets: [pick(u.length ? u : p.hand)] };
  }
  if (type === 'Q') {
    if (P.smart >= 1) {
      // espia uma carta que ainda não conhece, de quem está mais perto de encerrar (menos cartas)
      const withUnknown = others.filter((o) => o.hand.some((id) => p.memory[id] === undefined));
      if (withUnknown.length) {
        const o = fewest(withUnknown);
        return { targets: [pick(o.hand.filter((id) => p.memory[id] === undefined))] };
      }
    }
    const o = pick(others);
    return { targets: [pick(o.hand)] };
  }
  // Valete
  const k = known(p).sort((a, b) => p.memory[b] - p.memory[a]);
  const high = k.length && p.memory[k[0]] >= 8 ? k[0] : null;
  if (P.smart >= 2 && others.length) {
    // 1) leva uma carta baixa que o bot sabe onde está, dando em troca a sua pior carta conhecida
    for (const o of others) {
      const low = seenOf(o, p).filter((id) => p.memory[id] <= 3).sort((a, b) => p.memory[a] - p.memory[b])[0];
      if (low !== undefined && k.length && p.memory[k[0]] >= p.memory[low] + 4) return { targets: [k[0], low] };
    }
    // 2) adversário com poucas cartas está perto de ganhar: empurra-lhe uma carta alta
    const leader = fewest(others);
    if (leader.hand.length <= 2 && high !== null) return { targets: [high, pick(leader.hand)] };
    // 3) sem carta alta para dar, embaralha a mão do líder com a de outro adversário (ele deixa de saber o que tem)
    if (leader.hand.length <= 3) {
      const rest = others.filter((o) => o !== leader);
      if (rest.length) return { targets: [pick(leader.hand), pick(pick(rest).hand)] };
    }
  }
  if (high !== null && others.length) {
    // manda embora a carta alta; no nível Difícil+ dá ao adversário com menos cartas
    const o = P.smart >= 1 ? fewest(others) : pick(others);
    return { targets: [high, pick(o.hand)] };
  }
  return { skip: true };
}

module.exports = { wantDiscard, TRAITS, randomTrait, LEVELS, LEVEL_NAMES, params, cutCandidate, shouldEnd, chooseAction, choosePower };
