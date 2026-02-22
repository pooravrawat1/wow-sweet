// ============================================================
// SweetReturns — StockNetworkPage: 3D stock correlation graph
// ============================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import { SECTORS, generateStockData, getCorrelationEdges, loadPipelineData } from '../data/stockData';
import type { StockData, GraphEdge } from '../types';

// Dynamic import holder for ForceGraph3D; loaded inside component useEffect
let ForceGraph3D: React.ComponentType<any> | null = null;

const PAGE_BG = '#1a1a2e';
const PANEL_BG = '#0f0f23';
const ACCENT = '#FFD700';
const TEXT_COLOR = '#e0e0e0';
const BORDER_COLOR = '#2a2a4a';

// ---- Pipeline step component ----
const PIPELINE_ICONS: Record<string, string> = {
  'Kaggle CSV': '📊',
  'Google Colab': '🧪',
  'Databricks': '⚡',
  'API': '🔗',
};

const PipelineStep: React.FC<{ label: string; index: number; last?: boolean }> = ({ label, index, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: `linear-gradient(135deg, #1e1e3a, #16162e)`,
        border: `1px solid ${BORDER_COLOR}`,
        borderRadius: 8,
        color: TEXT_COLOR,
        fontSize: 12,
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      <span style={{ fontSize: 14 }}>{PIPELINE_ICONS[label] ?? '📦'}</span>
      <div>
        <div style={{ color: '#888', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>
          Step {index + 1}
        </div>
        <div style={{ color: ACCENT, fontWeight: 600 }}>{label}</div>
      </div>
    </div>
    {!last && (
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
        <svg width="20" height="12" viewBox="0 0 20 12">
          <defs>
            <linearGradient id={`arrow-grad-${index}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0.7} />
            </linearGradient>
          </defs>
          <path d="M0 6 L14 6 M10 2 L16 6 L10 10" stroke={`url(#arrow-grad-${index})`} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )}
  </div>
);

// ---- Sector color lookup ----
function sectorColor(sectorName: string): string {
  return SECTORS.find((s) => s.name === sectorName)?.color ?? '#888888';
}

// ---- D3 fallback SVG graph ----
const D3FallbackGraph: React.FC<{
  stocks: StockData[];
  edges: GraphEdge[];
  highlightedNode: string | null;
  onNodeClick: (id: string) => void;
}> = ({ stocks, edges, highlightedNode, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    // Simple force-like placement using a grid + jitter
    const cols = Math.ceil(Math.sqrt(stocks.length));
    const spacing = 18;
    const posMap = new Map<string, { x: number; y: number }>();
    stocks.forEach((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      posMap.set(s.ticker, {
        x: 60 + col * spacing + (Math.sin(i * 0.7) * 4),
        y: 60 + row * spacing + (Math.cos(i * 0.5) * 4),
      });
    });
    setPositions(posMap);
  }, [stocks]);

  const highlightedEdges = useMemo(() => {
    if (!highlightedNode) return new Set<string>();
    const set = new Set<string>();
    edges.forEach((e) => {
      if (e.source === highlightedNode || e.target === highlightedNode) {
        set.add(e.source);
        set.add(e.target);
      }
    });
    return set;
  }, [edges, highlightedNode]);

  const svgWidth = Math.ceil(Math.sqrt(stocks.length)) * 18 + 120;
  const svgHeight = Math.ceil(stocks.length / Math.ceil(Math.sqrt(stocks.length))) * 18 + 120;

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
      <svg
        ref={svgRef}
        width={svgWidth}
        height={svgHeight}
        style={{ background: '#0a0a1e', display: 'block', margin: '0 auto' }}
      >
        {/* Edges — interlocked candy cane pairs */}
        {edges.map((edge, idx) => {
          const s = positions.get(typeof edge.source === 'string' ? edge.source : '');
          const t = positions.get(typeof edge.target === 'string' ? edge.target : '');
          if (!s || !t) return null;
          const isHighlighted =
            highlightedNode &&
            (edge.source === highlightedNode || edge.target === highlightedNode);

          // Direction & perpendicular
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len;  // perpendicular
          const ny = dx / len;
          const hookR = Math.min(len * 0.15, 10);

          // Hook origins near midpoint
          const mx = (s.x + t.x) / 2;
          const my = (s.y + t.y) / 2;
          const hax = mx - (dx / len) * hookR * 0.35;
          const hay = my - (dy / len) * hookR * 0.35;
          const hbx = mx + (dx / len) * hookR * 0.35;
          const hby = my + (dy / len) * hookR * 0.35;

          // Cane A: source → hookA, J-hook curls in +perp direction
          const hookEndAx = hax + (dx / len) * hookR * 0.7 + nx * hookR * 0.7;
          const hookEndAy = hay + (dy / len) * hookR * 0.7 + ny * hookR * 0.7;
          const pathA = `M ${s.x} ${s.y} L ${hax} ${hay} Q ${hax + nx * hookR} ${hay + ny * hookR} ${hookEndAx} ${hookEndAy}`;

          // Cane B: target → hookB, J-hook curls in -perp direction (interlocked)
          const hookEndBx = hbx - (dx / len) * hookR * 0.7 - nx * hookR * 0.7;
          const hookEndBy = hby - (dy / len) * hookR * 0.7 - ny * hookR * 0.7;
          const pathB = `M ${t.x} ${t.y} L ${hbx} ${hby} Q ${hbx - nx * hookR} ${hby - ny * hookR} ${hookEndBx} ${hookEndBy}`;

          const baseOpacity = isHighlighted ? 0.9 : 0.15;
          const width = isHighlighted ? 1.8 : 0.6;
          const stripeColor = isHighlighted ? ACCENT : '#cc3333';

          return (
            <g key={idx}>
              {/* White base layer */}
              <path d={pathA} stroke="#ffffff" strokeWidth={width + 0.4} fill="none" strokeOpacity={baseOpacity} strokeLinecap="round" />
              <path d={pathB} stroke="#ffffff" strokeWidth={width + 0.4} fill="none" strokeOpacity={baseOpacity} strokeLinecap="round" />
              {/* Red/gold stripe layer (dashed for candy cane effect) */}
              <path d={pathA} stroke={stripeColor} strokeWidth={width} fill="none" strokeDasharray="3,3" strokeOpacity={baseOpacity} strokeLinecap="round" />
              <path d={pathB} stroke={stripeColor} strokeWidth={width} fill="none" strokeDasharray="3,3" strokeOpacity={baseOpacity * 0.9} strokeLinecap="round" />
            </g>
          );
        })}
        {/* Nodes */}
        {stocks.map((stock) => {
          const pos = positions.get(stock.ticker);
          if (!pos) return null;
          const isHL = highlightedNode === stock.ticker || highlightedEdges.has(stock.ticker);
          const r = 2 + stock.golden_score * 1.5;
          return (
            <g key={stock.ticker} onClick={() => onNodeClick(stock.ticker)} style={{ cursor: 'pointer' }}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={sectorColor(stock.sector)}
                stroke={isHL ? ACCENT : 'none'}
                strokeWidth={isHL ? 2 : 0}
                opacity={highlightedNode && !isHL ? 0.2 : 1}
              />
              {r > 4 && (
                <text
                  x={pos.x}
                  y={pos.y + r + 10}
                  textAnchor="middle"
                  fontSize={7}
                  fill={TEXT_COLOR}
                  opacity={0.7}
                >
                  {stock.ticker}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ---- Main page ----
export default function StockNetworkPage() {
  const stocks = useStore((s) => s.stocks);
  const setStocks = useStore((s) => s.setStocks);
  const correlationThreshold = useStore((s) => s.correlationThreshold);
  const setCorrelationThreshold = useStore((s) => s.setCorrelationThreshold);
  const correlationEdges = useStore((s) => s.correlationEdges);
  const setCorrelationEdges = useStore((s) => s.setCorrelationEdges);

  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(
    () => new Set(SECTORS.map((s) => s.name)),
  );
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [forceGraphAvailable, setForceGraphAvailable] = useState<boolean>(ForceGraph3D !== null);

  // Initialize stocks if empty
  useEffect(() => {
    if (stocks.length === 0) {
      loadPipelineData()
        .then(({ stocks: s, edges }) => {
          setStocks(s);
          setCorrelationEdges(edges);
        })
        .catch(() => setStocks(generateStockData()));
    }
  }, [stocks.length, setStocks, setCorrelationEdges]);

  // Recompute edges when threshold changes
  useEffect(() => {
    if (stocks.length > 0) {
      const edges = getCorrelationEdges(stocks, correlationThreshold);
      setCorrelationEdges(edges);
    }
  }, [stocks, correlationThreshold, setCorrelationEdges]);

  // Filtered stocks by selected sectors
  const filteredStocks = useMemo(
    () => stocks.filter((s) => selectedSectors.has(s.sector)),
    [stocks, selectedSectors],
  );

  // Filtered edges (both endpoints must be in filteredStocks)
  const filteredTickers = useMemo(() => new Set(filteredStocks.map((s) => s.ticker)), [filteredStocks]);
  const filteredEdges = useMemo(
    () =>
      correlationEdges.filter(
        (e) => filteredTickers.has(e.source) && filteredTickers.has(e.target),
      ),
    [correlationEdges, filteredTickers],
  );

  // Graph data for ForceGraph3D
  const graphData = useMemo(() => {
    const nodes = filteredStocks.map((s) => ({
      id: s.ticker,
      name: `${s.ticker} — ${s.company}`,
      sector: s.sector,
      goldenScore: s.golden_score,
      isPlatinum: s.is_platinum,
      val: 2 + s.golden_score * 3,
      color: sectorColor(s.sector),
    }));
    const links = filteredEdges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));
    return { nodes, links };
  }, [filteredStocks, filteredEdges]);

  const toggleSector = useCallback((name: string) => {
    setSelectedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const handleNodeClick = useCallback((nodeOrId: any) => {
    const id = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId?.id;
    setHighlightedNode((prev) => (prev === id ? null : id));
  }, []);

  // Highlighted links / neighbors
  const highlightLinks = useMemo(() => {
    if (!highlightedNode) return new Set<string>();
    const set = new Set<string>();
    filteredEdges.forEach((e) => {
      if (e.source === highlightedNode || e.target === highlightedNode) {
        set.add(e.source);
        set.add(e.target);
      }
    });
    return set;
  }, [filteredEdges, highlightedNode]);

  // Dynamic ForceGraph3D import attempt (for code-split scenario)
  useEffect(() => {
    if (!ForceGraph3D) {
      import('react-force-graph-3d')
        .then((mod) => {
          ForceGraph3D = mod.default;
          setForceGraphAvailable(true);
        })
        .catch(() => {
          setForceGraphAvailable(false);
        });
    }
  }, []);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: PAGE_BG, color: TEXT_COLOR, fontFamily: 'system-ui, sans-serif' }}>
      {/* ---- LEFT PANEL ---- */}
      <style>{`
        .snp-panel::-webkit-scrollbar { width: 4px; }
        .snp-panel::-webkit-scrollbar-track { background: transparent; }
        .snp-panel::-webkit-scrollbar-thumb { background: ${BORDER_COLOR}; border-radius: 2px; }
        .snp-panel::-webkit-scrollbar-thumb:hover { background: ${ACCENT}44; }
        .snp-sector-row:hover { background: rgba(255,215,0,0.04); }
        .snp-toggle-btn:hover { color: ${ACCENT} !important; }
      `}</style>
      <div
        className="snp-panel"
        style={{
          width: 'clamp(240px, 25vw, 400px)' as any,
          minWidth: 240,
          flexShrink: 0,
          background: PANEL_BG,
          borderRight: `1px solid ${BORDER_COLOR}`,
          overflowY: 'auto',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {/* Panel Header */}
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: `1px solid ${BORDER_COLOR}`,
          background: 'linear-gradient(180deg, #141430 0%, #0f0f23 100%)',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: ACCENT, letterSpacing: 0.5 }}>
            Stock Network
          </h2>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            {filteredStocks.length} stocks &middot; {filteredEdges.length} correlations
          </div>
        </div>

        {/* Model Pipeline */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER_COLOR}` }}>
          <h3 style={{ color: '#ccc', fontSize: 11, margin: '0 0 12px', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>
            Data Pipeline
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            <PipelineStep label="Kaggle CSV" index={0} />
            <PipelineStep label="Google Colab" index={1} />
            <PipelineStep label="Databricks" index={2} />
            <PipelineStep label="API" index={3} last />
          </div>
        </div>

        {/* Correlation Threshold */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER_COLOR}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ color: '#ccc', fontSize: 11, margin: 0, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>
              Correlation Threshold
            </h3>
            <span style={{
              fontFamily: 'monospace',
              fontSize: 13,
              color: ACCENT,
              background: '#1e1e3a',
              padding: '2px 8px',
              borderRadius: 4,
              border: `1px solid ${BORDER_COLOR}`,
              fontWeight: 700,
            }}>
              {correlationThreshold.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={correlationThreshold}
            onChange={(e) => setCorrelationThreshold(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: ACCENT, height: 4 }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            color: '#666',
            marginTop: 4,
            fontFamily: 'monospace',
          }}>
            <span>0.00</span>
            <span style={{ color: '#aaa' }}>{filteredEdges.length} edges</span>
            <span>1.00</span>
          </div>
        </div>

        {/* Sector Filters */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER_COLOR}`, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ color: '#ccc', fontSize: 11, margin: 0, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>
              Sectors
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="snp-toggle-btn"
                onClick={() => setSelectedSectors(new Set(SECTORS.map((s) => s.name)))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: 10,
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  transition: 'color 0.15s',
                }}
              >
                All
              </button>
              <span style={{ color: '#444' }}>|</span>
              <button
                className="snp-toggle-btn"
                onClick={() => setSelectedSectors(new Set())}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: 10,
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  transition: 'color 0.15s',
                }}
              >
                None
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {SECTORS.map((sector) => {
              const active = selectedSectors.has(sector.name);
              const count = stocks.filter(s => s.sector === sector.name).length;
              return (
                <label
                  key={sector.name}
                  className="snp-sector-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    padding: '6px 8px',
                    fontSize: 12,
                    color: active ? TEXT_COLOR : '#555',
                    borderRadius: 6,
                    transition: 'color 0.15s, background 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleSector(sector.name)}
                    style={{ accentColor: sector.color, margin: 0 }}
                  />
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: active ? sector.color : `${sector.color}44`,
                      display: 'inline-block',
                      flexShrink: 0,
                      transition: 'background 0.15s',
                      boxShadow: active ? `0 0 6px ${sector.color}44` : 'none',
                    }}
                  />
                  <span style={{ flex: 1 }}>{sector.name}</span>
                  <span style={{ fontSize: 10, color: '#666', fontFamily: 'monospace' }}>{count}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Highlighted node info */}
        {highlightedNode && (() => {
          const stock = stocks.find(s => s.ticker === highlightedNode);
          const connCount = highlightLinks.size - 1;
          return (
            <div style={{ padding: '16px 20px' }}>
              <div
                style={{
                  padding: 14,
                  background: 'linear-gradient(135deg, #1e1e3a, #1a1a35)',
                  borderRadius: 10,
                  border: `1px solid ${ACCENT}33`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: stock ? sectorColor(stock.sector) : '#888',
                    boxShadow: `0 0 8px ${stock ? sectorColor(stock.sector) : '#888'}66`,
                  }} />
                  <span style={{ fontSize: 15, color: ACCENT, fontWeight: 700 }}>
                    {highlightedNode}
                  </span>
                </div>
                {stock && (
                  <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>
                    {stock.company}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: 'monospace' }}>
                  <div>
                    <span style={{ color: '#666' }}>Connections </span>
                    <span style={{ color: TEXT_COLOR }}>{connCount}</span>
                  </div>
                  {stock && (
                    <>
                      <div>
                        <span style={{ color: '#666' }}>Score </span>
                        <span style={{ color: stock.golden_score >= 3 ? ACCENT : TEXT_COLOR }}>
                          {stock.golden_score}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#666' }}>Sector </span>
                        <span style={{ color: sectorColor(stock.sector) }}>{stock.sector}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ---- MAIN GRAPH AREA (70%) ---- */}
      <div style={{ flex: 1, position: 'relative', background: '#0a0a1e' }}>
        {stocks.length === 0 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#555',
              fontSize: 16,
              fontFamily: 'monospace',
            }}
          >
            Loading stock network...
          </div>
        ) : forceGraphAvailable && ForceGraph3D ? (
          <ForceGraph3D
            graphData={graphData}
            nodeLabel="name"
            nodeVal="val"
            nodeColor={(node: any) => {
              if (highlightedNode && node.id !== highlightedNode && !highlightLinks.has(node.id)) {
                return '#222233';
              }
              return node.color;
            }}
            nodeOpacity={1}
            linkColor={(link: any) => {
              const src = typeof link.source === 'object' ? link.source.id : link.source;
              const tgt = typeof link.target === 'object' ? link.target.id : link.target;
              if (highlightedNode && (src === highlightedNode || tgt === highlightedNode)) {
                return ACCENT;
              }
              return '#333355';
            }}
            linkOpacity={0.2}
            linkWidth={(link: any) => {
              const src = typeof link.source === 'object' ? link.source.id : link.source;
              const tgt = typeof link.target === 'object' ? link.target.id : link.target;
              if (highlightedNode && (src === highlightedNode || tgt === highlightedNode)) {
                return 2;
              }
              return 0.3;
            }}
            onNodeClick={handleNodeClick}
            backgroundColor="#0a0a1e"
            width={undefined}
            height={undefined}
          />
        ) : (
          <D3FallbackGraph
            stocks={filteredStocks}
            edges={filteredEdges}
            highlightedNode={highlightedNode}
            onNodeClick={handleNodeClick}
          />
        )}
      </div>
    </div>
  );
}
