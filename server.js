'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Room } = require('./game');

const PORT = process.env.PORT || 3000;
const SPEED = Number(process.env.WILL_SPEED || 1);
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 4096 });

function attach(conn, room, p) {
  if (p.conn && p.conn !== conn) { try { p.conn.ws.close(); } catch (_) {} }
  conn.room = room; conn.player = p; p.conn = conn;
  p.send = (msg) => { if (conn.ws.readyState === 1) conn.ws.send(JSON.stringify(msg)); };
  const wasAway = !p.connected;
  p.connected = true;
  p.send({ t: 'joined', token: p.token, code: room.code, you: p.id });
  if (wasAway) room.reconnected(p); else room.change();
}

function handle(conn, m) {
  const send = (msg) => conn.ws.readyState === 1 && conn.ws.send(JSON.stringify(msg));
  if (m.t === 'ping') return send({ t: 'pong' }); // batimento do cliente: mantém a conexão e o serviço ativos
  if (m.t === 'create') {
    if (rooms.size >= MAX_ROOMS) return send({ t: 'error', msg: 'O servidor está cheio no momento. Tente de novo em instantes.' });
    const room = new Room(newCode(), { speed: SPEED });
    rooms.set(room.code, room);
    const p = room.addPlayer({ name: m.name });
    room.logMsg(`${p.name} criou a sala.`);
    attach(conn, room, p);
    if (m.practice) { // sala de treino: 2 bots e a partida começa já
      try { room.addBot(p.id, 'medio'); room.addBot(p.id, 'facil'); room.start(p.id); } catch (e) { send({ t: 'error', msg: e.message }); }
    }
    return;
  }
  if (m.t === 'join') {
    const room = rooms.get(String(m.code || '').toUpperCase().trim());
    if (!room) return send({ t: 'error', msg: 'Sala não encontrada. Confira o código.' });
    try {
      const p = room.addPlayer({ name: m.name });
      room.logMsg(`${p.name} entrou na sala${room.phase === 'peek' || room.phase === 'play' ? ' como espectador' : ''}.`);
      return attach(conn, room, p);
    } catch (e) { return send({ t: 'error', msg: e.message }); }
  }
  if (m.t === 'resume') {
    for (const room of rooms.values()) {
      const p = room.players.find((x) => !x.bot && x.token === m.token);
      if (p) return attach(conn, room, p);
    }
    return send({ t: 'error', code: 'resume', msg: 'Sessão expirada.' });
  }
  if (!conn.room || !conn.player) return;
  if (m.t === 'leave') {
    const { room, player } = conn;
    conn.room = null; conn.player = null;
    if (room.phase === 'lobby' || room.phase === 'ended') {
      try { room.removePlayer(player.id, player.id); } catch (_) {}
    } else {
      room.disconnect(player); // sai e um bot assume a vez
    }
    player.conn = null;
    return send({ t: 'left' });
  }
  conn.room.act(conn.player, m);
}

const MAX_ROOMS = Number(process.env.MAX_ROOMS || 300);
wss.on('connection', (ws) => {
  const conn = { ws, room: null, player: null, tokens: 30, last: Date.now(), dropped: 0 };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    // balde de fichas: 30 de reserva, recarrega 15 por segundo; excesso é descartado e abuso grave derruba a conexão
    const now = Date.now();
    conn.tokens = Math.min(30, conn.tokens + ((now - conn.last) / 1000) * 15); conn.last = now;
    if (conn.tokens < 1) { if (++conn.dropped > 300) ws.terminate(); return; }
    conn.tokens -= 1;
    let m;
    try { m = JSON.parse(raw); } catch (_) { return; }
    if (!m || typeof m.t !== 'string') return;
    try { handle(conn, m); } catch (e) { console.error('erro ao tratar mensagem', e); }
  });
  ws.on('close', () => {
    const { room, player } = conn;
    if (room && player && player.conn === conn) room.disconnect(player);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.hasHumans() && now - room.lastActivity > 15 * 60 * 1000) { room.destroy(); rooms.delete(code); }
  }
}, 30000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`Jogo do Will rodando em http://localhost:${PORT}`));
}
module.exports = { server, rooms };
