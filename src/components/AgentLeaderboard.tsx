// ============================================================
// SweetReturns — Agent Leaderboard: Top 5 with Trade Details
// Shows top 5 agents, their trades, reasoning, and win rate
// ============================================================

import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { GoldenStar } from './CandyIcons';
import type { LeaderboardEntry } from '../types';

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

const actionColors: Record<string, string> = {
  BUY: '#00FF7F', CALL: '#00BFFF', PUT: '#FFD700', SHORT: '#FF4500',
};

const AgentRow: React.FC<{ entry: LeaderboardEntry }> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const isTop3 = entry.rank <= 3;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          ...rowStyle,
          cursor: 'pointer',
          background: expanded ? 'rgba(255,255,255,0.03)' : 'transparent',
          border: 'none',
          width: '100%',
        }}
      >
        <span style={{
          ...rankNumStyle,
          color: rankColors[entry.rank] || '#888',
          textShadow: isTop3 ? `0 0 6px ${rankColors[entry.rank]}55` : 'none',
        }}>
          {entry.rank}
        </span>
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div style={nameStyle}>{entry.name}</div>
          {entry.currentTicker && (
            <div style={{ fontSize: 9, color: actionColors[entry.currentAction || 'BUY'] || '#888' }}>
              {entry.currentAction} {entry.currentTicker}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...profitStyle, color: entry.profit >= 0 ? '#00FF7F' : '#FF4500' }}>
            {entry.profit >= 0 ? '+' : ''}{formatProfit(entry.profit)}
          </div>
          {entry.winRate !== undefined && (
            <div style={{ fontSize: 8, color: entry.winRate > 0.5 ? '#00FF7F' : '#FF4500' }}>
              {(entry.winRate * 100).toFixed(0)}% win
            </div>
          )}
        </div>
        <span style={{ fontSize: 10, color: '#666', marginLeft: 4 }}>
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {/* Expanded trade details */}
      {expanded && entry.trades && entry.trades.length > 0 && (
        <div style={expandedStyle}>
          <div style={{ fontSize: 9, color: '#9370DB', fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>
            RECENT TRADES ({entry.totalTrades || entry.trades.length} total)
          </div>
          {entry.trades.slice(0, 5).map((trade, i) => (
            <div key={i} style={tradeRowStyle}>
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: actionColors[trade.action] || '#888',
                width: 38,
              }}>
                {trade.action}
              </span>
              <span style={{ fontSize: 10, color: '#ddd', fontWeight: 600, width: 42 }}>
                {trade.ticker}
              </span>
              <span style={{
                fontSize: 9,
                fontWeight: 600,
                color: trade.profit >= 0 ? '#00FF7F' : '#FF4500',
                width: 48,
                textAlign: 'right',
              }}>
                {trade.profit >= 0 ? '+' : ''}{formatProfit(trade.profit)}
              </span>
              <span style={{ fontSize: 8, color: '#777', flex: 1, marginLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {trade.reasoning}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AgentLeaderboard: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const leaderboard = useStore((s) => s.agentLeaderboard);

  const top5 = useMemo(() => leaderboard.slice(0, 5), [leaderboard]);

  return (
    <div style={containerStyle}>
      {/* Header / toggle */}
      <button style={headerBtnStyle} onClick={() => setCollapsed((c) => !c)}>
        <span style={trophyStyle}><GoldenStar size={14} /></span>
        <span style={titleTextStyle}>Top 5 Agents</span>
        <span style={chevronStyle}>{collapsed ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* List */}
      {!collapsed && (
        <div style={listStyle}>
          {top5.length === 0 && (
            <div style={{ fontSize: 10, color: '#666', textAlign: 'center', padding: 8 }}>
              No agent data yet
            </div>
          )}
          {top5.map((entry) => (
            <AgentRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
};

// --------------- Styles ---------------

const containerStyle: React.CSSProperties = {
  width: 280,
  background: 'rgba(26, 26, 46, 0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
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

const trophyStyle: React.CSSProperties = { fontSize: 14 };
const titleTextStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#FFD700',
  letterSpacing: 0.8, flex: 1, textAlign: 'left',
};
const chevronStyle: React.CSSProperties = { fontSize: 10, color: '#888' };

const listStyle: React.CSSProperties = {
  padding: '4px 0',
  maxHeight: 400,
  overflowY: 'auto',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '6px 12px',
  gap: 8,
};

const rankNumStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, width: 18, textAlign: 'right', flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  fontSize: 11, color: '#ddd', fontWeight: 600,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

const profitStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, flexShrink: 0,
};

const expandedStyle: React.CSSProperties = {
  padding: '4px 12px 8px',
  background: 'rgba(147, 112, 219, 0.04)',
  borderTop: '1px solid rgba(255,255,255,0.04)',
};

const tradeRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '2px 0',
  gap: 4,
};

export default AgentLeaderboard;
