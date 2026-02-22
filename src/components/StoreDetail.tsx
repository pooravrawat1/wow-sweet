// ============================================================
// SweetReturns — Store Interior Overlay (light candy theme)
// ============================================================

import React, { useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { SECTORS } from '../data/stockData';
import type { StockData } from '../types';

const FONT = `'Leckerli One', cursive`;
const PURPLE = '#6a00aa';
const GOLD = '#FFD700';
const GOLD_DARK = '#c8a800';

// ---- Sub-components ----

const StarRating: React.FC<{ score: number }> = ({ score }) => (
  <div style={{ display: 'flex', gap: 3 }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <span
        key={i}
        style={{
          fontSize: 22,
          color: i <= score ? GOLD_DARK : 'rgba(0,0,0,0.12)',
          textShadow: i <= score ? '0 0 6px rgba(200,168,0,0.4)' : 'none',
        }}
      >
        ★
      </span>
    ))}
  </div>
);

const TradeBar: React.FC<{
  label: string;
  pct: number;
  agentCount: number;
  color: string;
  maxPct: number;
}> = ({ label, pct, agentCount, color, maxPct }) => {
  const barHeight = maxPct > 0 ? (pct / maxPct) * 100 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 3, fontFamily: FONT }}>
      <span style={{ fontSize: 10, color: PURPLE, fontWeight: 700 }}>{(pct * 100).toFixed(0)}%</span>
      <div style={{
        width: 28,
        height: 110,
        background: 'rgba(106,0,170,0.07)',
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        overflow: 'hidden',
        border: '1.5px solid rgba(106,0,170,0.15)',
      }}>
        <div style={{
          width: '100%',
          height: barHeight,
          background: `linear-gradient(to top, ${color}, ${color}cc)`,
          borderRadius: '0 0 5px 5px',
          transition: 'height 0.5s ease',
          boxShadow: `0 0 6px ${color}88`,
        }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, fontFamily: FONT }}>{label}</span>
      <span style={{ fontSize: 8, color: '#888', fontFamily: FONT }}>{agentCount}</span>
    </div>
  );
};

const DoorCrowdViz: React.FC<{ doorCount: number; insideCount: number }> = ({ doorCount, insideCount }) => {
  const dots = Math.min(doorCount, 40);
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      fontFamily: FONT,
    }}>
      <div style={{ fontSize: 10, color: PURPLE, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
        Door
      </div>
      {/* Door icon */}
      <div style={{
        width: 30,
        height: 50,
        borderRadius: '4px 4px 0 0',
        border: `2px solid ${GOLD_DARK}`,
        borderBottom: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        <div style={{
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: GOLD_DARK,
          position: 'absolute',
          right: 4,
          top: '50%',
        }} />
      </div>
      {/* Crowd dots */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        justifyContent: 'center',
        maxWidth: 80,
      }}>
        {Array.from({ length: dots }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: i % 2 === 0 ? PURPLE : GOLD_DARK,
              animation: `pulse 0.5s ease-in-out ${(i * 0.05)}s infinite alternate`,
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 10, color: '#c0392b', fontWeight: 700 }}>
        {doorCount} fighting
      </span>
      <span style={{ fontSize: 10, color: '#1a7a00', fontWeight: 700 }}>
        {insideCount} inside
      </span>
    </div>
  );
};

const ReturnDistChart: React.FC<{ dist: StockData['forward_return_distribution'] }> = ({ dist }) => {
  const bars = [
    { label: 'p5', value: dist.p5 },
    { label: 'p25', value: dist.p25 },
    { label: 'med', value: dist.median },
    { label: 'p75', value: dist.p75 },
    { label: 'p95', value: dist.p95 },
  ];
  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.value)), 0.01);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
      {bars.map((bar) => {
        const h = (Math.abs(bar.value) / maxAbs) * 50;
        const isPos = bar.value >= 0;
        return (
          <div key={bar.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <span style={{ fontSize: 8, color: '#555', marginBottom: 2, fontFamily: FONT }}>
              {(bar.value * 100).toFixed(1)}%
            </span>
            <div style={{
              width: '100%',
              maxWidth: 28,
              height: Math.max(h, 3),
              borderRadius: 2,
              backgroundColor: isPos ? GOLD : '#c0392b',
              boxShadow: isPos ? `0 0 4px ${GOLD}88` : undefined,
              opacity: 0.9,
            }} />
            <span style={{ fontSize: 8, color: '#777', marginTop: 2, fontFamily: FONT }}>{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const TicketRow: React.FC<{ label: string; candy: string; active: boolean }> = ({ label, candy, active }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontFamily: FONT }}>
    <span style={{ fontSize: 14, width: 20, textAlign: 'center', color: active ? GOLD_DARK : '#ccc' }}>
      {active ? '✓' : '✗'}
    </span>
    <span style={{ fontSize: 11, color: active ? '#7a4800' : '#bbb', fontWeight: active ? 700 : 400 }}>
      {candy}
    </span>
    <span style={{ fontSize: 10, color: active ? GOLD_DARK : '#ccc', marginLeft: 'auto' }}>
      {label}
    </span>
  </div>
);

// ---- Main Component ----

export const StoreDetail: React.FC = () => {
  const selectedStock = useStore((s) => s.selectedStock);
  const selectStock = useStore((s) => s.selectStock);
  const stocks = useStore((s) => s.stocks);
  const storeAgentCounts = useStore((s) => s.storeAgentCounts);
  const storeDoorCounts = useStore((s) => s.storeDoorCounts);
  const storeLaneCounts = useStore((s) => s.storeLaneCounts);

  const sectorInfo = useMemo(() => {
    if (!selectedStock) return null;
    return SECTORS.find((s) => s.name === selectedStock.sector) || null;
  }, [selectedStock]);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedStock) {
        selectStock(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedStock, selectStock]);

  if (!selectedStock) return null;

  const {
    ticker, company, sector, golden_score, is_platinum,
    direction_bias, forward_return_distribution, ticket_levels,
    brand_color,
  } = selectedStock;

  // Real agent counts from simulation
  const storeIdx = stocks.findIndex((s) => s.ticker === ticker);
  const doorCount = storeIdx >= 0 && storeDoorCounts.length > storeIdx ? storeDoorCounts[storeIdx] : 0;
  const insideCount = storeIdx >= 0 && storeAgentCounts.length > storeIdx ? storeAgentCounts[storeIdx] : 0;

  // Exact per-lane agent counts from simulation (lane 0=BUY, 1=CALL, 2=PUT, 3=SHORT)
  const hasLaneData = storeIdx >= 0 && storeLaneCounts.length > storeIdx * 4 + 3;
  const buyCount = hasLaneData ? storeLaneCounts[storeIdx * 4] : Math.floor(insideCount * direction_bias.buy);
  const callCount = hasLaneData ? storeLaneCounts[storeIdx * 4 + 1] : Math.floor(insideCount * direction_bias.call);
  const putCount = hasLaneData ? storeLaneCounts[storeIdx * 4 + 2] : Math.floor(insideCount * direction_bias.put);
  const shortCount = hasLaneData ? storeLaneCounts[storeIdx * 4 + 3] : Math.floor(insideCount * direction_bias.short);
  const laneTotal = buyCount + callCount + putCount + shortCount || 1;
  const buyPct = buyCount / laneTotal;
  const callPct = callCount / laneTotal;
  const putPct = putCount / laneTotal;
  const shortPct = shortCount / laneTotal;
  const maxPct = Math.max(buyPct, callPct, putPct, shortPct);

  return (
    <>
      {/* Backdrop */}
      <div style={backdropStyle} onClick={() => selectStock(null)} />

      {/* Main overlay */}
      <div style={overlayStyle}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Leckerli+One&display=swap');
          .sd-close:hover { background: rgba(106,0,170,0.12) !important; }
          .sd-back:hover  { background: #e6c200 !important; }
        `}</style>
        {/* Close button */}
        <button className="sd-close" style={closeBtnStyle} onClick={() => selectStock(null)} title="Close (ESC)">
          ✕
        </button>

        {/* Top Header Bar */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Brand color dot */}
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: brand_color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 12px ${brand_color}66`,
            }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
                {ticker.slice(0, 2)}
              </span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={tickerStyle}>{ticker}</span>
                {is_platinum && <span style={platBadgeStyle}>PLATINUM</span>}
              </div>
              <div style={{ fontSize: 13, color: '#444', fontWeight: 500, fontFamily: FONT }}>{company}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {sectorInfo && (
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    backgroundColor: sectorInfo.color, display: 'inline-block',
                  }} />
                )}
                <span style={{ color: '#666', fontSize: 11, fontFamily: FONT }}>{sector}</span>
                {sectorInfo && (
                  <span style={{ fontSize: 10, color: PURPLE, fontFamily: FONT }}> – {sectorInfo.district}</span>
                )}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <StarRating score={golden_score} />
              <span style={{ fontSize: 11, color: GOLD_DARK, fontWeight: 700, fontFamily: FONT }}>
                {golden_score}/5
              </span>
            </div>
          </div>
        </div>

        <div style={dividerStyle} />

        {/* Main Content Area */}
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, flexWrap: 'wrap' }}>

          {/* Left: Door crowd visualization */}
          <div style={{
            width: 120,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            borderRight: '1px solid rgba(106,0,170,0.10)',
            paddingRight: 12,
          }}>
            <DoorCrowdViz doorCount={doorCount} insideCount={insideCount} />
          </div>

          {/* Center: 4 Trade Lanes */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={sectionTitleStyle}>Trade Lanes</div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flex: 1, alignItems: 'flex-end' }}>
              <TradeBar label="BUY"   pct={buyPct}   agentCount={buyCount}   color={GOLD}    maxPct={maxPct} />
              <TradeBar label="CALL"  pct={callPct}  agentCount={callCount}  color={PURPLE}  maxPct={maxPct} />
              <TradeBar label="PUT"   pct={putPct}   agentCount={putCount}   color="#FF8C00" maxPct={maxPct} />
              <TradeBar label="SHORT" pct={shortPct} agentCount={shortCount} color="#c0392b" maxPct={maxPct} />
            </div>
          </div>

          {/* Right: Stats Panel */}
          <div style={{
            width: 200,
            borderLeft: '1px solid rgba(106,0,170,0.10)',
            paddingLeft: 12,
            overflowY: 'auto',
          }}>
            {/* Forward Returns */}
            <div style={sectionTitleStyle}>Forward Returns (60d)</div>
            <ReturnDistChart dist={forward_return_distribution} />
            <div style={{ fontSize: 10, color: '#666', marginTop: 4, fontFamily: FONT }}>
              Skew: <span style={{ color: forward_return_distribution.skew > 0 ? '#1a7a00' : '#c0392b', fontWeight: 700 }}>
                {forward_return_distribution.skew.toFixed(2)}
              </span>
            </div>

            <div style={dividerStyle} />

            {/* Golden Tickets */}
            <div style={sectionTitleStyle}>Golden Tickets</div>
            <TicketRow label="Ticket I" candy="Sour Candy Drop" active={ticket_levels.dip_ticket} />
            <TicketRow label="Ticket II" candy="Jawbreaker" active={ticket_levels.shock_ticket} />
            <TicketRow label="Ticket III" candy="Fortune Cookie" active={ticket_levels.asymmetry_ticket} />
            <TicketRow label="Ticket IV" candy="Taffy Pull" active={ticket_levels.dislocation_ticket} />
            <TicketRow label="Ticket V" candy="Golden Gummy Bear" active={ticket_levels.convexity_ticket} />
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 10,
          borderTop: '1px solid rgba(106,0,170,0.10)',
          marginTop: 10,
        }}>
          <span style={{ fontSize: 10, color: '#aaa', fontFamily: FONT }}>Press ESC to close</span>
          <button
            className="sd-back"
            onClick={() => selectStock(null)}
            style={{
              background: GOLD,
              border: `1.5px solid ${GOLD_DARK}`,
              borderRadius: 8,
              color: '#3d0066',
              fontSize: 12,
              padding: '6px 20px',
              cursor: 'pointer',
              fontWeight: 700,
              fontFamily: FONT,
              boxShadow: `0 2px 8px ${GOLD}55`,
              transition: 'background 0.15s',
            }}
          >
            Back to City
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse { from { transform: scale(1); } to { transform: scale(1.3); } }
        @keyframes overlaySlideIn {
          from { opacity: 0; transform: scale(0.95) translateY(20px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </>
  );
};

// ---- Styles ----

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 940,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 'clamp(40px, 8%, 14%)',
  left: 'clamp(40px, 12%, 20%)',
  right: 'clamp(40px, 12%, 20%)',
  bottom: 'clamp(40px, 8%, 14%)',
  background: 'rgba(255, 255, 255, 0.97)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: 16,
  border: '1.5px solid rgba(106,0,170,0.18)',
  boxShadow: '0 8px 48px rgba(106,0,170,0.14)',
  zIndex: 950,
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: FONT,
  animation: 'overlaySlideIn 0.3s ease-out',
  overflow: 'hidden',
};

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 14,
  background: 'rgba(106,0,170,0.07)',
  border: '1px solid rgba(106,0,170,0.18)',
  borderRadius: 8,
  color: PURPLE,
  fontSize: 16,
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  zIndex: 10,
  transition: 'background 0.15s',
};

const headerStyle: React.CSSProperties = {
  marginBottom: 4,
};

const platBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  background: `linear-gradient(135deg, ${GOLD_DARK}, ${GOLD})`,
  color: '#3d0066',
  fontSize: 9,
  fontWeight: 800,
  padding: '2px 8px',
  borderRadius: 3,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  boxShadow: `0 0 8px ${GOLD}88`,
  fontFamily: FONT,
};

const tickerStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  color: PURPLE,
  letterSpacing: 1,
  lineHeight: 1.1,
  fontFamily: FONT,
  textShadow: `0 0 12px ${PURPLE}22`,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'rgba(106,0,170,0.10)',
  margin: '10px 0',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: PURPLE,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  marginBottom: 8,
  fontFamily: FONT,
};

export default StoreDetail;
