'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import gsap from 'gsap';
import { Send, Copy, Check, Crown, Users, Lock, Unlock, Heart, Film, X, Play, Moon, Home as HomeIcon, Eye, EyeOff, Trash2, KeyRound, User } from 'lucide-react';
import { getSocket, getCid } from '@/lib/socket';
import { getKey, setKey } from '@/lib/vault';
import VideoPlayer from '@/components/VideoPlayer';
import CouplesOverlay from '@/components/CouplesOverlay';
import ThemeToggle from '@/components/ThemeToggle';

const EMOJI = ['❤️', '😂', '😮', '😢', '🔥', '👏'];
const QUESTIONS = ['What is a memory of us you replay the most?', 'What small thing did I do that made you smile this week?', 'Where should our first trip together be?',
  'What song reminds you of me?', 'What are you looking forward to this month?', 'If we had a free day together tomorrow, what would we do?',
  'What is one thing you want us to try this year?', 'What was the best part of your day?', 'What is a dream you have never told me?',
  'Which movie should we watch next, and why?', 'What do you miss most about being together?', 'What is the first thing we do when we meet?'];
const hello = (n) => { // soft chime (+ notification when the tab is in the background)
  try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 660;
    g.gain.setValueAtTime(0.08, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6); o.start(); o.stop(c.currentTime + 0.6); } catch {}
  if (document.hidden && window.Notification?.permission === 'granted') new Notification(`${n} is here 💗`);
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// one friendly card used for "your name" and "secret word"
const Gate = ({ icon, title, hint, onSubmit, cta, children }) => (
  <main className="grid min-h-screen place-items-center px-6">
    <form onSubmit={onSubmit} className="card rise w-full max-w-sm space-y-4 p-7 text-center">
      <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#d9467a]/15 text-[#d9467a]"><i className="ring" />{icon}</div>
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="text-sm opacity-70">{hint}</p>
      {children}
      <button className="btn w-full !py-2.5">{cta}</button>
      <Link href="/" className="block text-xs underline opacity-60 hover:opacity-100">Back to home</Link>
    </form>
  </main>
);
// toolbar button: icon always, text label on wide screens
const Tool = ({ icon, label, title, onClick, className = '', labelClass = 'hidden lg:inline' }) => (
  <button onClick={onClick} title={title} aria-label={title} className={`ghost ${className}`}>{icon}{label && <span className={labelClass}>{label}</span>}</button>
);

export default function Room() {
  const { roomId } = useParams();
  const [name, setName] = useState(null), [draft, setDraft] = useState('');
  const [boot, setBoot] = useState(null), [users, setUsers] = useState([]), [hostId, setHostId] = useState(null);
  const [chat, setChat] = useState([]), [text, setText] = useState('');
  const [screenBy, setScreenBy] = useState(null), [screen, setScreen] = useState(null);
  const [queue, setQueue] = useState([]), [needKey, setNeedKey] = useState(false), [keyTick, setKeyTick] = useState(0), [keyDraft, setKeyDraft] = useState('');
  const [sleep, setSleep] = useState(0), seen = useRef(new Set());
  const [err, setErr] = useState(''), [lock, setLock] = useState(false), [needPass, setNeedPass] = useState(null), [passDraft, setPassDraft] = useState('');
  const [online, setOnline] = useState(true), [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(false), [toast, setToast] = useState(null), toastT = useRef();
  const peerRef = useRef(null), playerRef = useRef(null), listRef = useRef(), root = useRef();
  const socket = typeof window !== 'undefined' ? getSocket() : null;
  const me = typeof window !== 'undefined' ? getCid() : null;

  const say = (m) => { setToast({ m, n: Date.now() }); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 2400); };

  useEffect(() => { localStorage.lastRoom = roomId; setName(localStorage.getItem('name') || ''); }, []);
  useEffect(() => () => document.body.classList.remove('cinema', 'hide-screen'), []);   // leave the room → leave its modes behind
  useEffect(() => { document.body.classList.toggle('hide-screen', hidden); }, [hidden]);

  useEffect(() => { // quick-join: connect once a display name exists
    if (!name) return;
    const join = () => socket.emit('join', { roomId, cid: me, name, key: getKey(), pass: sessionStorage.getItem('rp_' + roomId) || '', token: sessionStorage.tok || '' }, (r) => {
      if (r.error === 'denied') return setNeedKey(true);
      if (['needpass', 'badpass', 'newroom'].includes(r.error)) { sessionStorage.removeItem('rp_' + roomId); return setNeedPass(r.error); }
      if (r.error) return setErr(r.error);
      setNeedKey(false); setNeedPass(null); sessionStorage.tok = r.token; setQueue(r.queue);
      setLock(r.lock); setUsers(r.users); setHostId(r.hostId); setChat(r.chat); setScreenBy(r.screenBy); setBoot(r); setOnline(true);
    });
    socket.on('connect', join);
    socket.on('disconnect', () => setOnline(false));
    socket.on('presence', (p) => {
      p.users.forEach((u) => { if (u.id !== me && !seen.current.has(u.sid)) { seen.current.add(u.sid); hello(u.name); } });
      setUsers(p.users); setHostId(p.hostId); setLock(p.lock); });
    socket.on('chat', (m) => setChat((c) => [...c.slice(-99), m]));
    socket.on('chat:cleared', () => setChat([]));
    socket.on('screen', (by) => { setScreenBy(by); if (!by) setScreen(null); });
    socket.on('reaction', (e) => {
      const el = Object.assign(document.createElement('div'), { textContent: e });
      el.className = 'absolute bottom-4 text-4xl';
      el.style.left = 8 + Math.random() * 80 + '%';
      document.getElementById('reaction-layer')?.append(el);
      gsap.to(el, { y: -260, x: gsap.utils.random(-30, 30), opacity: 0, duration: 2.2, ease: 'power1.out', onComplete: () => el.remove() });
    });
    if (window.Notification?.permission === 'default') Notification.requestPermission();
    socket.on('queue', setQueue);
    socket.on('nudge', () => {                      // "thinking of you": hearts + phone buzz
      navigator.vibrate?.([200, 100, 200]);
      for (let i = 0; i < 14; i++) {
        const el = Object.assign(document.createElement('div'), { textContent: '💗' });
        el.className = 'fixed bottom-10 z-50 text-5xl pointer-events-none'; el.style.left = 10 + Math.random() * 80 + '%';
        document.body.append(el);
        gsap.to(el, { y: -window.innerHeight * 0.8, opacity: 0, scale: 1.6, duration: 2 + Math.random(), delay: i * 0.08, ease: 'power1.out', onComplete: () => el.remove() });
      }
    });
    socket.connect();
    if (socket.connected) join();
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [name, keyTick]);

  useEffect(() => { // keep the screen awake while watching (phones/tablets)
    if (!boot) return;
    let lock; const get = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch {} };
    const vis = () => document.visibilityState === 'visible' && get();
    get(); document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release?.(); };
  }, [!!boot]);

  useEffect(() => { // sleep timer: fall asleep together, the movie pauses itself
    if (!sleep) return;
    const t = setTimeout(() => { playerRef.current?.pause?.(); setSleep(0); say('Sleep timer done — movie paused. Sweet dreams 🌙'); }, sleep * 60000);
    return () => clearTimeout(t);
  }, [sleep]);

  useEffect(() => { // one orchestrated entrance when the room opens
    if (!boot) return;
    const ctx = gsap.context(() => {
      gsap.from('.hdr > *', { opacity: 0, y: -16, duration: 0.6, stagger: 0.1, ease: 'power3.out' });
      gsap.from('.panel', { opacity: 0, y: 28, duration: 0.8, stagger: 0.15, ease: 'power3.out' });
    }, root);
    return () => ctx.revert();
  }, [!!boot]);

  useEffect(() => { // new chat message slides in
    const last = listRef.current?.lastElementChild;
    if (last) { gsap.from(last, { x: 24, opacity: 0, duration: 0.35 }); listRef.current.scrollTop = 1e9; }
  }, [chat.length]);

  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit('chat', { text, vt: playerRef.current?.time?.() || 0 });
    setText('');
  };
  const ask = () => socket.emit('chat', { text: '💬 ' + QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)], vt: playerRef.current?.time?.() || 0 });
  const copy = () => { navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); say('Invite link copied — send it to your partner 💗'); };
  const clearChat = () => { if (confirm('Delete the chat history for both of you? This cannot be undone.')) socket.emit('chat:clear'); };
  const cycleSleep = () => { const n = { 0: 15, 15: 30, 30: 60, 60: 0 }[sleep]; setSleep(n); say(n ? `Movie will pause in ${n} min 🌙` : 'Sleep timer off'); };
  const toggleCinema = () => { const on = document.body.classList.toggle('cinema'); say(on ? 'Cinema mode: hover the top or chat to bring controls back' : 'Cinema mode off'); };
  const toggleHide = () => { setHidden((h) => { say(!h ? 'Screen hidden — hover over the video or chat to peek' : 'Screen visible'); return !h; }); };

  if (name === null) return null;
  if (!name) return (
    <Gate icon={<User className="h-6 w-6" />} title="What should we call you?" hint="Your partner will see this name." cta="Join the couch"
      onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { localStorage.setItem('name', draft.trim()); setName(draft.trim()); } }}>
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Your name" className="field text-center" />
    </Gate>
  );

  if (needKey) return (
    <Gate icon={<KeyRound className="h-6 w-6" />} title="Our secret word" hint="This room is private. Type the word only you two know." cta="Unlock"
      onSubmit={(e) => { e.preventDefault(); setKey(keyDraft); setKeyTick((t) => t + 1); }}>
      <input autoFocus type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="Secret word" className="field text-center" />
    </Gate>
  );

  if (needPass) return (
    <Gate icon={<Lock className="h-6 w-6" />} cta={needPass === 'newroom' ? 'Lock this room' : 'Enter room'}
      title={needPass === 'newroom' ? 'Set a room passkey' : 'Room passkey'}
      hint={needPass === 'newroom' ? 'Nobody can enter this room without it. Share it only with your partner.' : needPass === 'badpass' ? 'Wrong passkey. Try again.' : 'This room is locked. Type its passkey to enter.'}
      onSubmit={(e) => { e.preventDefault(); const v = passDraft.trim(); if (v.length < 4) return; sessionStorage.setItem('rp_' + roomId, v); setPassDraft(''); setKeyTick((t) => t + 1); }}>
      <input autoFocus type="password" minLength={4} maxLength={64} value={passDraft} onChange={(e) => setPassDraft(e.target.value)} placeholder="Room passkey (4+ characters)" className="field text-center" />
    </Gate>
  );

  return (
    <div ref={root} className="mx-auto max-w-7xl px-4 py-4">
      <header className="hdr mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="ghost !p-2" aria-label="Back to home" title="Back to home"><HomeIcon className="h-4 w-4" /></Link>
          <h1 className="font-display text-xl font-semibold">SyncCinema <span className="ml-1 text-sm font-normal opacity-60">room {roomId}</span></h1>
          <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${online ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-500'}`}>
            <i className={`h-2 w-2 rounded-full ${online ? 'animate-pulse bg-emerald-400' : 'bg-rose-500'}`} />{online ? 'Live' : 'Reconnecting…'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {me === hostId && <Tool onClick={() => socket.emit('lock', !lock)} title={lock ? 'Only you control playback (click to let everyone)' : 'Everyone controls playback (click to keep it to you)'} icon={lock ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />} label={lock ? 'Host controls' : 'Everyone controls'} />}
          <Tool onClick={() => socket.emit('nudge')} title="Send hearts to your partner" icon={<Heart className="beat h-4 w-4 text-[#d9467a]" />} label="Miss you" labelClass="hidden sm:inline" />
          <Tool onClick={toggleCinema} title="Cinema mode: dim everything but the screen" icon={<Film className="h-4 w-4" />} label="Cinema" />
          <Tool onClick={cycleSleep} title="Sleep timer: pause the movie automatically" icon={<Moon className="h-4 w-4" />} label={sleep ? `${sleep} min` : 'Sleep'} labelClass={sleep ? '' : 'hidden lg:inline'} />
          <Tool onClick={toggleHide} title={hidden ? 'Show the screen again' : 'Hide the screen and chat (blur) — hover to peek'} icon={hidden ? <EyeOff className="h-4 w-4 text-[#d9467a]" /> : <Eye className="h-4 w-4" />} label={hidden ? 'Hidden' : 'Hide'} />
          <button onClick={copy} className="btn !py-2" title="Copy the invite link">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}<span className="hidden sm:inline">{copied ? 'Link copied' : 'Invite partner'}</span></button>
          <ThemeToggle />
        </div>
      </header>

      {err && <p className="card rise p-6 text-center">{{ full: 'This room is full.', locked: 'Too many wrong tries. Try again in 15 minutes.', taken: 'This seat is already in use.' }[err] || 'Could not join this room.'}</p>}
      {boot && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <section className="panel">
            {users.length < 2 && (
              <div className="card rise mb-3 flex items-center gap-4 p-4">
                <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#d9467a]/15"><i className="ring" /><Heart className="beat h-5 w-5 fill-[#d9467a] text-[#d9467a]" /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Waiting for your partner…</p>
                  <p className="text-sm opacity-65">Send them the invite link. They will need the secret word to come in.</p>
                </div>
                <button onClick={copy} className="btn shrink-0"><Copy className="h-4 w-4" />Copy link</button>
              </div>
            )}
            <VideoPlayer socket={socket} me={me} hostId={hostId} users={users} peerRef={peerRef} initial={boot}
              screenBy={screenBy} screenStream={screen} playerRef={playerRef} />
            {queue.length > 0 && (
              <div className="card mt-3 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide opacity-60">Up next</p>
                <ul className="space-y-1">
                  {queue.map((q) => (
                    <li key={q.id} className="flex items-center gap-2 text-sm">
                      <button onClick={() => socket.emit('queue:next', q.id)} aria-label="Play now" className="ghost !p-1.5"><Play className="h-3.5 w-3.5" /></button>
                      <span className="min-w-0 flex-1 truncate">{q.src.replace(/^https?:\/\/(www\.)?/, '')}</span>
                      <button onClick={() => socket.emit('queue:remove', q.id)} aria-label="Remove" className="opacity-50 hover:opacity-100"><X className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <aside className="panel card vault flex h-[70vh] flex-col p-4 lg:h-[calc(100vh-6rem)]">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-xs opacity-60"><Users className="h-3.5 w-3.5" />{users.length} here</span>
              {users.map((u) => (
                <span key={u.id} className="flex items-center gap-1 rounded-full border border-black/10 dark:border-white/10 px-2 py-0.5 text-xs">
                  <i className="h-2 w-2 rounded-full" style={{ background: u.color }} />{u.name}{u.id === hostId && <Crown className="h-3 w-3 text-amber-500" />}
                </span>
              ))}
              {chat.length > 0 && <button onClick={clearChat} title="Delete chat history for both of you" aria-label="Delete chat history" className="ml-auto rounded-lg p-1 opacity-50 transition hover:opacity-100"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
              {chat.length === 0 && <p className="mt-8 text-center text-sm opacity-50">No messages yet.<br />Say hi 👋 or tap 💬 for a conversation starter.</p>}
              {chat.map((m) => {
                const mine = m.user === name;
                return (
                  <div key={m.id} className={`flex flex-col text-sm leading-snug ${mine ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-1.5 text-xs">
                      <b style={{ color: m.color }}>{mine ? 'You' : m.user}</b>
                      <button onClick={() => playerRef.current?.seek(m.vt)} title="Jump to this moment" className="rounded bg-[#d9467a]/15 px-1 text-[11px] text-[#d9467a] hover:bg-[#d9467a]/25">{fmt(m.vt)}</button>
                    </div>
                    <p className={`mt-0.5 max-w-[85%] break-words rounded-2xl px-3 py-1.5 ${mine ? 'rounded-tr-sm bg-[#d9467a] text-white' : 'rounded-tl-sm bg-black/5 dark:bg-white/10'}`}>{m.text}</p>
                  </div>
                );
              })}
            </div>
            <div className="my-2 flex justify-between">
              {EMOJI.map((e) => <button key={e} onClick={() => socket.emit('reaction', e)} aria-label={`React ${e}`} className="rounded-lg p-1 text-xl transition hover:-translate-y-1 hover:scale-125 active:scale-90">{e}</button>)}
              <button onClick={ask} aria-label="Conversation starter" title="Conversation starter" className="rounded-lg p-1 text-xl transition hover:-translate-y-1 hover:scale-125 active:scale-90">💬</button>
            </div>
            <form onSubmit={send} className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something sweet…" className="field" />
              <button className="btn !px-3" aria-label="Send"><Send className="h-4 w-4" /></button>
            </form>
          </aside>
        </div>
      )}

      {boot && <CouplesOverlay me={me} users={users} peerRef={peerRef} onScreen={setScreen} />}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && <div key={toast.n} className="toast rounded-full bg-black/80 px-4 py-2 text-sm text-white shadow-xl backdrop-blur">{toast.m}</div>}
      </div>
    </div>
  );
}
