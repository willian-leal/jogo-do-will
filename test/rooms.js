'use strict';
// Lista de salas públicas: só aparecem as marcadas como públicas, com humano conectado e ainda no lobby.
process.env.WILL_SPEED = '0.05';
const assert = require('assert');
const WebSocket = require('ws');
const { server } = require('../server');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const open = (port) => new Promise((res) => { const s = new WebSocket(`ws://localhost:${port}`); s.msgs = []; s.on('message', (r) => s.msgs.push(JSON.parse(r))); s.on('open', () => res(s)); });
const last = (s, t) => [...s.msgs].reverse().find((m) => m.t === t);

server.listen(0, async () => {
  const port = server.address().port;
  const a = await open(port), b = await open(port), c = await open(port);
  a.send(JSON.stringify({ t: 'create', name: 'Ana' })); await sleep(200);
  b.send(JSON.stringify({ t: 'create', name: 'Beto' })); await sleep(200);
  c.send(JSON.stringify({ t: 'rooms' })); await sleep(200);
  assert.strictEqual(last(c, 'rooms').list.length, 0, 'salas privadas não aparecem');
  a.send(JSON.stringify({ t: 'setting', public: true })); await sleep(200);
  c.send(JSON.stringify({ t: 'rooms' })); await sleep(200);
  const l = last(c, 'rooms').list;
  assert.strictEqual(l.length, 1); assert.strictEqual(l[0].host, 'Ana'); assert.strictEqual(l[0].players, 1);
  assert(!('token' in l[0]) && !('hand' in l[0]), 'lista só expõe o essencial');
  c.send(JSON.stringify({ t: 'join', name: 'Cris', code: l[0].code })); await sleep(300);
  assert(last(c, 'joined'), 'entrou pela lista');
  b.send(JSON.stringify({ t: 'setting', public: true })); await sleep(200);   // só o anfitrião muda (Beto é anfitrião da dele)
  a.send(JSON.stringify({ t: 'setting', public: false })); await sleep(200);
  const d = await open(port); d.send(JSON.stringify({ t: 'rooms' })); await sleep(200);
  assert.deepStrictEqual(last(d, 'rooms').list.map((x) => x.host), ['Beto'], 'sala voltou a privada e some da lista');
  console.log('OK: lista de salas públicas.');
  process.exit(0);
});
