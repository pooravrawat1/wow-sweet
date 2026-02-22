// ============================================================
// SweetReturns — AgentReactionsPage: Real simulation data
//   Whale leaderboard, agent heatmap, store pressure, decision stream
// ============================================================

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { useStore } from '../store/useStore';
import { generateStockData, loadPipelineData, SECTORS } from '../data/stockData';
import { getWhales, type WhaleFund } from '../services/whaleArena';
import { getFeaturedAgents, getLatestChain, type FeaturedAgent, type ReasoningChain } from '../services/geminiService';
import { loadSimulationHistory, getSimulationStats, type SimulationStats } from '../services/tradeTracker';
import { WHALE_ICONS } from '../components/CandyIcons';
import type { StockData } from '../types';

const PAGE_BG = '#FFF8DC';
const PANEL_BG = 'rgba(255,255,255,0.7)';
const ACCENT = '#6a00aa';
const TEXT_COLOR = '#2d1a00';
const BORDER_COLOR = 'rgba(106,0,170,0.18)';
const FONT = `'Leckerli One', cursive`;

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
// Whale + Agent Leaderboard (left column)
// ============================================================
const Leaderboard: React.FC<{
  whales: WhaleFund[];
  featuredAgents: FeaturedAgent[];
  simStats: SimulationStats;
}> = ({ whales, featuredAgents, simStats }) => {
  const sorted = [...whales].sort((a, b) => b.totalProfit - a.totalProfit);
  const activeAgents = featuredAgents.filter(
    (a) => a.decision && Date.now() - a.lastUpdated < 30000,
  );

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
      {/* Whale Rankings */}
      <h3
        style={{
          color: ACCENT,
          fontSize: 13,
          margin: '0 0 10px',
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        Whale Arena
      </h3>
      {sorted.map((whale, rank) => (
        <div
          key={whale.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 4px',
            borderBottom: `1px solid ${BORDER_COLOR}`,
            fontSize: 12,
          }}
        >
          <span
            style={{
              color: rank === 0 ? ACCENT : rank === 1 ? '#C0C0C0' : '#666',
              fontWeight: rank < 2 ? 700 : 400,
              minWidth: 20,
              textAlign: 'right',
              fontSize: 12,
            }}
          >
            #{rank + 1}
          </span>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: whale.color,
              boxShadow: `0 0 6px ${whale.color}66`,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: whale.color,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {WHALE_ICONS[whale.id] || whale.icon} {whale.name}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
              {whale.strategy} | {whale.allocations.length} pos | {whale.tradeCount} trades
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "'Leckerli One', cursive",
                color: whale.totalProfit >= 0 ? '#00FF7F' : '#FF4500',
              }}
            >
              {whale.totalProfit >= 0 ? '+' : ''}
              {whale.totalProfit.toFixed(0)}
            </div>
          </div>
        </div>
      ))}

      {/* Wonka reasoning */}
      {sorted[0]?.reasoning && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 8px',
            background: 'rgba(255, 215, 0, 0.06)',
            borderRadius: 6,
            border: '1px solid rgba(255, 215, 0, 0.1)',
          }}
        >
          <div style={{ fontSize: 9, color: '#FFD700', fontWeight: 600, marginBottom: 2 }}>
            AI REASONING
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', lineHeight: 1.3 }}>
            {sorted[0].reasoning}
          </div>
        </div>
      )}

      {/* Featured AI Agents */}
      {activeAgents.length > 0 && (
        <>
          <h3
            style={{
              color: '#00BFFF',
              fontSize: 11,
              margin: '14px 0 8px',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Featured AI Agents
          </h3>
          {activeAgents.slice(0, 10).map((agent) => (
            <div
              key={agent.index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 4px',
                borderBottom: `1px solid ${BORDER_COLOR}`,
                fontSize: 11,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: ACCENT, fontSize: 10 }}>
                  {agent.name}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    color:
                      agent.decision?.action === 'BUY' || agent.decision?.action === 'CALL'
                        ? '#00FF7F'
                        : '#FF4500',
                    fontWeight: 600,
                    fontSize: 10,
                  }}
                >
                  {agent.decision?.action}
                </span>
                <span style={{ color: '#888', fontSize: 9, marginLeft: 4 }}>
                  {agent.decision?.targetTicker}
                </span>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Simulation Intelligence — historical performance from Databricks */}
      {simStats.isLoaded && simStats.topTickers.length > 0 && (
        <>
          <h3
            style={{
              color: '#FFD700',
              fontSize: 11,
              margin: '14px 0 8px',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Simulation Intelligence
          </h3>
          <div
            style={{
              padding: '4px 6px',
              background: 'rgba(255, 215, 0, 0.06)',
              borderRadius: 4,
              marginBottom: 6,
              border: '1px solid rgba(255, 215, 0, 0.1)',
            }}
          >
            <div style={{ fontSize: 9, color: '#FFD700' }}>
              {simStats.cycleCount} tickers analyzed across simulation cycles
            </div>
          </div>
          {simStats.topTickers.slice(0, 6).map((tp) => (
            <div
              key={tp.ticker}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '3px 4px',
                borderBottom: `1px solid ${BORDER_COLOR}`,
                fontSize: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#FFD700', fontWeight: 600 }}>{tp.ticker}</span>
                <span
                  style={{
                    color: tp.bestAction === 'BUY' || tp.bestAction === 'CALL' ? '#00FF7F' : '#FF4500',
                    fontSize: 9,
                    fontWeight: 600,
                  }}
                >
                  {tp.bestAction}
                </span>
              </div>
              <div style={{ textAlign: 'right', fontSize: 9 }}>
                <span style={{ color: tp.avgProfit >= 0 ? '#00FF7F' : '#FF4500' }}>
                  {tp.avgProfit >= 0 ? '+' : ''}{tp.avgProfit.toFixed(0)}
                </span>
                <span style={{ color: '#666', marginLeft: 3 }}>
                  ({tp.tradeCount} trades)
                </span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

// ============================================================
// Agent Heatmap (center, D3 treemap) — real store counts
// ============================================================

// Heat color: blue (cold) -> yellow (warm) -> red (hot)
function heatColor(t: number): string {
  // t in [0, 1]
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= 0.5) {
    // blue -> yellow
    const s = clamped * 2; // 0..1
    const r = Math.round(s * 255);
    const g = Math.round(s * 255);
    const b = Math.round(255 * (1 - s));
    return `rgb(${r},${g},${b})`;
  } else {
    // yellow -> red
    const s = (clamped - 0.5) * 2; // 0..1
    const r = 255;
    const g = Math.round(255 * (1 - s));
    const b = 0;
    return `rgb(${r},${g},${b})`;
  }
}

interface TreemapStockNode {
  ticker: string;
  sector: string;
  company: string;
  index: number;
  agentCount: number;
  inside: number;
  door: number;
  lanes: { BUY: number; CALL: number; PUT: number; SHORT: number };
}

interface TooltipData {
  ticker: string;
  sector: string;
  company: string;
  total: number;
  inside: number;
  door: number;
  lanes: { BUY: number; CALL: number; PUT: number; SHORT: number };
  x: number;
  y: number;
}

const AgentHeatmap: React.FC<{
  stocks: StockData[];
  storeAgentCounts: Int16Array;
  storeDoorCounts: Int16Array;
  storeLaneCounts: Int16Array;
}> = ({ stocks, storeAgentCounts, storeDoorCounts, storeLaneCounts }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // ResizeObserver for responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build the treemap layout data
  const treemapNodes = useMemo(() => {
    if (stocks.length === 0) return null;

    // Build per-stock data with agent counts
    const stockNodes: TreemapStockNode[] = stocks.map((stock, i) => {
      const inside = i < storeAgentCounts.length ? storeAgentCounts[i] : 0;
      const door = i < storeDoorCounts.length ? storeDoorCounts[i] : 0;
      const hasLanes = storeLaneCounts.length > i * 4 + 3;
      return {
        ticker: stock.ticker,
        sector: stock.sector,
        company: stock.company,
        index: i,
        agentCount: inside + door,
        inside,
        door,
        lanes: {
          BUY: hasLanes ? storeLaneCounts[i * 4] : 0,
          CALL: hasLanes ? storeLaneCounts[i * 4 + 1] : 0,
          PUT: hasLanes ? storeLaneCounts[i * 4 + 2] : 0,
          SHORT: hasLanes ? storeLaneCounts[i * 4 + 3] : 0,
        },
      };
    });

    // Group by sector
    const sectorMap = new Map<string, TreemapStockNode[]>();
    for (const node of stockNodes) {
      const arr = sectorMap.get(node.sector) || [];
      arr.push(node);
      sectorMap.set(node.sector, arr);
    }

    // Build hierarchy data: root -> sectors -> stocks
    const hierarchyData = {
      name: 'root',
      children: Array.from(sectorMap.entries()).map(([sector, children]) => ({
        name: sector,
        children: children.map((child) => ({
          name: child.ticker,
          value: Math.max(child.agentCount, 1), // minimum 1 so every stock gets a cell
          data: child,
        })),
      })),
    };

    // Create treemap layout
    const root = d3
      .hierarchy(hierarchyData)
      .sum((d: any) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.treemap<any>()
      .size([dimensions.width, dimensions.height])
      .paddingOuter(3)
      .paddingTop(16)
      .paddingInner(1)
      .round(true)(root);

    return root;
  }, [stocks, storeAgentCounts, storeDoorCounts, storeLaneCounts, dimensions]);

  // Max agent count for normalization
  const maxCount = useMemo(() => {
    let max = 1;
    for (let i = 0; i < stocks.length; i++) {
      const total =
        (i < storeAgentCounts.length ? storeAgentCounts[i] : 0) +
        (i < storeDoorCounts.length ? storeDoorCounts[i] : 0);
      if (total > max) max = total;
    }
    return max;
  }, [stocks, storeAgentCounts, storeDoorCounts]);

  const handleMouseEnter = useCallback(
    (node: any, e: React.MouseEvent) => {
      const data = node.data?.data as TreemapStockNode | undefined;
      if (!data) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({
        ticker: data.ticker,
        sector: data.sector,
        company: data.company,
        total: data.agentCount,
        inside: data.inside,
        door: data.door,
        lanes: data.lanes,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!tooltip) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip((prev) =>
        prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null,
      );
    },
    [tooltip],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Collect leaf nodes (stocks) and sector group nodes
  const leaves = treemapNodes?.leaves() ?? [];
  const sectorGroups = treemapNodes?.children ?? [];

  const laneColors: Record<string, string> = {
    BUY: '#00ff7f',
    CALL: '#00bfff',
    PUT: '#ff8c00',
    SHORT: '#ff4444',
  };

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
          flexShrink: 0,
        }}
      >
        Agent Heatmap (Live)
      </h3>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          borderRadius: 4,
          overflow: 'hidden',
          background: '#0a0a1e',
          minHeight: 0,
        }}
      >
        {/* Sector group labels */}
        {sectorGroups.map((sectorNode: any) => {
          const sectorColor =
            SECTORS.find((s) => s.name === sectorNode.data.name)?.color ?? '#666';
          const w = sectorNode.x1 - sectorNode.x0;
          const h = sectorNode.y1 - sectorNode.y0;
          if (w < 2 || h < 2) return null;
          return (
            <div
              key={`sector-${sectorNode.data.name}`}
              style={{
                position: 'absolute',
                left: sectorNode.x0,
                top: sectorNode.y0,
                width: w,
                height: Math.min(15, h),
                fontSize: 9,
                fontWeight: 700,
                fontFamily: "'Leckerli One', cursive",
                color: sectorColor,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                padding: '1px 3px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: '14px',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              {sectorNode.data.name}
            </div>
          );
        })}

        {/* Stock cells */}
        {leaves.map((leaf: any) => {
          const data = leaf.data?.data as TreemapStockNode | undefined;
          if (!data) return null;
          const w = leaf.x1 - leaf.x0;
          const h = leaf.y1 - leaf.y0;
          if (w < 1 || h < 1) return null;

          const t = maxCount > 0 ? data.agentCount / maxCount : 0;
          const bg = heatColor(t);
          const showLabel = w > 28 && h > 14;
          const showCount = w > 20 && h > 24;
          // Text contrast: dark text on bright yellows, light text on blue/red extremes
          const textColor = t > 0.25 && t < 0.75 ? '#000' : '#fff';

          return (
            <div
              key={data.ticker}
              onMouseEnter={(e) => handleMouseEnter(leaf, e)}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={{
                position: 'absolute',
                left: leaf.x0,
                top: leaf.y0,
                width: w,
                height: h,
                background: bg,
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'opacity 0.1s',
                zIndex: 1,
              }}
            >
              {showLabel && (
                <div
                  style={{
                    fontSize: Math.min(w * 0.3, 10),
                    fontWeight: 700,
                    fontFamily: "'Leckerli One', cursive",
                    color: textColor,
                    lineHeight: 1,
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    maxWidth: w - 2,
                    textAlign: 'center',
                  }}
                >
                  {data.ticker}
                </div>
              )}
              {showCount && (
                <div
                  style={{
                    fontSize: Math.min(w * 0.22, 8),
                    fontFamily: "'Leckerli One', cursive",
                    color: textColor,
                    opacity: 0.8,
                    lineHeight: 1,
                    marginTop: 1,
                  }}
                >
                  {data.agentCount}
                </div>
              )}
            </div>
          );
        })}

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(tooltip.x + 12, dimensions.width - 180),
              top: Math.min(tooltip.y + 12, dimensions.height - 140),
              background: 'rgba(10, 10, 30, 0.95)',
              border: `1px solid ${ACCENT}66`,
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 11,
              fontFamily: "'Leckerli One', cursive",
              color: TEXT_COLOR,
              pointerEvents: 'none',
              zIndex: 10,
              minWidth: 150,
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ color: ACCENT, fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
              {tooltip.ticker}
            </div>
            <div style={{ color: '#888', fontSize: 10, marginBottom: 4 }}>
              {tooltip.company}
            </div>
            <div style={{ color: '#aaa', fontSize: 9, marginBottom: 6 }}>
              {tooltip.sector}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 2,
                color: TEXT_COLOR,
              }}
            >
              <span>Total agents</span>
              <span style={{ fontWeight: 700 }}>{tooltip.total}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: '#00FF7F',
                fontSize: 10,
              }}
            >
              <span>Inside</span>
              <span>{tooltip.inside}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: '#FF69B4',
                fontSize: 10,
              }}
            >
              <span>Door fighting</span>
              <span>{tooltip.door}</span>
            </div>
            <div
              style={{ height: 1, background: BORDER_COLOR, margin: '4px 0' }}
            />
            {Object.entries(tooltip.lanes).map(([lane, count]) => (
              <div
                key={lane}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: laneColors[lane] || '#bbb',
                  fontSize: 10,
                }}
              >
                <span>{lane}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Store Pressure Map (right column) — real counts
// ============================================================
const StorePressureMap: React.FC<{
  stocks: StockData[];
  storeAgentCounts: Int16Array;
  storeDoorCounts: Int16Array;
  storeLaneCounts: Int16Array;
}> = ({ stocks, storeAgentCounts, storeDoorCounts, storeLaneCounts }) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const maxCount = useMemo(() => {
    let max = 1;
    for (let i = 0; i < stocks.length; i++) {
      const total =
        (i < storeAgentCounts.length ? storeAgentCounts[i] : 0) +
        (i < storeDoorCounts.length ? storeDoorCounts[i] : 0);
      if (total > max) max = total;
    }
    return max;
  }, [stocks, storeAgentCounts, storeDoorCounts]);

  const breakdown = useMemo(() => {
    if (selectedIdx === null || selectedIdx >= stocks.length) return null;
    const inside = selectedIdx < storeAgentCounts.length ? storeAgentCounts[selectedIdx] : 0;
    const door = selectedIdx < storeDoorCounts.length ? storeDoorCounts[selectedIdx] : 0;
    const hasLanes = storeLaneCounts.length > selectedIdx * 4 + 3;
    return {
      ticker: stocks[selectedIdx].ticker,
      inside,
      door,
      total: inside + door,
      lanes: {
        BUY: hasLanes ? storeLaneCounts[selectedIdx * 4] : 0,
        CALL: hasLanes ? storeLaneCounts[selectedIdx * 4 + 1] : 0,
        PUT: hasLanes ? storeLaneCounts[selectedIdx * 4 + 2] : 0,
        SHORT: hasLanes ? storeLaneCounts[selectedIdx * 4 + 3] : 0,
      },
    };
  }, [selectedIdx, stocks, storeAgentCounts, storeDoorCounts, storeLaneCounts]);

  const laneColors: Record<string, string> = {
    BUY: '#00ff7f',
    CALL: '#00bfff',
    PUT: '#ff8c00',
    SHORT: '#ff4444',
  };

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
        Store Pressure (Live)
      </h3>

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
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#FF69B4', fontSize: 11 }}>
            <span>Door fighting</span>
            <span style={{ fontFamily: "'Leckerli One', cursive" }}>{breakdown.door}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#00FF7F', fontSize: 11 }}>
            <span>Inside</span>
            <span style={{ fontFamily: "'Leckerli One', cursive" }}>{breakdown.inside}</span>
          </div>
          <div style={{ height: 1, background: BORDER_COLOR, margin: '4px 0' }} />
          {Object.entries(breakdown.lanes).map(([lane, count]) => (
            <div
              key={lane}
              style={{ display: 'flex', justifyContent: 'space-between', color: laneColors[lane] || '#bbb', fontSize: 10 }}
            >
              <span>{lane}</span>
              <span style={{ fontFamily: "'Leckerli One', cursive" }}>{count}</span>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(42px, 1fr))',
          gap: 2,
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {stocks.map((stock, i) => {
          const inside = i < storeAgentCounts.length ? storeAgentCounts[i] : 0;
          const door = i < storeDoorCounts.length ? storeDoorCounts[i] : 0;
          const count = inside + door;
          const isSelected = selectedIdx === i;
          return (
            <div
              key={stock.ticker}
              onClick={() => setSelectedIdx(isSelected ? null : i)}
              style={{
                background: pressureColor(count, maxCount),
                borderRadius: 3,
                padding: '3px 2px',
                textAlign: 'center',
                fontSize: 8,
                fontFamily: "'Leckerli One', cursive",
                color: count > maxCount * 0.5 ? '#fff' : '#aaa',
                cursor: 'pointer',
                border: isSelected ? `2px solid ${ACCENT}` : '2px solid transparent',
                transition: 'border-color 0.15s',
                lineHeight: 1.3,
              }}
              title={`${stock.ticker}: ${count} agents (${inside} inside, ${door} door)`}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 7,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
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
// Decision Stream (bottom bar) — real Gemini reasoning chain
// ============================================================
interface StreamEntry {
  id: string;
  timestamp: string;
  source: string;
  ticker: string;
  action: string;
  detail: string;
  color: string;
}

const DecisionStream: React.FC<{
  whales: WhaleFund[];
  chain: ReasoningChain | null;
  featuredAgents: FeaturedAgent[];
}> = ({ whales, chain, featuredAgents }) => {
  const entries = useMemo(() => {
    const result: StreamEntry[] = [];
    const now = new Date();

    // Whale allocation entries
    for (const whale of whales) {
      if (whale.allocations.length === 0) continue;
      for (const alloc of whale.allocations.slice(0, 3)) {
        result.push({
          id: `${whale.id}-${alloc.ticker}`,
          timestamp: new Date(whale.lastUpdated || now.getTime()).toLocaleTimeString(),
          source: `${whale.icon} ${whale.name}`,
          ticker: alloc.ticker,
          action: alloc.action,
          detail: `Weight: ${(alloc.weight * 100).toFixed(0)}%`,
          color: whale.color,
        });
      }
    }

    // Featured agent decisions
    for (const agent of featuredAgents) {
      if (!agent.decision || Date.now() - agent.lastUpdated > 30000) continue;
      result.push({
        id: `agent-${agent.index}`,
        timestamp: new Date(agent.lastUpdated).toLocaleTimeString(),
        source: agent.name,
        ticker: agent.decision.targetTicker,
        action: agent.decision.action,
        detail: agent.decision.reasoning,
        color: '#FFD700',
      });
    }

    // Sector reports from reasoning chain
    if (chain) {
      for (const report of chain.sectorReports) {
        for (const pick of report.topPicks.slice(0, 1)) {
          result.push({
            id: `sector-${report.sector}-${pick.ticker}`,
            timestamp: new Date(chain.timestamp).toLocaleTimeString(),
            source: `${report.sector} Analyst`,
            ticker: pick.ticker,
            action: pick.action,
            detail: pick.reason,
            color:
              report.sectorSentiment === 'bullish'
                ? '#00FF7F'
                : report.sectorSentiment === 'bearish'
                  ? '#FF4500'
                  : '#808080',
          });
        }
      }
    }

    return result;
  }, [whales, chain, featuredAgents]);

  const actionColor = (action: string): string => {
    switch (action) {
      case 'BUY': return '#00ff7f';
      case 'CALL': return '#00bfff';
      case 'SHORT': return '#ff4444';
      case 'PUT': return '#ff8c00';
      default: return TEXT_COLOR;
    }
  };

  return (
    <div
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
        Live Decisions
      </h3>
      {entries.length === 0 && (
        <div style={{ color: '#666', fontSize: 11, padding: '8px 0' }}>
          Waiting for AI decisions...
        </div>
      )}
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
            borderLeft: `3px solid ${entry.color}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: '#888', fontSize: 10 }}>{entry.timestamp}</span>
            <span style={{ color: actionColor(entry.action), fontWeight: 700 }}>{entry.action}</span>
          </div>
          <div style={{ marginTop: 2 }}>
            <span style={{ color: entry.color, fontSize: 10 }}>{entry.source}</span>
            <span style={{ color: '#555' }}> &rarr; </span>
            <span style={{ color: ACCENT }}>{entry.ticker}</span>
          </div>
          <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>{entry.detail}</div>
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
  const storeAgentCounts = useStore((s) => s.storeAgentCounts);
  const storeDoorCounts = useStore((s) => s.storeDoorCounts);
  const storeLaneCounts = useStore((s) => s.storeLaneCounts);
  const setStoreCrowdData = useStore((s) => s.setStoreCrowdData);

  const [whales, setWhales] = useState<WhaleFund[]>(getWhales());
  const [featuredAgents, setFeaturedAgents] = useState<FeaturedAgent[]>(getFeaturedAgents());
  const [chain, setChain] = useState<ReasoningChain | null>(getLatestChain());
  const [simStats, setSimStats] = useState<SimulationStats>(getSimulationStats());

  // Initialize stocks if empty
  useEffect(() => {
    if (stocks.length === 0) {
      loadPipelineData()
        .then(({ stocks: s }) => setStocks(s))
        .catch(() => setStocks(generateStockData()));
    }
  }, [stocks.length, setStocks]);

  // Generate synthetic crowd data when 3D simulation isn't running
  useEffect(() => {
    if (stocks.length === 0) return;

    // Check if simulation is producing data
    const hasLiveData = storeAgentCounts.length > 0 &&
      Array.prototype.some.call(storeAgentCounts, (v: number) => v > 0);
    if (hasLiveData) return;

    function generateSyntheticCrowdData() {
      const n = stocks.length;
      const agents = new Int16Array(n);
      const doors = new Int16Array(n);
      const lanes = new Int16Array(n * 4);
      const now = Date.now();

      for (let i = 0; i < n; i++) {
        const s = stocks[i];
        const base = 5 + s.golden_score * 8 + Math.abs(s.drawdown_current) * 20;
        const noise = Math.sin(now * 0.001 + i * 0.7) * 3 + Math.cos(now * 0.0007 + i * 1.3) * 2;
        const total = Math.max(1, Math.round(base + noise));

        const doorCount = Math.round(total * 0.25);
        const insideCount = total - doorCount;
        agents[i] = insideCount;
        doors[i] = doorCount;

        const buyCount = Math.round(insideCount * s.direction_bias.buy);
        const callCount = Math.round(insideCount * s.direction_bias.call);
        const putCount = Math.round(insideCount * s.direction_bias.put);
        const shortCount = Math.max(0, insideCount - buyCount - callCount - putCount);
        lanes[i * 4] = buyCount;
        lanes[i * 4 + 1] = callCount;
        lanes[i * 4 + 2] = putCount;
        lanes[i * 4 + 3] = shortCount;
      }

      setStoreCrowdData(agents, doors, lanes);
    }

    generateSyntheticCrowdData();
    const interval = setInterval(generateSyntheticCrowdData, 2000);
    return () => clearInterval(interval);
  }, [stocks, storeAgentCounts, setStoreCrowdData]);

  // Poll real data from services
  useEffect(() => {
    const interval = setInterval(() => {
      setWhales([...getWhales()]);
      setFeaturedAgents([...getFeaturedAgents()]);
      setChain(getLatestChain());
      setSimStats(getSimulationStats());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Load simulation history from Databricks (refreshes every 60s)
  useEffect(() => {
    loadSimulationHistory().then(() => setSimStats(getSimulationStats()));
    const interval = setInterval(() => {
      loadSimulationHistory().then(() => setSimStats(getSimulationStats()));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  if (stocks.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: PAGE_BG,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: ACCENT,
          fontFamily: FONT,
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
        width: '100%',
        height: '100%',
        background: PAGE_BG,
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 280px) 1fr minmax(200px, 1.2fr)',
        gridTemplateRows: '1fr 140px',
        gap: 8,
        padding: 12,
        fontFamily: "'Leckerli One', cursive",
        color: TEXT_COLOR,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Left column — Whale + Agent Leaderboard */}
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        <Leaderboard whales={whales} featuredAgents={featuredAgents} simStats={simStats} />
      </div>

      {/* Center — Agent Heatmap */}
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        <AgentHeatmap
          stocks={stocks}
          storeAgentCounts={storeAgentCounts}
          storeDoorCounts={storeDoorCounts}
          storeLaneCounts={storeLaneCounts}
        />
      </div>

      {/* Right — Store Pressure Map */}
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        <StorePressureMap
          stocks={stocks}
          storeAgentCounts={storeAgentCounts}
          storeDoorCounts={storeDoorCounts}
          storeLaneCounts={storeLaneCounts}
        />
      </div>

      {/* Bottom — Decision Stream (spans all 3 columns) */}
      <div style={{ gridColumn: '1 / -1', minHeight: 0 }}>
        <DecisionStream whales={whales} chain={chain} featuredAgents={featuredAgents} />
      </div>
    </div>
  );
}
