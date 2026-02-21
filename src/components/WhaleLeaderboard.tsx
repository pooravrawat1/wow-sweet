// ============================================================
// Wolf of Wall Sweet — Whale Arena Leaderboard
// Shows 4 competing hedge fund factions + Gemini reasoning chain
// Draggable anywhere on screen
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { getWhales, type WhaleFund } from '../services/whaleArena';
import { getLatestChain, type ReasoningChain } from '../services/geminiService';
import { HamburgerMenu, TopHat, WHALE_ICONS } from './CandyIcons';
import { useStore } from '../store/useStore';

export function WhaleLeaderboard() {
  const [whales, setWhales] = useState<WhaleFund[]>(getWhales());
  const [chain, setChain] = useState<ReasoningChain | null>(null);
  const [expanded, setExpanded] = useState(false);
  const geminiEnabled = useStore((s) => s.geminiEnabled);
  const setGeminiEnabled = useStore((s) => s.setGeminiEnabled);

  // Drag state
  const [pos, setPos] = useState({ x: window.innerWidth - 292, y: 56 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      setWhales([...getWhales()]);
      setChain(getLatestChain());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const nx = Math.max(0, Math.min(window.innerWidth - 280, e.clientX - offset.current.x));
      const ny = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - offset.current.y));
      setPos({ x: nx, y: ny });
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const sorted = [...whales].sort((a, b) => b.totalProfit - a.totalProfit);

  return (
    <div style={{
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: 280,
      maxHeight: expanded ? '80vh' : 'auto',
      overflowY: expanded ? 'auto' : 'visible',
      zIndex: 900,
      background: 'rgba(10, 8, 20, 0.92)',
      border: '1px solid rgba(255, 215, 0, 0.2)',
      borderRadius: 10,
      padding: '10px 12px',
      fontFamily: 'monospace',
      backdropFilter: 'blur(12px)',
    }}>
      {/* Drag Handle Header */}
      <div
        onMouseDown={onMouseDown}
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#FFD700',
          letterSpacing: '1px',
          marginBottom: 8,
          textAlign: 'center',
          borderBottom: '1px solid rgba(255, 215, 0, 0.15)',
          paddingBottom: 6,
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <HamburgerMenu size={12} /> <TopHat size={14} /> WHALE ARENA LEADERBOARD
      </div>

      {/* Whale Rankings */}
      {sorted.map((whale, rank) => (
        <div key={whale.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 4px',
          borderBottom: rank < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none',
        }}>
          <div style={{
            width: 18, fontSize: 12, fontWeight: 700,
            color: rank === 0 ? '#FFD700' : rank === 1 ? '#C0C0C0' : 'rgba(255,255,255,0.4)',
          }}>
            #{rank + 1}
          </div>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: whale.color,
            boxShadow: `0 0 6px ${whale.color}66`,
            flexShrink: 0,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: whale.color,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {WHALE_ICONS[whale.id] || whale.icon} {whale.name}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
              {whale.strategy}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700,
              color: whale.totalProfit >= 0 ? '#00FF7F' : '#FF4500',
            }}>
              {whale.totalProfit >= 0 ? '+' : ''}{whale.totalProfit.toFixed(0)}
            </div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>
              {whale.allocations.length} pos
            </div>
          </div>
        </div>
      ))}

      {/* Wonka Fund reasoning */}
      {whales[0]?.reasoning && (
        <div style={{
          marginTop: 8,
          padding: '6px 8px',
          background: 'rgba(255, 215, 0, 0.06)',
          borderRadius: 6,
          border: '1px solid rgba(255, 215, 0, 0.1)',
        }}>
          <div style={{ fontSize: 9, color: '#FFD700', fontWeight: 600, marginBottom: 2 }}>
            <TopHat size={10} /> WONKA AI
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', lineHeight: 1.3 }}>
            {whales[0].reasoning}
          </div>
        </div>
      )}

      {/* Gemini AI Toggle */}
      <button
        onClick={() => setGeminiEnabled(!geminiEnabled)}
        style={{
          width: '100%',
          marginTop: 6,
          padding: '5px 0',
          background: geminiEnabled ? 'rgba(0, 255, 127, 0.1)' : 'rgba(255, 69, 0, 0.1)',
          border: `1px solid ${geminiEnabled ? 'rgba(0, 255, 127, 0.25)' : 'rgba(255, 69, 0, 0.25)'}`,
          borderRadius: 4,
          color: geminiEnabled ? '#00FF7F' : '#FF4500',
          fontSize: 9,
          fontWeight: 700,
          fontFamily: 'monospace',
          cursor: 'pointer',
          letterSpacing: '0.5px',
          transition: 'all 0.2s',
        }}
      >
        GEMINI AI: {geminiEnabled ? 'ON' : 'OFF'}
      </button>

      {/* Expand button for reasoning chain */}
      {chain && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: '100%',
            marginTop: 6,
            padding: '4px 0',
            background: 'transparent',
            border: '1px solid rgba(255, 215, 0, 0.15)',
            borderRadius: 4,
            color: '#FFD700',
            fontSize: 9,
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Hide' : 'Show'} Reasoning Chain ({chain.sectorReports.length} analysts)
        </button>
      )}

      {/* Expanded reasoning chain */}
      {expanded && chain && (
        <div style={{ marginTop: 8 }}>
          {/* Sector Analyst Reports */}
          <div style={{
            fontSize: 9, fontWeight: 700, color: '#00BFFF',
            marginBottom: 4, letterSpacing: '0.5px',
          }}>
            SECTOR ANALYSTS (Flash)
          </div>
          {chain.sectorReports.map((r) => (
            <div key={r.sector} style={{
              padding: '3px 6px',
              marginBottom: 3,
              background: 'rgba(0, 191, 255, 0.05)',
              borderRadius: 4,
              borderLeft: `2px solid ${
                r.sectorSentiment === 'bullish' ? '#00FF7F' :
                r.sectorSentiment === 'bearish' ? '#FF4500' : '#808080'
              }`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                {r.sector} [{r.sectorSentiment}]
              </div>
              {r.topPicks.slice(0, 2).map((p, i) => (
                <div key={i} style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>
                  {p.ticker} {p.action} ({p.conviction}%) — {p.reason}
                </div>
              ))}
            </div>
          ))}

          {/* Portfolio Manager */}
          <div style={{
            fontSize: 9, fontWeight: 700, color: '#FFD700',
            marginTop: 8, marginBottom: 4, letterSpacing: '0.5px',
          }}>
            PORTFOLIO MANAGER
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 3,
          }}>
            {chain.finalAllocations.map((a, i) => (
              <span key={i} style={{
                fontSize: 8,
                padding: '2px 5px',
                borderRadius: 3,
                background: a.action === 'BUY' || a.action === 'CALL'
                  ? 'rgba(0, 255, 127, 0.15)'
                  : 'rgba(255, 69, 0, 0.15)',
                color: a.action === 'BUY' || a.action === 'CALL' ? '#00FF7F' : '#FF4500',
                border: `1px solid ${a.action === 'BUY' || a.action === 'CALL' ? '#00FF7F33' : '#FF450033'}`,
              }}>
                {a.ticker} {a.action} {(a.weight * 100).toFixed(0)}%
              </span>
            ))}
          </div>

          {/* Risk Desk */}
          {chain.riskReview && (
            <div style={{
              marginTop: 8,
              padding: '4px 8px',
              background: chain.riskReview.overallRisk === 'high' || chain.riskReview.overallRisk === 'extreme'
                ? 'rgba(255, 69, 0, 0.1)' : 'rgba(0, 255, 127, 0.05)',
              borderRadius: 4,
              border: `1px solid ${chain.riskReview.approved ? '#00FF7F22' : '#FF450022'}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: chain.riskReview.approved ? '#00FF7F' : '#FF4500' }}>
                RISK DESK: {chain.riskReview.approved ? 'APPROVED' : 'ADJUSTED'} ({chain.riskReview.overallRisk})
              </div>
              {chain.riskReview.adjustments.map((adj, i) => (
                <div key={i} style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>
                  {adj.ticker}: {adj.reason} (new weight: {(adj.newWeight * 100).toFixed(0)}%)
                </div>
              ))}
            </div>
          )}

          <div style={{
            marginTop: 6,
            fontSize: 8,
            color: 'rgba(255,255,255,0.3)',
            textAlign: 'center',
          }}>
            Cycle: {chain.cycleMs}ms | {new Date(chain.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
