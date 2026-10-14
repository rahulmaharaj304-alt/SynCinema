'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, GripHorizontal } from 'lucide-react';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { serverUrl } from '@/lib/socket';
import { getKey } from '@/lib/vault';
gsap.registerPlugin(Draggable);

function Tile({ stream, name, muted }) {
  const r = useRef();
  useEffect(() => { if (r.current) r.current.srcObject = stream || null; }, [stream]);
  return (
    <div className="vault relative aspect-video w-36 overflow-hidden rounded-xl bg-black/70 ring-1 ring-white/10">
      <video ref={r} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      <span className="absolute bottom-1 left-1.5 rounded bg-black/55 px-1.5 text-[10px] text-white">{name}</span>
    </div>
  );
}

export default function CouplesOverlay({ me, users, peerRef, onScreen }) {
  const [mine, setMine] = useState(null);
  const [remote, setRemote] = useState({});     // peerId -> MediaStream
  const [ready, setReady] = useState(false);
  const [mic, setMic] = useState(true), [cam, setCam] = useState(true);
  const box = useRef(), grip = useRef(), local = useRef(), called = useRef(new Set());
  const usersRef = useRef(users); usersRef.current = users;

  useEffect(() => { // PeerJS setup
    let peer, dead = false, timer;
    const blank = () => { const c = document.createElement('canvas'); c.width = c.height = 16; return c.captureStream(1); };
    const u = new URL(serverUrl());
    let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    const open = async () => {
      const { default: Peer } = await import('peerjs');
      if (dead) return;
      let peerKey;
      try { const j = await (await fetch(serverUrl() + '/api/ice?key=' + encodeURIComponent(getKey()))).json(); iceServers = j.iceServers; peerKey = j.peerKey; } catch {}
      peer = new Peer(me, { host: u.hostname, port: +u.port || (u.protocol === 'https:' ? 443 : 80), path: '/peerjs', secure: u.protocol === 'https:', config: { iceServers }, ...(peerKey && { key: peerKey }) });
      peerRef.current = peer;
      peer.on('open', () => setReady(true));
      peer.on('disconnected', () => !dead && peer.reconnect());
      peer.on('error', (e) => { // refreshed tab: old peer id may still be registered for a moment
        if (e.type === 'unavailable-id') { peer.destroy(); timer = setTimeout(open, 2000); }
      });
      peer.on('call', (c) => {
        if (!usersRef.current.some((u) => u.id === c.peer)) return c.close();   // ignore calls from anyone not in our room
        if (c.metadata?.type === 'screen') {           // host broadcast: receive only
          c.answer(); c.on('stream', onScreen); c.on('close', () => onScreen(null));
        } else {                                       // camera call: answer with our stream
          c.answer(local.current);
          c.on('stream', (s) => setRemote((p) => ({ ...p, [c.peer]: s })));
        }
      });
    };
    (async () => {
      try { local.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); }
      catch { local.current = blank(); }   // no camera/mic or permission denied: can still watch
      if (dead) return;
      setMine(local.current);
      open();
    })();
    return () => { dead = true; clearTimeout(timer); local.current?.getTracks().forEach((t) => t.stop()); peer?.destroy(); peerRef.current = null; };
  }, [me]);

  useEffect(() => { // lower id dials higher id → exactly one call per pair
    if (!ready) return;
    users.filter((u) => u.id !== me && me < u.id && !called.current.has(u.sid)).forEach((u) => {
      called.current.add(u.sid);
      const c = peerRef.current.call(u.id, local.current, { metadata: { type: 'cam' } });
      c?.on('stream', (s) => setRemote((p) => ({ ...p, [u.id]: s })));
    });
  }, [users, ready]);

  useEffect(() => { // draggable PiP
    const d = Draggable.create(box.current, { trigger: grip.current, bounds: window, inertia: false })[0];
    gsap.from(box.current, { scale: 0.8, opacity: 0, duration: 0.6, ease: 'back.out(1.7)', delay: 0.6 });
    return () => d.kill();
  }, []);

  const toggle = (kind) => {
    const on = kind === 'mic' ? !mic : !cam;
    local.current?.[kind === 'mic' ? 'getAudioTracks' : 'getVideoTracks']().forEach((t) => (t.enabled = on));
    kind === 'mic' ? setMic(on) : setCam(on);
  };

  return (
    <div ref={box} className="fixed bottom-6 right-6 z-40 rounded-2xl bg-[#181120]/85 p-2 shadow-2xl backdrop-blur">
      <div ref={grip} className="flex cursor-grab justify-center pb-1 text-white/50 active:cursor-grabbing"><GripHorizontal className="h-4 w-4" /></div>
      <div className="flex flex-col gap-2">
        <Tile stream={mine} name="You" muted />
        {users.filter((u) => u.id !== me).map((u) => <Tile key={u.id} stream={remote[u.id]} name={u.name} />)}
      </div>
      <div className="mt-2 flex justify-center gap-2 text-white">
        <button onClick={() => toggle('mic')} aria-label="Toggle microphone" className="rounded-full bg-white/10 p-2 hover:bg-white/20">{mic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-rose-400" />}</button>
        <button onClick={() => toggle('cam')} aria-label="Toggle camera" className="rounded-full bg-white/10 p-2 hover:bg-white/20">{cam ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4 text-rose-400" />}</button>
      </div>
    </div>
  );
}
