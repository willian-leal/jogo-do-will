'use strict';
/** Inteligência dos bots. Cada jogador guarda p.memory = { cardId: pontos } do que viu. */

const LEVELS = ['facil', 'medio', 'dificil'];
const LEVEL_NAMES = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };

const PARAMS = {
  // misremember: chance de memorizar valor errado · forget: esquecer por turno · react: janela de reação ao corte (ms)
  // think: multiplicador do tempo de pensar · end: {turns, est, prob} para encerrar · margin: ganho mínimo para trocar
  facil:   { misremember: 0.16, forget: 0.08, react: [1600, 3800], think: 1.25, end: { turns: 6, est: 4, prob: 0.15 }, margin: 4, blind: 3 },
  medio:   { misremember: 0.06, forget: 0.03, react: [1000, 2600], think: 1.0,  end: { turns: 5, est: 5, prob: 0.25 }, margin: 3, blind: 4 },
  dificil: { misremember: 0.015, forget: 0.01, react: [650, 1500], think: 0.8,  end: { turns: 5, est: 5, prob: 0.40 }, margin: 2, blind: 5 },
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
    q.react = [q.react[0] * 0.7, q.react[1] * 0.7]; q.misremember *= 1.8; q.end.prob = Math.min(0.9, q.end.prob * 1.5); q.think *= 0.85;
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

function shouldEnd(p) {
  decay(p);
  const e = params(p).end, est = estimate(p);
  // só encerra quando tem boa certeza: poucas cartas desconhecidas e soma baixa
  if (unknown(p).length > 1) return false;
  if (p.turns >= e.turns && est <= e.est && Math.random() < e.prob) return true;
  if (p.hand.length <= 2 && p.turns >= e.turns - 1 && est <= e.est + 2 && Math.random() < e.prob * 0.7) return true;
  return false;
}

function chooseAction(room, p) {
  const P = params(p);
  const drawnId = p.drawn;
  const v = pts(room, drawnId);
  p.memory[drawnId] = v;
  const k = known(p).filter((id) => id !== drawnId);
  const u = unknown(p).filter((id) => id !== drawnId);
  const highest = k.sort((a, b) => p.memory[b] - p.memory[a])[0];
  const hv = highest !== undefined ? p.memory[highest] : -1;

  // vai cortar com a igual logo depois? então só descarta a comprada
  if (k.some((id) => p.memory[id] === v)) return { type: 'discard' };

  if (v <= 2) {
    if (highest !== undefined && hv > v + 1) return { type: 'swap', cardId: highest };
    if (u.length) return { type: 'swap', cardId: pick(u) };
  }
  if (highest !== undefined && hv >= v + P.margin) return { type: 'swap', cardId: highest };
  if (u.length && v <= P.blind) return { type: 'swap', cardId: pick(u) };
  return { type: 'discard' };
}

function choosePower(room, p, type) {
  const others = room.parts().filter((o) => o !== p && o.hand.length);
  if (type === '10') {
    const u = unknown(p);
    return { targets: [pick(u.length ? u : p.hand)] };
  }
  if (type === 'Q') {
    const o = pick(others);
    return { targets: [pick(o.hand)] };
  }
  // Valete: manda embora uma carta alta que conhece, trocando por uma carta qualquer de outro
  const k = known(p).sort((a, b) => p.memory[b] - p.memory[a]);
  if (k.length && p.memory[k[0]] >= 8 && others.length) {
    const o = pick(others);
    return { targets: [k[0], pick(o.hand)] };
  }
  return { skip: true };
}

module.exports = { TRAITS, randomTrait, LEVELS, LEVEL_NAMES, params, cutCandidate, shouldEnd, chooseAction, choosePower };
