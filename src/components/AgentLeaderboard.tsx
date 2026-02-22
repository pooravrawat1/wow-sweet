// ============================================================
// SweetReturns — Agent Leaderboard: Draggable Top 5 Panel
// Click-and-drag anywhere on the header to reposition.
// Expanded view shows full trade summary with copy button.
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { GoldenStar } from './CandyIcons';
import type { LeaderboardEntry, TradeRecord } from '../types';

// ---- helpers ----

function formatProfit(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function tradeSummaryText(entry: LeaderboardEntry): string {
  const lines = [
    `${entry.name}  |  P&L: ${entry.profit >= 0 ? '+' : ''}${formatProfit(entry.profit)}  |  Win rate: ${entry.winRate !== undefined ? (entry.winRate * 100).toFixed(0) + '%' : 'N/A'}`,
    '',
  ];
  if (entry.trades.length > 0) {
    lines.push('Trades:');
    entry.trades.slice(0, 8).forEach((t) => {
      lines.push(`  ${t.action.padEnd(5)} ${t.ticker.padEnd(5)}  ${t.profit >= 0 ? '+' : ''}${formatProfit(t.profit)}  — ${t.reasoning}`);
    });
  }
  return lines.join('\n');
}

// ---- palette ----

const ACCENT = '#6a00aa';
const PANEL_BG = 'transparent';
const BORDER = 'rgba(106,0,170,0.18)';
const FONT = `'Leckerli One', cursive`;

const rankColors: Record<number, string> = {
  1: '#6a00aa',
  2: '#9b30d9',
  3: '#c77dff',
};

const actionColors: Record<string, string> = {
  BUY: '#2d7a00', CALL: '#005fa3', PUT: '#7a4800', SHORT: '#a30000',
};

const actionLabels: Record<string, string> = {
  BUY: 'Bought', CALL: 'Call option', PUT: 'Put option', SHORT: 'Shorted',
};

// ---- per-trade row ----

const TradeRow: React.FC<{ trade: TradeRecord; index: number }> = ({ trade, index }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      padding: '5px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}
  >
    <span style={{ fontSize: 8, color: '#555', width: 14, flexShrink: 0, paddingTop: 2, textAlign: 'right' }}>
      {index + 1}.
    </span>
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: actionColors[trade.action] || '#888',
        background: `${actionColors[trade.action] || '#888'}18`,
        padding: '1px 5px',
        borderRadius: 3,
        flexShrink: 0,
      }}
    >
      {trade.action}
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, color: '#eee', fontWeight: 600 }}>{trade.ticker}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: trade.profit >= 0 ? '#00FF7F' : '#FF4500',
            flexShrink: 0,
            marginLeft: 6,
          }}
        >
          {trade.profit >= 0 ? '+' : ''}{formatProfit(trade.profit)}
        </span>
      </div>
      {trade.reasoning && (
        <div style={{ fontSize: 9, color: '#999', marginTop: 2, lineHeight: 1.35 }}>
          {actionLabels[trade.action] || trade.action} — {trade.reasoning}
        </div>
      )}
      {trade.entryDate && (
        <div style={{ fontSize: 8, color: '#555', marginTop: 1 }}>{trade.entryDate}</div>
      )}
    </div>
  </div>
);

// ---- per-agent row ----

const AgentRow: React.FC<{ entry: LeaderboardEntry }> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const isTop3 = entry.rank <= 3;

  const winCount = entry.trades.filter((t) => t.profit >= 0).length;
  const lossCount = entry.trades.length - winCount;

  const bestTrade = useMemo(
    () => entry.trades.reduce<TradeRecord | null>((best, t) => (!best || t.profit > best.profit ? t : best), null),
    [entry.trades],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(tradeSummaryText(entry)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [entry]);

  return (
    <div style={{ borderBottom: `1px solid ${BORDER}` }}>
      {/* Collapsed row */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '8px 14px',
          gap: 8,
          cursor: 'pointer',
          background: expanded ? 'rgba(106,0,170,0.06)' : 'transparent',
          border: 'none',
          transition: 'background 0.15s',
          fontFamily: FONT,
        }}
      >
        {/* Rank badge */}
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            width: 20,
            textAlign: 'center',
            flexShrink: 0,
            color: rankColors[entry.rank] || '#666',
            textShadow: isTop3 ? `0 0 8px ${rankColors[entry.rank]}55` : 'none',
          }}
        >
          {entry.rank}
        </span>

        {/* Name + current position */}
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#3d0066', fontFamily: FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {entry.name}
          </div>
          {entry.currentTicker && (
            <div style={{ fontSize: 9, color: actionColors[entry.currentAction || 'BUY'] || '#7a4800', marginTop: 1, fontFamily: FONT }}>
              {entry.currentAction} {entry.currentTicker}
            </div>
          )}
        </div>

        {/* P&L + win rate */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: entry.profit >= 0 ? '#1a7a00' : '#a30000', fontFamily: "'Leckerli One', cursive" }}>
            {entry.profit >= 0 ? '+' : ''}{formatProfit(entry.profit)}
          </div>
          {entry.winRate !== undefined && (
            <div style={{ fontSize: 8, color: entry.winRate >= 0.5 ? '#1a7a00' : '#a30000', marginTop: 1, fontFamily: "'Leckerli One', cursive" }}>
              {(entry.winRate * 100).toFixed(0)}% win
            </div>
          )}
        </div>

        {/* Chevron */}
        <span style={{ fontSize: 8, color: '#666', marginLeft: 2 }}>
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {/* Expanded summary */}
      {expanded && (
        <div style={{ padding: '8px 14px 12px', background: 'rgba(147,112,219,0.04)' }}>
          {/* Stats bar */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginBottom: 10,
              padding: '6px 10px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#777', textTransform: 'uppercase', letterSpacing: 0.5 }}>Trades</div>
              <div style={{ fontSize: 13, color: '#eee', fontWeight: 700 }}>{entry.totalTrades || entry.trades.length}</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#777', textTransform: 'uppercase', letterSpacing: 0.5 }}>Wins</div>
              <div style={{ fontSize: 13, color: '#00FF7F', fontWeight: 700 }}>{winCount}</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#777', textTransform: 'uppercase', letterSpacing: 0.5 }}>Losses</div>
              <div style={{ fontSize: 13, color: '#FF4500', fontWeight: 700 }}>{lossCount}</div>
            </div>
            {bestTrade && (
              <>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
                <div style={{ flex: 1.3, textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: '#777', textTransform: 'uppercase', letterSpacing: 0.5 }}>Best</div>
                  <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700 }}>
                    {bestTrade.ticker} +{formatProfit(bestTrade.profit)}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Trade list */}
          {entry.trades.length > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 9, color: '#9370DB', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Recent Trades
                </span>
                <button
                  onClick={handleCopy}
                  style={{
                    background: copied ? 'rgba(0,255,127,0.15)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${copied ? 'rgba(0,255,127,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 4,
                    color: copied ? '#00FF7F' : '#aaa',
                    fontSize: 9,
                    padding: '2px 8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontFamily: 'inherit',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy trades'}
                </button>
              </div>
              {entry.trades.slice(0, 8).map((trade, i) => (
                <TradeRow key={i} trade={trade} index={i} />
              ))}
            </>
          ) : (
            <div style={{ fontSize: 10, color: '#666', textAlign: 'center', padding: 8 }}>
              No trade history yet
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---- main component ----

export const AgentLeaderboard: React.FC = () => {
  const leaderboard = useStore((s) => s.agentLeaderboard);
  const top5 = useMemo(() => leaderboard.slice(0, 5), [leaderboard]);

  return (
    <div style={{
      width: '100%',
      background: PANEL_BG,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px',
        gap: 8,
        background: '#fff',
        borderBottom: `2px solid rgba(106,0,170,0.2)`,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}><GoldenStar size={16} /></span>
        <span style={{ fontSize: 16, color: '#4b0082', fontFamily: FONT, flex: 1 }}>
          Top 5 Agents
        </span>
      </div>

      {/* List */}
      <div className="sweet-scroll" style={{ overflowY: 'visible' }}>
        {top5.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#7a4800', fontFamily: FONT }}>No agent rankings yet</div>
            <div style={{ fontSize: 10, color: '#a06000', marginTop: 4, fontFamily: FONT }}>Loading simulation…</div>
          </div>
        ) : (
          top5.map((entry) => <AgentRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
};

export default AgentLeaderboard;
