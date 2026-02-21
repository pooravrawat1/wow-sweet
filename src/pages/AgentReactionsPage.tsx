// ============================================================
// SweetReturns — AgentReactionsPage: Agent heatmap, leaderboard,
//   store pressure map, and decision stream
// ============================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store/useStore';
import { generateStockData, SECTORS } from '../data/stockData';
import type { StockData } from '../types';

const PAGE_BG = '#1a1a2e';
const PANEL_BG = '#0f0f23';
const ACCENT = '#FFD700';
const TEXT_COLOR = '#e0e0e0';
const BORDER_COLOR = '#2a2a4a';

// ---- Deterministic seeded random (for mock data) ----
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---- Mock agent data generator ----
interface MockAgent {
  id: string;
  name: string;
  profit: number;
  tradesCompleted: number;
  targetTicker: string;
  lane: string;
  confidence: number;
}

function generateMockAgents(stocks: StockData[], count: number): MockAgent[] {
  const rand = seededRandom(777);
  const names = [
    'AlphaBot', 'BetaTrader', 'GammaSurge', 'DeltaEdge', 'EpsilonAI',
    'ZetaHunter', 'EtaPulse', 'ThetaWave', 'IotaSnap', 'KappaFlux',
    'LambdaCore', 'MuDrift', 'NuStrike', 'XiProbe', 'OmicronScan',
    'PiCalc', 'RhoForce', 'SigmaNet', 'TauBeam', 'UpsilonArc',
    'PhiSense', 'ChiPulse', 'PsiDepth', 'OmegaMax', 'VegaPrime',
    'NovaSwift', 'QuantaRush', 'NeonBlitz', 'CyberKnight', 'PixelStorm',
  ];
  const lanes = ['BUY', 'SHORT', 'CALL', 'PUT'];
  const agents: MockAgent[] = [];

  for (let i = 0; i < count; i++) {
    const stock = stocks[Math.floor(rand() * stocks.length)];
    agents.push({
      id: `agent-${i}`,
      name: `${names[i % names.length]}${i >= names.length ? `-${Math.floor(i / names.length)}` : ''}`,
      profit: Math.round((-5000 + rand() * 25000) * 100) / 100,
      tradesCompleted: Math.floor(rand() * 200),
      targetTicker: stock.ticker,
      lane: lanes[Math.floor(rand() * lanes.length)],
      confidence: Math.round(rand() * 100) / 100,
    });
  }

  return agents.sort((a, b) => b.profit - a.profit);
}

// ---- Mock decision stream entries ----
interface DecisionEntry {
  id: number;
  timestamp: string;
  agent: string;
  ticker: string;
  action: string;
  reasoning: string;
}

function generateDecisionStream(agents: MockAgent[], count: number): DecisionEntry[] {
  const rand = seededRandom(999);
  const actions = ['BUY', 'SHORT', 'CALL', 'PUT', 'EXIT', 'HOLD'];
  const reasons = [
    'Golden score spike detected',
    'Sector rotation signal triggered',
    'Volatility crush opportunity',
    'Convexity ticket activated',
    'Dislocation ticket — rare entry',
    'Momentum divergence noted',
    'Earnings asymmetry play',
    'Mean reversion setup detected',
    'Volume anomaly at support',
    'Correlation breakdown identified',
    'Shock ticket — drawdown exceeds threshold',
    'Platinum store entry — high conviction',
  ];
  const entries: DecisionEntry[] = [];
  const baseTime = Date.now();

  for (let i = 0; i < count; i++) {
    const agent = agents[Math.floor(rand() * agents.length)];
    entries.push({
      id: i,
      timestamp: new Date(baseTime - i * 2300).toLocaleTimeString(),
      agent: agent.name,
      ticker: agent.targetTicker,
      action: actions[Math.floor(rand() * actions.length)],
      reasoning: reasons[Math.floor(rand() * reasons.length)],
    });
  }

  return entries;
}

// ---- Compute store pressure (agents per stock) ----
function computeStorePressure(
  stocks: StockData[],
  agents: MockAgent[],
): Map<string, number> {
  const pressureMap = new Map<string, number>();
  for (const s of stocks) pressureMap.set(s.ticker, 0);
  for (const a of agents) {
    pressureMap.set(a.targetTicker, (pressureMap.get(a.targetTicker) ?? 0) + 1);
  }
  return pressureMap;
}

// ---- Color scale: intensity from count ----
function pressureColor(count: number, maxCount: number): string {
  if (maxCount === 0) return '#1e1e3a';
  const t = Math.min(count / maxCount, 1);
  const r = Math.round(30 + t * 225);
  const g = Math.round(30 + t * 60);
  const b = Math.round(60 - t * 30);
  return `rgb(${r},${g},${b})`;
}

// ============================================================
// Leaderboard (left column)
// ============================================================
const Leaderboard: React.FC<{ agents: MockAgent[] }> = ({ agents }) => {
  const top20 = agents.slice(0, 20);
  return (
    <div
      style={{
        background: PANEL_BG,
        borderRadius: 8,
        padding: 12,
        height: '100%',
        overflowY: 'auto',
        border: `1px solid ${BORDER_COLOR}`,
      }}
    >
      <h3
        style={{
          color: ACCENT,
          fontSize: 13,
          margin: '0 0 10px',
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        Top 20 Agents
      </h3>
      {top20.map((agent, idx) => (
        <div
          key={agent.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 4px',
            borderBottom: `1px solid ${BORDER_COLOR}`,
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                color: idx < 3 ? ACCENT : '#666',
                fontWeight: idx < 3 ? 700 : 400,
                minWidth: 20,
                textAlign: 'right',
              }}
            >
              {idx + 1}
            </span>
            <span style={{ color: TEXT_COLOR }}>{agent.name}</span>
          </div>
          <span
            style={{
              color: agent.profit >= 0 ? '#00ff7f' : '#ff4444',
              fontFamily: 'monospace',
              fontSize: 11,
            }}
          >
            {agent.profit >= 0 ? '+' : ''}
            ${agent.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// Agent Heatmap (center, canvas-based)
// ============================================================
const AgentHeatmap: React.FC<{
  stocks: StockData[];
  agents: MockAgent[];
}> = ({ stocks, agents }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || stocks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pressureMap = computeStorePressure(stocks, agents);
    const maxCount = Math.max(1, ...pressureMap.values());

    const cols = Math.ceil(Math.sqrt(stocks.length));
    const rows = Math.ceil(stocks.length / cols);
    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;

    ctx.fillStyle = '#0a0a1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    stocks.forEach((stock, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const count = pressureMap.get(stock.ticker) ?? 0;
      const t = Math.min(count / maxCount, 1);

      // Base sector color blended with heat intensity
      const sc = SECTORS.find((s) => s.name === stock.sector)?.color ?? '#444';

      // Parse sector color
      const r = parseInt(sc.slice(1, 3), 16) || 80;
      const g = parseInt(sc.slice(3, 5), 16) || 80;
      const b = parseInt(sc.slice(5, 7), 16) || 80;

      // Heat blend: sector color at low counts, hot orange/white at high counts
      const hr = Math.round(r + (255 - r) * t);
      const hg = Math.round(g * (1 - t * 0.5) + 100 * t);
      const hb = Math.round(b * (1 - t * 0.7));

      ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
      ctx.fillRect(col * cellW + 0.5, row * cellH + 0.5, cellW - 1, cellH - 1);

      // Label for larger cells
      if (cellW > 16 && cellH > 10) {
        ctx.fillStyle = t > 0.5 ? '#000' : '#aaa';
        ctx.font = `${Math.min(cellW * 0.35, 9)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stock.ticker, col * cellW + cellW / 2, row * cellH + cellH / 2);
      }
    });
  }, [stocks, agents]);

  return (
    <div
      style={{
        background: PANEL_BG,
        borderRadius: 8,
        padding: 12,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${BORDER_COLOR}`,
      }}
    >
      <h3
        style={{
          color: ACCENT,
          fontSize: 13,
          margin: '0 0 10px',
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        Agent Heatmap
      </h3>
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        style={{ width: '100%', flex: 1, borderRadius: 4, imageRendering: 'pixelated' }}
      />
    </div>
  );
};

// ============================================================
// Store Pressure Map (right column)
// ============================================================
const StorePressureMap: React.FC<{
  stocks: StockData[];
  agents: MockAgent[];
}> = ({ stocks, agents }) => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const pressureMap = useMemo(() => computeStorePressure(stocks, agents), [stocks, agents]);
  const maxCount = useMemo(() => Math.max(1, ...pressureMap.values()), [pressureMap]);

  // Agent breakdown for selected cell
  const breakdown = useMemo(() => {
    if (!selectedTicker) return null;
    const targeting = agents.filter((a) => a.targetTicker === selectedTicker);
    const laneBreakdown: Record<string, number> = { BUY: 0, SHORT: 0, CALL: 0, PUT: 0 };
    targeting.forEach((a) => {
      if (laneBreakdown[a.lane] !== undefined) laneBreakdown[a.lane]++;
    });
    return { ticker: selectedTicker, total: targeting.length, lanes: laneBreakdown };
  }, [selectedTicker, agents]);

  return (
    <div
      style={{
        background: PANEL_BG,
        borderRadius: 8,
        padding: 12,
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${BORDER_COLOR}`,
      }}
    >
      <h3
        style={{
          color: ACCENT,
          fontSize: 13,
          margin: '0 0 10px',
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        Store Pressure
      </h3>

      {/* Breakdown info */}
      {breakdown && (
        <div
          style={{
            padding: 8,
            marginBottom: 10,
            background: '#1e1e3a',
            borderRadius: 6,
            border: `1px solid ${ACCENT}44`,
            fontSize: 12,
          }}
        >
          <div style={{ color: ACCENT, fontWeight: 700, marginBottom: 4 }}>
            {breakdown.ticker} — {breakdown.total} agents
          </div>
          {Object.entries(breakdown.lanes).map(([lane, count]) => (
            <div key={lane} style={{ display: 'flex', justifyContent: 'space-between', color: '#bbb' }}>
              <span>{lane}</span>
              <span style={{ fontFamily: 'monospace' }}>{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pressure grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(42px, 1fr))',
          gap: 2,
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {stocks.map((stock) => {
          const count = pressureMap.get(stock.ticker) ?? 0;
          const isSelected = selectedTicker === stock.ticker;
          return (
            <div
              key={stock.ticker}
              onClick={() => setSelectedTicker(isSelected ? null : stock.ticker)}
              style={{
                background: pressureColor(count, maxCount),
                borderRadius: 3,
                padding: '3px 2px',
                textAlign: 'center',
                fontSize: 8,
                fontFamily: 'monospace',
                color: count > maxCount * 0.5 ? '#fff' : '#aaa',
                cursor: 'pointer',
                border: isSelected ? `2px solid ${ACCENT}` : '2px solid transparent',
                transition: 'border-color 0.15s',
                lineHeight: 1.3,
              }}
              title={`${stock.ticker}: ${count} agents`}
            >
              <div style={{ fontWeight: 600, fontSize: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {stock.ticker}
              </div>
              <div style={{ fontSize: 9, color: ACCENT }}>{count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// Decision Stream (bottom bar)
// ============================================================
const DecisionStream: React.FC<{ entries: DecisionEntry[] }> = ({ entries }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const actionColor = (action: string): string => {
    switch (action) {
      case 'BUY': return '#00ff7f';
      case 'CALL': return '#00bfff';
      case 'SHORT': return '#ff4444';
      case 'PUT': return '#ff8c00';
      case 'EXIT': return '#888';
      case 'HOLD': return '#aaa';
      default: return TEXT_COLOR;
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        background: PANEL_BG,
        borderRadius: 8,
        padding: '8px 12px',
        overflowX: 'auto',
        overflowY: 'hidden',
        display: 'flex',
        gap: 12,
        border: `1px solid ${BORDER_COLOR}`,
        whiteSpace: 'nowrap',
      }}
    >
      <h3
        style={{
          color: ACCENT,
          fontSize: 11,
          letterSpacing: 1,
          textTransform: 'uppercase',
          writingMode: 'vertical-lr',
          margin: 0,
          padding: '0 4px 0 0',
          flexShrink: 0,
        }}
      >
        Decisions
      </h3>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            flexShrink: 0,
            padding: '6px 10px',
            background: '#1e1e3a',
            borderRadius: 6,
            border: `1px solid ${BORDER_COLOR}`,
            fontSize: 11,
            minWidth: 180,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: '#888', fontSize: 10 }}>{entry.timestamp}</span>
            <span style={{ color: actionColor(entry.action), fontWeight: 700 }}>{entry.action}</span>
          </div>
          <div style={{ marginTop: 2 }}>
            <span style={{ color: '#aaa' }}>{entry.agent}</span>
            <span style={{ color: '#555' }}> &rarr; </span>
            <span style={{ color: ACCENT }}>{entry.ticker}</span>
          </div>
          <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>{entry.reasoning}</div>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// Main Page
// ============================================================
export default function AgentReactionsPage() {
  const stocks = useStore((s) => s.stocks);
  const setStocks = useStore((s) => s.setStocks);

  // Initialize stocks if empty
  useEffect(() => {
    if (stocks.length === 0) {
      setStocks(generateStockData());
    }
  }, [stocks.length, setStocks]);

  // Generate mock agents
  const agents = useMemo(() => {
    if (stocks.length === 0) return [];
    return generateMockAgents(stocks, 200);
  }, [stocks]);

  // Generate decision stream
  const decisions = useMemo(() => {
    if (agents.length === 0) return [];
    return generateDecisionStream(agents, 50);
  }, [agents]);

  if (stocks.length === 0) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: PAGE_BG,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: ACCENT,
          fontFamily: 'monospace',
          fontSize: 16,
        }}
      >
        Loading agent data...
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: PAGE_BG,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
        color: TEXT_COLOR,
        overflow: 'hidden',
      }}
    >
      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', gap: 8, padding: '12px 12px 0 12px', minHeight: 0 }}>
        {/* Left column (20%) — Leaderboard */}
        <div style={{ width: '20%', minWidth: 180 }}>
          <Leaderboard agents={agents} />
        </div>

        {/* Center (50%) — Agent Heatmap */}
        <div style={{ width: '50%', minWidth: 300 }}>
          <AgentHeatmap stocks={stocks} agents={agents} />
        </div>

        {/* Right (30%) — Store Pressure Map */}
        <div style={{ width: '30%', minWidth: 200 }}>
          <StorePressureMap stocks={stocks} agents={agents} />
        </div>
      </div>

      {/* Bottom — Decision Stream */}
      <div style={{ padding: '8px 12px 12px 12px', flexShrink: 0, maxHeight: 130 }}>
        <DecisionStream entries={decisions} />
      </div>
    </div>
  );
}
