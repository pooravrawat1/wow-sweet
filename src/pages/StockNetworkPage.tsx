// ============================================================
// SweetReturns — StockNetworkPage: 3D stock correlation graph
// ============================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import { SECTORS, generateStockData, getCorrelationEdges } from '../data/stockData';
import type { StockData, GraphEdge } from '../types';

// Dynamic import holder for ForceGraph3D; loaded inside component useEffect
let ForceGraph3D: React.ComponentType<any> | null = null;

const PAGE_BG = '#1a1a2e';
const PANEL_BG = '#0f0f23';
const ACCENT = '#FFD700';
const TEXT_COLOR = '#e0e0e0';
const BORDER_COLOR = '#2a2a4a';

// ---- Pipeline step component ----
const PipelineStep: React.FC<{ label: string; last?: boolean }> = ({ label, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div
      style={{
        padding: '6px 12px',
        background: '#1e1e3a',
        border: `1px solid ${BORDER_COLOR}`,
        borderRadius: 6,
        color: ACCENT,
        fontSize: 12,
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </div>
    {!last && <span style={{ color: '#555', fontSize: 16 }}>&rarr;</span>}
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
        {/* Edges */}
        {edges.map((edge, idx) => {
          const s = positions.get(typeof edge.source === 'string' ? edge.source : '');
          const t = positions.get(typeof edge.target === 'string' ? edge.target : '');
          if (!s || !t) return null;
          const isHighlighted =
            highlightedNode &&
            (edge.source === highlightedNode || edge.target === highlightedNode);
          return (
            <line
              key={idx}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={isHighlighted ? ACCENT : '#333355'}
              strokeWidth={isHighlighted ? 1.5 : 0.3}
              strokeOpacity={isHighlighted ? 0.9 : 0.15}
            />
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
      const generated = generateStockData();
      setStocks(generated);
    }
  }, [stocks.length, setStocks]);

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
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: PAGE_BG, color: TEXT_COLOR, fontFamily: 'system-ui, sans-serif' }}>
      {/* ---- LEFT PANEL (30%) ---- */}
      <div
        style={{
          width: '30%',
          minWidth: 280,
          maxWidth: 400,
          background: PANEL_BG,
          borderRight: `1px solid ${BORDER_COLOR}`,
          overflowY: 'auto',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Model Pipeline */}
        <div>
          <h3 style={{ color: ACCENT, fontSize: 14, margin: '0 0 12px', letterSpacing: 1, textTransform: 'uppercase' }}>
            Model Pipeline
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <PipelineStep label="Kaggle CSV" />
            <PipelineStep label="Google Colab" />
            <PipelineStep label="Databricks" />
            <PipelineStep label="API" last />
          </div>
        </div>

        {/* Correlation Threshold */}
        <div>
          <h3 style={{ color: ACCENT, fontSize: 14, margin: '0 0 8px', letterSpacing: 1, textTransform: 'uppercase' }}>
            Correlation Threshold
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={correlationThreshold}
              onChange={(e) => setCorrelationThreshold(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: ACCENT }}
            />
            <span style={{ fontFamily: 'monospace', fontSize: 14, color: ACCENT, minWidth: 36, textAlign: 'right' }}>
              {correlationThreshold.toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            {filteredEdges.length} edges shown
          </div>
        </div>

        {/* Sector Filters */}
        <div>
          <h3 style={{ color: ACCENT, fontSize: 14, margin: '0 0 8px', letterSpacing: 1, textTransform: 'uppercase' }}>
            Sector Filters
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SECTORS.map((sector) => (
              <label
                key={sector.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  padding: '4px 0',
                  fontSize: 13,
                  color: selectedSectors.has(sector.name) ? TEXT_COLOR : '#555',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedSectors.has(sector.name)}
                  onChange={() => toggleSector(sector.name)}
                  style={{ accentColor: sector.color }}
                />
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: sector.color,
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                {sector.name}
              </label>
            ))}
          </div>
        </div>

        {/* Highlighted node info */}
        {highlightedNode && (
          <div
            style={{
              padding: 12,
              background: '#1e1e3a',
              borderRadius: 8,
              border: `1px solid ${ACCENT}44`,
            }}
          >
            <div style={{ fontSize: 14, color: ACCENT, fontWeight: 700, marginBottom: 4 }}>
              {highlightedNode}
            </div>
            <div style={{ fontSize: 12, color: '#aaa' }}>
              {highlightLinks.size - 1} connections above threshold
            </div>
          </div>
        )}
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
