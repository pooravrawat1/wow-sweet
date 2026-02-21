// ============================================================
// SweetReturns — Agent Leaderboard Mini-Panel
// Bottom-left collapsible panel showing top 10 trader agents
// ============================================================

import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';

function formatProfit(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

const rankColors: Record<number, string> = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32',
};

export const AgentLeaderboard: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const leaderboard = useStore((s) => s.agentLeaderboard);

  const top10 = useMemo(() => leaderboard.slice(0, 10), [leaderboard]);

  return (
    <div style={containerStyle}>
      {/* Header / toggle */}
      <button style={headerBtnStyle} onClick={() => setCollapsed((c) => !c)}>
        <span style={trophyStyle}>{'\u{1F3C6}'}</span>
        <span style={titleTextStyle}>Top Traders</span>
        <span style={chevronStyle}>{collapsed ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* List */}
      {!collapsed && (
        <div style={listStyle}>
          {top10.length === 0 && (
            <div style={{ fontSize: 10, color: '#666', textAlign: 'center', padding: 8 }}>
              No agent data yet
            </div>
          )}
          {top10.map((entry) => {
            const isTop3 = entry.rank <= 3;
            return (
              <div key={entry.id} style={rowStyle}>
                <span
                  style={{
                    ...rankNumStyle,
                    color: rankColors[entry.rank] || '#888',
                    textShadow: isTop3 ? `0 0 6px ${rankColors[entry.rank]}55` : 'none',
                  }}
                >
                  {entry.rank}
                </span>
                <span style={nameStyle}>{entry.name}</span>
                <span
                  style={{
                    ...profitStyle,
                    color: entry.profit >= 0 ? '#00FF7F' : '#FF4500',
                  }}
                >
                  {entry.profit >= 0 ? '+' : ''}
                  {formatProfit(entry.profit)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --------------- Styles ---------------

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  left: 12,
  bottom: 92, // above the 80px time slider
  width: 250,
  background: 'rgba(26, 26, 46, 0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  zIndex: 900,
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
  overflow: 'hidden',
};

const headerBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: 'none',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  cursor: 'pointer',
  gap: 6,
};

const trophyStyle: React.CSSProperties = {
  fontSize: 14,
};

const titleTextStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#FFD700',
  letterSpacing: 0.8,
  flex: 1,
  textAlign: 'left',
};

const chevronStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#888',
};

const listStyle: React.CSSProperties = {
  padding: '4px 0',
  maxHeight: 280,
  overflowY: 'auto',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 12px',
  gap: 8,
};

const rankNumStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  width: 18,
  textAlign: 'right',
  flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#ddd',
  flex: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const profitStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
};

export default AgentLeaderboard;
