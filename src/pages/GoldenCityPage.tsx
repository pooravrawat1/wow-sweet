// ============================================================
// SweetReturns — GoldenCityPage: 3-column layout
// ============================================================

import { Suspense, lazy } from 'react';
import { useStore } from '../store/useStore';
import { WhaleLeaderboard } from '../components/WhaleLeaderboard';
import { AgentLeaderboard } from '../components/AgentLeaderboard';
import NewsInjector from '../components/NewsInjector';

// Lazy-load heavy 3D components
const CandyCity = lazy(() => import('../components/CandyCity'));
const TimeSlider = lazy(() => import('../components/TimeSlider'));
const SectorFilter = lazy(() => import('../components/SectorFilter'));
const StoreDetail = lazy(() => import('../components/StoreDetail'));
const FONT = `'Leckerli One', cursive`;

export default function GoldenCityPage() {
  const selectedStock = useStore((s) => s.selectedStock);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      fontFamily: FONT,
      background: '#0a0a1e',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Leckerli+One&display=swap');
        .sweet-scroll::-webkit-scrollbar { width: 4px; }
        .sweet-scroll::-webkit-scrollbar-track { background: rgba(106,0,170,0.07); border-radius: 4px; }
        .sweet-scroll::-webkit-scrollbar-thumb { background: rgba(106,0,170,0.3); border-radius: 4px; }
      `}</style>

      {/* ── FULL-PAGE 3D city ── */}
      <Suspense fallback={null}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <CandyCity />
        </div>
      </Suspense>

      {/* Sector filter — top left (above left panel) */}
      <Suspense fallback={null}>
        <div style={{ position: 'absolute', top: 12, left: 236, zIndex: 10 }}>
          <SectorFilter />
        </div>
      </Suspense>

      {/* Time slider — bottom center */}
      <Suspense fallback={null}>
        <div style={{
          position: 'absolute', bottom: 0,
          left: '50%', transform: 'translateX(-50%)',
          zIndex: 10,
        }}>
          <TimeSlider />
        </div>
      </Suspense>

      {/* Store detail */}
      {selectedStock !== null && (
        <Suspense fallback={null}>
          <StoreDetail />
        </Suspense>
      )}

      {/* ── LEFT COLUMN (overlay) ── */}
      <div style={{
        position: 'absolute',
        top: 8,
        left: 8,
        width: 220,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 20,
      }}>
        {/* Top 5 Agents box */}
        <div style={{
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.72)',
          border: '1.5px solid rgba(106,0,170,0.13)',
          borderRadius: 16,
          boxShadow: '0 2px 16px rgba(106,0,170,0.08)',
          backdropFilter: 'blur(6px)',
        }}>
          <AgentLeaderboard />
        </div>
        {/* Whale Arena box */}
        <div style={{
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.72)',
          border: '1.5px solid rgba(106,0,170,0.13)',
          borderRadius: 16,
          boxShadow: '0 2px 16px rgba(106,0,170,0.08)',
          backdropFilter: 'blur(6px)',
        }}>
          <WhaleLeaderboard />
        </div>
      </div>

      {/* ── RIGHT PANEL: Future Prediction (overlay) ── */}
      <div style={{
        position: 'absolute',
        top: 8, right: 8, bottom: 8,
        width: 380,
        background: 'rgba(255,255,255,0.72)',
        border: '1.5px solid rgba(106,0,170,0.13)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 2px 16px rgba(106,0,170,0.08)',
        zIndex: 20,
        backdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Injector fills everything */}
        <Suspense fallback={null}>
          <NewsInjector />
        </Suspense>
      </div>
    </div>
  );
}
