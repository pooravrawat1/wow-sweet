// ============================================================
// SweetReturns — Store Detail Panel
// Right-side slide-in panel for selected stock
// ============================================================

import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { SECTORS } from '../data/stockData';
import type { StockData } from '../types';

// ---- Sub-components ----

const StarRating: React.FC<{ score: number }> = ({ score }) => (
  <div style={{ display: 'flex', gap: 3 }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <span
        key={i}
        style={{
          fontSize: 18,
          color: i <= score ? '#FFD700' : 'rgba(255,255,255,0.15)',
          textShadow: i <= score ? '0 0 6px rgba(255,215,0,0.5)' : 'none',
        }}
      >
        {'\u2605'}
      </span>
    ))}
  </div>
);

const DirectionBar: React.FC<{ bias: StockData['direction_bias'] }> = ({ bias }) => {
  const segments = [
    { key: 'BUY', value: bias.buy, color: '#00FF7F' },
    { key: 'CALL', value: bias.call, color: '#00BFFF' },
    { key: 'PUT', value: bias.put, color: '#FFD700' },
    { key: 'SHORT', value: bias.short, color: '#FF4500' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
        {segments.map((seg) => (
          <div
            key={seg.key}
            style={{
              width: `${seg.value * 100}%`,
              backgroundColor: seg.color,
              transition: 'width 0.3s',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {segments.map((seg) => (
          <span key={seg.key} style={{ fontSize: 9, color: seg.color, fontWeight: 600 }}>
            {seg.key} {(seg.value * 100).toFixed(0)}%
          </span>
        ))}
      </div>
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
          <div
            key={bar.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flex: 1,
            }}
          >
            <span style={{ fontSize: 8, color: '#aaa', marginBottom: 2 }}>
              {(bar.value * 100).toFixed(1)}%
            </span>
            <div
              style={{
                width: '100%',
                maxWidth: 28,
                height: Math.max(h, 3),
                borderRadius: 2,
                backgroundColor: isPos ? '#00FF7F' : '#FF4500',
                opacity: 0.8,
              }}
            />
            <span style={{ fontSize: 8, color: '#888', marginTop: 2 }}>{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const TicketRow: React.FC<{ label: string; active: boolean }> = ({ label, active }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 0',
    }}
  >
    <span
      style={{
        fontSize: 13,
        color: active ? '#00FF7F' : '#FF4500',
        width: 16,
        textAlign: 'center',
      }}
    >
      {active ? '\u2713' : '\u2717'}
    </span>
    <span style={{ fontSize: 11, color: active ? '#ddd' : '#666' }}>{label}</span>
  </div>
);

// ---- Main Component ----

export const StoreDetail: React.FC = () => {
  const selectedStock = useStore((s) => s.selectedStock);
  const selectStock = useStore((s) => s.selectStock);

  const sectorInfo = useMemo(() => {
    if (!selectedStock) return null;
    return SECTORS.find((s) => s.name === selectedStock.sector) || null;
  }, [selectedStock]);

  if (!selectedStock) return null;

  const { ticker, company, sector, golden_score, is_platinum, direction_bias, forward_return_distribution, ticket_levels } = selectedStock;

  return (
    <div style={containerStyle}>
      {/* Close button */}
      <button style={closeBtnStyle} onClick={() => selectStock(null)} title="Close">
        {'\u2715'}
      </button>

      {/* Header */}
      <div style={headerStyle}>
        {is_platinum && <span style={platBadgeStyle}>PLATINUM</span>}
        <div style={tickerStyle}>{ticker}</div>
        <div style={companyStyle}>{company}</div>
        <div style={sectorRowStyle}>
          {sectorInfo && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: sectorInfo.color,
                display: 'inline-block',
                marginRight: 6,
              }}
            />
          )}
          <span style={{ color: '#bbb', fontSize: 11 }}>{sector}</span>
        </div>
        {sectorInfo && (
          <div style={{ fontSize: 10, color: '#9370DB', marginTop: 2 }}>{sectorInfo.district}</div>
        )}
      </div>

      <div style={dividerStyle} />

      {/* Golden Score */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Golden Score</div>
        <StarRating score={golden_score} />
        <span style={{ fontSize: 11, color: '#FFD700', marginLeft: 6, fontWeight: 700 }}>
          {golden_score}/5
        </span>
      </div>

      <div style={dividerStyle} />

      {/* Direction Bias */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Direction Bias</div>
        <DirectionBar bias={direction_bias} />
      </div>

      <div style={dividerStyle} />

      {/* Forward Return Distribution */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Forward Return Distribution</div>
        <ReturnDistChart dist={forward_return_distribution} />
      </div>

      <div style={dividerStyle} />

      {/* Ticket Breakdown */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Golden Tickets</div>
        <TicketRow label="Dip Ticket" active={ticket_levels.dip_ticket} />
        <TicketRow label="Shock Ticket" active={ticket_levels.shock_ticket} />
        <TicketRow label="Asymmetry Ticket" active={ticket_levels.asymmetry_ticket} />
        <TicketRow label="Dislocation Ticket" active={ticket_levels.dislocation_ticket} />
        <TicketRow label="Convexity Ticket" active={ticket_levels.convexity_ticket} />
      </div>
    </div>
  );
};

// --------------- Styles ---------------

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  right: 0,
  top: 80,
  bottom: 80,
  width: 350,
  background: 'rgba(26, 26, 46, 0.95)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  borderLeft: '1px solid rgba(255, 105, 180, 0.2)',
  zIndex: 950,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '16px 18px',
  boxSizing: 'border-box',
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
  animation: 'slideInRight 0.25s ease-out',
};

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 12,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  color: '#ccc',
  fontSize: 14,
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  lineHeight: 1,
};

const headerStyle: React.CSSProperties = {
  marginBottom: 4,
};

const platBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'linear-gradient(135deg, #DAA520, #FFD700)',
  color: '#1a1a2e',
  fontSize: 9,
  fontWeight: 800,
  padding: '2px 8px',
  borderRadius: 3,
  letterSpacing: 1.2,
  marginBottom: 6,
  textTransform: 'uppercase',
  boxShadow: '0 0 8px rgba(218,165,32,0.4)',
};

const tickerStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  color: '#FF69B4',
  letterSpacing: 1,
  lineHeight: 1.1,
  textShadow: '0 0 12px rgba(255,105,180,0.3)',
};

const companyStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#ddd',
  fontWeight: 500,
  marginTop: 2,
};

const sectorRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginTop: 4,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'rgba(255,255,255,0.08)',
  margin: '10px 0',
};

const sectionStyle: React.CSSProperties = {};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#9370DB',
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  marginBottom: 6,
};

export default StoreDetail;
