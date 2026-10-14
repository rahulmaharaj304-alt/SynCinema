'use client';
import { useEffect, useRef, useState } from 'react';
import { Link2, MonitorUp, MonitorOff, ExternalLink, AlertTriangle, FolderOpen, Captions, ListPlus, Play } from 'lucide-react';
import { detect, ytId, vimeoId, loadScript, ytReady, toEmbed } from '@/lib/media';

const TYPES = ['auto', 'file', 'hls', 'dash', 'embed'];

export default function VideoPlayer({ socket, me, hostId, users, peerRef, initial, screenBy, screenStream, playerRef }) {
  const [media, setMedia] = useState(initial.media);
  const [url, setUrl] = useState(''), [force, setForce] = useState('auto');
  const [local, setLocal] = useState(null), [error, setError] = useState('');
  const vref = useRef(), ytBox = useRef(), vmBox = useRef(), shareEl = useRef();
  const api = useRef({ time: () => 0, play() {}, pause() {}, seek() {} });
  const st = useRef(initial);          // last known room state
  const quiet = useRef(false);         // true while applying remote commands (prevents echo loops)
  const playing = useRef(false);
  const share = useRef(null), called = useRef(new Set());
  const stream = screenBy === me ? local : screenStream;
  const T = media.type;
  const [localUrl, setLocalUrl] = useState(null), [sub, setSub] = useState(null), [hist, setHist] = useState([]);
  const hostRef = useRef(false); hostRef.current = me === hostId;
  useEffect(() => setHist(JSON.parse(localStorage.hist || '[]')), []);

  const silently = (fn) => { quiet.current = true; fn(); setTimeout(() => (quiet.current = false), 700); };
  const send = (action) => {
    if (quiet.current) return;
    playing.current = action === 'PLAY' ? true : action === 'SEEK' ? playing.current : false;
    socket.emit('player', { action, time: api.current.time() });
  };
  const correct = (time, play) => silently(() => {
    const a = api.current;
    if (Math.abs(a.time() - time) > 1.5) a.seek(time);       // drift threshold
    if (play !== playing.current) { play ? a.play() : a.pause(); playing.current = play; }
  });

  // ---------- <video>: mp4/webm/audio, HLS, DASH ----------
  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    setError('');
    if (!['file', 'hls', 'dash', 'local'].includes(T)) { v.pause(); v.removeAttribute('src'); v.load(); return; }
    if (T === 'local' && !localUrl) { v.removeAttribute('src'); v.load(); return; }
    let dispose = () => {};
    if (T === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl'))
      import('hls.js').then(({ default: H }) => {
        const h = new H(); h.loadSource(media.src); h.attachMedia(v); dispose = () => h.destroy();
        h.on(H.Events.ERROR, (_, d) => d.fatal && setError('Stream failed to load (blocked, offline or CORS).'));
      });
    else if (T === 'dash') import('dashjs').then(({ MediaPlayer }) => { const d = MediaPlayer().create(); d.initialize(v, media.src, false); dispose = () => d.reset(); });
    else v.src = T === 'local' ? localUrl : media.src;
    api.current = { time: () => v.currentTime, play: () => v.play().catch(() => {}), pause: () => v.pause(), seek: (t) => (v.currentTime = t) };
    const evs = [['play', 'PLAY'], ['playing', 'PLAY'], ['pause', 'PAUSE'], ['seeked', 'SEEK'], ['waiting', 'BUFFERING']]
      .map(([e, a]) => { const f = () => send(a); v.addEventListener(e, f); return () => v.removeEventListener(e, f); });
    v.onended = () => hostRef.current && socket.emit('queue:next');
    v.onerror = () => setError('This link cannot be played here (unsupported format or blocked by the host). Try another type, or use Share screen.');
    v.onloadedmetadata = () => correct(st.current.time, st.current.playing);
    return () => { evs.forEach((o) => o()); dispose(); };
  }, [media, localUrl]);

  // ---------- YouTube ----------
  useEffect(() => {
    if (T !== 'youtube') return;
    let p, dead = false;
    ytReady().then(() => {
      if (dead) return;
      ytBox.current.innerHTML = '<div id="yt"></div>';
      p = new window.YT.Player('yt', {
        width: '100%', height: '100%', videoId: ytId(media.src), playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            api.current = { time: () => p.getCurrentTime(), play: () => p.playVideo(), pause: () => p.pauseVideo(), seek: (t) => p.seekTo(t, true) };
            correct(st.current.time, st.current.playing);
          },
          onStateChange: (e) => { const a = { 1: 'PLAY', 2: 'PAUSE', 3: 'BUFFERING' }[e.data]; if (a) send(a); if (e.data === 0 && hostRef.current) socket.emit('queue:next'); },
          onError: () => setError('YouTube refused to play this video here (embedding disabled). Open it in another tab and use Share screen to show it anyway.'),
        },
      });
    });
    return () => { dead = true; p?.destroy?.(); };
  }, [media]);

  // ---------- Vimeo ----------
  useEffect(() => {
    if (T !== 'vimeo') return;
    let p, t = 0, dead = false;
    loadScript('https://player.vimeo.com/api/player.js').then(() => {
      if (dead) return;
      vmBox.current.innerHTML = '';
      p = new window.Vimeo.Player(vmBox.current, { id: +vimeoId(media.src), width: 1280 });
      api.current = { time: () => t, play: () => p.play().catch(() => {}), pause: () => p.pause(), seek: (s) => { t = s; p.setCurrentTime(s); } };
      p.on('timeupdate', (e) => (t = e.seconds));
      p.on('play', () => send('PLAY')); p.on('pause', () => send('PAUSE'));
      p.on('seeked', () => send('SEEK')); p.on('bufferstart', () => send('BUFFERING'));
      p.on('loaded', () => correct(st.current.time, st.current.playing));
      p.on('error', () => setError('Vimeo refused to play this video here (privacy settings). Open it in another tab and use Share screen instead.'));
    });
    return () => { dead = true; p?.destroy?.(); };
  }, [media]);

  // ---------- socket sync ----------
  useEffect(() => {
    const onState = (s) => { st.current = s; setMedia((m) => (m.src === s.media.src && m.type === s.media.type ? m : s.media)); correct(s.time, s.playing); };
    const onPlayer = ({ action, time }) => silently(() => {
      const a = api.current;
      if (Math.abs(a.time() - time) > 0.5) a.seek(time);
      if (action === 'PLAY') { a.play(); playing.current = true; }
      if (action === 'PAUSE' || action === 'BUFFERING') { a.pause(); playing.current = false; }
    });
    const onBeat = ({ time, playing: p }) => correct(time, p);
    socket.on('state', onState); socket.on('player', onPlayer); socket.on('heartbeat', onBeat);
    const beat = setInterval(() => me === hostId && socket.emit('heartbeat', { time: api.current.time(), playing: playing.current }), 3000);
    playerRef.current = { pause: () => { api.current.pause(); send('PAUSE'); }, time: () => api.current.time(), seek: (t) => { api.current.seek(t); send('SEEK'); } };
    return () => { socket.off('state', onState); socket.off('player', onPlayer); socket.off('heartbeat', onBeat); clearInterval(beat); };
  }, [me, hostId]);

  // ---------- screen share (WebRTC) ----------
  useEffect(() => { if (shareEl.current) shareEl.current.srcObject = stream || null; }, [stream]);
  useEffect(() => { // call guests who joined (or rejoined) while sharing
    if (!share.current) return;
    users.filter((u) => u.id !== me && !called.current.has(u.sid)).forEach((u) => {
      called.current.add(u.sid);
      peerRef.current?.call(u.id, share.current, { metadata: { type: 'screen' } });
    });
  }, [users]);
  const stopShare = () => {
    share.current?.getTracks().forEach((t) => t.stop());
    share.current = null; called.current.clear(); setLocal(null);
    socket.emit('screen:stop');
  };
  const startShare = async () => {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      share.current = s; setLocal(s);
      s.getVideoTracks()[0].onended = stopShare;
      socket.emit('screen:start');
      users.filter((u) => u.id !== me).forEach((u) => { called.current.add(u.sid); peerRef.current?.call(u.id, s, { metadata: { type: 'screen' } }); });
    } catch { /* cancelled */ }
  };

  const build = () => {
    let src = url.trim(); if (!src) return null;
    if (!/^https?:\/\//i.test(src)) src = 'https://' + src;
    const type = force === 'auto' ? detect(src) : force;
    return { type, src: type === 'embed' ? toEmbed(src) : src };
  };
  const enqueue = () => { const m = build(); if (m) { socket.emit('queue:add', { media: m }); setUrl(''); } };
  const pickLocal = (e) => {                         // any file on this device: both partners pick their own copy
    const f = e.target.files[0]; if (!f) return;
    setLocalUrl(URL.createObjectURL(f));
    if (!(T === 'local' && media.name === f.name)) socket.emit('media:set', { media: { type: 'local', name: f.name } });
    e.target.value = '';
  };
  const pickSub = async (e) => {                     // .srt / .vtt subtitles for your own player
    const f = e.target.files[0]; if (!f) return;
    let t = (await f.text()).replace(/\r/g, '');
    if (!t.startsWith('WEBVTT')) t = 'WEBVTT\n\n' + t.replace(/(\d+:\d+:\d+),(\d+)/g, '$1.$2');
    setSub(URL.createObjectURL(new Blob([t], { type: 'text/vtt' }))); e.target.value = '';
  };
  const load = (e) => {
    e.preventDefault();
    const m = build(); if (!m) return;
    socket.emit('media:set', { media: m });
    const h = [m.src, ...hist.filter((x) => x !== m.src)].slice(0, 6); setHist(h); localStorage.hist = JSON.stringify(h);
    setUrl('');
  };

  const show = (k) => (!stream && k ? '' : 'hidden');
  return (
    <div className="flex flex-col gap-3">
      <div className="vault relative aspect-video overflow-hidden rounded-2xl bg-black shadow-[0_20px_80px_-24px_rgba(217,70,122,.55)] ring-1 ring-white/10">
        <video ref={shareEl} autoPlay playsInline muted={screenBy === me} className={`absolute inset-0 h-full w-full bg-black object-contain ${stream ? '' : 'hidden'}`} />
        <video ref={vref} controls playsInline className={`absolute inset-0 h-full w-full ${show(['file', 'hls', 'dash', 'local'].includes(T))}`}>
          {sub && <track key={sub} default kind="subtitles" src={sub} srcLang="en" label="Subtitles" />}
        </video>
        <div ref={ytBox} className={`absolute inset-0 ${show(T === 'youtube')}`} />
        <div ref={vmBox} className={`absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full ${show(T === 'vimeo')}`} />
        {T === 'embed' && !stream && (
          <iframe src={media.src} sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups" referrerPolicy="no-referrer" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen className="absolute inset-0 h-full w-full bg-white" />
        )}
        {T === 'local' && !localUrl && !stream && (
          <label className="absolute inset-0 grid cursor-pointer place-items-center p-6 text-center text-white/80">
            <span>Playing <b>{media.name}</b><br />Tap to pick the same file from your device<input type="file" accept="video/*,audio/*,.mkv" onChange={pickLocal} hidden /></span>
          </label>
        )}
        {T === 'none' && !stream && (
          <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,#2a1636,#0b0610)] p-6 text-center text-white">
            <div>
              <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-[#d9467a] shadow-[0_0_50px_rgba(217,70,122,.6)]"><i className="ring" /><Play className="h-7 w-7 fill-white" /></div>
              <p className="font-display text-xl font-semibold">Pick tonight&apos;s movie</p>
              <ol className="mt-4 space-y-2 text-left text-sm text-white/80">
                {['Paste a video link in the box below', 'Press “Play for everyone”', 'Or share your screen for any site'].map((t, i) => (
                  <li key={t} className="rise flex items-center gap-2" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
                    <b className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-xs">{i + 1}</b>{t}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
        <div id="reaction-layer" className="pointer-events-none absolute inset-0" />
      </div>
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
      {T === 'embed' && !stream && (
        <p className="flex flex-wrap items-center gap-2 text-xs opacity-70">
          Embedded page: playback is not synced. Many sites block embedding — for those use <b>Share screen</b> to watch in perfect sync.
          <a href={media.src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">Open <ExternalLink className="h-3 w-3" /></a>
        </p>
      )}
      <form onSubmit={load} className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 basis-60">
            <Link2 className="absolute left-3 top-2.5 h-4 w-4 opacity-50" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste any link: YouTube, Vimeo, mp4, m3u8, mpd, website…" className="field !pl-9" />
          </div>
          <button className="btn"><Play className="h-4 w-4" />Play for everyone</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={enqueue} className="ghost" title="Add this link to the Up next list"><ListPlus className="h-4 w-4" />Add to queue</button>
          <label className="ghost cursor-pointer" title="Play a movie file from your own device"><FolderOpen className="h-4 w-4" />My file<input type="file" accept="video/*,audio/*,.mkv" onChange={pickLocal} hidden /></label>
          <label className="ghost cursor-pointer" title="Add .srt or .vtt subtitles"><Captions className="h-4 w-4" />Subtitles<input type="file" accept=".srt,.vtt" onChange={pickSub} hidden /></label>
          {screenBy === me
            ? <button type="button" onClick={stopShare} className="ghost"><MonitorOff className="h-4 w-4" />Stop sharing</button>
            : <button type="button" onClick={startShare} disabled={!!screenBy} className="ghost" title="Show your screen to your partner"><MonitorUp className="h-4 w-4" />Share screen</button>}
          <select value={force} onChange={(e) => setForce(e.target.value)} aria-label="Link type" className="field !w-auto" title="Link type (Auto detects it for you)">
            {TYPES.map((t) => <option key={t} value={t} className="text-black">{t === 'auto' ? 'Type: Auto' : t.toUpperCase()}</option>)}
          </select>
        </div>
      </form>
      {hist.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs opacity-70">
          {hist.map((h) => <button key={h} onClick={() => setUrl(h)} className="max-w-[16rem] truncate rounded-full border border-current/20 px-2 py-0.5 hover:opacity-100" title={h}>{h.replace(/^https?:\/\/(www\.)?/, '')}</button>)}
        </div>
      )}
    </div>
  );
}
