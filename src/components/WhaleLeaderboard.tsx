// ============================================================
// Wolf of Wall Sweet — Whale Arena Leaderboard (static panel)
// ============================================================

import { useState, useEffect } from 'react';
import { getWhales, type WhaleFund } from '../services/whaleArena';
import { getLatestChain, type ReasoningChain } from '../services/geminiService';
import { WHALE_ICONS } from './CandyIcons';
import { useStore } from '../store/useStore';

const ACCENT = '#6a00aa';
const BORDER = 'rgba(106,0,170,0.18)';
const FONT = `'Leckerli One', cursive`;

export function WhaleLeaderboard() {
  const [whales, setWhales] = useState<WhaleFund[]>(getWhales());
  const [chain, setChain] = useState<ReasoningChain | null>(null);
  const [expanded, setExpanded] = useState(false);
  const geminiEnabled = useStore((s) => s.geminiEnabled);
  const setGeminiEnabled = useStore((s) => s.setGeminiEnabled);

  useEffect(() => {
    const interval = setInterval(() => {
      setWhales([...getWhales()]);
      setChain(getLatestChain());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const sorted = [...whales].sort((a, b) => b.totalProfit - a.totalProfit);

  return (
    <div style={{
      width: '100%',
      background: 'transparent',
      fontFamily: FONT,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 14px',
        borderBottom: `1px solid ${BORDER}`,
        background: '#fff',
      }}>
        <span style={{ fontSize: 16, color: '#4b0082', fontFamily: FONT, flex: 1 }}>
          Whale Arena
        </span>
      </div>

      {/* Rankings */}
      <div style={{ padding: '4px 0' }}>
        {sorted.map((whale, rank) => (
          <div key={whale.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px',
            borderBottom: rank < sorted.length - 1 ? `1px solid ${BORDER}` : 'none',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, width: 16, textAlign: 'right', flexShrink: 0,
              color: rank === 0 ? '#6a00aa' : rank === 1 ? '#9b30d9' : '#7a4800',
            }}>
              {rank + 1}
            </span>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: whale.color, flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontFamily: FONT, color: '#3d0066', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {WHALE_ICONS[whale.id] || whale.icon} {whale.name}
              </div>
              <div style={{ fontSize: 8, color: '#7a4800' }}>{whale.strategy}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: whale.totalProfit >= 0 ? '#1a7a00' : '#a30000' }}>
                {whale.totalProfit >= 0 ? '+' : ''}{whale.totalProfit.toFixed(0)}
              </div>
              <div style={{ fontSize: 7, color: '#a06000' }}>{whale.allocations.length} pos</div>
            </div>
          </div>
        ))}
      </div>

      {/* Wonka AI note */}
      {whales[0]?.reasoning && (
        <div style={{ margin: '0 10px 6px', padding: '5px 8px', background: 'rgba(106,0,170,0.06)', borderRadius: 4, border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 9, color: ACCENT, fontFamily: FONT, marginBottom: 2 }}>Wonka AI</div>
          <div style={{ fontSize: 8, color: '#5a3080', lineHeight: 1.3 }}>{whales[0].reasoning}</div>
        </div>
      )}

      {/* Gemini toggle */}
      <div style={{ padding: '0 10px 10px', display: 'flex', gap: 4 }}>
        <button
          onClick={() => setGeminiEnabled(!geminiEnabled)}
          style={{
            flex: 1, padding: '5px 0',
            background: geminiEnabled ? 'rgba(26,122,0,0.1)' : 'rgba(163,0,0,0.08)',
            border: `1px solid ${geminiEnabled ? 'rgba(26,122,0,0.3)' : 'rgba(163,0,0,0.25)'}`,
            borderRadius: 4,
            color: geminiEnabled ? '#1a7a00' : '#a30000',
            fontSize: 9, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
          }}
        >
          Gemini AI: {geminiEnabled ? 'ON' : 'OFF'}
        </button>

        {chain && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              flex: 1, padding: '5px 0',
              background: 'rgba(106,0,170,0.06)',
              border: `1px solid ${BORDER}`,
              borderRadius: 4,
              color: '#6a00aa', fontSize: 9, fontFamily: FONT, cursor: 'pointer',
            }}
          >
            {expanded ? 'Hide' : 'Chain'} ({chain.sectorReports.length})
          </button>
        )}
      </div>

      {/* Expanded chain */}
      {expanded && chain && (
        <div className="sweet-scroll" style={{ padding: '0 10px 10px', maxHeight: 220, overflowY: 'auto' }}>
          <div style={{ fontSize: 9, fontFamily: FONT, color: ACCENT, marginBottom: 4 }}>
            Sector Analysts
          </div>
          {chain.sectorReports.map((r) => (
            <div key={r.sector} style={{
              padding: '3px 6px', marginBottom: 2,
              borderLeft: `2px solid ${r.sectorSentiment === 'bullish' ? '#1a7a00' : r.sectorSentiment === 'bearish' ? '#a30000' : '#7a4800'}`,
              background: 'rgba(106,0,170,0.04)', borderRadius: '0 3px 3px 0',
            }}>
              <div style={{ fontSize: 8, color: '#3d0066' }}>
                {r.sector} <span style={{ color: '#9b30d9' }}>[{r.sectorSentiment}]</span>
              </div>
              {r.topPicks.slice(0, 2).map((p, i) => (
                <div key={i} style={{ fontSize: 7, color: '#7a4800' }}>
                  {p.ticker} {p.action} — {p.reason}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
