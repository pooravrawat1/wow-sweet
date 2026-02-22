// ============================================================
// SweetReturns — GoldenCityPage: 3-column layout
// ============================================================

import { Suspense, lazy } from 'react';
import { useStore } from '../store/useStore';
import { WhaleLeaderboard } from '../components/WhaleLeaderboard';
import { AgentLeaderboard } from '../components/AgentLeaderboard';
import { DraggablePanel } from '../components/DraggablePanel';

// Lazy-load heavy 3D components
const CandyCity = lazy(() => import('../components/CandyCity'));
const TimeSlider = lazy(() => import('../components/TimeSlider'));
const SectorFilter = lazy(() => import('../components/SectorFilter'));
const StoreDetail = lazy(() => import('../components/StoreDetail'));
const FuturePredictions = lazy(() => import('../components/FuturePredictions'));
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

      {/* ── DRAGGABLE PANELS ── */}

      {/* Top 5 Agents — draggable + collapsible */}
      <DraggablePanel
        title="Top 5 Agents"
        defaultPosition={{ x: 8, y: 66 }}
        width={220}
        maxHeight={400}
      >
        <AgentLeaderboard />
      </DraggablePanel>

      {/* Whale Arena — draggable + collapsible */}
      <DraggablePanel
        title="Whale Arena"
        defaultPosition={{ x: 8, y: 380 }}
        width={220}
        maxHeight={360}
      >
        <WhaleLeaderboard />
      </DraggablePanel>

      {/* Future Predictions — collapsible only (no drag) */}
      <DraggablePanel
        title="Future Predictions"
        defaultPosition={{ x: typeof window !== 'undefined' ? window.innerWidth - 396 : 900, y: 66 }}
        width={380}
        maxHeight={600}
        draggable={false}
      >
        <Suspense fallback={null}>
          <FuturePredictions />
        </Suspense>
      </DraggablePanel>
    </div>
  );
}
