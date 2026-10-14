import { io } from 'socket.io-client';
const ENV = process.env.NEXT_PUBLIC_SERVER_URL || '';   // empty = same origin (behind Caddy/nginx)
export const serverUrl = () => ENV || location.origin;
let s;
export const getSocket = () => (s ||= io(ENV || undefined, { reconnectionDelayMax: 3000 }));
// per-tab identity: survives refresh/reconnect, no login needed
export const getCid = () => {
  let c = sessionStorage.getItem('cid');
  if (!c) sessionStorage.setItem('cid', (c = crypto.randomUUID().replace(/-/g, '').slice(0, 12)));
  return c;
};
