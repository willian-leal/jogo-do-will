'use strict';
/**
 * Motor do Jogo do Will — servidor autoritativo.
 * Toda regra do manual é aplicada aqui; o cliente só mostra o estado e envia intenções.
 */
const crypto = require('crypto');
const Bot = require('./bot');

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const MAX_PLAYERS = 8;

class GameError extends Error {}
const fail = (m) => { throw new GameError(m); };

const isRed = (s) => s === 'H' || s === 'D';
function points(c) {
  if (c.rank === 'A') return 1;
  if (c.rank === 'J') return 11;
  if (c.rank === 'Q') return 12;
  if (c.rank === 'K') return isRed(c.suit) ? 0 : 13; // K preto 13, K vermelho 0
  return parseInt(c.rank, 10);
}
const pub = (c) => ({ id: c.id, rank: c.rank, suit: c.suit, pts: points(c) });
const rid = (n = 6) => crypto.randomBytes(n).toString('hex');
const rand = (a, b) => a + Math.random() * (b - a);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Room {
  constructor(code, opts = {}) {
    this.code = code;
    this.speed = opts.speed ?? 1;           // multiplicador de tempo (testes usam < 1)
    this.onChange = opts.onChange || null;  // gancho para testes
    this.players = [];
    this.hostId = null;
    this.phase = 'lobby';                   // lobby | peek | play | ended
    this.log = [];
    this.logN = 0;
    this.timers = new Set();
    this.cards = new Map();
    this.draw = [];
    this.discard = [];
    this.decks = 1;
    this.turnIdx = 0;
    this.turnSeq = 0;
    this.sub = null;                        // draw | action | power
    this.pending = null;                    // { type, by }
    this.cutWindow = null;                  // { value, sched }
    this.lockUntil = 0;
    this.autoKey = null;
    this.fxq = [];
    this.result = null;
    this.gameNo = 0;
    this.turnTime = 0;                      // segundos por turno (0 = sem limite)
    this.rounds = 1;                        // rodadas do campeonato (1 = partida única)
    this.fast = false;                      // mesa rápida: janela de corte menor + 20 s por turno
    this.seriesRounds = 1; this.roundNo = 0; this.totals = {}; this.seriesIds = [];
    this.deadline = 0;
    this.wins = {};
    this.lastReact = {};
    this.lastActivity = Date.now();
    this.destroyed = false;
  }

  /* ------------------------------ utilidades ------------------------------ */
  get LOCK() { return (this.fast ? 1300 : 2200) * this.speed; }
  after(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); if (!this.destroyed) fn(); }, Math.max(1, ms * this.speed));
    this.timers.add(t);
  }
  destroy() { this.destroyed = true; for (const t of this.timers) clearTimeout(t); this.timers.clear(); }
  byId(id) { return this.players.find((p) => p.id === id); }
  parts() { return this.players.filter((p) => p.inGame); }
  current() { return this.parts()[this.turnIdx]; }
  isAuto(p) { return p.bot || !p.connected || p.forcedTurn === this.turnSeq; }
  logMsg(msg) { this.log.push({ n: ++this.logN, msg }); if (this.log.length > 80) this.log.shift(); }
  owner(cardId) { return this.parts().find((p) => p.hand.includes(cardId)); }

  /* ------------------------------- jogadores ------------------------------ */
  addPlayer({ name, bot = false, level = 'medio' }) {
    if (this.players.length >= MAX_PLAYERS) fail(`A sala está cheia (máximo ${MAX_PLAYERS}).`);
    let base = String(name || (bot ? 'Bot' : 'Jogador')).replace(/[<>&"]/g, '').trim().slice(0, 16) || 'Jogador';
    let nm = base, k = 2;
    while (this.players.some((p) => p.name === nm)) nm = `${base} ${k++}`;
    const p = {
      id: rid(4), token: rid(12), name: nm, bot, level: Bot.LEVELS.includes(level) ? level : 'medio', trait: bot ? Bot.randomTrait() : 'equilibrado', connected: bot, send: () => {}, conn: null,
      hand: [], drawn: null, drawnFrom: null, peeksLeft: 0, peeked: new Set(), ready: false, inGame: false, memory: {}, turns: 0,
    };
    this.players.push(p);
    if (!bot && !this.hostId) this.hostId = p.id;
    return p;
  }
  addBot(pid, level) {
    if (pid !== this.hostId) fail('Só o anfitrião pode adicionar bots.');
    if (this.phase !== 'lobby' && this.phase !== 'ended') fail('Aguarde o fim da partida.');
    const names = ['Bia', 'Caio', 'Duda', 'Enzo', 'Lia', 'Theo', 'Nina', 'Davi'];
    const used = new Set(this.players.map((p) => p.name));
    const nm = names.find((n) => !used.has(n)) || 'Bot';
    const b = this.addPlayer({ name: nm, bot: true, level });
    this.logMsg(`${b.name} (bot ${Bot.LEVEL_NAMES[b.level].toLowerCase()}) entrou na sala.`);
    this.change();
  }
  removePlayer(pid, byId) {
    if (byId !== this.hostId && byId !== pid) fail('Sem permissão.');
    if (this.phase === 'peek' || this.phase === 'play') fail('Não é possível remover jogadores durante a partida.');
    const p = this.byId(pid);
    if (!p) return;
    this.players = this.players.filter((x) => x !== p);
    if (this.hostId === pid) this.reassignHost();
    this.logMsg(`${p.name} saiu da sala.`);
    this.change();
  }
  reassignHost() {
    const h = this.players.find((p) => !p.bot && p.connected) || this.players.find((p) => !p.bot);
    this.hostId = h ? h.id : null;
  }
  disconnect(p) {
    p.connected = false; p.send = () => {}; p.conn = null;
    if (this.hostId === p.id) this.reassignHost();
    this.logMsg(`${p.name} desconectou.`);
    if (this.phase === 'lobby' || this.phase === 'ended') {
      this.after(60000 / this.speed, () => { // 60s reais de tolerância
        if (!p.connected && (this.phase === 'lobby' || this.phase === 'ended')) {
          this.players = this.players.filter((x) => x !== p);
          if (this.hostId === p.id) this.reassignHost();
          this.change();
        }
      });
    }
    this.change();
  }
  reconnected(p) {
    p.connected = true;
    const h = this.byId(this.hostId);
    if (!h || !h.connected) this.hostId = p.id;
    this.logMsg(`${p.name} voltou.`);
    this.change();
  }
  hasHumans() { return this.players.some((p) => !p.bot && p.connected); }

  /* ------------------------------- início --------------------------------- */
  start(pid, { extra = false } = {}) {
    if (pid !== this.hostId) fail('Só o anfitrião pode iniciar a partida.');
    if (this.phase !== 'lobby' && this.phase !== 'ended') fail('A partida já está em andamento.');
    const isExtra = !!(extra && this.result && this.result.tie && this.result.series.of === 1);
    let ids;
    if (isExtra) { ids = this.result.winners; this.roundNo = 0; this.totals = {}; this.seriesRounds = 1; this.seriesIds = ids; }
    else if (this.seriesInProgress()) ids = this.seriesIds.filter((id) => this.byId(id) && (this.byId(id).bot || this.byId(id).connected));
    else { // novo campeonato / partida única
      ids = this.players.filter((p) => p.bot || p.connected).map((p) => p.id);
      this.roundNo = 0; this.totals = {}; this.seriesRounds = this.rounds; this.seriesIds = ids;
    }
    this.startGame(ids, isExtra);
  }

  startGame(ids, isExtra = false) {
    const parts = this.players.filter((p) => ids.includes(p.id));
    if (parts.length < 2) fail('São necessários pelo menos 2 jogadores.');
    this.timers.forEach((t) => clearTimeout(t)); this.timers.clear();
    this.decks = parts.length === 2 ? 1 : 2;
    const deck = [];
    for (let d = 0; d < this.decks; d++) for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
    shuffle(deck);
    this.cards = new Map();
    deck.forEach((c, i) => { c.id = i + 1; this.cards.set(c.id, c); }); // ids só depois de embaralhar
    this.draw = deck.map((c) => c.id);
    this.discard = [];
    for (const p of this.players) {
      p.hand = []; p.drawn = null; p.drawnFrom = null; p.memory = {}; p.turns = 0; p.ready = false; p.peeksLeft = 0; p.peeked = new Set();
      p.inGame = parts.includes(p);
    }
    for (let i = 0; i < 4; i++) for (const p of parts) p.hand.push(this.draw.pop());
    for (const p of parts) p.peeksLeft = 2;
    this.gameNo++; this.roundNo++;
    this.phase = 'peek'; this.sub = null; this.pending = null; this.cutWindow = null; this.result = null;
    this.log = [];
    this.logMsg(isExtra ? 'Rodada extra entre os empatados!' : this.seriesRounds > 1 ? `Rodada ${this.roundNo} de ${this.seriesRounds} — ${parts.length} jogadores, ${this.decks} baralho(s).` : `Nova partida com ${parts.length} jogadores e ${this.decks} baralho(s).`);
    this.logMsg('Cada jogador pode olhar 2 das suas 4 cartas, uma única vez.');
    this.change();
  }

  /* ------------------------- fase de memorização --------------------------- */
  peek(pid, cardId) {
    const p = this.byId(pid);
    if (this.phase !== 'peek' || !p || !p.inGame) fail('Agora não dá para olhar cartas.');
    if (p.ready) fail('Você já confirmou.');
    if (p.peeksLeft <= 0) fail('Você já olhou duas cartas.');
    if (!p.hand.includes(cardId)) fail('Escolha uma das suas cartas.');
    if (p.peeked.has(cardId)) return;
    p.peeked.add(cardId);
    p.peeksLeft--;
    this.remember(p, cardId, false);
    this.reveal(p, [cardId], 0);
    this.change();
  }
  ready(pid) {
    const p = this.byId(pid);
    if (this.phase !== 'peek' || !p || !p.inGame) return;
    p.ready = true; p.peeksLeft = 0;
    this.checkAllReady();
    this.change();
  }
  autoPeek(p) {
    const picks = shuffle([...p.hand]).slice(0, 2);
    for (const id of picks) this.remember(p, id, p.bot);
    p.peeksLeft = 0; p.ready = true;
    this.checkAllReady();
    this.change();
  }
  checkAllReady() {
    if (this.phase !== 'peek') return;
    if (!this.parts().every((p) => p.ready)) return;
    this.phase = 'play';
    this.turnIdx = Math.floor(Math.random() * this.parts().length);
    this.beginTurn();
    this.logMsg(`A partida começou! ${this.current().name} joga primeiro.`);
  }

  /* ------------------------------- turnos --------------------------------- */
  beginTurn() {
    this.turnSeq++;
    this.sub = 'draw'; this.pending = null;
    this.current().turns++;
    this.armTimer();
  }
  armTimer() {
    const cur = this.current(), seq = this.turnSeq;
    this.deadline = 0;
    if (!this.turnTime || !cur || cur.bot || !cur.connected) return;
    this.deadline = Date.now() + this.turnTime * 1000 * this.speed;
    this.after(this.turnTime * 1000, () => {
      if (this.phase !== 'play' || this.turnSeq !== seq) return;
      cur.forcedTurn = seq;                 // a vez dele passa a ser jogada pelo piloto automático
      this.logMsg(`Tempo esgotado: ${cur.name} joga no automático.`);
      this.fx({ k: 'timeout', by: cur.id });
      this.autoKey = null;
      this.change();
    });
  }
  setting(pid, st) {
    if (pid !== this.hostId) fail('Só o anfitrião muda as configurações.');
    if (this.phase !== 'lobby' && this.phase !== 'ended') fail('Configure antes de iniciar a partida.');
    if (typeof st === 'number') st = { turnTime: st };
    if (st.turnTime !== undefined) {
      if (![0, 20, 30, 60, 90].includes(st.turnTime)) fail('Valor inválido.');
      this.turnTime = st.turnTime;
      this.logMsg(st.turnTime ? `Tempo por turno: ${st.turnTime}s.` : 'Sem limite de tempo por turno.');
    }
    if (st.fast !== undefined) {
      this.fast = !!st.fast;
      if (this.fast && (this.turnTime === 0 || this.turnTime > 20)) this.turnTime = 20;
      this.logMsg(this.fast ? 'Mesa rápida: janela de corte menor e 20 s por turno.' : 'Ritmo normal.');
    }
    if (st.rounds !== undefined) {
      if (![1, 3, 5].includes(st.rounds)) fail('Valor inválido.');
      if (this.seriesInProgress()) fail('Termine o campeonato em andamento antes de mudar as rodadas.');
      this.rounds = st.rounds;
      this.logMsg(st.rounds > 1 ? `Campeonato de ${st.rounds} rodadas (pontos acumulados).` : 'Partida única.');
    }
    this.change();
  }
  seriesInProgress() { return this.phase === 'ended' && this.result && this.result.series && !this.result.series.done; }
  react(p, emoji) {
    if (!['👍', '😂', '😮', '😡', '👏', '🤔', '🔥', '😅', 'Boa!', 'Rápido!', 'Revanche?', 'Calma…', 'Que sorte!', 'Quase!'].includes(emoji)) return;
    const now = Date.now();
    if (now - (this.lastReact[p.id] || 0) < 700) return;
    this.lastReact[p.id] = now;
    this.fx({ k: 'react', by: p.id, emoji });
    this.broadcast();
  }
  advanceTurn() {
    this.turnIdx = (this.turnIdx + 1) % this.parts().length;
    this.beginTurn();
  }
  need(pid, sub) {
    if (this.phase !== 'play') fail('A partida não está em andamento.');
    const cur = this.current();
    if (!cur || cur.id !== pid) fail('Não é a sua vez.');
    if (sub && this.sub !== sub) fail('Ação inválida neste momento.');
    return cur;
  }
  drawCard() {
    if (!this.draw.length && this.discard.length > 1) {
      const top = this.discard.pop();
      this.draw = shuffle(this.discard.slice());
      this.discard = [top];
      this.logMsg('A pilha de compras acabou e foi reembaralhada.');
    }
    return this.draw.length ? this.draw.pop() : null;
  }

  doDraw(pid) {
    const p = this.need(pid, 'draw');
    const id = this.drawCard();
    if (id == null) return this.endGame('deck', pid);
    p.drawn = id; p.drawnFrom = 'pile';
    p.memory[id] = points(this.cards.get(id));
    this.sub = 'action';
    // comprar da pilha NÃO fecha o corte: vale até alguém descartar outra carta
    this.logMsg(`${p.name} comprou uma carta.`);
    this.fx({ k: 'draw', by: p.id });
    this.change();
  }
  takeDiscard(pid) {
    const p = this.need(pid, 'draw');
    if (!this.discard.length) fail('Não há carta no descarte.');
    const id = this.discard.pop(), c = this.cards.get(id);
    p.drawn = id; p.drawnFrom = 'discard';
    p.memory[id] = points(c);
    this.sub = 'action';
    this.cutWindow = null; // a carta cortável saiu do topo
    this.logMsg(`${p.name} pegou ${this.label(c)} do descarte.`);
    this.fx({ k: 'draw', by: p.id, from: 'discard', card: pub(c) });
    this.change();
  }
  discardDrawn(pid) {
    const p = this.need(pid, 'action');
    if (p.drawnFrom === 'discard') fail('Você pegou do descarte: troque por uma carta da sua mão.');
    const id = p.drawn; p.drawn = null; p.drawnFrom = null;
    this.logMsg(`${p.name} descartou a carta comprada.`);
    this.afterDiscard(p, id, 'drawn');
  }
  swap(pid, cardId) {
    const p = this.need(pid, 'action');
    const idx = p.hand.indexOf(cardId);
    if (idx < 0) fail('Escolha uma das suas cartas para trocar.');
    const old = p.hand[idx];
    p.hand[idx] = p.drawn; p.drawn = null; p.drawnFrom = null;
    this.logMsg(`${p.name} trocou a carta comprada por uma da mão.`);
    this.afterDiscard(p, old, 'swap', p.hand[idx]);
  }
  afterDiscard(p, cardId, via, slot) {
    this.discard.push(cardId);
    const c = this.cards.get(cardId);
    this.fx({ k: 'discard', by: p.id, via, slot, card: pub(c) });
    this.logMsg(`Descarte: ${this.label(c)}.`);
    this.cutWindow = { value: points(c), sched: false };
    if (c.rank === '10' || c.rank === 'Q' || c.rank === 'J') {
      this.sub = 'power'; this.pending = { type: c.rank, by: p.id };
    } else {
      this.advanceTurn();
    }
    this.change();
  }
  label(c) { return `${c.rank}${{ S: '♠', H: '♥', D: '♦', C: '♣' }[c.suit]}`; }

  power(pid, targets) {
    const pend = this.pending;
    if (this.phase !== 'play' || this.sub !== 'power' || !pend || pend.by !== pid) fail('Não há poder para usar agora.');
    const p = this.byId(pid);
    if (!Array.isArray(targets)) fail('Alvo inválido.');
    if (pend.type === '10') {
      const id = targets[0];
      if (!p.hand.includes(id)) fail('Escolha uma carta sua.');
      this.remember(p, id, false);
      this.reveal(p, [id], 4000);
      this.fx({ k: 'power', type: '10', by: pid, targets: [{ owner: pid, cardId: id }] });
      this.logMsg(`${p.name} usou o 10 e revisou uma carta sua.`);
    } else if (pend.type === 'Q') {
      const id = targets[0];
      const o = this.owner(id);
      if (!o || o.id === pid) fail('Escolha uma carta de outro jogador.');
      this.remember(p, id, false);
      this.reveal(p, [id], 4000);
      this.fx({ k: 'power', type: 'Q', by: pid, targets: [{ owner: o.id, cardId: id }] });
      this.logMsg(`${p.name} usou a Dama e espiou uma carta de ${o.name}.`);
    } else if (pend.type === 'J') {
      const [a, b] = targets;
      const oa = this.owner(a), ob = this.owner(b);
      if (!oa || !ob || a === b || oa === ob) fail('Escolha duas cartas de jogadores diferentes.');
      const ia = oa.hand.indexOf(a), ib = ob.hand.indexOf(b);
      oa.hand[ia] = b; ob.hand[ib] = a;
      this.fx({ k: 'power', type: 'J', by: pid, targets: [{ owner: oa.id, cardId: b }, { owner: ob.id, cardId: a }] });
      this.logMsg(`${p.name} usou o Valete: trocou uma carta de ${oa.name} com uma de ${ob.name}.`);
    }
    this.advanceTurn();
    this.change();
  }
  skipPower(pid) {
    const pend = this.pending;
    if (this.phase !== 'play' || this.sub !== 'power' || !pend || pend.by !== pid) fail('Não há poder para pular.');
    this.logMsg(`${this.byId(pid).name} escolheu não usar o poder.`);
    this.advanceTurn();
    this.change();
  }

  /* -------------------------------- cortes -------------------------------- */
  cut(pid, cardId) {
    const p = this.byId(pid);
    if (this.phase !== 'play' || !p || !p.inGame) fail('Não dá para cortar agora.');
    const cw = this.cutWindow;
    if (!cw) fail('Não há descarte para cortar (alguém já cortou ou outra carta já foi descartada).');
    const idx = p.hand.indexOf(cardId);
    if (idx < 0) fail('Escolha uma carta da sua mão.');
    const card = this.cards.get(cardId);
    if (points(card) === cw.value) {
      p.hand.splice(idx, 1);
      this.discard.push(cardId);
      this.cutWindow = null; // só o primeiro corte correto vale
      this.fx({ k: 'cut', by: p.id, ok: true, card: pub(card) });
      this.logMsg(`${p.name} cortou com ${this.label(card)}! (${p.hand.length} carta${p.hand.length === 1 ? '' : 's'} na mão)`);
      if (p.hand.length === 0) return this.endGame('empty', pid);
      this.change();
    } else {
      const id = this.drawCard();
      if (id != null) p.hand.push(id);
      this.fx({ k: 'cut', by: p.id, ok: false, penalty: id });
      this.logMsg(`${p.name} errou o corte e comprou uma carta de punição.`);
      this.change();
      p.send({ t: 'toast', kind: 'bad', msg: 'Corte errado! Você comprou uma carta de punição.' });
    }
  }

  /* ------------------------------ encerramento ----------------------------- */
  endVoluntary(pid) {
    this.need(pid, 'draw'); // antes de comprar ou descartar
    this.logMsg(`${this.byId(pid).name} anunciou o encerramento da partida!`);
    this.endGame('voluntary', pid);
  }
  endGame(reason, pid) {
    const rows = this.parts().map((p) => {
      const cards = p.hand.map((id) => pub(this.cards.get(id)));
      return { id: p.id, name: p.name, count: cards.length, points: cards.reduce((s, c) => s + c.pts, 0), cards };
    });
    const sorted = [...rows].sort((a, b) => a.points - b.points || a.count - b.count);
    const best = sorted[0];
    const tied = sorted.filter((r) => r.points === best.points && r.count === best.count);
    for (const r of rows) this.totals[r.id] = (this.totals[r.id] || 0) + r.points;
    const done = this.roundNo >= this.seriesRounds;
    const ranking = rows.map((r) => ({ id: r.id, name: r.name, total: this.totals[r.id] })).sort((a, b) => a.total - b.total);
    const sWin = ranking.filter((x) => x.total === ranking[0].total).map((x) => x.id);
    this.result = { reason, by: pid, rows, winners: tied.map((r) => r.id), tie: tied.length > 1,
      series: { round: this.roundNo, of: this.seriesRounds, done, ranking, winners: sWin } };
    this.phase = 'ended'; this.sub = null; this.pending = null; this.cutWindow = null; this.deadline = 0;
    if (done) {
      const w = this.seriesRounds === 1 ? (tied.length === 1 ? tied[0].id : null) : (sWin.length === 1 ? sWin[0] : null);
      if (w) this.wins[w] = (this.wins[w] || 0) + 1;
    }
    // corte pode encerrar a partida com alguém segurando a carta comprada: ela volta ao fundo da pilha
    for (const p of this.players) { if (p.drawn != null) this.draw.unshift(p.drawn); p.drawn = null; p.drawnFrom = null; p.ready = false; }
    if (this.seriesRounds > 1) {
      this.logMsg(done ? (sWin.length > 1 ? 'Campeonato empatado!' : `${this.byId(sWin[0]).name} é o campeão com ${ranking[0].total} ponto(s)!`)
        : `Fim da rodada ${this.roundNo} de ${this.seriesRounds}: ${tied.length > 1 ? 'empate' : best.name + ' venceu a rodada'}.`);
    } else this.logMsg(tied.length > 1 ? 'Empate!' : `${best.name} venceu com ${best.points} ponto(s)!`);
    this.change();
  }

  /* ------------------------------ memória/bots ----------------------------- */
  remember(p, id, fuzz) {
    let v = points(this.cards.get(id));
    if (fuzz && Math.random() < Bot.params(p).misremember) v = Math.floor(rand(0, 14)); // bot pode lembrar errado
    p.memory[id] = v;
  }
  reveal(p, ids, ms, why) {
    p.send({ t: 'reveal', ms, why, cards: ids.map((i) => pub(this.cards.get(i))) });
  }

  /* ------------------------------- ações (rede) ---------------------------- */
  act(p, m) {
    try {
      switch (m.t) {
        case 'addBot': this.addBot(p.id, m.level); break;
        case 'removePlayer': this.removePlayer(String(m.id), p.id); break;
        case 'start': this.start(p.id, { extra: !!m.extra }); break;
        case 'peek': this.peek(p.id, m.cardId | 0); break;
        case 'ready': this.ready(p.id); break;
        case 'draw': this.doDraw(p.id); break;
        case 'takeDiscard': this.takeDiscard(p.id); break;
        case 'discard': this.discardDrawn(p.id); break;
        case 'swap': this.swap(p.id, m.cardId | 0); break;
        case 'power': this.power(p.id, (m.targets || []).map((x) => x | 0)); break;
        case 'skip': this.skipPower(p.id); break;
        case 'cut': this.cut(p.id, m.cardId | 0); break;
        case 'end': this.endVoluntary(p.id); break;
        case 'setting': this.setting(p.id, { turnTime: m.turnTime === undefined ? undefined : m.turnTime | 0, rounds: m.rounds === undefined ? undefined : m.rounds | 0, fast: m.fast === undefined ? undefined : !!m.fast }); break;
        case 'react': this.react(p, String(m.emoji)); break;
        default: break;
      }
    } catch (e) {
      if (e instanceof GameError) p.send({ t: 'error', msg: e.message });
      else throw e;
    }
  }

  /* --------------------------------- estado -------------------------------- */
  view(v) {
    const cur = this.phase === 'play' ? this.current() : null;
    const ended = this.phase === 'ended';
    const top = this.discard.length ? this.cards.get(this.discard[this.discard.length - 1]) : null;
    return {
      t: 'state', code: this.code, gameNo: this.gameNo, phase: this.phase, you: v.id, hostId: this.hostId, decks: this.decks,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, bot: p.bot, level: p.bot ? p.level : undefined, wins: this.wins[p.id] || 0, connected: p.connected, inGame: p.inGame, ready: p.ready,
        count: p.hand.length,
        hand: p.hand.map((id) => (ended && p.inGame ? pub(this.cards.get(id)) : { id })),
        peeksLeft: p.id === v.id ? p.peeksLeft : undefined,
      })),
      turnTime: this.turnTime, fast: this.fast, lockFull: this.LOCK / this.speed, rounds: this.rounds, roundNo: this.roundNo, seriesRounds: this.seriesRounds,
      turnMs: this.deadline ? Math.max(0, Math.ceil((this.deadline - Date.now()) / this.speed)) : 0,
      turn: cur ? cur.id : null,
      sub: this.phase === 'play' ? this.sub : null,
      drawCount: this.draw.length, discardCount: this.discard.length,
      discardTop: top ? pub(top) : null,
      discardStack: this.discard.slice(-6).map((id) => pub(this.cards.get(id))),   // só cartas já reveladas no descarte
      inHand: this.phase === 'play' && this.sub === 'action' && cur && cur.drawn != null ? { by: cur.id, from: cur.drawnFrom, card: cur.drawnFrom === 'discard' ? pub(this.cards.get(cur.drawn)) : null } : null,
      drawnFrom: cur && cur.id === v.id && this.sub === 'action' ? cur.drawnFrom : null,
      drawn: cur && cur.id === v.id && this.sub === 'action' && cur.drawn != null ? pub(this.cards.get(cur.drawn)) : null,
      power: this.pending ? { type: this.pending.type, by: this.pending.by } : null,
      cutOpen: !!this.cutWindow,
      lockMs: Math.max(0, Math.ceil((this.lockUntil - Date.now()) / this.speed)),
      log: this.log.slice(-40),
      result: this.result,
    };
  }
  fx(e) { this.fxq.push(e); }
  broadcast() {
    const list = this.fxq; this.fxq = [];
    for (const p of this.players) {
      if (p.bot || !p.connected) continue;
      if (list.length) p.send({ t: 'fx', list });
      p.send(this.view(p));
    }
  }
  change() {
    this.lastActivity = Date.now();
    this.broadcast();
    if (this.onChange) this.onChange(this);
    this.think();
  }

  /* ------------------------ piloto automático (bots) ----------------------- */
  think() {
    if (this.destroyed) return;
    if (this.phase === 'peek') {
      for (const p of this.parts()) {
        if (this.isAuto(p) && !p.ready && !p._sched) {
          p._sched = true;
          this.after(rand(700, 1800) + (p.bot ? 0 : 4000), () => { p._sched = false; if (this.phase === 'peek' && !p.ready) this.autoPeek(p); });
        }
      }
      return;
    }
    if (this.phase !== 'play') return;

    // bots reagem ao descarte tentando cortar
    const cw = this.cutWindow;
    if (cw && !cw.sched) {
      cw.sched = true;
      for (const p of this.parts()) {
        if (!p.bot) continue;
        if (Bot.cutCandidate(p, cw.value) != null) {
          const [r0, r1] = Bot.params(p).react;
          this.after(rand(r0, r1), () => {
            if (this.cutWindow !== cw || this.phase !== 'play') return;
            const id = Bot.cutCandidate(p, cw.value);
            if (id != null) { try { this.cut(p.id, id); } catch (e) { if (!(e instanceof GameError)) throw e; } }
          });
        }
      }
    }

    const cur = this.current();
    if (!cur || !this.isAuto(cur)) return;
    const key = `${this.turnSeq}:${this.sub}`;
    if (key === this.autoKey) return;
    this.autoKey = key;
    const extra = cur.bot ? 0 : (cur.connected ? 300 : 4000);
    const T = Bot.params(cur).think;
    const still = () => this.phase === 'play' && this.autoKey === key && this.current() === cur;
    const run = (fn) => {
      try { fn(); } catch (e) {
        if (!(e instanceof GameError)) throw e;
        this.autoKey = null; this.after(300, () => this.think()); // tenta de novo (ex.: lock de corte)
      }
    };

    if (this.sub === 'draw') {
      const wait = Math.max(rand(900, 1800) * T + extra, (this.lockUntil - Date.now()) / this.speed + 250);
      this.after(wait, () => {
        if (!still()) return;
        run(() => {
          if (cur.bot && Bot.shouldEnd(cur)) return this.endVoluntary(cur.id);
          if (cur.bot && Bot.wantDiscard(this, cur)) return this.takeDiscard(cur.id);
          return this.doDraw(cur.id);
        });
      });
    } else if (this.sub === 'action') {
      this.after(rand(900, 1700) * T + extra, () => {
        if (!still()) return;
        const d = Bot.chooseAction(this, cur);
        run(() => (d.type === 'swap' ? this.swap(cur.id, d.cardId) : this.discardDrawn(cur.id)));
      });
    } else if (this.sub === 'power') {
      this.after(rand(1000, 2000) * T + extra, () => {
        if (!still()) return;
        const d = Bot.choosePower(this, cur, this.pending.type);
        run(() => (d.skip ? this.skipPower(cur.id) : this.power(cur.id, d.targets)));
      });
    }
  }

  /* ------------------------------ verificação ------------------------------ */
  checkInvariant() {
    const total = this.cards.size;
    let n = this.draw.length + this.discard.length;
    for (const p of this.players) { n += p.hand.length; if (p.drawn != null) n++; }
    if (n !== total) throw new Error(`Invariante quebrada: ${n} cartas contadas, esperado ${total}`);
    const seen = new Set();
    const all = [...this.draw, ...this.discard];
    for (const p of this.players) { all.push(...p.hand); if (p.drawn != null) all.push(p.drawn); }
    for (const id of all) { if (seen.has(id)) throw new Error(`Carta duplicada ${id}`); seen.add(id); }
  }
}

module.exports = { Room, GameError, points, MAX_PLAYERS };
