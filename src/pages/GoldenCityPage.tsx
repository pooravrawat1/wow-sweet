// ============================================================
// SweetReturns — GoldenCityPage: Main city view composition
// ============================================================

import React, { Suspense, lazy } from 'react';
import { useStore } from '../store/useStore';

// Lazy-load heavy 3D components
const CandyCity = lazy(() => import('../components/CandyCity'));
const TimeSlider = lazy(() => import('../components/TimeSlider'));
const SectorFilter = lazy(() => import('../components/SectorFilter'));
const Minimap = lazy(() => import('../components/Minimap'));
const StoreDetail = lazy(() => import('../components/StoreDetail'));
const AgentLeaderboard = lazy(() => import('../components/AgentLeaderboard'));

const PAGE_BG = '#1a1a2e';

const LoadingFallback: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: PAGE_BG,
      color: '#FFD700',
      fontFamily: 'monospace',
      fontSize: 18,
    }}
  >
    Loading Golden City...
  </div>
);

export default function GoldenCityPage() {
  const selectedStock = useStore((s) => s.selectedStock);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: PAGE_BG, overflow: 'hidden' }}>
      {/* Full-screen 3D candy city */}
      <Suspense fallback={<LoadingFallback />}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <CandyCity />
        </div>
      </Suspense>

      {/* Time slider overlay — bottom center */}
      <Suspense fallback={null}>
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          <TimeSlider />
        </div>
      </Suspense>

      {/* Sector filter overlay — top left */}
      <Suspense fallback={null}>
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          <SectorFilter />
        </div>
      </Suspense>

      {/* Minimap overlay — bottom left */}
      <Suspense fallback={null}>
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 16,
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          <Minimap />
        </div>
      </Suspense>

      {/* Agent leaderboard overlay — top right */}
      <Suspense fallback={null}>
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          <AgentLeaderboard />
        </div>
      </Suspense>

      {/* Store detail panel — shown when a stock is selected */}
      {selectedStock !== null && (
        <Suspense fallback={null}>
          <div
            style={{
              position: 'absolute',
              bottom: 80,
              right: 16,
              zIndex: 20,
              pointerEvents: 'auto',
            }}
          >
            <StoreDetail />
          </div>
        </Suspense>
      )}
    </div>
  );
}
