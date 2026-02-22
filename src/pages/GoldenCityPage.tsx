// ============================================================
// SweetReturns — GoldenCityPage: Main city view composition
// ============================================================

import React, { Suspense, lazy } from 'react';
import { useStore } from '../store/useStore';
import { WhaleLeaderboard } from '../components/WhaleLeaderboard';
import { Lollipop } from '../components/CandyIcons';

// Lazy-load heavy 3D components
const CandyCity = lazy(() => import('../components/CandyCity'));
const TimeSlider = lazy(() => import('../components/TimeSlider'));
const SectorFilter = lazy(() => import('../components/SectorFilter'));
const StoreDetail = lazy(() => import('../components/StoreDetail'));
const AgentLeaderboard = lazy(() => import('../components/AgentLeaderboard'));
const NewsInjector = lazy(() => import('../components/NewsInjector'));

const PAGE_BG = '#1a1a2e';

const LoadingFallback: React.FC = () => (
  <div style={{
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: PAGE_BG, color: '#FFD700',
    fontFamily: 'monospace', fontSize: 18, gap: 12,
  }}>
    <div style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
      <Lollipop size={48} />
    </div>
    <div>Loading Golden City...</div>
    <div style={{
      width: 160, height: 4, borderRadius: 2,
      background: 'rgba(255,215,0,0.15)', overflow: 'hidden',
    }}>
      <div style={{
        width: '40%', height: '100%', background: '#FFD700',
        borderRadius: 2, animation: 'slideRight 1.2s ease-in-out infinite',
      }} />
    </div>
    <style>{`
      @keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
      @keyframes slideRight { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
    `}</style>
  </div>
);

export default function GoldenCityPage() {
  const selectedStock = useStore((s) => s.selectedStock);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: PAGE_BG, overflow: 'hidden' }}>
      <style>{`
        @media (max-width: 768px) {
          .city-agent-lb { display: none !important; }
        }
      `}</style>
      {/* Full-screen 3D candy city */}
      <Suspense fallback={<LoadingFallback />}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <CandyCity />
        </div>
      </Suspense>

      {/* Time slider overlay — bottom center (flush to bottom) */}
      <Suspense fallback={null}>
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'auto',
            overflow: 'visible',
          }}
        >
          <TimeSlider />
        </div>
      </Suspense>

      {/* Sector filter overlay — top left (collapsible dropdown) */}
      <Suspense fallback={null}>
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 16,
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          <SectorFilter />
        </div>
      </Suspense>

      {/* Agent leaderboard overlay — draggable, default bottom-left */}
      <Suspense fallback={null}>
        <AgentLeaderboard />
      </Suspense>

      {/* Whale Arena Leaderboard — right side */}
      <WhaleLeaderboard />

      {/* News Injector — top right floating panel */}
      <Suspense fallback={null}>
        <NewsInjector />
      </Suspense>

      {/* Store detail panel — shown when a stock is selected (fixed overlay) */}
      {selectedStock !== null && (
        <Suspense fallback={null}>
          <StoreDetail />
        </Suspense>
      )}
    </div>
  );
}
