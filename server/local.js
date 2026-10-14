// Free one-command mode: API + web UI behind ONE port, so a free tunnel (cloudflared) can expose it over HTTPS.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const httpProxy = require('http-proxy');
const { API_PORT = 4000, WEB_PORT = 3000, GATEWAY_PORT = 8080 } = process.env;
process.env.PORT = API_PORT;
require('./server');                                   // API + sockets + WebRTC signaling
const web = spawn('npx', ['next', 'start', '-p', WEB_PORT], { cwd: path.join(__dirname, '../web'), stdio: 'inherit', shell: true });
const api = httpProxy.createProxyServer({ target: `http://localhost:${API_PORT}`, ws: true });
const ui = httpProxy.createProxyServer({ target: `http://localhost:${WEB_PORT}`, ws: true });
for (const p of [api, ui]) p.on('error', (_, __, res) => res?.writeHead?.(502).end('starting…'));
const isApi = (u = '') => /^\/(socket\.io|peerjs|api|health)(\/|\?|$)/.test(u);
// real client IP for the brute-force lockout (never trust a client-supplied header)
const stamp = (req) => { req.headers['x-forwarded-for'] = req.headers['cf-connecting-ip'] || req.socket.remoteAddress; };
http.createServer((req, res) => { stamp(req); (isApi(req.url) ? api : ui).web(req, res); })
  .on('upgrade', (req, sock, head) => { stamp(req); (isApi(req.url) ? api : ui).ws(req, sock, head); })
  .listen(GATEWAY_PORT, () => console.log(`\nSyncCinema → http://localhost:${GATEWAY_PORT}\nShare free over HTTPS:  cloudflared tunnel --url http://localhost:${GATEWAY_PORT}\n`));
process.on('exit', () => web.kill());
