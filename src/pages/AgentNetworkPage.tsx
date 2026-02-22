// ============================================================
// SweetReturns — Agent Network Page
// Canvas-based force graph of whale funds + top agents
// ============================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { SECTORS } from '../data/stockData';

const PAGE_BG = '#1a1a2e';
const PANEL_BG = '#0f0f23';
const ACCENT = '#FFD700';
const BORDER = '#2a2a4a';

interface NetworkNode {
  id: string;
  name: string;
  type: 'whale' | 'agent';
  color: string;
  profit: number;
  positions: { ticker: string; action: string; weight: number }[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface NetworkLink {
  source: string;
  target: string;
  sharedTickers: string[];
  weight: number;
}

interface ShockState {
  active: boolean;
  sourceId: string | null;
  affected: Map<string, { intensity: number; timestamp: number }>;
}

function sectorColor(sector: string): string {
  return SECTORS.find(s => s.name === sector)?.color ?? '#888';
}

// Seeded random for deterministic layout
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---- Canvas renderer ----

const NetworkCanvas: React.FC<{
  nodes: NetworkNode[];
  links: NetworkLink[];
  shock: ShockState;
  onNodeClick: (node: NetworkNode | null) => void;
  selectedNode: string | null;
}> = ({ nodes, links, shock, onNodeClick, selectedNode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(new Map());
  const animRef = useRef<number>(0);
  const sizeRef = useRef({ w: 900, h: 600 });

  // Responsive canvas sizing
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.round(rect.width * devicePixelRatio);
      const h = Math.round(rect.height * devicePixelRatio);
      canvas.width = w;
      canvas.height = h;
      sizeRef.current = { w, h };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize positions with seeded random
    const posMap = posRef.current;
    const rand = seededRandom(42);
    nodes.forEach((n, i) => {
      if (!posMap.has(n.id)) {
        const { w, h } = sizeRef.current;
        const angle = (i / nodes.length) * Math.PI * 2;
        const r = Math.min(w, h) * 0.25 + rand() * Math.min(w, h) * 0.12;
        posMap.set(n.id, {
          x: w / 2 + Math.cos(angle) * r,
          y: h / 2 + Math.sin(angle) * r,
          vx: 0, vy: 0,
        });
      }
    });

    function simulate() {
      if (!ctx || !canvas) return;
      const { w: W, h: H } = sizeRef.current;

      // Scale for device pixel ratio
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Force simulation
      const positions = Array.from(posMap.entries());

      // Center gravity
      positions.forEach(([, p]) => {
        p.vx += (W / 2 - p.x) * 0.001;
        p.vy += (H / 2 - p.y) * 0.001;
      });

      // Repulsion
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const [, a] = positions[i];
          const [, b] = positions[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 1200 / (dist * dist);
          a.vx += (dx / dist) * force;
          a.vy += (dy / dist) * force;
          b.vx -= (dx / dist) * force;
          b.vy -= (dy / dist) * force;
        }
      }

      // Link attraction
      links.forEach(link => {
        const a = posMap.get(link.source);
        const b = posMap.get(link.target);
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 150) * 0.003 * link.weight;
        a.vx += (dx / dist) * force;
        a.vy += (dy / dist) * force;
        b.vx -= (dx / dist) * force;
        b.vy -= (dy / dist) * force;
      });

      // Shock
      const now = Date.now();
      if (shock.active) {
        shock.affected.forEach((info, nodeId) => {
          const p = posMap.get(nodeId);
          if (!p) return;
          const elapsed = now - info.timestamp;
          if (elapsed < 3000) {
            const fade = 1 - elapsed / 3000;
            const shake = info.intensity * fade * 8;
            p.vx += (Math.random() - 0.5) * shake;
            p.vy += (Math.random() - 0.5) * shake;
          }
        });
      }

      // Apply velocities
      positions.forEach(([, p]) => {
        p.vx *= 0.85;
        p.vy *= 0.85;
        p.x += p.vx;
        p.y += p.vy;
        p.x = Math.max(40, Math.min(W - 40, p.x));
        p.y = Math.max(40, Math.min(H - 40, p.y));
      });

      // Draw
      ctx.clearRect(0, 0, W, H);

      // Links
      links.forEach(link => {
        const a = posMap.get(link.source);
        const b = posMap.get(link.target);
        if (!a || !b) return;

        const isSelected = selectedNode === link.source || selectedNode === link.target;
        const isShocked = shock.active && (shock.affected.has(link.source) || shock.affected.has(link.target));

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = isShocked
          ? `rgba(255, 69, 0, ${0.3 + link.weight * 0.5})`
          : isSelected
            ? `rgba(255, 215, 0, ${0.3 + link.weight * 0.4})`
            : `rgba(255, 255, 255, ${0.04 + link.weight * 0.1})`;
        ctx.lineWidth = isShocked ? 2 + link.weight * 3 : isSelected ? 1.5 : 0.5 + link.weight;
        ctx.stroke();

        // Shared ticker label
        if (isSelected && link.sharedTickers.length > 0) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          ctx.font = `${8 * devicePixelRatio}px monospace`;
          ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
          ctx.textAlign = 'center';
          ctx.fillText(link.sharedTickers.slice(0, 3).join(', '), mx, my - 6);
        }
      });

      // Shock ripples
      if (shock.active && shock.sourceId) {
        const sourcePos = posMap.get(shock.sourceId);
        if (sourcePos) {
          const elapsed = now - (shock.affected.get(shock.sourceId)?.timestamp || now);
          for (let ring = 0; ring < 3; ring++) {
            const ringElapsed = elapsed - ring * 400;
            if (ringElapsed > 0 && ringElapsed < 2000) {
              const progress = ringElapsed / 2000;
              const r = progress * 250;
              ctx.beginPath();
              ctx.arc(sourcePos.x, sourcePos.y, r, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(255, 69, 0, ${(1 - progress) * 0.25})`;
              ctx.lineWidth = 2 * (1 - progress);
              ctx.stroke();
            }
          }
        }
      }

      // Nodes
      nodes.forEach(node => {
        const p = posMap.get(node.id);
        if (!p) return;

        const isNodeSelected = selectedNode === node.id;
        const isShocked = shock.active && shock.affected.has(node.id);
        const shockInfo = shock.affected.get(node.id);
        let shockScale = 1;
        if (isShocked && shockInfo) {
          const elapsed = now - shockInfo.timestamp;
          const fade = Math.max(0, 1 - elapsed / 3000);
          shockScale = 1 + fade * shockInfo.intensity * 0.5 * Math.sin(elapsed * 0.02);
        }

        const r = node.radius * shockScale;

        // Glow
        if (isNodeSelected || isShocked) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 10, 0, Math.PI * 2);
          const glow = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, r + 10);
          glow.addColorStop(0, isShocked ? 'rgba(255, 69, 0, 0.35)' : 'rgba(255, 215, 0, 0.35)');
          glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Circle
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();
        ctx.strokeStyle = isNodeSelected ? ACCENT : isShocked ? '#FF4500' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = isNodeSelected ? 2 : 1;
        ctx.stroke();

        // Type icon inside (W for whale, A for agent)
        ctx.font = `bold ${Math.max(8, r * 0.7)}px monospace`;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.type === 'whale' ? 'W' : 'A', p.x, p.y);
        ctx.textBaseline = 'alphabetic';

        // Label
        ctx.font = `${node.type === 'whale' ? 'bold ' : ''}${10 * devicePixelRatio}px monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, p.x, p.y + r + 14);

        // Profit
        ctx.font = `${8 * devicePixelRatio}px monospace`;
        ctx.fillStyle = node.profit >= 0 ? '#00FF7F' : '#FF4500';
        ctx.fillText(
          `${node.profit >= 0 ? '+' : ''}$${Math.abs(node.profit) >= 1000 ? (node.profit / 1000).toFixed(0) + 'K' : node.profit.toFixed(0)}`,
          p.x, p.y + r + 26
        );
      });

      animRef.current = requestAnimationFrame(simulate);
    }

    simulate();
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, links, shock, selectedNode]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    for (const node of nodes) {
      const p = posRef.current.get(node.id);
      if (!p) continue;
      const dx = mx - p.x;
      const dy = my - p.y;
      if (dx * dx + dy * dy < (node.radius + 8) ** 2) {
        onNodeClick(node);
        return;
      }
    }
    onNodeClick(null);
  }, [nodes, onNodeClick]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{ width: '100%', height: '100%', cursor: 'pointer', display: 'block' }}
      />
    </div>
  );
};

// ---- Main page ----

export default function AgentNetworkPage() {
  const stocks = useStore(s => s.stocks);
  const leaderboard = useStore(s => s.agentLeaderboard);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [shock, setShock] = useState<ShockState>({ active: false, sourceId: null, affected: new Map() });

  // Build network
  const { nodes, links } = useMemo(() => {
    const rand = seededRandom(99);
    const actions = ['BUY', 'CALL', 'PUT', 'SHORT'];

    const whaleNodes: NetworkNode[] = [
      { id: 'slugworth', name: 'Slugworth', type: 'whale', color: '#FF4500', profit: 37000, positions: [], x: 0, y: 0, vx: 0, vy: 0, radius: 20 },
      { id: 'wonka', name: 'Wonka Fund', type: 'whale', color: '#FFD700', profit: 17000, positions: [], x: 0, y: 0, vx: 0, vy: 0, radius: 18 },
      { id: 'oompa', name: 'Oompa Fund', type: 'whale', color: '#00FF7F', profit: 8000, positions: [], x: 0, y: 0, vx: 0, vy: 0, radius: 16 },
      { id: 'gobstopper', name: 'Gobstopper', type: 'whale', color: '#9370DB', profit: -3000, positions: [], x: 0, y: 0, vx: 0, vy: 0, radius: 14 },
    ];

    const topStocks = stocks.slice(0, 40);
    whaleNodes.forEach((whale, wi) => {
      const slice = topStocks.slice(wi * 8, wi * 8 + 10);
      whale.positions = slice.map(s => ({
        ticker: s.ticker,
        action: actions[Math.floor(rand() * actions.length)],
        weight: 0.05 + rand() * 0.25,
      }));
    });

    // Agent nodes — from leaderboard or generate placeholders
    let agentEntries = leaderboard.slice(0, 10);
    if (agentEntries.length === 0 && stocks.length > 0) {
      // Generate placeholder agents so the graph isn't empty
      const names = ['CandyTrader', 'SugarRush', 'GummyBear', 'ChocolateChip', 'LollipopKing', 'ToffeeBot', 'MintCondition', 'CaramelQuant'];
      agentEntries = names.map((name, i) => ({
        id: `agent-${i}`,
        name,
        profit: Math.round((rand() - 0.3) * 120000),
        rank: i + 1,
        trades: topStocks.slice(i * 3, i * 3 + 4).map(s => ({
          ticker: s.ticker,
          action: actions[Math.floor(rand() * 4)] as any,
          profit: Math.round((rand() - 0.4) * 30000),
          entryDate: '2026-02-20',
          reasoning: 'Momentum signal',
        })),
        winRate: 0.4 + rand() * 0.4,
        totalTrades: 10 + Math.floor(rand() * 40),
      }));
    }

    const agentNodes: NetworkNode[] = agentEntries.map(agent => ({
      id: agent.id,
      name: agent.name,
      type: 'agent' as const,
      color: sectorColor(stocks[Math.floor(rand() * Math.min(stocks.length, 11))]?.sector || 'Technology'),
      profit: agent.profit,
      positions: (agent.trades || []).slice(0, 6).map(t => ({
        ticker: t.ticker,
        action: t.action,
        weight: 0.05 + rand() * 0.2,
      })),
      x: 0, y: 0, vx: 0, vy: 0,
      radius: 8 + Math.min(Math.abs(agent.profit) / 15000, 6),
    }));

    const allNodes = [...whaleNodes, ...agentNodes];

    // Compute links from shared tickers
    const networkLinks: NetworkLink[] = [];
    for (let i = 0; i < allNodes.length; i++) {
      for (let j = i + 1; j < allNodes.length; j++) {
        const a = allNodes[i];
        const b = allNodes[j];
        const aTickers = new Set(a.positions.map(p => p.ticker));
        const shared = b.positions.filter(p => aTickers.has(p.ticker)).map(p => p.ticker);
        if (shared.length > 0) {
          networkLinks.push({
            source: a.id,
            target: b.id,
            sharedTickers: shared,
            weight: shared.length / Math.max(a.positions.length, b.positions.length, 1),
          });
        }
      }
    }

    return { nodes: allNodes, links: networkLinks };
  }, [stocks, leaderboard]);

  const handleShock = useCallback((nodeId: string) => {
    const now = Date.now();
    const affected = new Map<string, { intensity: number; timestamp: number }>();
    affected.set(nodeId, { intensity: 1.0, timestamp: now });

    const visited = new Set([nodeId]);
    let frontier = [nodeId];
    let depth = 1;
    while (frontier.length > 0 && depth <= 3) {
      const nextFrontier: string[] = [];
      for (const nid of frontier) {
        links.forEach(link => {
          const neighbor = link.source === nid ? link.target : link.target === nid ? link.source : null;
          if (neighbor && !visited.has(neighbor)) {
            visited.add(neighbor);
            nextFrontier.push(neighbor);
            affected.set(neighbor, {
              intensity: link.weight * (1 / depth),
              timestamp: now + depth * 300,
            });
          }
        });
      }
      frontier = nextFrontier;
      depth++;
    }

    setShock({ active: true, sourceId: nodeId, affected });
    setTimeout(() => setShock({ active: false, sourceId: null, affected: new Map() }), 4000);
  }, [links]);

  const selectedNodeData = nodes.find(n => n.id === selectedNode);
  const actionColors: Record<string, string> = { BUY: '#00FF7F', CALL: '#00BFFF', PUT: '#FFD700', SHORT: '#FF4500' };

  return (
    <div style={{ width: '100%', height: '100%', background: PAGE_BG, display: 'flex' }}>
      {/* Left Panel */}
      <div style={{
        width: 260, minWidth: 220, flexShrink: 0,
        background: PANEL_BG,
        borderRight: `1px solid ${BORDER}`,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <h2 style={{ fontSize: 14, color: ACCENT, margin: 0, fontWeight: 700 }}>Agent Network</h2>
          <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
            {nodes.length} nodes &middot; {links.length} connections
          </div>
        </div>

        {/* Instructions */}
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: 9, color: '#777', lineHeight: 1.5 }}>
          Click node to inspect. Double-click to simulate shock propagation.
        </div>

        {/* Node list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {nodes.map(n => (
            <button
              key={n.id}
              onClick={() => setSelectedNode(selectedNode === n.id ? null : n.id)}
              onDoubleClick={() => handleShock(n.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 16px', width: '100%',
                background: selectedNode === n.id ? 'rgba(255,215,0,0.06)' : 'transparent',
                border: 'none', borderLeft: selectedNode === n.id ? `2px solid ${ACCENT}` : '2px solid transparent',
                cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.1s',
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: n.color, flexShrink: 0,
                boxShadow: selectedNode === n.id ? `0 0 6px ${n.color}66` : 'none',
              }} />
              <span style={{ fontSize: 10, color: selectedNode === n.id ? '#eee' : '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.name}
              </span>
              <span style={{ fontSize: 9, color: n.type === 'whale' ? '#666' : 'transparent', flexShrink: 0, fontWeight: 600 }}>
                {n.type === 'whale' ? 'W' : ''}
              </span>
              <span style={{ fontSize: 9, color: n.profit >= 0 ? '#00FF7F' : '#FF4500', fontWeight: 600, flexShrink: 0, fontFamily: 'monospace' }}>
                {n.profit >= 0 ? '+' : ''}{(n.profit / 1000).toFixed(0)}K
              </span>
            </button>
          ))}
        </div>

        {/* Selected detail */}
        {selectedNodeData && (
          <div style={{
            padding: '12px 16px',
            borderTop: `1px solid ${BORDER}`,
            background: 'rgba(255,215,0,0.02)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: selectedNodeData.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#eee' }}>{selectedNodeData.name}</span>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 10 }}>
              <div>
                <span style={{ color: '#666' }}>P&L </span>
                <span style={{ color: selectedNodeData.profit >= 0 ? '#00FF7F' : '#FF4500', fontWeight: 600 }}>
                  {selectedNodeData.profit >= 0 ? '+' : ''}${(Math.abs(selectedNodeData.profit) / 1000).toFixed(1)}K
                </span>
              </div>
              <div>
                <span style={{ color: '#666' }}>Positions </span>
                <span style={{ color: '#ccc' }}>{selectedNodeData.positions.length}</span>
              </div>
            </div>

            {/* Positions */}
            {selectedNodeData.positions.slice(0, 6).map((pos, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 9 }}>
                <span style={{ color: actionColors[pos.action] || '#888', fontWeight: 700, width: 36 }}>
                  {pos.action}
                </span>
                <span style={{ color: '#ccc', flex: 1 }}>{pos.ticker}</span>
                <span style={{ color: '#555' }}>{(pos.weight * 100).toFixed(0)}%</span>
              </div>
            ))}

            <button
              onClick={() => handleShock(selectedNodeData.id)}
              style={{
                marginTop: 8, padding: '5px 0', width: '100%',
                background: 'rgba(255,69,0,0.08)',
                border: `1px solid rgba(255,69,0,0.2)`,
                borderRadius: 4, color: '#FF4500', fontSize: 9,
                fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace',
              }}
            >
              Simulate Shock
            </button>
          </div>
        )}
      </div>

      {/* Graph */}
      <div style={{ flex: 1, position: 'relative', background: '#0a0a1e' }}>
        <NetworkCanvas
          nodes={nodes}
          links={links}
          shock={shock}
          onNodeClick={(n) => setSelectedNode(n ? n.id : null)}
          selectedNode={selectedNode}
        />
      </div>
    </div>
  );
}
