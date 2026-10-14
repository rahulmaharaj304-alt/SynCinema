import { serverUrl } from './socket';

// NOTE: never use `localStorage.key` — it is a built-in method. Always getItem/setItem, with our own name.
const K = 'sc_key';
export const getKey = () => { try { return localStorage.getItem(K) || ''; } catch { return ''; } };
export const setKey = (v) => { try { localStorage.setItem(K, v); } catch {} };

// ask the server if the secret word is right → 'ok' | 'denied' | 'locked' | 'offline'
export async function verify(key) {
  try {
    const r = await fetch(serverUrl() + '/api/verify', { headers: { 'x-access-key': key }, cache: 'no-store' });
    return r.ok ? 'ok' : r.status === 429 ? 'locked' : 'denied';
  } catch { return 'offline'; }
}

// the hero picture is private: only served to someone who knows the secret word
export async function loadHero(key) {
  const r = await fetch(serverUrl() + '/api/hero', { headers: { 'x-access-key': key }, cache: 'no-store' });
  if (!r.ok) throw new Error('hero');
  return URL.createObjectURL(await r.blob());
}

// wipe everything this browser remembers (secret word, name, rooms, link history)
export function forgetEverything() {
  try { ['sc_key', 'key', 'name', 'lastRoom', 'hist'].forEach((k) => localStorage.removeItem(k)); sessionStorage.clear(); } catch {}
}
