// ============================================================
// SweetReturns — GraphPlaygroundPage: Full-screen interactive
//   force graph with shock propagation, node detail, sector legend,
//   color modes, search, network stats, and regime toggle.
// ============================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import { SECTORS, generateStockData, getCorrelationEdges, loadPipelineData, PLATINUM_COLOR, TIER_COLORS } from '../data/stockData';

const ACCENT = '#FFD700';
const TEXT_COLOR = '#e0e0e0';
const BORDER_COLOR = '#2a2a4a';
const PANEL_BG = 'rgba(15,15,35,0.92)';

function sectorColor(sectorName: string): string {
  return SECTORS.find((s) => s.name === sectorName)?.color ?? '#888888';
}

type Regime = 'all' | 'highVol' | 'lowVol';
type ColorMode = 'sector' | 'golden';

let ForceGraph3DComponent: React.ComponentType<any> | null = null;

interface ShockState {
  active: boolean;
  sourceNode: string | null;
  affectedNodes: Map<string, { intensity: number; timestamp: number }>;
}

interface ShockResults {
  sourceTicker: string;
  sourceGoldenScore: number;
  sourceSector: string;
  affectedTickers: Array<{ ticker: string; sector: string; intensity: number; company: string }>;
  sectorBreakdown: Array<{ sector: string; count: number; color: string }>;
  totalReach: number;
  maxDepth: number;
}

interface NodeDetailData {
  ticker: string;
  company: string;
  sector: string;
  sectorColor: string;
  goldenScore: number;
  isPlatinum: boolean;
  tickets: { dip: boolean; shock: boolean; asymmetry: boolean; dislocation: boolean; convexity: boolean };
  technicals: { rsi: number; macd: number; bbPctB: number; zscore: number; vol: number } | null;
  connectionCount: number;
  topCorrelated: Array<{ ticker: string; weight: number }>;
  drawdown: number;
  volumePct: number;
  volPct: number;
}

// ============================================================
// Fallback canvas graph
// ============================================================
interface FallbackNodeData {
  id: string;
  sector: string;
  goldenScore: number;
  isPlatinum: boolean;
  color: string;
  val: number;
}

interface FallbackLinkData {
  source: string;
  target: string;
  weight: number;
}

const FallbackCanvasGraph: React.FC<{
  nodes: FallbackNodeData[];
  links: FallbackLinkData[];
  shock: ShockState;
  searchHighlight: string | null;
  onNodeClick: (node: FallbackNodeData) => void;
}> = ({ nodes, links, shock, searchHighlight, onNodeClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(new Map());
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const positions = positionsRef.current;
    nodes.forEach((node) => {
      if (!positions.has(node.id)) {
        positions.set(node.id, {
          x: w / 2 + (Math.random() - 0.5) * w * 0.8,
          y: h / 2 + (Math.random() - 0.5) * h * 0.8,
          vx: 0,
          vy: 0,
        });
      }
    });

    function simulate() {
      if (!ctx) return;
      ctx.fillStyle = '#0a0a1e';
      ctx.fillRect(0, 0, w, h);

      const alpha = 0.1;

      nodes.forEach((node) => {
        const p = positions.get(node.id)!;
        p.vx += (w / 2 - p.x) * 0.001;
        p.vy += (h / 2 - p.y) * 0.001;
        for (let j = 0; j < Math.min(nodes.length, 80); j++) {
          const other = nodes[j];
          if (other.id === node.id) continue;
          const op = positions.get(other.id)!;
          const dx = p.x - op.x;
          const dy = p.y - op.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 1;
          if (dist < 80) {
            const force = 200 / (dist * dist);
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.x += p.vx * alpha;
        p.y += p.vy * alpha;
        p.x = Math.max(20, Math.min(w - 20, p.x));
        p.y = Math.max(20, Math.min(h - 20, p.y));
      });

      links.forEach((link) => {
        const sp = positions.get(link.source);
        const tp = positions.get(link.target);
        if (!sp || !tp) return;
        const dx = tp.x - sp.x;
        const dy = tp.y - sp.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 1;
        const force = (dist - 60) * 0.0005 * Math.abs(link.weight);
        sp.vx += (dx / dist) * force;
        sp.vy += (dy / dist) * force;
        tp.vx -= (dx / dist) * force;
        tp.vy -= (dy / dist) * force;
      });

      // Draw links
      links.forEach((link) => {
        const sp = positions.get(link.source);
        const tp = positions.get(link.target);
        if (!sp || !tp) return;
        const lw = Math.max(0.5, Math.abs(link.weight) * 2);
        const baseAlpha = link.weight > 0 ? 0.2 : 0.15;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(tp.x, tp.y);
        ctx.strokeStyle = `rgba(255,255,255,${baseAlpha})`;
        ctx.lineWidth = lw;
        ctx.stroke();
      });

      // Shock edge glow
      const now = Date.now();
      if (shock.active) {
        ctx.save();
        links.forEach((link) => {
          const srcShock = shock.affectedNodes.get(link.source);
          const tgtShock = shock.affectedNodes.get(link.target);
          if (!srcShock && !tgtShock) return;
          const sp2 = positions.get(link.source);
          const tp2 = positions.get(link.target);
          if (!sp2 || !tp2) return;
          let maxT = 0;
          if (srcShock) { const el = now - srcShock.timestamp; if (el >= 0 && el < 5000) maxT = Math.max(maxT, srcShock.intensity * (1 - el / 5000)); }
          if (tgtShock) { const el = now - tgtShock.timestamp; if (el >= 0 && el < 5000) maxT = Math.max(maxT, tgtShock.intensity * (1 - el / 5000)); }
          if (maxT <= 0) return;
          ctx.beginPath();
          ctx.moveTo(sp2.x, sp2.y);
          ctx.lineTo(tp2.x, tp2.y);
          ctx.strokeStyle = `rgba(255, 215, 0, ${maxT * 0.6})`;
          ctx.lineWidth = 1 + maxT * 5;
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = maxT * 14;
          ctx.stroke();
        });
        ctx.restore();
      }

      // Draw nodes
      nodes.forEach((node) => {
        const p = positions.get(node.id)!;
        let radius = 2 + node.goldenScore * 1.5;
        let drawX = p.x;
        let drawY = p.y;
        let fillColor = node.color;
        let shockT = 0;

        if (shock.active && shock.affectedNodes.has(node.id)) {
          const { intensity, timestamp } = shock.affectedNodes.get(node.id)!;
          const elapsed = now - timestamp;
          if (elapsed >= 0 && elapsed < 5000) {
            const fade = Math.max(0, 1 - elapsed / 5000);
            shockT = intensity * fade;
            fillColor = `rgb(${Math.round(255 * shockT + 136 * (1 - shockT))},${Math.round(215 * shockT + 136 * (1 - shockT))},${Math.round(0 * shockT + 136 * (1 - shockT))})`;
            const shake = shockT * 6;
            drawX += (Math.random() - 0.5) * shake * 2;
            drawY += (Math.random() - 0.5) * shake * 2;
            radius *= 1 + shockT * 2 * (0.5 + 0.5 * Math.sin(now * 0.004));
          }
        }

        // Shock glow ring
        if (shockT > 0.01) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(drawX, drawY, radius + 5 + shockT * 10, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 215, 0, ${shockT * 0.2})`;
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = shockT * 18;
          ctx.fill();
          ctx.restore();
        }

        // Search highlight ring
        if (searchHighlight === node.id) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(drawX, drawY, radius + 8, 0, Math.PI * 2);
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 2;
          ctx.shadowColor = ACCENT;
          ctx.shadowBlur = 12;
          ctx.stroke();
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();

        if (node.isPlatinum) {
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);
          ctx.strokeStyle = PLATINUM_COLOR;
          ctx.lineWidth = 1.5 + pulse;
          ctx.globalAlpha = 0.5 + pulse * 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        if (node.val > 5 || searchHighlight === node.id) {
          ctx.fillStyle = searchHighlight === node.id ? ACCENT : 'rgba(255,255,255,0.6)';
          ctx.font = searchHighlight === node.id ? 'bold 11px system-ui' : '9px system-ui';
          ctx.textAlign = 'left';
          ctx.fillText(node.id, drawX + radius + 2, drawY + 3);
        }
      });

      // Shock ripple rings
      if (shock.active && shock.sourceNode) {
        const sourcePos = positions.get(shock.sourceNode);
        const sourceInfo = shock.affectedNodes.get(shock.sourceNode);
        if (sourcePos && sourceInfo) {
          const elapsed = now - sourceInfo.timestamp;
          for (let ring = 0; ring < 4; ring++) {
            const ringElapsed = elapsed - ring * 1200;
            if (ringElapsed < 0 || ringElapsed > 6000) continue;
            const progress = ringElapsed / 6000;
            const ringRadius = progress * Math.min(w, h) * 0.5;
            const ringAlpha = (1 - progress) * 0.4;
            ctx.beginPath();
            ctx.arc(sourcePos.x, sourcePos.y, ringRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 215, 0, ${ringAlpha})`;
            ctx.lineWidth = 3 * (1 - progress);
            ctx.stroke();
          }
        }
      }

      frameRef.current = requestAnimationFrame(simulate);
    }

    simulate();

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const my = (e.clientY - rect.top) * (canvas.height / rect.height);
      for (const node of nodes) {
        const p = positions.get(node.id);
        if (!p) continue;
        const dx = p.x - mx;
        const dy = p.y - my;
        if (dx * dx + dy * dy < 100) {
          onNodeClick(node);
          return;
        }
      }
    };
    canvas.addEventListener('click', handleClick);

    return () => {
      cancelAnimationFrame(frameRef.current);
      canvas.removeEventListener('click', handleClick);
    };
  }, [nodes, links, onNodeClick, shock, searchHighlight]);

  return (
    <canvas
      ref={canvasRef}
      width={1400}
      height={900}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
};

// ============================================================
// Side Panel — Node Detail
// ============================================================
const NodeDetailPanel: React.FC<{ detail: NodeDetailData }> = ({ detail }) => {
  const ticketNames = [
    { key: 'dip' as const, label: 'Dip', emoji: '🍬' },
    { key: 'shock' as const, label: 'Shock', emoji: '💥' },
    { key: 'asymmetry' as const, label: 'Asymmetry', emoji: '🥠' },
    { key: 'dislocation' as const, label: 'Dislocation', emoji: '🍬' },
    { key: 'convexity' as const, label: 'Convexity', emoji: '🐻' },
  ];

  return (
    <>
      <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        Node Detail
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: ACCENT, marginBottom: 2 }}>
        {detail.ticker}
        {detail.isPlatinum && (
          <span style={{ fontSize: 10, color: PLATINUM_COLOR, marginLeft: 8, padding: '2px 6px', background: 'rgba(228,180,255,0.1)', borderRadius: 4 }}>
            PLATINUM
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>{detail.company}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: detail.sectorColor }} />
        <span style={{ fontSize: 11, color: detail.sectorColor }}>{detail.sector}</span>
      </div>

      {/* Golden Score */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>GOLDEN SCORE</div>
        <div style={{ display: 'flex', gap: 3 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{
              width: 24, height: 8, borderRadius: 2,
              background: i < detail.goldenScore ? (TIER_COLORS[detail.goldenScore] || '#888') : '#1e1e3a',
              border: '1px solid #2a2a4a',
            }} />
          ))}
          <span style={{ fontSize: 11, fontWeight: 700, color: TIER_COLORS[detail.goldenScore] || '#888', marginLeft: 4 }}>
            {detail.goldenScore}/5
          </span>
        </div>
      </div>

      {/* Ticket Levels */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>GOLDEN TICKETS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {ticketNames.map(t => (
            <div key={t.key} style={{
              fontSize: 9, padding: '3px 6px', borderRadius: 4,
              background: detail.tickets[t.key] ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.02)',
              color: detail.tickets[t.key] ? ACCENT : '#444',
              border: `1px solid ${detail.tickets[t.key] ? 'rgba(255,215,0,0.3)' : '#2a2a4a'}`,
            }}>
              {t.label}
            </div>
          ))}
        </div>
      </div>

      {/* Technicals */}
      {detail.technicals && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>TECHNICALS</div>
          {[
            { label: 'RSI', value: detail.technicals.rsi.toFixed(1), color: detail.technicals.rsi > 70 ? '#FF4500' : detail.technicals.rsi < 30 ? '#00FF7F' : '#aaa' },
            { label: 'MACD', value: detail.technicals.macd.toFixed(3), color: detail.technicals.macd > 0 ? '#00FF7F' : '#FF4500' },
            { label: 'BB%B', value: detail.technicals.bbPctB.toFixed(2), color: '#aaa' },
            { label: 'Z-Score', value: detail.technicals.zscore.toFixed(2), color: Math.abs(detail.technicals.zscore) > 2 ? '#FF69B4' : '#aaa' },
            { label: 'Volatility', value: (detail.technicals.vol * 100).toFixed(1) + '%', color: '#aaa' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
              <span style={{ color: '#888' }}>{row.label}</span>
              <span style={{ color: row.color, fontFamily: 'monospace', fontWeight: 600 }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Market Stats */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>MARKET</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
          <span style={{ color: '#888' }}>Drawdown</span>
          <span style={{ color: '#FF4500', fontFamily: 'monospace' }}>{(detail.drawdown * 100).toFixed(1)}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
          <span style={{ color: '#888' }}>Volume Pctl</span>
          <span style={{ color: '#aaa', fontFamily: 'monospace' }}>{(detail.volumePct * 100).toFixed(0)}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
          <span style={{ color: '#888' }}>Connections</span>
          <span style={{ color: ACCENT, fontFamily: 'monospace' }}>{detail.connectionCount}</span>
        </div>
      </div>

      {/* Top Correlated */}
      {detail.topCorrelated.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>TOP CORRELATED</div>
          {detail.topCorrelated.map(c => (
            <div key={c.ticker} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
              <span style={{ fontSize: 11, color: ACCENT, minWidth: 48 }}>{c.ticker}</span>
              <div style={{ flex: 1, height: 6, background: '#1e1e3a', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.abs(c.weight) * 100}%`, height: '100%', background: c.weight > 0 ? '#00FF7F' : '#FF4500', borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 10, color: '#888', fontFamily: 'monospace', minWidth: 36, textAlign: 'right' }}>
                {c.weight.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

// ============================================================
// Side Panel — Shock Results
// ============================================================
const ShockResultsPanel: React.FC<{ results: ShockResults }> = ({ results }) => (
  <>
    <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
      Shock Propagation Results
    </div>

    {/* Source */}
    <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(255,215,0,0.06)', borderRadius: 6, border: '1px solid rgba(255,215,0,0.15)' }}>
      <div style={{ fontSize: 9, color: '#888', marginBottom: 2 }}>SOURCE</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: ACCENT }}>{results.sourceTicker}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 10 }}>
        <span style={{ color: sectorColor(results.sourceSector) }}>{results.sourceSector}</span>
        <span style={{ color: TIER_COLORS[results.sourceGoldenScore] || '#888' }}>Score {results.sourceGoldenScore}/5</span>
      </div>
    </div>

    {/* Cascade Stats */}
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <div style={{ flex: 1, padding: '6px 8px', background: '#1e1e3a', borderRadius: 6, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#FF4500' }}>{results.totalReach}</div>
        <div style={{ fontSize: 8, color: '#888' }}>Nodes Hit</div>
      </div>
      <div style={{ flex: 1, padding: '6px 8px', background: '#1e1e3a', borderRadius: 6, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#FF69B4' }}>{results.maxDepth}</div>
        <div style={{ fontSize: 8, color: '#888' }}>Max Depth</div>
      </div>
    </div>

    {/* Sector Breakdown */}
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>SECTOR IMPACT</div>
      {results.sectorBreakdown.map(s => (
        <div key={s.sector} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: '#aaa', flex: 1 }}>{s.sector}</span>
          <div style={{ width: 60, height: 5, background: '#1e1e3a', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min((s.count / (results.totalReach || 1)) * 100, 100)}%`, height: '100%', background: s.color, borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 10, color: '#888', fontFamily: 'monospace', minWidth: 20, textAlign: 'right' }}>{s.count}</span>
        </div>
      ))}
    </div>

    {/* Affected Tickers */}
    <div>
      <div style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>MOST AFFECTED ({results.affectedTickers.length})</div>
      {results.affectedTickers.map((t, i) => (
        <div key={t.ticker} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: i < results.affectedTickers.length - 1 ? `1px solid ${BORDER_COLOR}` : 'none' }}>
          <span style={{ fontSize: 10, color: '#666', minWidth: 16 }}>#{i + 1}</span>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: sectorColor(t.sector), flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: ACCENT, minWidth: 48, fontWeight: 600 }}>{t.ticker}</span>
          <div style={{ flex: 1, height: 4, background: '#1e1e3a', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${t.intensity * 100}%`, height: '100%', background: `rgba(255,215,0,${0.3 + t.intensity * 0.7})`, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 9, color: '#888', fontFamily: 'monospace' }}>{(t.intensity * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  </>
);

// ============================================================
// Main page component
// ============================================================
export default function GraphPlaygroundPage() {
  const stocks = useStore((s) => s.stocks);
  const setStocks = useStore((s) => s.setStocks);
  const correlationThreshold = useStore((s) => s.correlationThreshold);
  const setCorrelationThreshold = useStore((s) => s.setCorrelationThreshold);
  const correlationEdges = useStore((s) => s.correlationEdges);
  const setCorrelationEdges = useStore((s) => s.setCorrelationEdges);

  const [regime, setRegime] = useState<Regime>('all');
  const [colorMode, setColorMode] = useState<ColorMode>('sector');
  const [shockMode, setShockMode] = useState(false);
  const [shockType, setShockType] = useState<'crash' | 'spike'>('crash');
  const [shock, setShock] = useState<ShockState>({ active: false, sourceNode: null, affectedNodes: new Map() });
  const [shockResults, setShockResults] = useState<ShockResults | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHighlight, setSearchHighlight] = useState<string | null>(null);
  const [forceGraphReady, setForceGraphReady] = useState(ForceGraph3DComponent !== null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const graphRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);

  // Initialize stocks if empty
  useEffect(() => {
    if (stocks.length === 0) {
      loadPipelineData()
        .then(({ stocks: s, edges }) => { setStocks(s); setCorrelationEdges(edges); })
        .catch(() => setStocks(generateStockData()));
    }
  }, [stocks.length, setStocks, setCorrelationEdges]);

  // Compute edges when threshold or stocks change
  useEffect(() => {
    if (stocks.length > 0) {
      const edges = getCorrelationEdges(stocks, correlationThreshold);
      setCorrelationEdges(edges);
    }
  }, [stocks, correlationThreshold, setCorrelationEdges]);

  // Load ForceGraph3D dynamically
  useEffect(() => {
    if (!ForceGraph3DComponent) {
      import('react-force-graph-3d')
        .then((mod) => { ForceGraph3DComponent = mod.default; setForceGraphReady(true); })
        .catch(() => { setFallbackMode(true); });
    }
  }, []);

  // Filter edges based on regime
  const regimeEdges = useMemo(() => {
    if (regime === 'all') return correlationEdges;
    const volMap = new Map<string, number>();
    stocks.forEach((s) => volMap.set(s.ticker, s.volatility_percentile));
    return correlationEdges.filter((e) => {
      const avgVol = ((volMap.get(e.source) ?? 0.5) + (volMap.get(e.target) ?? 0.5)) / 2;
      if (regime === 'highVol') return avgVol > 0.6;
      return avgVol <= 0.4;
    });
  }, [correlationEdges, regime, stocks]);

  // Network stats
  const networkStats = useMemo(() => {
    const nodeCount = stocks.length;
    const edgeCount = regimeEdges.length;
    const avgConnections = nodeCount > 0 ? (edgeCount * 2 / nodeCount) : 0;
    const maxPossible = nodeCount * (nodeCount - 1) / 2;
    const density = maxPossible > 0 ? edgeCount / maxPossible : 0;
    return { nodeCount, edgeCount, avgConnections, density };
  }, [stocks.length, regimeEdges.length]);

  // Adjacency list for BFS shock propagation
  const adjacency = useMemo(() => {
    const adj = new Map<string, Array<{ target: string; weight: number }>>();
    for (const edge of regimeEdges) {
      if (!adj.has(edge.source)) adj.set(edge.source, []);
      if (!adj.has(edge.target)) adj.set(edge.target, []);
      adj.get(edge.source)!.push({ target: edge.target, weight: edge.weight });
      adj.get(edge.target)!.push({ target: edge.source, weight: edge.weight });
    }
    return adj;
  }, [regimeEdges]);

  // BFS shock propagation with results
  const triggerShock = useCallback((sourceId: string) => {
    const affected = new Map<string, { intensity: number; timestamp: number }>();
    const queue: Array<{ id: string; intensity: number; depth: number }> = [{ id: sourceId, intensity: 1.0, depth: 0 }];
    const visited = new Set<string>();
    visited.add(sourceId);
    const now = Date.now();
    let maxDepth = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      affected.set(current.id, { intensity: current.intensity, timestamp: now + current.depth * 1000 });
      maxDepth = Math.max(maxDepth, current.depth);
      if (current.intensity < 0.05 || current.depth > 8) continue;
      const neighbors = adjacency.get(current.id) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.target)) {
          visited.add(neighbor.target);
          const nextIntensity = current.intensity * (1 - Math.abs(neighbor.weight) * 0.5) * 0.8;
          queue.push({ id: neighbor.target, intensity: nextIntensity, depth: current.depth + 1 });
        }
      }
    }

    // Build shock results
    const sourceStock = stocks.find(s => s.ticker === sourceId);
    const affectedTickers: ShockResults['affectedTickers'] = [];
    const sectorCounts = new Map<string, number>();

    for (const [id, info] of affected) {
      if (id === sourceId) continue;
      const stock = stocks.find(s => s.ticker === id);
      if (stock) {
        affectedTickers.push({ ticker: id, sector: stock.sector, intensity: info.intensity, company: stock.company });
        sectorCounts.set(stock.sector, (sectorCounts.get(stock.sector) || 0) + 1);
      }
    }

    affectedTickers.sort((a, b) => b.intensity - a.intensity);

    const sectorBreakdown = Array.from(sectorCounts.entries())
      .map(([sector, count]) => ({ sector, count, color: sectorColor(sector) }))
      .sort((a, b) => b.count - a.count);

    setShockResults({
      sourceTicker: sourceId,
      sourceGoldenScore: sourceStock?.golden_score ?? 0,
      sourceSector: sourceStock?.sector ?? '',
      affectedTickers: affectedTickers.slice(0, 15),
      sectorBreakdown,
      totalReach: affected.size - 1,
      maxDepth,
    });

    setSelectedNode(null);
    setShock({ active: true, sourceNode: sourceId, affectedNodes: affected });

    // Apply shock to actual stock data direction_bias
    const updatedStocks = stocks.map(s => {
      const shockInfo = affected.get(s.ticker);
      if (!shockInfo || s.ticker === sourceId) return s;

      const intensity = shockInfo.intensity;
      const bias = { ...s.direction_bias };

      if (shockType === 'crash') {
        bias.short = Math.min(0.8, bias.short + intensity * 0.15);
        bias.put = Math.min(0.8, bias.put + intensity * 0.10);
        bias.buy = Math.max(0.05, bias.buy - intensity * 0.15);
        bias.call = Math.max(0.05, bias.call - intensity * 0.10);
      } else {
        bias.buy = Math.min(0.8, bias.buy + intensity * 0.15);
        bias.call = Math.min(0.8, bias.call + intensity * 0.10);
        bias.short = Math.max(0.05, bias.short - intensity * 0.15);
        bias.put = Math.max(0.05, bias.put - intensity * 0.10);
      }

      // Normalize to sum to 1
      const total = bias.buy + bias.call + bias.put + bias.short;
      bias.buy /= total;
      bias.call /= total;
      bias.put /= total;
      bias.short /= total;

      return { ...s, direction_bias: bias };
    });
    setStocks(updatedStocks);

    const maxDelay = Math.max(0, ...Array.from(affected.values()).map((v) => v.timestamp - now));
    setTimeout(() => {
      setShock({ active: false, sourceNode: null, affectedNodes: new Map() });
    }, maxDelay + 6000);
  }, [adjacency, stocks, shockType, setStocks]);

  // Handle node click
  const handleNodeClick = useCallback((node: any) => {
    const id = typeof node === 'string' ? node : node?.id;
    if (!id) return;
    if (shockMode) {
      triggerShock(id);
      setShockMode(false);
      return;
    }
    // Toggle node detail
    if (selectedNode === id) {
      setSelectedNode(null);
    } else {
      setSelectedNode(id);
      setShockResults(null);
    }
  }, [shockMode, triggerShock, selectedNode]);

  // Node detail data
  const nodeDetail = useMemo((): NodeDetailData | null => {
    if (!selectedNode) return null;
    const stock = stocks.find(s => s.ticker === selectedNode);
    if (!stock) return null;
    const connections = regimeEdges.filter(e => e.source === selectedNode || e.target === selectedNode);
    const topCorrelated = connections
      .map(e => ({ ticker: e.source === selectedNode ? e.target : e.source, weight: e.weight }))
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
      .slice(0, 5);
    return {
      ticker: stock.ticker,
      company: stock.company,
      sector: stock.sector,
      sectorColor: sectorColor(stock.sector),
      goldenScore: stock.golden_score,
      isPlatinum: stock.is_platinum,
      tickets: {
        dip: stock.ticket_levels.dip_ticket,
        shock: stock.ticket_levels.shock_ticket,
        asymmetry: stock.ticket_levels.asymmetry_ticket,
        dislocation: stock.ticket_levels.dislocation_ticket,
        convexity: stock.ticket_levels.convexity_ticket,
      },
      technicals: stock.technicals ? {
        rsi: stock.technicals.rsi_14,
        macd: stock.technicals.macd_histogram,
        bbPctB: stock.technicals.bb_pct_b,
        zscore: stock.technicals.zscore_20d,
        vol: stock.technicals.realized_vol_20d,
      } : null,
      connectionCount: connections.length,
      topCorrelated,
      drawdown: stock.drawdown_current,
      volumePct: stock.volume_percentile,
      volPct: stock.volatility_percentile,
    };
  }, [selectedNode, stocks, regimeEdges]);

  // Search handler
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    const upper = q.toUpperCase();
    const match = stocks.find(s => s.ticker === upper);
    if (match) {
      setSearchHighlight(upper);
      setSelectedNode(upper);
      setShockResults(null);
    } else {
      setSearchHighlight(null);
    }
  }, [stocks]);

  // Build graph data
  const graphData = useMemo(() => {
    const nodes = stocks.map((s) => ({
      id: s.ticker,
      name: `${s.ticker} -- ${s.company}`,
      sector: s.sector,
      goldenScore: s.golden_score,
      isPlatinum: s.is_platinum,
      val: 2 + s.golden_score * 3,
      color: colorMode === 'sector' ? sectorColor(s.sector) : (TIER_COLORS[s.golden_score] ?? '#888'),
    }));
    const links = regimeEdges.map((e) => ({ source: e.source, target: e.target, weight: e.weight }));
    return { nodes, links };
  }, [stocks, regimeEdges, colorMode]);

  // Node color with shock animation
  const getNodeColor = useCallback((node: any) => {
    const id = node.id as string;
    // Search highlight
    if (searchHighlight === id) return ACCENT;
    // Shock animation
    if (shock.active && shock.affectedNodes.has(id)) {
      const { intensity, timestamp } = shock.affectedNodes.get(id)!;
      const elapsed = Date.now() - timestamp;
      if (elapsed >= 0 && elapsed < 5000) {
        const fade = Math.max(0, 1 - elapsed / 5000);
        const t = intensity * fade;
        const br = parseInt((node.color || '#888888').slice(1, 3), 16) || 136;
        const bg = parseInt((node.color || '#888888').slice(3, 5), 16) || 136;
        const bb = parseInt((node.color || '#888888').slice(5, 7), 16) || 136;
        return `rgb(${Math.round(255 * t + br * (1 - t))},${Math.round(215 * t + bg * (1 - t))},${Math.round(bb * (1 - t))})`;
      }
    }
    return node.color;
  }, [shock, searchHighlight]);

  // Platinum pulsing for ForceGraph3D
  const nodeThreeObject = useCallback((node: any) => {
    if (!node.isPlatinum) return undefined;
    try {
      const THREE = (window as any).__THREE_PLAYGROUND;
      if (!THREE) return undefined;
      const radius = 2 + (node.goldenScore ?? 0) * 3;
      const geometry = new THREE.SphereGeometry(radius, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(PLATINUM_COLOR), transparent: true, opacity: 0.85 });
      const mesh = new THREE.Mesh(geometry, material);
      (mesh as any).__platinumPulse = { material };
      return mesh;
    } catch { return undefined; }
  }, []);

  // Load THREE and run platinum pulse animation
  useEffect(() => {
    if (!forceGraphReady || fallbackMode) return;
    let running = true;
    (async () => { try { const THREE = await import('three'); (window as any).__THREE_PLAYGROUND = THREE; } catch {} })();
    const animate = () => {
      if (!running) return;
      if (graphRef.current) {
        const scene = graphRef.current.scene?.();
        if (scene) {
          const now = Date.now();
          scene.traverse((obj: any) => { if (obj.__platinumPulse) { obj.__platinumPulse.material.opacity = 0.6 + 0.4 * Math.sin(now * 0.004); } });
        }
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, [forceGraphReady, fallbackMode]);

  const showSidePanel = nodeDetail !== null || shockResults !== null;

  if (stocks.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#0a0a1e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontFamily: 'monospace', fontSize: 16 }}>
        Loading graph playground...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', background: '#0a0a1e', position: 'relative', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      {/* Full-screen graph */}
      {forceGraphReady && ForceGraph3DComponent && !fallbackMode ? (
        <ForceGraph3DComponent
          ref={graphRef}
          graphData={graphData}
          nodeLabel="name"
          nodeVal="val"
          nodeColor={getNodeColor}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          linkColor={(link: any) => (link.weight ?? 0) > 0 ? '#224466' : '#442222'}
          linkOpacity={0.15}
          linkWidth={0.3}
          onNodeClick={handleNodeClick}
          backgroundColor="#0a0a1e"
          showNavInfo={false}
        />
      ) : fallbackMode ? (
        <FallbackCanvasGraph
          nodes={graphData.nodes}
          links={graphData.links}
          shock={shock}
          searchHighlight={searchHighlight}
          onNodeClick={handleNodeClick}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontFamily: 'monospace' }}>
          Initializing 3D engine...
        </div>
      )}

      {/* ---- Top overlay controls ---- */}
      <div style={{ position: 'absolute', top: 16, left: 16, right: showSidePanel ? 340 : 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none', zIndex: 20, gap: 12 }}>

        {/* Left: Threshold + Stats + Color + Search */}
        <div style={{ background: PANEL_BG, backdropFilter: 'blur(8px)', borderRadius: 10, padding: '12px 16px', border: `1px solid ${BORDER_COLOR}`, pointerEvents: 'auto', minWidth: 240 }}>
          <div style={{ color: ACCENT, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
            Correlation Threshold
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range" min={0} max={1} step={0.05}
              value={correlationThreshold}
              onChange={(e) => setCorrelationThreshold(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: ACCENT }}
            />
            <span style={{ fontFamily: 'monospace', color: ACCENT, fontSize: 14, minWidth: 36, textAlign: 'right' }}>
              {correlationThreshold.toFixed(2)}
            </span>
          </div>

          {/* Network Stats */}
          <div style={{ fontSize: 10, color: '#666', marginTop: 6, lineHeight: 1.6 }}>
            <div>{networkStats.nodeCount} nodes | {networkStats.edgeCount} edges</div>
            <div>Avg connections: {networkStats.avgConnections.toFixed(1)} | Density: {(networkStats.density * 100).toFixed(2)}%</div>
          </div>

          {/* Color Mode */}
          <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
            {(['sector', 'golden'] as ColorMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setColorMode(mode)}
                style={{
                  flex: 1, background: colorMode === mode ? ACCENT : '#1e1e3a',
                  color: colorMode === mode ? '#000' : TEXT_COLOR,
                  border: `1px solid ${colorMode === mode ? ACCENT : BORDER_COLOR}`,
                  borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 10,
                  fontWeight: colorMode === mode ? 700 : 400, transition: 'all 0.2s',
                }}
              >
                {mode === 'sector' ? 'Sector' : 'Golden Score'}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search ticker..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            style={{
              width: '100%', marginTop: 8, background: '#1e1e3a',
              border: `1px solid ${searchHighlight ? ACCENT : BORDER_COLOR}`,
              borderRadius: 4, padding: '6px 8px', color: ACCENT,
              fontFamily: 'monospace', fontSize: 11, outline: 'none',
              boxSizing: 'border-box', transition: 'border-color 0.2s',
            }}
          />
        </div>

        {/* Center: Shock Propagation button */}
        <div style={{ background: PANEL_BG, backdropFilter: 'blur(8px)', borderRadius: 10, padding: '10px 16px', border: `1px solid ${BORDER_COLOR}`, pointerEvents: 'auto', textAlign: 'center' }}>
          {/* Crash / Spike toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {(['crash', 'spike'] as const).map(type => (
              <button
                key={type}
                onClick={() => setShockType(type)}
                style={{
                  flex: 1,
                  background: shockType === type ? (type === 'crash' ? '#FF4500' : '#00FF7F') : '#1e1e3a',
                  color: shockType === type ? '#000' : TEXT_COLOR,
                  border: `1px solid ${shockType === type ? (type === 'crash' ? '#FF4500' : '#00FF7F') : BORDER_COLOR}`,
                  borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 10,
                  fontWeight: shockType === type ? 700 : 400, transition: 'all 0.2s',
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}
              >
                {type}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShockMode(!shockMode)}
            style={{
              background: shockMode ? ACCENT : '#1e1e3a', color: shockMode ? '#000' : ACCENT,
              border: `1px solid ${ACCENT}`, borderRadius: 6, padding: '8px 18px',
              cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, transition: 'all 0.2s',
              width: '100%',
            }}
          >
            {shockMode ? 'Click a node to shock...' : 'Shock Propagation'}
          </button>
          {shock.active && (
            <div style={{ color: shockType === 'crash' ? '#FF4500' : '#00FF7F', fontSize: 10, marginTop: 4 }}>
              {shockType.toUpperCase()} from {shock.sourceNode} -- {shock.affectedNodes.size} nodes affected
            </div>
          )}
        </div>

        {/* Right: Regime Toggle */}
        <div style={{ background: PANEL_BG, backdropFilter: 'blur(8px)', borderRadius: 10, padding: '10px 16px', border: `1px solid ${BORDER_COLOR}`, pointerEvents: 'auto', display: 'flex', gap: 6 }}>
          {(['all', 'highVol', 'lowVol'] as Regime[]).map((r) => {
            const labels: Record<Regime, string> = { all: 'All', highVol: 'High Vol', lowVol: 'Low Vol' };
            const isActive = regime === r;
            return (
              <button
                key={r} onClick={() => setRegime(r)}
                style={{
                  background: isActive ? ACCENT : '#1e1e3a', color: isActive ? '#000' : TEXT_COLOR,
                  border: `1px solid ${isActive ? ACCENT : BORDER_COLOR}`, borderRadius: 6,
                  padding: '6px 14px', cursor: 'pointer', fontSize: 12,
                  fontWeight: isActive ? 700 : 400, transition: 'all 0.2s',
                }}
              >
                {labels[r]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Sector Legend (bottom left) ---- */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16, background: PANEL_BG,
        backdropFilter: 'blur(8px)', borderRadius: 10, padding: '8px 12px',
        border: `1px solid ${BORDER_COLOR}`, zIndex: 20,
        display: 'flex', flexWrap: 'wrap', gap: '4px 12px', maxWidth: '60vw',
        pointerEvents: 'none',
      }}>
        {SECTORS.map(s => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
            <span style={{ color: colorMode === 'sector' ? '#aaa' : '#555' }}>{s.name}</span>
          </div>
        ))}
      </div>

      {/* ---- Right Side Panel (Node Detail or Shock Results) ---- */}
      {showSidePanel && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 320, height: '100%',
          background: 'rgba(15,15,35,0.95)', backdropFilter: 'blur(12px)',
          borderLeft: `1px solid ${BORDER_COLOR}`, zIndex: 25,
          overflowY: 'auto', padding: '16px', boxSizing: 'border-box',
        }}>
          <button
            onClick={() => { setSelectedNode(null); setShockResults(null); }}
            style={{
              position: 'absolute', top: 8, right: 12, background: 'none',
              border: 'none', color: '#666', fontSize: 16, cursor: 'pointer', lineHeight: 1,
            }}
          >
            x
          </button>
          {shockResults ? (
            <ShockResultsPanel results={shockResults} />
          ) : nodeDetail ? (
            <NodeDetailPanel detail={nodeDetail} />
          ) : null}
        </div>
      )}

      {/* Shock mode cursor indicator */}
      {shockMode && (
        <div style={{ position: 'absolute', inset: 0, cursor: 'crosshair', pointerEvents: 'none', zIndex: 15, border: `3px solid ${ACCENT}44` }} />
      )}
    </div>
  );
}
