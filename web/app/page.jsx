'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { Lock, ArrowRight, Heart, Eye, EyeOff, ShieldCheck, Sparkles, KeyRound, LogOut } from 'lucide-react';
import Floaters from '@/components/Floaters';
import { getKey, setKey, verify, loadHero, forgetEverything } from '@/lib/vault';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const slug = (v) => v.trim().split('?')[0].split('/').filter(Boolean).pop() || '';   // accepts a code or a whole pasted link
const IMG_W = 1710, IMG_H = 919;                                                    // the split between the two rooms is the centre line

/* ---------------- locked screen ---------------- */
function Gate({ onUnlock, notice }) {
  const [v, setV] = useState(''), [show, setShow] = useState(false), [msg, setMsg] = useState(notice || ''), [busy, setBusy] = useState(false);
  const card = useRef();
  useEffect(() => { if (!reduced()) gsap.from(card.current.children, { y: 24, opacity: 0, duration: 0.7, stagger: 0.09, ease: 'power3.out' }); }, []);
  const submit = async (e) => {
    e.preventDefault(); if (!v || busy) return;
    setBusy(true); setMsg('');
    const r = await verify(v);
    if (r === 'ok') { setKey(v); return onUnlock(v); }
    setBusy(false);
    setMsg({ denied: 'Wrong secret word. Try again.', locked: 'Too many wrong tries. Wait 15 minutes.', offline: 'Cannot reach the server. Is it running?' }[r]);
    if (r === 'denied') { card.current.classList.remove('shake'); void card.current.offsetWidth; card.current.classList.add('shake'); }
  };
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#120b1a] px-6 text-white">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(217,70,122,.35),transparent_55%),radial-gradient(ellipse_at_80%_80%,rgba(109,74,255,.3),transparent_55%)]" />
      <Floaters n={16} />
      <form ref={card} onSubmit={submit} className="glass relative w-full max-w-sm space-y-4 p-8 text-center">
        <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#d9467a] shadow-[0_0_50px_rgba(217,70,122,.6)]"><i className="ring" /><Lock className="h-7 w-7" /></div>
        <h1 className="font-display text-3xl font-semibold">Our private couch</h1>
        <p className="text-sm text-white/70">Only you two know the secret word. Type it to come in.</p>
        <div className="relative">
          <KeyRound className="absolute left-3 top-3 h-4 w-4 text-white/50" />
          <input autoFocus type={show ? 'text' : 'password'} value={v} onChange={(e) => setV(e.target.value)} placeholder="Secret word" autoComplete="current-password" className="field-d !pl-9 !pr-10" />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide word' : 'Show word'} className="absolute right-2 top-2 rounded-lg p-1 text-white/60 hover:text-white">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
        {msg && <p role="alert" className="text-sm text-rose-300">{msg}</p>}
        <button className="btn w-full !py-3" disabled={busy}>{busy ? 'Checking…' : 'Unlock'}</button>
      </form>
    </main>
  );
}

/* ---------------- dashboard (after unlock) ---------------- */
function Dashboard({ hero, onLock }) {
  const router = useRouter();
  const root = useRef(), stage = useRef(), cta = useRef();
  const [seam, setSeam] = useState({ x: 0, y: 0 });
  const [pass, setPass] = useState(''), [perr, setPerr] = useState('');
  const [code, setCode] = useState(''), [last, setLast] = useState(''), [err, setErr] = useState(''), [loaded, setLoaded] = useState(false);
  useEffect(() => setLast(localStorage.getItem('lastRoom') || ''), []);

  // keep the glowing seam + heart exactly on the picture's split line, on any screen shape
  useLayoutEffect(() => {
    const el = stage.current;
    const calc = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      const s = Math.max(w / IMG_W, h / IMG_H), iw = IMG_W * s, ih = IMG_H * s;
      setSeam({ x: (w - iw) / 2 + iw / 2, y: (h - ih) / 2 + ih / 2 });
    };
    calc(); const ro = new ResizeObserver(calc); ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (reduced()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.layer', { scale: 1.2, opacity: 0 }, { scale: 1.06, opacity: 1, duration: 2.2, ease: 'power3.out' });
      gsap.to('.layer', { scale: 1.13, duration: 20, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 2.2 });
      gsap.from('.nav', { y: -24, opacity: 0, duration: 0.8, delay: 0.3, ease: 'power3.out' });
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.5 });
      tl.from('.word', { yPercent: 110, opacity: 0, duration: 0.9, stagger: 0.07 })
        .from('.sub', { opacity: 0, y: 14, duration: 0.6 }, '-=0.5')
        .from('.step', { opacity: 0, y: 12, scale: 0.9, duration: 0.5, stagger: 0.12 }, '-=0.3')
        .from('.panel', { opacity: 0, y: 40, duration: 0.8 }, 0.9)
        .from('.panel > *', { opacity: 0, y: 14, duration: 0.5, stagger: 0.09 }, 1.2);
      // gentle parallax: the picture follows the pointer
      if (matchMedia('(hover: hover)').matches) {
        const x = gsap.quickTo('.layer', 'x', { duration: 1.2, ease: 'power3' }), y = gsap.quickTo('.layer', 'y', { duration: 1.2, ease: 'power3' });
        const mv = (e) => { x((e.clientX / innerWidth - 0.5) * -22); y((e.clientY / innerHeight - 0.5) * -14); };
        addEventListener('pointermove', mv); return () => removeEventListener('pointermove', mv);
      }
    }, root);
    return () => ctx.revert();
  }, []);

  // magnetic main button
  const pull = (e) => {
    if (reduced() || !cta.current) return;
    const r = cta.current.getBoundingClientRect();
    gsap.to(cta.current, { x: (e.clientX - r.left - r.width / 2) * 0.08, y: (e.clientY - r.top - r.height / 2) * 0.2, duration: 0.3 });
  };
  const release = () => cta.current && gsap.to(cta.current, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,.5)' });

  const create = () => {
    const p = pass.trim();
    if (p.length < 4) return setPerr('Room passkey needs at least 4 characters.');
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    sessionStorage.setItem('rp_' + id, p);              // the room locks itself with this passkey on first entry
    router.push(`/room/${id}`);
  };
  const join = (e) => {
    e.preventDefault();
    const c = slug(code);
    if (!/^[\w-]{2,64}$/.test(c)) return setErr('That does not look like a room code.');
    router.push(`/room/${c}`);
  };

  return (
    <main ref={root} className="relative min-h-screen overflow-hidden bg-[#120b1a] text-white">
      {/* picture: top banner on phones, full-screen background on desktop */}
      <div ref={stage} className="absolute inset-x-0 top-0 h-[56vh] md:inset-0 md:h-auto">
        <div className="layer absolute inset-0 will-change-transform">
          {hero && <img src={hero} alt="Two people in different rooms watching the same movie on laptops" onLoad={() => setLoaded(true)} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${loaded ? 'opacity-100' : 'opacity-0'}`} />}
          <div className="seam" style={{ left: seam.x }}><i /></div>
          <div className="absolute z-[5]" style={{ left: seam.x, top: seam.y, transform: 'translate(-50%,-50%)' }}>
            <div className="relative grid h-11 w-11 place-items-center rounded-full bg-[#d9467a] shadow-[0_0_40px_#d9467a]">
              <i className="ring" /><i className="ring" style={{ animationDelay: '1.3s' }} />
              <Heart className="beat h-5 w-5 fill-white text-white" />
            </div>
            <span className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/50 px-2.5 py-0.5 text-[10px] uppercase tracking-widest backdrop-blur">in sync</span>
          </div>
        </div>
        <Floaters n={16} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#120b1a] via-[#120b1a]/50 to-[#120b1a]/10 md:via-[#120b1a]/35" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(10,6,16,.65)_100%)]" />
      </div>

      <nav className="nav relative z-20 flex items-center justify-between px-5 py-4 md:px-8">
        <span className="flex items-center gap-2 font-display text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#d9467a]"><Heart className="h-4 w-4 fill-white" /></span>SyncCinema
        </span>
        <button onClick={onLock} className="glass-btn" title="Lock and forget this device"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Lock &amp; forget this device</span><span className="sm:hidden">Lock</span></button>
      </nav>

      <section className="relative z-10 flex min-h-[calc(100vh-4rem)] flex-col justify-end gap-8 px-5 pb-8 pt-[34vh] md:flex-row md:items-end md:justify-between md:px-10 md:pb-12 md:pt-0">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl">
            {'Same movie. Different cities. One couch.'.split(' ').map((w, i) => (
              <span key={i} className="mr-3 inline-block overflow-hidden align-bottom"><span className="word inline-block">{w}</span></span>
            ))}
          </h1>
          <p className="sub mt-5 max-w-md text-base text-white/80 sm:text-lg">Your own private room. Watch in sync with video, voice and chat — no sign-up.</p>
          <ol className="mt-5 flex flex-wrap gap-2 text-sm">
            {['Start a room', 'Send the link', 'Press play together'].map((s, i) => (
              <li key={s} className="step glass-btn !rounded-full !px-3 !py-1.5"><b className="grid h-5 w-5 place-items-center rounded-full bg-[#d9467a] text-xs">{i + 1}</b>{s}</li>
            ))}
          </ol>
        </div>

        <div className="panel glass w-full space-y-4 p-6 md:max-w-md">
          <div>
            <h2 className="font-display text-xl font-semibold">Ready when you are</h2>
            <p className="text-sm text-white/65">Start a room, or join your partner with their code or link.</p>
          </div>
          <div>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 h-4 w-4 text-white/50" />
              <input type="password" value={pass} onChange={(e) => { setPass(e.target.value); setPerr(''); }} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="Choose a room passkey" aria-label="Room passkey" maxLength={64} className="field-d !pl-9" />
            </div>
            <p className={`mt-1 text-xs ${perr ? 'text-rose-300' : 'text-white/50'}`} role={perr ? 'alert' : undefined}>{perr || 'Only people with this passkey can enter. Tell it to your partner.'}</p>
          </div>
          <button ref={cta} onClick={create} onPointerMove={pull} onPointerLeave={release} className="btn w-full !py-3.5 !text-base"><Sparkles className="h-4 w-4" />Start a private room<ArrowRight className="h-4 w-4" /></button>
          <form onSubmit={join} className="flex gap-2">
            <input value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} placeholder="Room code or link" aria-label="Room code or link" className="field-d" />
            <button className="glass-btn">Join</button>
          </form>
          {err && <p role="alert" className="-mt-2 text-xs text-rose-300">{err}</p>}
          {last && (
            <button onClick={() => router.push(`/room/${last}`)} className="glass-btn w-full justify-between">
              <span className="flex items-center gap-2"><Heart className="h-4 w-4 text-[#ff6fa0]" />Back to our room</span>
              <span className="font-mono text-xs text-white/60">{last}</span>
            </button>
          )}
          <p className="flex items-center gap-1.5 border-t border-white/10 pt-3 text-xs text-white/60"><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" />Private: secret word to enter, and video &amp; voice go straight between you two.</p>
        </div>
      </section>
    </main>
  );
}

/* ---------------- page ---------------- */
export default function Home() {
  const [phase, setPhase] = useState('checking');     // checking | locked | open
  const [hero, setHero] = useState(null), [notice, setNotice] = useState('');
  const enter = (k) => { loadHero(k).then(setHero).catch(() => {}); setPhase('open'); };
  useEffect(() => {
    (async () => {
      const r = await verify(getKey());               // no secret word set on the server → opens straight away
      if (r === 'ok') return enter(getKey());
      if (r === 'offline') setNotice('Cannot reach the server. Is it running?');
      setPhase('locked');
    })();
  }, []);
  const lock = () => { forgetEverything(); if (hero) URL.revokeObjectURL(hero); setHero(null); setPhase('locked'); };

  if (phase === 'checking') return <main className="grid min-h-screen place-items-center bg-[#120b1a]"><Heart className="beat h-10 w-10 fill-[#d9467a] text-[#d9467a]" aria-label="Loading" /></main>;
  if (phase === 'locked') return <Gate onUnlock={enter} notice={notice} />;
  return <Dashboard hero={hero} onLock={lock} />;
}
