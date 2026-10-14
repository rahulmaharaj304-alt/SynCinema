'use client';
import { useEffect, useState } from 'react';

// soft hearts drifting upward (pure CSS animation, created after mount to avoid hydration mismatch)
export default function Floaters({ n = 14 }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    setItems(Array.from({ length: n }, () => ({
      left: Math.random() * 100, size: 10 + Math.random() * 18, dur: 12 + Math.random() * 16,
      delay: -Math.random() * 24, drift: (Math.random() - 0.5) * 120, o: 0.15 + Math.random() * 0.3,
    })));
  }, [n]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((it, i) => (
        <span key={i} className="floater" style={{ left: it.left + '%', fontSize: it.size, animationDuration: it.dur + 's', animationDelay: it.delay + 's', '--drift': it.drift + 'px', '--o': it.o }}>♥</span>
      ))}
    </div>
  );
}
