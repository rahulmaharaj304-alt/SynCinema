const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const { WebSocketServer } = require('ws');

const { PORT = 4000, CLIENT_ORIGIN, TURN_URL, TURN_SECRET, ACCESS_KEY, DATA_FILE = './data/rooms.json' } = process.env;
const MAX_USERS = +process.env.MAX_USERS_PER_ROOM || 4;     // couple mode: small rooms
const GRACE_MS = 10000;                              // keep a user's seat while their socket reconnects
const origin = CLIENT_ORIGIN ? CLIENT_ORIGIN.split(',') : true;
if (process.env.NODE_ENV === 'production' && (!ACCESS_KEY || ACCESS_KEY.length < 10)) {
  console.error('Refusing to start: set ACCESS_KEY (10+ chars) so strangers cannot enter.'); process.exit(1);
}
const PEER_KEY = ACCESS_KEY ? crypto.createHmac('sha256', ACCESS_KEY).update('peer').digest('hex').slice(0, 32) : 'peerjs';
const TYPES = ['youtube', 'vimeo', 'file', 'hls', 'dash', 'embed'];
const ROOM_RE = /^[\w-]{2,64}$/;

const keyOk = (k) => { // private mode: shared passphrase gates rooms + TURN creds
  if (!ACCESS_KEY) return true;
  const a = Buffer.from(String(k || '')), b = Buffer.from(ACCESS_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const fails = new Map();                             // brute-force lockout: 8 wrong tries → 15 min ban per IP
const ipOf = (r) => String(r.headers['x-forwarded-for'] || r.address || r.socket?.remoteAddress || '').split(',')[0].trim();
const locked = (ip) => (fails.get(ip)?.until || 0) > Date.now();
const fail = (ip) => { const f = fails.get(ip) || { n: 0 }; if (++f.n >= 8) { f.until = Date.now() + 15 * 60_000; f.n = 0; } fails.set(ip, f); };
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors({ origin }));
app.use('/api', rateLimit({ windowMs: 60_000, max: 120 }));
const server = http.createServer(app);
app.use('/peerjs', ExpressPeerServer(server, {
  path: '/', key: PEER_KEY, allow_discovery: false,
  // route only /peerjs upgrades to PeerJS; otherwise its ws server 400s Socket.io's websocket upgrade
  createWebSocketServer: () => {
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, sock, head) => {
      if (req.url.startsWith('/peerjs/peerjs')) wss.handleUpgrade(req, sock, head, (ws) => wss.emit('connection', ws, req));
    });
    return wss;
  },
})); // WebRTC signaling

app.get('/health', (_, res) => res.send('ok'));
app.use('/api', (_, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const gate = (req, res, next) => {                   // every private asset needs the secret word (sent as a header, never in the URL)
  const ip = ipOf(req);
  if (locked(ip)) return res.status(429).json({ error: 'locked' });
  if (!keyOk(req.get('x-access-key'))) { fail(ip); return res.status(401).json({ error: 'denied' }); }
  next();
};
app.get('/api/verify', gate, (_, res) => res.json({ ok: true }));
app.get('/api/hero', gate, (_, res) => res.type('jpg').sendFile(path.join(__dirname, 'private', 'hero.jpg')));
app.post('/api/rooms', (_, res) => res.json({ roomId: crypto.randomBytes(4).toString('hex') }));
app.get('/api/ice', (req, res) => {
  if (locked(ipOf(req))) return res.status(429).json({});
  if (!keyOk(req.query.key)) { fail(ipOf(req)); return res.status(401).json({}); }                    // STUN + short-lived TURN credentials (coturn use-auth-secret)
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (TURN_URL && TURN_SECRET) {
    const username = `${Math.floor(Date.now() / 1000) + 86400}:sync`;
    const credential = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');
    iceServers.push({ urls: TURN_URL.split(','), username, credential });
  }
  try { iceServers.push(...JSON.parse(process.env.EXTRA_ICE || '[]')); } catch {}   // e.g. free Open Relay / Metered TURN
  res.json({ iceServers, peerKey: PEER_KEY });
});

const io = new Server(server, {
  cors: { origin }, maxHttpBufferSize: 1e5,
  allowRequest: (req, cb) => cb(null, !CLIENT_ORIGIN || !req.headers.origin || origin.includes(req.headers.origin)),  // block cross-site websockets
});
const rooms = new Map();
const fresh = () => ({ pass: null, users: new Map(), hostId: null, screenBy: null, lock: false, queue: [],
  media: { type: 'none', src: '' }, playing: false, time: 0, at: Date.now(), chat: [] });
try { for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(DATA_FILE)))) rooms.set(id, { ...fresh(), ...v }); } catch {}
let saveT;                                          // persist rooms so "our room" survives restarts
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries([...rooms].map(([id, r]) => [id, { pass: r.pass, media: r.media, queue: r.queue, chat: r.chat, lock: r.lock }]))));
} catch (e) { console.error('save failed', e.message); } }, 1000); };
// room passkey: stored only as a salted scrypt hash, so even the server file never holds it
const hashPass = (p) => { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + crypto.scryptSync(p, salt, 32).toString('hex'); };
const passOk = (r, p) => {
  const [salt, h] = String(r.pass).split(':');
  const a = crypto.scryptSync(p, Buffer.from(salt, 'hex'), 32), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const position = (r) => r.time + (r.playing ? (Date.now() - r.at) / 1000 : 0);
const snapshot = (r) => ({ media: r.media, playing: r.playing, time: position(r) });
const roster = (r) => [...r.users.values()].map(({ cid, name, color, sid }) => ({ id: cid, name, color, sid }));
const presence = (id, r) => io.to(id).emit('presence', { users: roster(r), hostId: r.hostId, lock: r.lock });
const PRIVATE = /^(localhost|.*\.(local|internal|lan)|127\..*|10\..*|192\.168\..*|172\.(1[6-9]|2\d|3[01])\..*|169\.254\..*|0\.0\.0\.0|\[?::1?\]?|\[?f[cd].*)$/i;
const cleanUrl = (v) => { // http(s) only; never point a partner's browser at their home network
  try {
    const u = new URL(String(v).trim());
    if (!/^https?:$/.test(u.protocol) || (!process.env.ALLOW_PRIVATE_URLS && PRIVATE.test(u.hostname))) return null;
    return u.href.slice(0, 2048);
  } catch { return null; }
};
const setMedia = (id, r, m) => { r.media = m; r.time = 0; r.playing = false; r.at = Date.now(); io.to(id).emit('state', snapshot(r)); save(); };
const num = (v) => (Number.isFinite(+v) && +v >= 0 && +v < 1e6 ? +v : 0);

io.on('connection', (socket) => {
  let rid, room, user, n = 0, t = Date.now();
  socket.on('error', () => {});
  socket.use((_, next) => { if (Date.now() - t > 1000) { n = 0; t = Date.now(); } ++n <= 30 ? next() : next(new Error('rate')); });
  const joined = () => room && user;
  const canControl = () => joined() && (!room.lock || user.cid === room.hostId);

  socket.on('join', ({ roomId, cid, name, key, token, pass } = {}, ack) => {
    if (typeof ack !== 'function') return;
    const ip = ipOf(socket.handshake);
    if (locked(ip)) return ack({ error: 'locked' });
    if (!keyOk(key)) { fail(ip); return ack({ error: 'denied' }); }
    if (!ROOM_RE.test(roomId) || !/^\w{4,32}$/.test(cid)) return ack({ error: 'invalid' });
    const r = rooms.get(roomId) || fresh();
    const p = typeof pass === 'string' ? pass.trim() : '';
    if (r.pass) {                                    // locked room: right passkey or no entry
      if (!p) return ack({ error: 'needpass' });
      if (!passOk(r, p)) { fail(ip); return ack({ error: 'badpass' }); }
    } else if (p.length >= 4 && p.length <= 64) { r.pass = hashPass(p); rooms.set(roomId, r); save(); }   // first person claims + locks it
    else return ack({ error: 'newroom' });
    if (!r.users.has(cid) && r.users.size >= MAX_USERS) return ack({ error: 'full' });
    const ex = r.users.get(cid);                      // seat is bound to a secret token: nobody can impersonate you
    if (ex && ex.token !== token) return ack({ error: 'taken' });
    rid = roomId; room = r;
    user = room.users.get(cid) || { cid, token: crypto.randomBytes(16).toString('hex'), color: `hsl(${Math.random() * 360 | 0} 70% 62%)` };
    clearTimeout(user.timer);                        // reconnect within grace → same seat
    Object.assign(user, { name: (String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Guest'), sid: socket.id });
    room.users.set(cid, user);
    if (!room.hostId || !room.users.has(room.hostId)) room.hostId = cid;
    socket.join(rid);
    ack({ me: cid, token: user.token, ...snapshot(room), users: roster(room), hostId: room.hostId, lock: room.lock, queue: room.queue, chat: room.chat, screenBy: room.screenBy });
    socket.emit('state', snapshot(room));            // re-sync player after reconnect
    presence(rid, room);
  });

  socket.on('media:set', ({ media } = {}) => {
    const local = media?.type === 'local';             // local file: each partner opens their own copy
    const src = local ? '' : cleanUrl(media?.src);
    if (!canControl() || !(local || src) || ![...TYPES, 'local'].includes(media.type)) return;
    setMedia(rid, room, { type: media.type, src, ...(local && { name: String(media.name || '').slice(0, 200) }) });
  });

  const pushQ = () => { io.to(rid).emit('queue', room.queue); save(); };
  socket.on('queue:add', ({ media } = {}) => {
    const src = cleanUrl(media?.src);
    if (!joined() || !src || !TYPES.includes(media.type) || room.queue.length >= 100) return;
    room.queue.push({ id: crypto.randomUUID(), type: media.type, src }); pushQ();
  });
  socket.on('queue:remove', (id) => { if (joined()) { room.queue = room.queue.filter((q) => q.id !== id); pushQ(); } });
  socket.on('queue:next', (id) => {                  // play next (or a chosen item)
    if (!canControl()) return;
    const i = id ? room.queue.findIndex((q) => q.id === id) : 0;
    if (i < 0 || !room.queue.length) return;
    const [q] = room.queue.splice(i, 1); setMedia(rid, room, { type: q.type, src: q.src }); pushQ();
  });
  socket.on('chat:clear', () => { if (joined()) { room.chat = []; io.to(rid).emit('chat:cleared'); save(); } });   // wipe saved chat for both
  socket.on('nudge', () => { if (joined()) socket.to(rid).emit('nudge', { from: user.name }); });

  // PLAY | PAUSE | SEEK | BUFFERING
  socket.on('player', ({ action, time } = {}) => {
    if (!canControl() || !['PLAY', 'PAUSE', 'SEEK', 'BUFFERING'].includes(action)) return;
    room.time = num(time); room.at = Date.now();
    if (action === 'PLAY') room.playing = true;
    if (action === 'PAUSE' || action === 'BUFFERING') room.playing = false;
    socket.to(rid).emit('player', { action, time: room.time, by: user.cid });
  });

  // host heartbeat → clients correct drift > 1.5s
  socket.on('heartbeat', ({ time, playing } = {}) => {
    if (!joined() || user.cid !== room.hostId) return;
    room.time = num(time); room.playing = !!playing; room.at = Date.now();
    socket.to(rid).emit('heartbeat', { time: room.time, playing: room.playing });
  });

  socket.on('lock', (v) => { if (joined() && user.cid === room.hostId) { room.lock = !!v; presence(rid, room); } });
  socket.on('chat', ({ text, vt } = {}) => {
    if (!joined() || typeof text !== 'string' || !text.trim()) return;
    const m = { id: crypto.randomUUID(), user: user.name, color: user.color, text: text.slice(0, 500), vt: num(vt), ts: Date.now() };
    room.chat = [...room.chat.slice(-99), m];
    io.to(rid).emit('chat', m); save();
  });
  socket.on('reaction', (e) => { if (joined() && ['❤️', '😂', '😮', '😢', '🔥', '👏'].includes(e)) io.to(rid).emit('reaction', e); });
  socket.on('screen:start', () => { if (joined()) { room.screenBy = user.cid; io.to(rid).emit('screen', room.screenBy); } });
  socket.on('screen:stop', () => { if (joined() && room.screenBy === user.cid) { room.screenBy = null; io.to(rid).emit('screen', null); } });

  socket.on('disconnect', () => {
    if (!joined() || user.sid !== socket.id) return;  // a newer socket already took over
    const [r, u, id] = [room, user, rid];
    u.timer = setTimeout(() => {
      r.users.delete(u.cid);
      if (r.screenBy === u.cid) { r.screenBy = null; io.to(id).emit('screen', null); }
      if (r.hostId === u.cid) r.hostId = r.users.keys().next().value || null;
      presence(id, r);   // rooms stay (persisted)
    }, GRACE_MS);
  });
});

server.listen(PORT, () => console.log(`SyncCinema server on :${PORT}`));
const stop = () => { io.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
