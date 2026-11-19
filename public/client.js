(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ------------------------------ ícones e naipes --------------------------- */
  const PIPS = {
    S: 'M12 2C9 7 3 9.5 3 14a4.5 4.5 0 0 0 8 2.7c-.1 2-.7 3.4-2 5.3h6c-1.3-1.9-1.9-3.3-2-5.3A4.5 4.5 0 0 0 21 14c0-4.5-6-7-9-12z',
    H: 'M12 21s-7-4.6-9.3-9A5.2 5.2 0 0 1 12 6.3 5.2 5.2 0 0 1 21.3 12C19 16.4 12 21 12 21z',
    D: 'M12 2l7 10-7 10-7-10z',
    C: 'M12 3a4 4 0 0 0-3.4 6.1A4.5 4.5 0 1 0 11 16.2c-.1 2-.7 3.3-2 4.8h6c-1.3-1.5-1.9-2.8-2-4.8a4.5 4.5 0 1 0 2.4-7.1A4 4 0 0 0 12 3z',
  };
  const pipSVG = (s) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PIPS[s]}" fill="currentColor"/></svg>`;
  const ICONS = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
    soundoff: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 20h8"/>',
    cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8L20 18M8.5 16L20 6"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  };
  const icon = (n, s = 18, sw = 1.9, col = 'currentColor') => `<span class="ico"><svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg></span>`;
  const winsTag = (n) => (n ? `<span class="wins">${icon('trophy', 13, 2.2)}${n}</span>` : '');
  const botTag = (p) => (p.bot ? '<span class="bot">BOT</span>' : '');

  /* --------------------- estatísticas locais e acessibilidade ---------------- */
  const getAway = () => { try { const a = JSON.parse(localStorage.getItem('will_away')); return a && a.token ? a : null; } catch (_) { return null; } };
  const loadJSON = (k, d) => { try { return Object.assign({}, d, JSON.parse(localStorage.getItem(k) || '{}')); } catch (_) { return { ...d }; } };
  const STATS0 = { games: 0, wins: 0, rounds: 0, cutsOk: 0, cutsBad: 0, best: null };
  const bumpStats = (fn) => { const s = loadJSON('will_stats', STATS0); fn(s); try { localStorage.setItem('will_stats', JSON.stringify(s)); } catch (_) { /* ignore */ } };
  const a11y = loadJSON('will_a11y', { hc: false, btns: false, rm: window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches });
  const narrOn = () => (a11y.narr === undefined ? (loadJSON('will_stats', STATS0).games || 0) < 3 : !!a11y.narr);
  function applyA11y() { document.documentElement.classList.toggle('hc', !!a11y.hc); document.documentElement.classList.toggle('rm', !!a11y.rm); }
  applyA11y();
  let seenTips = loadJSON('will_tips', {});
  let coachKey = null;
  const SUIT_NAMES = { S: 'espadas', H: 'copas', D: 'ouros', C: 'paus' };
  const TIP_TEXT = {
    peek: 'Toque em 2 das suas 4 cartas para olhar. Só vale uma vez: memorize e clique em “Memorizei”.',
    draw: 'Sua vez! Toque (ou arraste) a pilha “Compras” para comprar, ou o “Descarte” para pegar a carta do topo (aí você precisa trocar).',
    action: 'Agora escolha: toque no “Descarte” para descartar a carta comprada, ou toque numa carta sua para trocar (sem olhar a que sai). Dá para arrastar também.',
    cut: 'Alguém descartou! Se você tem uma carta de mesmo valor, toque nela rápido para cortar. Errou? Compra uma carta de castigo.',
    power: 'Você descartou 10, Dama ou Valete: o poder é opcional — use ou pule.',
  };

  let ws = null;
  let S = null;                 // último estado recebido do servidor
  let mode = null;              // null | 'swap' | 'cut'
  let modeTimer = null;
  let sel = [];                 // seleção do Valete: [{id, owner}]
  const reveals = {};           // cardId -> { card, until }
  let prevTopId = null;
  let lockUntil = 0;
  let dismissedResult = null;
  let lockTimer = null;
  let LOCK_FULL = 2200;       // mesmo valor do servidor (tempo mínimo antes do próximo comprar)
  let fxQueue = [];
  const flashes = {};           // cardId -> { until, cls }
  let ghostTop = { id: null, until: 0 };
  let noteTimer;
  let botLevel = localStorage.getItem('will_level') || 'medio';
  let turnEnd = 0, prevTurn = null, prevPhase = null, lastTick = -1;

  /* ------------------------------ sons e vibração --------------------------- */
  let actx = null, muted = localStorage.getItem('will_mute') === '1';
  function ac() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(f, d = 0.12, type = 'sine', g = 0.08, t0 = 0, slide) {
    if (muted) return;
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), v = a.createGain(), t = a.currentTime + t0;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(v); v.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
  }
  const SFX = {
    draw: () => tone(520, 0.07, 'triangle', 0.06, 0, 380),
    discard: () => tone(180, 0.09, 'square', 0.05, 0, 90),
    cutok: () => { tone(660, 0.1, 'triangle', 0.09); tone(990, 0.14, 'triangle', 0.09, 0.09); },
    cutbad: () => tone(140, 0.35, 'sawtooth', 0.08, 0, 70),
    power: () => [880, 1175, 1568].forEach((f, i) => tone(f, 0.12, 'sine', 0.05, i * 0.07)),
    turn: () => { tone(784, 0.12, 'sine', 0.09); tone(1047, 0.18, 'sine', 0.09, 0.12); },
    tick: () => tone(1200, 0.04, 'square', 0.04),
    end: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.08, i * 0.12)),
    react: () => tone(900, 0.06, 'sine', 0.04),
  };
  const vib = (p) => { if (!muted && navigator.vibrate) { try { navigator.vibrate(p); } catch (_) { /* ignore */ } } };
  document.addEventListener('pointerdown', () => ac(), { once: true });

  const BASE_TITLE = document.title;
  /* ------------------------------- rede ---------------------------------- */
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => {
      retry = 0;
      const tok = localStorage.getItem('will_token');
      if (tok) send({ t: 'resume', token: tok });
      if (!$('#home').hidden) send({ t: 'rooms' });
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      onMsg(m);
    };
    ws.onclose = () => {
      toast('Conexão perdida. Reconectando…', 'bad');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, Math.min(8000, 1000 * Math.pow(2, retry++)));
    };
  }
  let retry = 0, retryTimer = null;
  // batimento: mantém a conexão viva em proxies e evita que o serviço hiberne durante a partida
  setInterval(() => { if (ws && ws.readyState === 1) ws.send('{"t":"ping"}'); }, 20000);
  // ao voltar para a aba (ex.: depois do WhatsApp), reconecta na hora se caiu
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    document.title = BASE_TITLE;
    if (!ws || ws.readyState > 1) { clearTimeout(retryTimer); retry = 0; connect(); }
  });
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); else toast('Sem conexão com o servidor.', 'bad'); }

  function onMsg(m) {
    if (m.t === 'joined') {
      localStorage.setItem('will_token', m.token); localStorage.removeItem('will_away');
      history.replaceState(null, '', `?sala=${m.code}`);
    } else if (m.t === 'state') {
      if (S && S.phase !== m.phase) { mode = null; sel = []; }
      if (m.phase !== 'peek') for (const k of Object.keys(reveals)) if (reveals[k].until === Infinity) delete reveals[k];
      if (!m.cutOpen && mode === 'cut') mode = null;
      if (m.sub !== 'power') sel = [];
      if (!(m.sub === 'action' && m.turn === m.you) && mode === 'swap') mode = null;
      const wasTurn = prevTurn, wasPhase = prevPhase;
      S = m;
      LOCK_FULL = m.lockFull || 2200;
      prevTurn = m.turn; prevPhase = m.phase;
      if (pendingSwap) {
        if (m.turn !== m.you || Date.now() > pendingSwap.until) pendingSwap = null;
        else if (m.sub === 'action') {
          const id = pendingSwap.id; pendingSwap = null;
          if (m.players.find((p) => p.id === m.you).hand.some((h) => h.id === id)) send({ t: 'swap', cardId: id });
        }
      }
      turnEnd = m.turnMs ? Date.now() + m.turnMs : 0;
      if (m.phase === 'play' && m.turn === m.you && wasTurn !== m.you) { SFX.turn(); vib(70); if (document.hidden) document.title = '🔔 Sua vez! · ' + BASE_TITLE; }
      if (m.phase === 'ended' && wasPhase !== 'ended' && m.result) {
        const mine = m.result.rows.find((x) => x.id === m.you), sr = m.result.series;
        if (mine) bumpStats((s) => {
          s.rounds++; s.best = s.best === null ? mine.points : Math.min(s.best, mine.points);
          if (sr.done) { s.games++; if (sr.of === 1 ? (!m.result.tie && m.result.winners.includes(m.you)) : (sr.winners.length === 1 && sr.winners[0] === m.you)) s.wins++; }
        });
      }
      if (m.phase === 'ended' && wasPhase !== 'ended') { SFX.end(); if (m.result && m.result.winners.includes(m.you)) vib([80, 60, 80, 60, 160]); }
      lockUntil = Date.now() + m.lockMs;
      clearTimeout(lockTimer);
      if (m.lockMs > 0) lockTimer = setTimeout(render, m.lockMs + 30);
      render();
      processFx();
    } else if (m.t === 'fx') {
      fxQueue.push(...m.list);
      for (const f of m.list) if (f.k === 'discard' || (f.k === 'cut' && f.ok)) { ghostTop = { id: f.card.id, until: Date.now() + 560 }; setTimeout(render, 600); }
    } else if (m.t === 'reveal') {
      for (const c of m.cards) {
        reveals[c.id] = { card: c, until: m.ms ? Date.now() + m.ms : Infinity };
        if (m.ms) setTimeout(render, m.ms + 60);
      }
      render();
    } else if (m.t === 'error') {
      if (m.code === 'resume') { localStorage.removeItem('will_token'); if (localStorage.getItem('will_away')) { localStorage.removeItem('will_away'); toast('Essa sala não existe mais.', 'bad'); } show('home'); return; }
      toast(m.msg, 'bad');
    } else if (m.t === 'toast') {
      toast(m.msg, m.kind);
    } else if (m.t === 'rooms') {
      const ul = $('#roomList'); if (!ul) return;
      ul.innerHTML = m.list.length ? m.list.map((r) => `<li><span class="grow">${esc(r.host)}<small> · ${r.players}/8${r.rounds > 1 ? ` · ${r.rounds} rodadas` : ''}${r.fast ? ' · rápido' : ''}${r.phase === 'ended' ? ' · entre partidas' : ''}</small></span><button class="btn" data-act="joinopen" data-code="${r.code}">Entrar</button></li>`).join('') : '<li class="empty">Nenhuma sala pública aberta agora.</li>';
    } else if (m.t === 'away') {
      localStorage.removeItem('will_token'); try { localStorage.setItem('will_away', JSON.stringify({ code: m.code, token: m.token })); } catch (_) { /* ignore */ }
      S = null; closeOverlay(); history.replaceState(null, '', location.pathname); show('home');
    } else if (m.t === 'left') {
      localStorage.removeItem('will_token'); S = null; closeOverlay(); history.replaceState(null, '', location.pathname); show('home');
    }
  }

  /* ------------------------------- helpers -------------------------------- */
  let toastTimer;
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast ' + (kind || ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  setInterval(() => { if (!$('#home').hidden && ws && ws.readyState === 1) send({ t: 'rooms' }); }, 5000);
  function show(name) {
    for (const id of ['home', 'lobby', 'game']) $('#' + id).hidden = id !== name;
    if (name === 'home') {
      if (ws && ws.readyState === 1) send({ t: 'rooms' });
      const aw = getAway(), b = $('#backBtn');
      if (b) { b.hidden = !aw; if (aw) b.textContent = `Voltar à sala ${aw.code}`; }
    }
  }
  function revealOf(id) {
    const r = reveals[id];
    if (r && r.until > Date.now()) return r.card;
    if (r) delete reveals[id];
    return null;
  }
  function cardHTML(info, o = {}) {
    // info: { id, rank?, suit? }
    const known = info.rank ? info : revealOf(info.id);
    const cls = ['card'];
    let inner = '';
    if (known && (o.up !== false)) {
      if (known.suit === 'H' || known.suit === 'D') cls.push('red');
      inner = `<span class="corner">${known.rank}${pipSVG(known.suit)}</span><span class="mid">${pipSVG(known.suit)}</span><span class="pts">${known.pts} pt${known.pts === 1 ? '' : 's'}</span>`;
      if (!info.rank) cls.push('peeked');
    } else {
      cls.push('back');
      inner = '<b class="roundel">W</b>';
    }
    if (o.cls) cls.push(o.cls);
    const fl = flashes[info.id];
    if (fl && fl.until > Date.now()) cls.push(fl.cls);
    const label = known ? `${known.rank} de ${SUIT_NAMES[known.suit]}, ${known.pts} pontos` : 'carta virada';
    const data = info.id != null && o.owner ? ` data-cid="${info.id}" data-owner="${o.owner}" tabindex="0" role="button" aria-label="${label}"` : (known ? ` role="img" aria-label="${label}"` : '');
    return `<div class="${cls.join(' ')}"${data}>${inner}</div>`;
  }
  const me = () => S.players.find((p) => p.id === S.you);
  const nameOf = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : '?'; };
  const turnSelHTML = () => `<label class="setrow">Tempo por turno
    <select class="turnSel">${[[0, 'Sem limite'], [20, '20 s'], [30, '30 s'], [60, '60 s'], [90, '90 s']].map(([v, t]) => `<option value="${v}" ${S.turnTime === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const paceSelHTML = () => `<label class="setrow">Ritmo
    <select class="paceSel">${[[0, 'Normal'], [1, 'Rápido (corte curto, 20 s)']].map(([v, t]) => `<option value="${v}" ${(S.fast ? 1 : 0) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const roundsSelHTML = () => `<label class="setrow">Campeonato
    <select class="roundsSel" ${S.result && S.result.series && !S.result.series.done && S.phase === 'ended' ? 'disabled' : ''}>${[[1, 'Partida única'], [3, '3 rodadas'], [5, '5 rodadas']].map(([v, t]) => `<option value="${v}" ${S.rounds === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const LEVEL_NAMES = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };
  const powerText = { 10: 'o 10: olhe novamente uma das suas cartas', Q: 'a Dama: espie uma carta de outro jogador', J: 'o Valete: troque duas cartas, sem olhar (de jogadores diferentes)' };

  /* -------------------------------- render -------------------------------- */
  function render() {
    if (!S) return;
    if (S.phase === 'lobby') return renderLobby();
    renderGame();
  }

  function renderLobby() {
    show('lobby');
    $('#lobbyCode').textContent = S.code;
    const host = S.hostId === S.you;
    $('#lobbyPlayers').innerHTML = S.players.map((p) => `
      <li><span class="grow">${esc(p.name)}${botTag(p)}${p.bot ? ` <small>${LEVEL_NAMES[p.level] || ''}</small>` : ''}${p.id === S.you ? ' <small>(você)</small>' : ''}${p.connected ? '' : ' <small>(desconectado)</small>'}</span>
      ${winsTag(p.wins)}${p.id === S.hostId ? '<span class="badge">anfitrião</span>' : ''}
      ${host && p.id !== S.you ? `<button class="x" title="Remover" data-act="remove" data-id="${p.id}">✕</button>` : ''}</li>`).join('');
    const n = S.players.filter((p) => p.bot || p.connected).length;
    $('#lobbyHost').innerHTML = host
      ? `<div class="botrow"><select id="levelSel" aria-label="Dificuldade do bot">${Object.entries(LEVEL_NAMES).map(([k, v]) => `<option value="${k}" ${k === botLevel ? 'selected' : ''}>${v}</option>`).join('')}</select>
         <button class="btn grow" data-act="addbot" ${S.players.length >= 8 ? 'disabled' : ''}>+ Adicionar bot</button></div>
         ${turnSelHTML()}
         ${paceSelHTML()}
         ${roundsSelHTML()}
         <label class="chk"><input type="checkbox" class="pubChk" ${S.public ? 'checked' : ''}> Sala pública (aparece na lista da tela inicial)</label>
         <button class="btn primary big" data-act="start" ${n < 2 ? 'disabled' : ''}>Iniciar partida</button>`
      : '';
    $('#lobbyHint').textContent = host
      ? (n < 2 ? 'Convide alguém ou adicione um bot para começar.' : `${n} jogadores · ${n === 2 ? '1 baralho' : '2 baralhos'}`)
      : `Aguardando o anfitrião iniciar a partida…${S.turnTime ? ` · ${S.turnTime}s por turno` : ''}${S.rounds > 1 ? ` · campeonato de ${S.rounds} rodadas` : ''}`;
  }

  // montinho de descarte: as últimas cartas empilhadas meio desalinhadas, a última por cima
  function discardStackHTML(topCls) {
    const st = S.discardStack && S.discardStack.length ? S.discardStack : [S.discardTop];
    return `<div class="dstack">${st.map((c, i) => {
      const last = i === st.length - 1, k = c.id;
      const r = (((k * 37) % 21) - 10) * (last ? 0.45 : 1), x = (((k * 53) % 13) - 6) * (last ? 0.5 : 1), y = (((k * 29) % 11) - 5) * (last ? 0.5 : 1);
      return `<div class="dwrap" style="--r:${r.toFixed(1)}deg;--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px">${cardHTML(c, { cls: last ? 'top ' + topCls : 'under' })}</div>`;
    }).join('')}</div>`;
  }

  function renderGame() {
    show('game');
    $('#gameCode').textContent = S.code;
    $('#roundTag').textContent = S.seriesRounds > 1 ? `· Rodada ${S.roundNo}/${S.seriesRounds}` : '';
    const mp = me();
    const playing = mp && mp.inGame;
    const myTurn = S.phase === 'play' && S.turn === S.you;
    const opps = S.players.filter((p) => p.inGame && p.id !== S.you);
    const specs = !playing ? S.players.filter((p) => p.inGame) : opps;

    /* oponentes */
    const canTarget = S.power && S.power.by === S.you && (S.power.type === 'Q' || S.power.type === 'J');
    const oppHTML = (p) => `
      <div class="opp ${S.turn === p.id ? 'turn' : ''}" data-pid="${p.id}">
        <div class="pname">${esc(p.name)}${botTag(p)}${winsTag(p.wins)} <small>${p.count} carta${p.count === 1 ? '' : 's'}${p.connected ? '' : ' · off'}</small>${S.turn === p.id && turnEnd ? ' <span class="timer" data-timer></span>' : ''}</div>
        <div class="row oprow">${p.hand.map((c) => cardHTML(c, {
          owner: p.id,
          cls: (canTarget ? 'target ' : '') + (sel.some((s) => s.id === c.id) ? 'selected' : ''),
        })).join('')}${S.inHand && S.inHand.by === p.id ? `<div class="inhandwrap" title="${S.inHand.from === 'discard' ? 'Pegou do descarte' : 'Comprou da pilha'}">${cardHTML(S.inHand.card || { id: 0 }, { cls: 'inhand' })}</div>` : ''}</div>
        ${S.phase === 'peek' ? `<small>${p.ready ? 'pronto' : 'memorizando…'}</small>` : ''}
      </div>`;
    /* mesa quadrada: cada jogador num lado (esquerda, frente, direita), no sentido da vez a partir de você */
    {
      const order = S.players.filter((p) => p.inGame);
      const mi = order.findIndex((p) => p.id === S.you);
      const seq = specs.length === order.length && mi < 0 ? order : order.slice(mi + 1).concat(order.slice(0, Math.max(mi, 0))).filter((p) => specs.includes(p));
      const n = seq.length;
      const side = n >= 4 ? Math.floor(n / 3) : n === 2 ? 1 : n === 3 ? 1 : 0;
      const top = n - 2 * side;
      const L = seq.slice(0, side).reverse(), T = seq.slice(side, side + top), R = seq.slice(side + top);
      $('#seatL').innerHTML = L.map(oppHTML).join('');
      $('#seatT').innerHTML = T.map(oppHTML).join('');
      $('#seatR').innerHTML = R.map(oppHTML).join('');
    }

    /* centro: compra, descarte, carta comprada */
    const canDraw = myTurn && S.sub === 'draw';
    const canDiscard = myTurn && S.sub === 'action' && !!S.drawn && S.drawnFrom !== 'discard';
    const top = S.discardTop;
    const popCls = top && top.id !== prevTopId ? 'pop' : '';
    prevTopId = top ? top.id : null;
    $('#center').innerHTML = S.phase === 'peek' ? '' : `
      <div class="pile ${canDraw ? 'drawable' : ''}" id="drawPile" ${canDraw ? 'data-act="draw" tabindex="0" role="button" aria-label="Comprar carta"' : ''}>
        <div>Compras (${S.drawCount})</div>${cardHTML({ id: 0 })}
        ${canDraw ? '<div>toque para comprar</div>' : ''}
      </div>
      <div class="pile ${(canDraw && top) || canDiscard ? 'drawable' : ''}" id="discardPile" ${canDraw && top ? 'data-act="takediscard" tabindex="0" role="button" aria-label="Pegar a carta do topo do descarte"' : canDiscard ? 'data-act="discard" tabindex="0" role="button" aria-label="Descartar a carta comprada"' : ''}><div>Descarte (${S.discardCount})</div>${top ? discardStackHTML(popCls + (ghostTop.id === top.id && ghostTop.until > Date.now() ? ' ghost' : '')) : '<div class="slot"></div>'}
        ${canDraw && top ? '<div>toque para pegar</div>' : canDiscard ? '<div>toque para descartar</div>' : ''}
      `;

    /* mensagem de status */
    let msg = '', mine = false;
    const narr = narrOn();
    if (S.phase === 'peek') {
      if (!playing) msg = 'Partida em andamento — você está assistindo.';
      else if (mp.ready) msg = 'Aguardando os outros jogadores memorizarem…';
      else { msg = mp.peeksLeft > 0 ? `Toque em ${mp.peeksLeft} das suas 4 cartas para olhar (só uma vez!).` : 'Memorize bem as duas cartas e clique em “Memorizei”.'; mine = true; }
    } else if (S.phase === 'play') {
      if (!playing) msg = 'Você está assistindo esta rodada.';
      else if (myTurn) {
        mine = true;
        if (S.sub === 'draw') msg = narr ? 'Sua vez: toque ou arraste uma pilha (compras ou descarte), ou encerre a partida.' : 'Sua vez';
        else if (S.sub === 'action' && !narr) msg = '';
        else if (S.sub === 'action' && S.drawnFrom === 'discard') msg = 'Você pegou do descarte: toque na carta sua que vai trocar.';
        else if (S.sub === 'action') msg = 'Toque numa carta sua para trocar, ou no descarte para descartar a comprada.';
        else if (S.sub === 'power') msg = `Poder d${powerText[S.power.type]}${S.power.type === 'J' ? ` (${sel.length}/2)` : ''}. Opcional.${S.cutOpen && (S.power.type === '10' || S.power.type === 'J') ? ' Para cortar: arraste sua carta até o descarte ou toque em CORTAR.' : ''}`;
      } else if (S.sub === 'power' && S.power) msg = `${nameOf(S.power.by)} está decidindo se usa o poder do ${S.power.type === 'Q' ? 'Dama' : S.power.type === 'J' ? 'Valete' : '10'}…`;
      else msg = narr ? `Vez de ${nameOf(S.turn)}.` : '';
      if (mode === 'cut') { msg = 'Clique na carta da sua mão que tem o mesmo valor do descarte!'; mine = true; }
    } else if (S.phase === 'ended') {
      const r = S.result;
      msg = r.reason === 'empty' ? `${nameOf(r.by)} ficou sem cartas!` : r.reason === 'voluntary' ? `${nameOf(r.by)} encerrou a partida.` : 'Acabaram as cartas.';
    }
    $('#msg').textContent = msg;
    $('#msg').className = 'msg' + (mine ? ' mine' : '');

    /* botões de ação */
    const a = [];
    if (S.phase === 'peek' && playing && !mp.ready) a.push('<button class="btn primary big" data-act="ready">Memorizei</button>');
    if (myTurn && S.sub === 'action' && S.drawnFrom === 'discard' && mode !== 'swap') mode = 'swap';
    if (S.phase === 'play' && playing) {
      if (myTurn && S.sub === 'draw') {
        if (a11y.btns) a.push(`<button class="btn primary" data-act="draw">Comprar carta</button>`);
        if (a11y.btns && top) a.push('<button class="btn" data-act="takediscard">Pegar do descarte</button>');
        a.push('<button class="btn danger" data-act="end">Encerrar partida</button>');
      }
      if (myTurn && S.sub === 'action') {
        if (a11y.btns && S.drawnFrom !== 'discard') {
          a.push('<button class="btn primary" data-act="discard">Descartar a comprada</button>');
          a.push(`<button class="btn ${mode === 'swap' ? 'primary' : ''}" data-act="swapmode">${mode === 'swap' ? 'Cancelar troca' : 'Trocar com uma das minhas'}</button>`);
        }
      }
      if (myTurn && S.sub === 'power') a.push('<button class="btn" data-act="skip">Não usar o poder</button>');
      const ownPower = S.sub === 'power' && S.power && S.power.by === S.you && (S.power.type === '10' || S.power.type === 'J');
      if (S.cutOpen && (a11y.btns || ownPower)) a.push(`<button class="btn cut ${mode === 'cut' ? 'on' : ''}" data-act="cutmode">${icon('cut', 22, 2.2)}CORTAR (C)</button>`);
    }
    if (S.phase === 'ended') a.push('<button class="btn primary" data-act="showresult">Ver resultado</button><button class="btn" data-act="away">Voltar ao início</button>');
    $('#actions').innerHTML = a.join('');

    /* minha mão */
    if (playing) {
      const meTargets = (mode === 'swap') || (S.power && S.power.by === S.you && S.power.type === '10') || (S.power && S.power.by === S.you && S.power.type === 'J')
        || (S.phase === 'peek' && !mp.ready && mp.peeksLeft > 0);
      if (myTurn && S.sub === 'action' && S.drawnFrom === 'discard' && mode !== 'swap') mode = 'swap';
      $('#me').className = 'me' + (myTurn ? ' turn' : '');
      $('#me').dataset.pid = S.you;
      $('#me').innerHTML = `
        <div class="row five">${mp.hand.map((c) => cardHTML(c, {
          owner: S.you,
          cls: (mode === 'cut' ? 'cutmode ' : meTargets ? 'clickable ' : '') + (sel.some((s) => s.id === c.id) ? 'selected' : ''),
        })).join('')}${S.phase === 'ended' ? '' : (S.drawn
          ? `<div class="handslot has" id="drawnPile" title="${S.drawnFrom === 'discard' ? 'Pegou do descarte: troque por uma carta sua' : 'Toque numa carta sua para trocar ou no descarte para descartar'}">${cardHTML(S.drawn, { cls: 'inhand pop' })}</div>`
          : `<div class="handslot ${S.phase === 'play' ? '' : 'hid'}"></div>`)}</div>
        <div class="mehead">${esc(mp.name)}${winsTag(mp.wins)} <small>(você) · ${mp.count} carta${mp.count === 1 ? '' : 's'}</small>${myTurn && turnEnd ? ' <span class="timer" data-timer></span>' : ''}</div>`;
    } else {
      $('#me').innerHTML = '';
    }

    maybeTip();
    updateTimers();
    $('#muteBtn').innerHTML = icon(muted ? 'soundoff' : 'sound', 22);

    /* histórico */
    const lp = $('#logpanel');
    if (!lp.hidden) { lp.innerHTML = S.log.slice().reverse().map((l) => `<div>${esc(l.msg)}</div>`).join(''); }

    /* resultado */
    if (S.phase === 'ended' && dismissedResult !== S.gameNo) renderResult(); else if (S.phase !== 'ended') closeOverlay();
  }

  function renderResult() {
    const r = S.result, sr = r.series, multi = sr.of > 1;
    const host = S.hostId === S.you;
    const rows = r.rows.slice().sort((a, b) => a.points - b.points || a.count - b.count);
    const title = multi
      ? (sr.done ? (sr.winners.length > 1 ? 'Campeonato empatado!' : `${esc(nameOf(sr.winners[0]))} é o campeão!`)
        : (r.tie ? 'Rodada empatada' : `${esc(nameOf(r.winners[0]))} venceu a rodada ${sr.round}`))
      : (r.tie ? 'Empate!' : `${esc(nameOf(r.winners[0]))} venceu!`);
    const why = r.reason === 'empty' ? `${esc(nameOf(r.by))} descartou todas as cartas.` : r.reason === 'voluntary' ? `${esc(nameOf(r.by))} encerrou a partida.` : 'As cartas acabaram.';
    const totalOf = (id) => (sr.ranking.find((x) => x.id === id) || {}).total;
    const nextLabel = multi ? (sr.done ? 'Novo campeonato' : `Próxima rodada (${sr.round + 1}/${sr.of})`) : 'Jogar de novo';
    resultAt = Date.now();
    $('#overlay').innerHTML = `<div class="modal">
      <div class="trophy">${icon('trophy', 30, 2, '#1B1400')}</div>
      <h3>${title}</h3><p>${multi ? `Rodada ${sr.round} de ${sr.of} · ` : ''}${why} Menos pontos vence.</p>
      ${rows.map((x) => `<div class="res-row ${(multi && sr.done ? sr.winners : r.winners).includes(x.id) ? 'win' : ''}">
        <span class="who">${esc(x.name)}${x.id === S.you ? '<small>você</small>' : ''}</span>
        <span class="cards">${x.cards.length ? x.cards.map((c) => cardHTML(c)).join('') : '<em>sem cartas</em>'}</span>
        <span class="tot">${x.points}<small> pts${multi ? ` · total ${totalOf(x.id)}` : ''}</small></span></div>`).join('')}
      ${multi ? `<div class="rank"><b>Classificação</b>${sr.ranking.map((x, i) => `<div class="${sr.winners.includes(x.id) && sr.done ? 'lead' : ''}"><span>${i + 1}. ${esc(x.name)}</span><span>${x.total} pts</span></div>`).join('')}</div>` : ''}
      ${r.tie && !multi ? '<p>Critério 1 (menos cartas) não desempatou — rodada extra entre os empatados.</p>' : ''}
      <div class="row">
        ${host ? `<button class="btn primary" data-act="start">${nextLabel}</button>` : '<span>Aguardando o anfitrião…</span><button class="btn" data-act="rematch">Pedir revanche</button>'}
        ${host && r.tie && !multi ? '<button class="btn" data-act="startextra">Rodada extra (só os empatados)</button>' : ''}
        ${host && !(multi && !sr.done) ? '<button class="btn" data-act="addbot">+ Bot</button>' : ''}
        <button class="btn" data-act="closeoverlay">Ver mesa</button>
        <button class="btn" data-act="away">Voltar ao início</button>
      </div>
      ${host ? `<div class="stack">${turnSelHTML()}${paceSelHTML()}${roundsSelHTML()}</div>` : ''}</div>`;
    $('#overlay').hidden = false;
  }
  function closeOverlay() { $('#overlay').hidden = true; $('#overlay').innerHTML = ''; }

  function rulesModal() {
    $('#overlay').innerHTML = `<div class="modal"><h3>Regras do Jogo do Will</h3><ul>
      <li><b>Objetivo:</b> terminar com a <b>menor soma de pontos</b> na mão.</li>
      <li>Cada jogador começa com 4 cartas viradas para baixo e olha <b>apenas 2</b>, uma única vez. 2 jogadores usam 1 baralho; mais de 2, usam 2.</li>
      <li><b>Seu turno:</b> compre da pilha <i>ou</i> pegue o topo do descarte. Da pilha: descarte a carta ou troque por uma das suas. Do descarte: é obrigatório trocar por uma das suas (a que sai vai para o descarte).</li>
      <li><b>10</b> (ao descartar): olhe uma carta sua. <b>Dama (Q):</b> olhe uma carta de outro jogador. <b>Valete (J):</b> troque duas cartas, sem olhar, de jogadores diferentes. Os poderes são opcionais.</li>
      <li><b>Corte:</b> quando alguém descarta uma carta, qualquer jogador pode descartar da mão uma carta de <b>mesmo valor</b>. Só o primeiro corte certo vale. Errou? Pega a carta de volta e compra mais uma.</li>
      <li><b>Autocorte:</b> compre uma carta, descarte-a e corte em seguida com a igual que já tinha na mão.</li>
      <li><b>Fim:</b> quem fica sem cartas encerra na hora. Ou, no início da sua vez (antes de comprar), você pode anunciar o encerramento.</li>
      <li><b>Pontos:</b> Ás 1 · 2 a 10 pelo número · J 11 · Q 12 · <b>Rei preto 13</b> · <b>Rei vermelho 0</b>.</li>
      <li><b>Desempate:</b> menos cartas na mão; se persistir, rodada extra entre os empatados.</li>
    </ul><div class="row"><button class="btn primary" data-act="closeoverlay">Entendi</button></div></div>`;
    $('#overlay').hidden = false;
  }

  function currentTip() {
    if (!S) return null;
    const mp = me();
    if (!mp || !mp.inGame) return null;
    if (S.phase === 'peek') return !mp.ready && mp.peeksLeft > 0 ? 'peek' : null;
    if (S.phase !== 'play') return null;
    if (S.turn === S.you) return S.sub === 'draw' ? 'draw' : S.sub === 'action' ? 'action' : S.sub === 'power' ? 'power' : null;
    return S.cutOpen ? 'cut' : null;
  }
  function maybeTip() {
    const key = currentTip(), el = $('#coach');
    if (coachKey && coachKey !== key) { seenTips[coachKey] = true; localStorage.setItem('will_tips', JSON.stringify(seenTips)); coachKey = null; }
    if (!coachKey && key && !seenTips[key]) coachKey = key;
    if (coachKey) { el.innerHTML = `<span>${TIP_TEXT[coachKey]}</span><button class="btn" data-act="tipok">Entendi</button>`; el.hidden = false; } else el.hidden = true;
  }
  function statsModal() {
    const s = loadJSON('will_stats', STATS0);
    const tot = s.cutsOk + s.cutsBad, acc = tot ? Math.round((s.cutsOk / tot) * 100) + '%' : '—';
    $('#overlay').innerHTML = `<div class="modal"><h3>Suas estatísticas</h3>
      <div class="statgrid">
        <div><b>${s.games}</b><span>partidas</span></div><div><b>${s.wins}</b><span>vitórias</span></div>
        <div><b>${s.rounds}</b><span>rodadas</span></div><div><b>${s.best === null ? '—' : s.best}</b><span>melhor pontuação</span></div>
        <div><b>${s.cutsOk}</b><span>cortes certos</span></div><div><b>${s.cutsBad}</b><span>cortes errados</span></div>
        <div><b>${acc}</b><span>precisão do corte</span></div></div>
      <p>Salvas só neste aparelho.</p>
      <div class="row"><button class="btn" data-act="resetstats">Zerar</button><button class="btn primary" data-act="closeoverlay">Fechar</button></div></div>`;
    $('#overlay').hidden = false;
  }
  function a11yModal() {
    $('#overlay').innerHTML = `<div class="modal"><h3>Acessibilidade</h3>
      <label class="chk"><input type="checkbox" data-a11y="hc" ${a11y.hc ? 'checked' : ''}> Alto contraste</label>
      <label class="chk"><input type="checkbox" data-a11y="rm" ${a11y.rm ? 'checked' : ''}> Reduzir animações</label>
      <label class="chk"><input type="checkbox" data-a11y="narr" ${narrOn() ? 'checked' : ''}> Mostrar narração da jogada no centro da mesa</label>
      <label class="chk"><input type="checkbox" data-a11y="btns" ${a11y.btns ? 'checked' : ''}> Mostrar botões de ação (comprar, descartar, trocar, cortar)</label>
      <p>Por padrão você joga tocando ou arrastando as cartas. Teclado: Tab navega, Enter ou espaço ativa, D compra, C corta, Esc cancela.</p>
      <div class="row"><button class="btn primary" data-act="closeoverlay">Pronto</button></div></div>`;
    $('#overlay').hidden = false;
  }
  function updateTimers() {
    const left = turnEnd ? Math.max(0, Math.ceil((turnEnd - Date.now()) / 1000)) : 0;
    document.querySelectorAll('[data-timer]').forEach((el) => { el.innerHTML = `${icon('clock', 12, 2.4)}${left}s`; el.classList.toggle('warn', left <= 8); });
    if (S && S.phase === 'play' && S.turn === S.you && turnEnd && left <= 5 && left > 0 && left !== lastTick) { lastTick = left; SFX.tick(); vib(20); }
  }
  setInterval(updateTimers, 400);

  /* ------------------------- animações e avisos (fx) ------------------------ */
  function boxOf(pid) { return pid === (S && S.you) ? $('#me') : document.querySelector(`.opp[data-pid="${pid}"]`); }
  function fly(from, to, card, ms = 520) {
    if (!from || !to || a11y.rm) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const holder = document.createElement('div');
    holder.innerHTML = cardHTML(card || { id: 0 });
    const el = holder.firstChild;
    el.style.cssText = `position:fixed;left:${a.left + a.width / 2 - 31}px;top:${a.top + a.height / 2 - 44}px;z-index:30;pointer-events:none;--card-w:62px;--card-h:88px`;
    document.body.appendChild(el);
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    const an = el.animate([{ transform: 'translate(0,0) scale(.75) rotate(-6deg)', opacity: .9 }, { transform: `translate(${dx}px,${dy}px) scale(1) rotate(0)`, opacity: 1 }], { duration: ms, easing: 'cubic-bezier(.2,.8,.2,1)' });
    an.onfinish = () => el.remove();
  }
  function flash(cardId, cls, ms) {
    flashes[cardId] = { until: Date.now() + ms, cls };
    setTimeout(render, ms + 40);
  }
  function note(text, ico = 'eye') {
    const n = $('#note'); n.innerHTML = `${icon(ico, 16, 2.1, ico === 'eye' ? '#7CC4FF' : 'currentColor')}<span>${esc(text)}</span>`; n.hidden = false;
    n.classList.remove('in'); void n.offsetWidth; n.classList.add('in');
    clearTimeout(noteTimer); noteTimer = setTimeout(() => { n.hidden = true; }, 3600);
  }
  function bubble(pid, emoji) {
    const box = boxOf(pid); if (!box) return;
    const r = box.getBoundingClientRect();
    const el = document.createElement('div');
    el.textContent = emoji;
    if (emoji.length > 2) el.className = 'bubble-text';
    el.style.cssText = `position:fixed;left:${r.left + r.width / 2 - (emoji.length > 2 ? 34 : 16)}px;top:${r.top + 4}px;font-size:2rem;z-index:40;pointer-events:none`;
    document.body.appendChild(el);
    el.animate([{ transform: 'translateY(0) scale(.6)', opacity: 0 }, { transform: 'translateY(-26px) scale(1.2)', opacity: 1, offset: .25 }, { transform: 'translateY(-70px) scale(1)', opacity: 0 }], { duration: 1600, easing: 'ease-out' }).onfinish = () => el.remove();
  }
  function shake(el) { if (el) el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' }], { duration: 420 }); }
  function processFx() {
    const list = fxQueue; fxQueue = [];
    const disc = () => document.querySelector('#discardPile .card.top');
    for (const f of list) {
      const who = nameOf(f.by);
      if (f.k === 'draw') {
        SFX.draw();
        if (f.from === 'discard') { note(`${who} pegou ${f.card.rank} do descarte`); fly(document.querySelector('#discardPile .card.top'), boxOf(f.by), f.card, 420); }
        else fly(document.querySelector('#drawPile .card'), boxOf(f.by), null, 420);
      } else if (f.k === 'discard' || (f.k === 'cut' && f.ok)) {
        if (f.k === 'cut' && f.by === S.you) bumpStats((s) => { s.cutsOk++; });
        if (f.k === 'cut') { SFX.cutok(); if (f.by === S.you) vib([30, 40, 30]); } else SFX.discard();
        ghostTop = { id: f.card.id, until: Date.now() + 520 };
        setTimeout(render, 560);
        render();
        fly(boxOf(f.by), disc(), f.card, 520);
        if (f.k === 'discard' && f.via === 'swap' && f.slot) flash(f.slot, 'flash', 1500);
        if (f.k === 'cut') note(`${who} cortou com ${f.card.rank}!`, 'cut');
      } else if (f.k === 'cut' && !f.ok) {
        SFX.cutbad(); if (f.by === S.you) { vib(220); bumpStats((s) => { s.cutsBad++; }); }
        note(`${who} errou o corte e comprou uma carta`, 'cut');
        shake(boxOf(f.by));
        fly(document.querySelector('#drawPile .card'), boxOf(f.by), null, 480);
      } else if (f.k === 'react') {
        SFX.react(); bubble(f.by, f.emoji);
      } else if (f.k === 'timeout') {
        note(`Tempo esgotado: ${who} joga no automático`, 'clock');
      } else if (f.k === 'power') {
        SFX.power();
        const t = f.targets;
        if (f.type === '10') { note(`${who} usou o 10 e revisou uma carta própria`, 'eye'); flash(t[0].cardId, 'spy', 1800); }
        else if (f.type === 'Q') { note(`${who} usou a Dama e espiou uma carta de ${nameOf(t[0].owner)}`, 'eye'); flash(t[0].cardId, 'spy', 1800); }
        else {
          note(`${who} usou o Valete: trocou cartas de ${nameOf(t[0].owner)} e ${nameOf(t[1].owner)}`, 'swap');
          flash(t[0].cardId, 'swapfx', 2200); flash(t[1].cardId, 'swapfx', 2200);
          fly(boxOf(t[0].owner), boxOf(t[1].owner), null, 650); fly(boxOf(t[1].owner), boxOf(t[0].owner), null, 650);
        }
      }
    }
  }

  /* ---------------------------- interações com cartas ---------------------- */
  function setMode(m) {
    mode = m; clearTimeout(modeTimer);
    if (m === 'cut') modeTimer = setTimeout(() => { if (mode === 'cut') { mode = null; render(); } }, 4000);
    render();
  }
  function clickCard(id, owner) {
    if (!S) return;
    const mine = owner === S.you;
    if (S.phase === 'peek') { if (mine) send({ t: 'peek', cardId: id }); return; }
    if (S.phase !== 'play') return;
    if (mode === 'cut') { if (mine) { send({ t: 'cut', cardId: id }); setMode(null); } return; }
    if ((mode === 'swap' || (S.turn === S.you && S.sub === 'action')) && mine) { send({ t: 'swap', cardId: id }); setMode(null); return; }
    const pw = S.power;
    const needsOwn = mode === 'swap' || (pw && pw.by === S.you && (pw.type === '10' || pw.type === 'J'));
    if (mine && S.cutOpen && !needsOwn) { send({ t: 'cut', cardId: id }); return; } // corte direto por toque
    if (pw && pw.by === S.you) {
      if (pw.type === '10' && mine) send({ t: 'power', targets: [id] });
      else if (pw.type === 'Q' && !mine) send({ t: 'power', targets: [id] });
      else if (pw.type === 'J') {
        const i = sel.findIndex((s) => s.id === id);
        if (i >= 0) sel.splice(i, 1);
        else {
          sel = sel.filter((s) => s.owner !== owner); // um por jogador
          sel.push({ id, owner });
        }
        if (sel.length === 2) { send({ t: 'power', targets: sel.map((s) => s.id) }); sel = []; }
        render();
      }
    }
  }

  // pointerdown (e não click): a mesa re-renderiza a cada mensagem e um click podia se perder
  // se o elemento fosse trocado entre apertar e soltar — num jogo de corte isso é fatal.
  document.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType === 'touch') { onActivate(e); } });
  document.addEventListener('click', (e) => { if (e.detail === 0) onActivate(e); }); // acionamento por teclado
  function drawNow(swapId) {
    if (swapId != null) pendingSwap = { id: swapId, until: Date.now() + 7000 };
    send({ t: 'draw' });
  }
  function takeNow(swapId) {
    if (swapId != null) pendingSwap = { id: swapId, until: Date.now() + 7000 };
    send({ t: 'takeDiscard' });
  }
  let resultAt = 0;
  let pendingSwap = null;   // troca pedida por arrasto antes de a carta chegar na mão

  /* ----------------------- arrastar e soltar (como na mesa) ----------------------- */
  let drag = null, dragClone = null;
  const myHandIds = () => { const me = S && S.players.find((p) => p.id === S.you); return me ? me.hand.map((h) => h.id) : []; };
  function dragKind(t) {
    if (!S || S.phase !== 'play' || !t.closest) return null;
    const myTurn = S.turn === S.you;
    if (myTurn && S.sub === 'draw' && t.closest('#drawPile')) return { kind: 'pile', el: t.closest('#drawPile') };
    if (myTurn && S.sub === 'draw' && S.discardTop && t.closest('#discardPile')) return { kind: 'take', el: t.closest('#discardPile') };
    if (myTurn && S.sub === 'action' && S.drawn && t.closest('#drawnPile')) return { kind: 'drawn', el: t.closest('#drawnPile') };
    const ce = t.closest('[data-cid]');
    if (ce && ce.dataset.owner === S.you && S.cutOpen && mode !== 'swap') return { kind: 'cutcard', el: ce, id: Number(ce.dataset.cid) };
    return null;
  }
  function dropTargets(kind) {
    const out = [];
    if (kind === 'pile' || kind === 'take') out.push(...document.querySelectorAll('#me [data-cid]'), $('#me'));
    if (kind === 'drawn') out.push(...document.querySelectorAll('#me [data-cid]'), $('#discardPile'));
    if (kind === 'cutcard') out.push($('#discardPile'));
    return out.filter(Boolean);
  }
  function endDrag() {
    if (dragClone) dragClone.remove();
    document.querySelectorAll('.droptarget').forEach((e) => e.classList.remove('droptarget'));
    document.querySelectorAll('.dragging').forEach((e) => e.classList.remove('dragging'));
    dragClone = null; drag = null;
  }
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const k = dragKind(e.target);
    if (!k) return;
    ac();
    e.stopPropagation();   // o toque simples é tratado no pointerup, se não houve arrasto
    drag = { ...k, x: e.clientX, y: e.clientY, started: false, target: e.target, pid: e.pointerId };
    try { document.body.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 9) return;
      drag.started = true;
      const src = drag.el.querySelector('.card.top') || drag.el.querySelector('.card') || drag.el;
      const r = src.getBoundingClientRect();
      dragClone = src.cloneNode(true);
      dragClone.classList.add('dragclone');
      dragClone.style.cssText = `position:fixed;left:0;top:0;width:${r.width}px;height:${r.height}px;margin:0;z-index:60;pointer-events:none;transform:translate(${r.left}px,${r.top}px)`;
      drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
      document.body.appendChild(dragClone);
      src.classList.add('dragging');
      dropTargets(drag.kind).forEach((t) => t.classList.add('droptarget'));
      vib(15);
    }
    dragClone.style.transform = `translate(${e.clientX - drag.dx}px,${e.clientY - drag.dy}px) rotate(${Math.max(-8, Math.min(8, (e.clientX - drag.x) / 12))}deg)`;
  });
  function dropOn(e) {
    const under = document.elementsFromPoint(e.clientX, e.clientY).filter((n) => n !== dragClone);
    const ownCard = under.map((n) => n.closest && n.closest('#me [data-cid]')).find(Boolean);
    const onHand = under.some((n) => n.closest && n.closest('#me'));
    const onDiscard = under.some((n) => n.closest && n.closest('#discardPile'));
    const k = drag.kind;
    if (k === 'pile') { if (ownCard) drawNow(Number(ownCard.dataset.cid)); else if (onHand) drawNow(); else return false; return true; }
    if (k === 'take') { if (ownCard) takeNow(Number(ownCard.dataset.cid)); else if (onHand) takeNow(); else return false; return true; }
    if (k === 'drawn') {
      if (ownCard) { send({ t: 'swap', cardId: Number(ownCard.dataset.cid) }); setMode(null); return true; }
      if (onDiscard) { if (S.drawnFrom === 'discard') toast('Você pegou do descarte: troque por uma carta sua.', 'bad'); else send({ t: 'discard' }); return true; }
      return false;
    }
    if (k === 'cutcard') { if (onDiscard) { send({ t: 'cut', cardId: drag.id }); return true; } return false; }
    return false;
  }
  document.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    if (!d.started) { endDrag(); onActivate({ target: d.target, button: 0 }); return; }  // foi só um toque
    const ok = dropOn(e);
    if (!ok && dragClone) { // volta para o lugar
      const c = dragClone; c.style.transition = 'transform .2s'; c.style.opacity = '.0';
      setTimeout(() => c.remove(), 220); dragClone = null;
    }
    endDrag();
  });
  document.addEventListener('pointercancel', () => { if (drag) endDrag(); });

  function onActivate(e) {
    const cardEl = e.target.closest('[data-cid]');
    if (cardEl) return clickCard(Number(cardEl.dataset.cid), cardEl.dataset.owner);
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act !== 'menutoggle' && !$('#menu').hidden) $('#menu').hidden = true;
    switch (act) {
      case 'create': { const n = $('#nameInput').value.trim() || 'Jogador'; localStorage.setItem('will_name', n); send({ t: 'create', name: n }); break; }
      case 'join': {
        const n = $('#nameInput').value.trim() || 'Jogador'; localStorage.setItem('will_name', n);
        const code = $('#codeInput').value.trim();
        if (!code) return toast('Digite o código da sala.', 'bad');
        send({ t: 'join', name: n, code }); break;
      }
      case 'rules': rulesModal(); break;
      case 'stats': statsModal(); break;
      case 'resetstats': localStorage.removeItem('will_stats'); statsModal(); break;
      case 'a11y': a11yModal(); break;
      case 'tipsreset': seenTips = {}; localStorage.removeItem('will_tips'); coachKey = null; toast('Dicas reativadas.', 'good'); render(); break;
      case 'tipok': if (coachKey) { seenTips[coachKey] = true; localStorage.setItem('will_tips', JSON.stringify(seenTips)); coachKey = null; } maybeTip(); break;
      case 'practice': { const n = $('#nameInput').value.trim() || 'Jogador'; localStorage.setItem('will_name', n); send({ t: 'create', name: n, practice: true }); break; }
      case 'mute': muted = !muted; localStorage.setItem('will_mute', muted ? '1' : '0'); if (!muted) SFX.react(); render(); break;
      case 'emojitoggle': { const e = $('#emojis'); e.hidden = !e.hidden; break; }
      case 'react': send({ t: 'react', emoji: el.dataset.e }); break;
      case 'rematch': send({ t: 'react', emoji: 'Revanche?' }); toast('Pedido de revanche enviado!', 'good'); break;
      case 'closeoverlay': if (S && S.phase === 'ended') dismissedResult = S.gameNo; closeOverlay(); break;
      case 'showresult': dismissedResult = null; renderResult(); break;
      case 'copylink': {
        const url = `${location.origin}${location.pathname}?sala=${S.code}`;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Link copiado!', 'good')).catch(() => toast(url));
        break;
      }
      case 'wpp': {
        const url = `${location.origin}${location.pathname}?sala=${S.code}`;
        const txt = `Bora jogar o Jogo do Will? Entra na sala ${S.code}: ${url}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
        break;
      }
      case 'joinopen': { const n = $('#nameInput').value.trim() || 'Jogador'; localStorage.setItem('will_name', n); send({ t: 'join', name: n, code: el.dataset.code }); break; }
      case 'leave': send({ t: 'leave' }); break;
      case 'away': send({ t: 'away' }); break;
      case 'backtoroom': { const aw = getAway(); if (aw) { localStorage.setItem('will_token', aw.token); send({ t: 'resume', token: aw.token }); } break; }
      case 'menutoggle': { const m = $('#menu'); m.hidden = !m.hidden; break; }
      case 'logtoggle': { const lp = $('#logpanel'); lp.hidden = !lp.hidden; render(); break; }
      case 'addbot': { const sel = $('#levelSel'); if (sel) { botLevel = sel.value; localStorage.setItem('will_level', botLevel); } send({ t: 'addBot', level: botLevel }); break; }
      case 'remove': send({ t: 'removePlayer', id: el.dataset.id }); break;
      case 'start': if (S && S.phase === 'ended' && Date.now() - resultAt < 700) break; /* duplo toque em "Encerrar" */ send({ t: 'start' }); break;
      case 'startextra': send({ t: 'start', extra: true }); break;
      case 'ready': for (const k of Object.keys(reveals)) if (reveals[k].until === Infinity) delete reveals[k]; send({ t: 'ready' }); render(); break;
      case 'draw': drawNow(); break;
      case 'takediscard': takeNow(); break;
      case 'discard': send({ t: 'discard' }); break;
      case 'swapmode': setMode(mode === 'swap' ? null : 'swap'); break;
      case 'skip': send({ t: 'skip' }); break;
      case 'cutmode': setMode(mode === 'cut' ? null : 'cut'); break;
      case 'end': if (confirm('Encerrar a partida agora? Todos contam os pontos das cartas que têm na mão.')) send({ t: 'end' }); break;
      default: break;
    }
  }
  document.addEventListener('change', (e) => {
    if (e.target.classList && e.target.classList.contains('pubChk')) send({ t: 'setting', public: e.target.checked });
    if (e.target.classList && e.target.classList.contains('turnSel')) send({ t: 'setting', turnTime: Number(e.target.value) });
    if (e.target.classList && e.target.classList.contains('paceSel')) send({ t: 'setting', fast: e.target.value === '1' });
    if (e.target.dataset && e.target.dataset.a11y) { a11y[e.target.dataset.a11y] = e.target.checked; localStorage.setItem('will_a11y', JSON.stringify(a11y)); applyA11y(); if (S) render(); }
    if (e.target.classList && e.target.classList.contains('roundsSel')) send({ t: 'setting', rounds: Number(e.target.value) });
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-cid],[data-act]:not(button)')) { e.preventDefault(); onActivate(e); return; }
    if (e.key === 'Escape') { mode = null; $('#menu').hidden = true; if (S && S.phase !== 'ended') closeOverlay(); render(); return; }
    if ((e.key === 'd' || e.key === 'D') && e.target.tagName !== 'INPUT' && S && S.phase === 'play' && S.turn === S.you && S.sub === 'draw') { onActivate({ target: $('#drawPile') || document.body, button: 0 }); return; }
    if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') { (e.target.id === 'codeInput' ? document.querySelector('[data-act=join]') : document.querySelector('[data-act=create]')).click(); } return; }
    if ((e.key === 'c' || e.key === 'C') && S && S.cutOpen && S.phase === 'play') setMode(mode === 'cut' ? null : 'cut');
  });

  /* -------------------------------- início --------------------------------- */
  $('#smileBtn').innerHTML = icon('smile', 22);
  $('#menuBtn').innerHTML = icon('menu', 22);
  $('#muteBtn').innerHTML = icon(muted ? 'soundoff' : 'sound', 22);
  $('#heroFan').innerHTML = `
    <div style="left:14px;top:30px;transform:rotate(-16deg);--card-w:84px;--card-h:118px">${cardHTML({ id: 0, rank: 'A', suit: 'S', pts: 1 })}</div>
    <div style="left:84px;top:6px;transform:rotate(-2deg);--card-w:84px;--card-h:118px">${cardHTML({ id: 0, rank: 'K', suit: 'H', pts: 0 })}</div>
    <div style="left:154px;top:32px;transform:rotate(15deg);--card-w:84px;--card-h:118px">${cardHTML({ id: 0 })}</div>`;
  $('#nameInput').value = localStorage.getItem('will_name') || '';
  const q = new URLSearchParams(location.search).get('sala');
  if (q) $('#codeInput').value = q.toUpperCase().slice(0, 4);
  connect();
})();
