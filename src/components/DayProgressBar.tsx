import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';

const CYCLE_MS = 10_000; // matches the 10s polling interval in App.tsx
const FONT = `'Leckerli One', cursive`;

export function DayProgressBar() {
  const snapshotDate = useStore((s) => s.snapshotDate);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());
  const rafRef = useRef(0);

  // Reset on new snapshot date
  useEffect(() => {
    startRef.current = Date.now();
    setProgress(0);
  }, [snapshotDate]);

  // Animate progress bar
  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / CYCLE_MS, 1);
      setProgress(pct);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [snapshotDate]);

  return (
    <div style={{
      position: 'absolute',
      bottom: 52,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(500px, 80vw)',
      zIndex: 15,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '4px 14px',
      background: 'rgba(10,8,20,0.7)',
      borderRadius: 10,
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255,215,0,0.15)',
    }}>
      {/* Date label */}
      <span style={{
        fontFamily: FONT,
        fontSize: 11,
        color: '#FFD700',
        whiteSpace: 'nowrap',
        minWidth: 80,
      }}>
        {snapshotDate || '...'}
      </span>

      {/* Progress track */}
      <div style={{
        flex: 1,
        height: 4,
        borderRadius: 2,
        background: 'rgba(255,215,0,0.12)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress * 100}%`,
          height: '100%',
          borderRadius: 2,
          background: progress >= 1
            ? 'linear-gradient(90deg, #FFD700, #FFA500)'
            : 'linear-gradient(90deg, #FFD700, #6a00aa)',
          transition: progress < 0.02 ? 'width 0.3s' : 'none',
        }} />
      </div>

      {/* Status text */}
      <span style={{
        fontFamily: FONT,
        fontSize: 9,
        color: progress >= 1 ? '#FFA500' : 'rgba(255,255,255,0.4)',
        whiteSpace: 'nowrap',
      }}>
        {progress >= 1 ? 'advancing...' : 'next day'}
      </span>
    </div>
  );
}
