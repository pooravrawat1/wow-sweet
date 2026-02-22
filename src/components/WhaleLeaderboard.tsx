// ============================================================
// Wolf of Wall Sweet — Whale Arena Leaderboard (minimalist)
// Draggable, compact panel. Shows 4 whale funds + Gemini toggle.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { getWhales, type WhaleFund } from '../services/whaleArena';
import { getLatestChain, type ReasoningChain } from '../services/geminiService';
import { WHALE_ICONS } from './CandyIcons';
import { useStore } from '../store/useStore';

const ACCENT = '#FFD700';
const PANEL_BG = 'rgba(15, 15, 35, 0.92)';
const BORDER = 'rgba(255,255,255,0.08)';

export function WhaleLeaderboard() {
  const [whales, setWhales] = useState<WhaleFund[]>(getWhales());
  const [chain, setChain] = useState<ReasoningChain | null>(null);
  const [expanded, setExpanded] = useState(false);
  const geminiEnabled = useStore((s) => s.geminiEnabled);
  const setGeminiEnabled = useStore((s) => s.setGeminiEnabled);

  // Drag state
  const [pos, setPos] = useState({ x: Math.min(window.innerWidth - 292, window.innerWidth * 0.7), y: 56 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      setWhales([...getWhales()]);
      setChain(getLatestChain());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const nx = Math.max(0, Math.min(window.innerWidth - 260, e.clientX - offset.current.x));
    const ny = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - offset.current.y));
    setPos({ x: nx, y: ny });
  }, []);

  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  const sorted = [...whales].sort((a, b) => b.totalProfit - a.totalProfit);

  return (
    <div
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 260,
        zIndex: 900,
        background: PANEL_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        fontFamily: 'monospace',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {/* Header */}
      <div
        onPointerDown={onPointerDown}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px',
          borderBottom: `1px solid ${BORDER}`,
          cursor: 'grab',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <span style={{ fontSize: 9, color: '#555', letterSpacing: 2 }}>&#x2630;</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: 0.8, flex: 1 }}>
          WHALE ARENA
        </span>
      </div>

      {/* Rankings */}
      <div style={{ padding: '4px 0' }}>
        {sorted.map((whale, rank) => (
          <div key={whale.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 12px',
            borderBottom: rank < 3 ? `1px solid ${BORDER}` : 'none',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, width: 16, textAlign: 'right', flexShrink: 0,
              color: rank === 0 ? ACCENT : rank === 1 ? '#C0C0C0' : '#555',
            }}>
              {rank + 1}
            </span>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: whale.color, flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: whale.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {WHALE_ICONS[whale.id] || whale.icon} {whale.name}
              </div>
              <div style={{ fontSize: 8, color: '#666' }}>{whale.strategy}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: whale.totalProfit >= 0 ? '#00FF7F' : '#FF4500' }}>
                {whale.totalProfit >= 0 ? '+' : ''}{whale.totalProfit.toFixed(0)}
              </div>
              <div style={{ fontSize: 7, color: '#555' }}>{whale.allocations.length} pos</div>
            </div>
          </div>
        ))}
      </div>

      {/* Wonka AI note */}
      {whales[0]?.reasoning && (
        <div style={{ margin: '0 10px 6px', padding: '5px 8px', background: 'rgba(255,215,0,0.04)', borderRadius: 4, border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 8, color: ACCENT, fontWeight: 600, marginBottom: 2 }}>WONKA AI</div>
          <div style={{ fontSize: 8, color: '#888', lineHeight: 1.3 }}>{whales[0].reasoning}</div>
        </div>
      )}

      {/* Gemini toggle */}
      <div style={{ padding: '0 10px 8px', display: 'flex', gap: 4 }}>
        <button
          onClick={() => setGeminiEnabled(!geminiEnabled)}
          style={{
            flex: 1, padding: '4px 0',
            background: geminiEnabled ? 'rgba(0,255,127,0.08)' : 'rgba(255,69,0,0.08)',
            border: `1px solid ${geminiEnabled ? 'rgba(0,255,127,0.2)' : 'rgba(255,69,0,0.2)'}`,
            borderRadius: 4,
            color: geminiEnabled ? '#00FF7F' : '#FF4500',
            fontSize: 8, fontWeight: 700, fontFamily: 'monospace', cursor: 'pointer',
          }}
        >
          GEMINI AI: {geminiEnabled ? 'ON' : 'OFF'}
        </button>

        {chain && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              flex: 1, padding: '4px 0',
              background: 'transparent',
              border: `1px solid ${BORDER}`,
              borderRadius: 4,
              color: '#888', fontSize: 8, fontFamily: 'monospace', cursor: 'pointer',
            }}
          >
            {expanded ? 'Hide' : 'Chain'} ({chain.sectorReports.length})
          </button>
        )}
      </div>

      {/* Expanded chain */}
      {expanded && chain && (
        <div style={{ padding: '0 10px 10px', maxHeight: 300, overflowY: 'auto' }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: '#00BFFF', marginBottom: 4, letterSpacing: 0.5 }}>
            SECTOR ANALYSTS
          </div>
          {chain.sectorReports.map((r) => (
            <div key={r.sector} style={{
              padding: '3px 6px', marginBottom: 2,
              borderLeft: `2px solid ${r.sectorSentiment === 'bullish' ? '#00FF7F' : r.sectorSentiment === 'bearish' ? '#FF4500' : '#555'}`,
              background: 'rgba(0,191,255,0.03)', borderRadius: '0 3px 3px 0',
            }}>
              <div style={{ fontSize: 8, fontWeight: 600, color: '#bbb' }}>
                {r.sector} <span style={{ color: '#666' }}>[{r.sectorSentiment}]</span>
              </div>
              {r.topPicks.slice(0, 2).map((p, i) => (
                <div key={i} style={{ fontSize: 7, color: '#777' }}>
                  {p.ticker} {p.action} — {p.reason}
                </div>
              ))}
            </div>
          ))}

          {/* Allocations */}
          <div style={{ fontSize: 8, fontWeight: 700, color: ACCENT, marginTop: 6, marginBottom: 3 }}>ALLOCATIONS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {chain.finalAllocations.map((a, i) => (
              <span key={i} style={{
                fontSize: 7, padding: '1px 4px', borderRadius: 2,
                background: a.action === 'BUY' || a.action === 'CALL' ? 'rgba(0,255,127,0.1)' : 'rgba(255,69,0,0.1)',
                color: a.action === 'BUY' || a.action === 'CALL' ? '#00FF7F' : '#FF4500',
                border: `1px solid ${a.action === 'BUY' || a.action === 'CALL' ? '#00FF7F22' : '#FF450022'}`,
              }}>
                {a.ticker} {a.action} {(a.weight * 100).toFixed(0)}%
              </span>
            ))}
          </div>

          {/* Risk desk */}
          {chain.riskReview && (
            <div style={{
              marginTop: 6, padding: '3px 6px',
              background: chain.riskReview.overallRisk === 'high' || chain.riskReview.overallRisk === 'extreme' ? 'rgba(255,69,0,0.06)' : 'rgba(0,255,127,0.03)',
              borderRadius: 3, border: `1px solid ${chain.riskReview.approved ? '#00FF7F15' : '#FF450015'}`,
            }}>
              <div style={{ fontSize: 8, fontWeight: 600, color: chain.riskReview.approved ? '#00FF7F' : '#FF4500' }}>
                RISK: {chain.riskReview.approved ? 'OK' : 'ADJ'} ({chain.riskReview.overallRisk})
              </div>
              {chain.riskReview.adjustments.map((adj, i) => (
                <div key={i} style={{ fontSize: 7, color: '#666' }}>
                  {adj.ticker}: {adj.reason}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 4, fontSize: 7, color: '#444', textAlign: 'center' }}>
            {chain.cycleMs}ms &middot; {new Date(chain.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
