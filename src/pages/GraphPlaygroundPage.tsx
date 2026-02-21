// ============================================================
// SweetReturns — GraphPlaygroundPage: Full-screen interactive
//   force graph with shock propagation, regime toggle, pulsing
//   platinum nodes, and adjustable correlation threshold.
// ============================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import { SECTORS, generateStockData, getCorrelationEdges, PLATINUM_COLOR } from '../data/stockData';
import type { StockData } from '../types';

const PAGE_BG = '#1a1a2e';
const ACCENT = '#FFD700';
const TEXT_COLOR = '#e0e0e0';
const BORDER_COLOR = '#2a2a4a';

// ---- Sector color lookup ----
function sectorColor(sectorName: string): string {
  return SECTORS.find((s) => s.name === sectorName)?.color ?? '#888888';
}

// ---- Regime types ----
type Regime = 'all' | 'highVol' | 'lowVol';

// ---- Dynamic import holder for ForceGraph3D ----
let ForceGraph3DComponent: React.ComponentType<any> | null = null;

// ---- Shock propagation state ----
interface ShockState {
  active: boolean;
  sourceNode: string | null;
  affectedNodes: Map<string, { intensity: number; timestamp: number }>;
}

// ============================================================
// Fallback canvas graph (used when react-force-graph-3d unavailable)
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
  onNodeClick: (node: FallbackNodeData) => void;
}> = ({ nodes, links, shock, onNodeClick }) => {
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

    // Initialize positions
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

      // Simple force simulation
      nodes.forEach((node) => {
        const p = positions.get(node.id)!;
        // Center gravity
        p.vx += (w / 2 - p.x) * 0.001;
        p.vy += (h / 2 - p.y) * 0.001;
        // Repulsion from nearby nodes (sample subset)
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

      // Link attraction
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
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(tp.x, tp.y);
        ctx.strokeStyle = link.weight > 0 ? 'rgba(34,68,102,0.15)' : 'rgba(68,34,34,0.15)';
        ctx.lineWidth = Math.abs(link.weight) * 2;
        ctx.stroke();
      });

      // Draw nodes
      const now = Date.now();
      nodes.forEach((node) => {
        const p = positions.get(node.id)!;
        const radius = 2 + node.goldenScore * 1.5;

        // Determine color (shock overlay)
        let fillColor = node.color;
        if (shock.active && shock.affectedNodes.has(node.id)) {
          const { intensity, timestamp } = shock.affectedNodes.get(node.id)!;
          const elapsed = now - timestamp;
          if (elapsed >= 0 && elapsed < 1500) {
            const fade = Math.max(0, 1 - elapsed / 1500);
            const t = intensity * fade;
            fillColor = `rgb(${Math.round(255 * t + 136 * (1 - t))},${Math.round(215 * t + 136 * (1 - t))},${Math.round(0 * t + 136 * (1 - t))})`;
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Platinum glow
        if (node.isPlatinum) {
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);
          ctx.strokeStyle = PLATINUM_COLOR;
          ctx.lineWidth = 1.5 + pulse;
          ctx.globalAlpha = 0.5 + pulse * 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Label for large nodes
        if (node.val > 5) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = '9px system-ui';
          ctx.textAlign = 'left';
          ctx.fillText(node.id, p.x + radius + 2, p.y + 3);
        }
      });

      frameRef.current = requestAnimationFrame(simulate);
    }

    simulate();

    // Click handler
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
  }, [nodes, links, onNodeClick, shock]);

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
  const [shockMode, setShockMode] = useState(false);
  const [shock, setShock] = useState<ShockState>({
    active: false,
    sourceNode: null,
    affectedNodes: new Map(),
  });
  const [forceGraphReady, setForceGraphReady] = useState(ForceGraph3DComponent !== null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const graphRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);

  // Initialize stocks if empty
  useEffect(() => {
    if (stocks.length === 0) {
      setStocks(generateStockData());
    }
  }, [stocks.length, setStocks]);

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
        .then((mod) => {
          ForceGraph3DComponent = mod.default;
          setForceGraphReady(true);
        })
        .catch(() => {
          setFallbackMode(true);
        });
    }
  }, []);

  // Filter edges based on regime (volatility-based filtering)
  const regimeEdges = useMemo(() => {
    if (regime === 'all') return correlationEdges;
    const volMap = new Map<string, number>();
    stocks.forEach((s) => volMap.set(s.ticker, s.volatility_percentile));

    return correlationEdges.filter((e) => {
      const srcVol = volMap.get(e.source) ?? 0.5;
      const tgtVol = volMap.get(e.target) ?? 0.5;
      const avgVol = (srcVol + tgtVol) / 2;
      if (regime === 'highVol') return avgVol > 0.6;
      if (regime === 'lowVol') return avgVol <= 0.4;
      return true;
    });
  }, [correlationEdges, regime, stocks]);

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

  // BFS shock propagation
  const triggerShock = useCallback(
    (sourceId: string) => {
      const affected = new Map<string, { intensity: number; timestamp: number }>();
      const queue: Array<{ id: string; intensity: number; depth: number }> = [
        { id: sourceId, intensity: 1.0, depth: 0 },
      ];
      const visited = new Set<string>();
      visited.add(sourceId);
      const now = Date.now();

      while (queue.length > 0) {
        const current = queue.shift()!;
        affected.set(current.id, {
          intensity: current.intensity,
          timestamp: now + current.depth * 300,
        });

        if (current.intensity < 0.05 || current.depth > 8) continue;

        const neighbors = adjacency.get(current.id) ?? [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor.target)) {
            visited.add(neighbor.target);
            const nextIntensity = current.intensity * (1 - Math.abs(neighbor.weight)) * 0.7;
            queue.push({
              id: neighbor.target,
              intensity: nextIntensity,
              depth: current.depth + 1,
            });
          }
        }
      }

      setShock({ active: true, sourceNode: sourceId, affectedNodes: affected });

      // Clear shock after animation completes
      const maxDelay = Math.max(0, ...Array.from(affected.values()).map((v) => v.timestamp - now));
      setTimeout(() => {
        setShock({ active: false, sourceNode: null, affectedNodes: new Map() });
      }, maxDelay + 2000);
    },
    [adjacency],
  );

  // Handle node click (shock mode or normal)
  const handleNodeClick = useCallback(
    (node: any) => {
      if (shockMode) {
        const id = typeof node === 'string' ? node : node?.id;
        if (id) triggerShock(id);
        setShockMode(false);
      }
    },
    [shockMode, triggerShock],
  );

  // Build graph data for ForceGraph3D
  const graphData = useMemo(() => {
    const nodes = stocks.map((s) => ({
      id: s.ticker,
      name: `${s.ticker} -- ${s.company}`,
      sector: s.sector,
      goldenScore: s.golden_score,
      isPlatinum: s.is_platinum,
      val: 2 + s.golden_score * 3,
      color: sectorColor(s.sector),
    }));
    const links = regimeEdges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));
    return { nodes, links };
  }, [stocks, regimeEdges]);

  // Node color incorporating shock animation
  const getNodeColor = useCallback(
    (node: any) => {
      const id = node.id as string;
      if (shock.active && shock.affectedNodes.has(id)) {
        const { intensity, timestamp } = shock.affectedNodes.get(id)!;
        const elapsed = Date.now() - timestamp;
        if (elapsed < 0) return node.color;
        if (elapsed < 1500) {
          const fade = Math.max(0, 1 - elapsed / 1500);
          const t = intensity * fade;
          const baseColor = node.color || '#888888';
          const br = parseInt(baseColor.slice(1, 3), 16) || 136;
          const bg = parseInt(baseColor.slice(3, 5), 16) || 136;
          const bb = parseInt(baseColor.slice(5, 7), 16) || 136;
          const r = Math.round(255 * t + br * (1 - t));
          const g = Math.round(215 * t + bg * (1 - t));
          const b = Math.round(0 * t + bb * (1 - t));
          return `rgb(${r},${g},${b})`;
        }
      }
      return node.color;
    },
    [shock],
  );

  // Platinum pulsing custom node objects for ForceGraph3D
  const nodeThreeObject = useCallback((node: any) => {
    if (!node.isPlatinum) return undefined;
    try {
      // Dynamically access THREE from the global scope or import
      const THREE = (window as any).__THREE_PLAYGROUND;
      if (!THREE) return undefined;

      const radius = 2 + (node.goldenScore ?? 0) * 3;
      const geometry = new THREE.SphereGeometry(radius, 16, 16);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(PLATINUM_COLOR),
        transparent: true,
        opacity: 0.85,
      });
      const mesh = new THREE.Mesh(geometry, material);
      (mesh as any).__platinumPulse = { material };
      return mesh;
    } catch {
      return undefined;
    }
  }, []);

  // Load THREE for platinum pulse and run animation loop
  useEffect(() => {
    if (!forceGraphReady || fallbackMode) return;
    let running = true;

    (async () => {
      try {
        const THREE = await import('three');
        (window as any).__THREE_PLAYGROUND = THREE;
      } catch {
        // three not available
      }
    })();

    const animate = () => {
      if (!running) return;
      if (graphRef.current) {
        const scene = graphRef.current.scene?.();
        if (scene) {
          const now = Date.now();
          scene.traverse((obj: any) => {
            if (obj.__platinumPulse) {
              const pulse = 0.6 + 0.4 * Math.sin(now * 0.004);
              obj.__platinumPulse.material.opacity = pulse;
            }
          });
        }
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [forceGraphReady, fallbackMode]);

  // ---- Render ----

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
        Loading graph playground...
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0a0a1e',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
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
          linkColor={(link: any) => {
            const w = link.weight ?? 0;
            return w > 0 ? '#224466' : '#442222';
          }}
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
          onNodeClick={handleNodeClick}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#555',
            fontFamily: 'monospace',
          }}
        >
          Initializing 3D engine...
        </div>
      )}

      {/* ---- Top overlay controls ---- */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          pointerEvents: 'none',
          zIndex: 20,
        }}
      >
        {/* Left: Threshold slider */}
        <div
          style={{
            background: 'rgba(15,15,35,0.92)',
            backdropFilter: 'blur(8px)',
            borderRadius: 10,
            padding: '12px 16px',
            border: `1px solid ${BORDER_COLOR}`,
            pointerEvents: 'auto',
            minWidth: 220,
          }}
        >
          <div
            style={{
              color: ACCENT,
              fontSize: 11,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Correlation Threshold
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={correlationThreshold}
              onChange={(e) => setCorrelationThreshold(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: ACCENT }}
            />
            <span
              style={{
                fontFamily: 'monospace',
                color: ACCENT,
                fontSize: 14,
                minWidth: 36,
                textAlign: 'right',
              }}
            >
              {correlationThreshold.toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
            {regimeEdges.length} edges | {stocks.length} nodes
          </div>
        </div>

        {/* Center: Shock Propagation button */}
        <div
          style={{
            background: 'rgba(15,15,35,0.92)',
            backdropFilter: 'blur(8px)',
            borderRadius: 10,
            padding: '10px 16px',
            border: `1px solid ${BORDER_COLOR}`,
            pointerEvents: 'auto',
            textAlign: 'center',
          }}
        >
          <button
            onClick={() => setShockMode(!shockMode)}
            style={{
              background: shockMode ? ACCENT : '#1e1e3a',
              color: shockMode ? '#000' : ACCENT,
              border: `1px solid ${ACCENT}`,
              borderRadius: 6,
              padding: '8px 18px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
              transition: 'all 0.2s',
            }}
          >
            {shockMode ? 'Click a node to shock...' : 'Shock Propagation'}
          </button>
          {shock.active && (
            <div style={{ color: ACCENT, fontSize: 10, marginTop: 4 }}>
              Shock from {shock.sourceNode} -- {shock.affectedNodes.size} nodes affected
            </div>
          )}
        </div>

        {/* Right: Regime Toggle buttons */}
        <div
          style={{
            background: 'rgba(15,15,35,0.92)',
            backdropFilter: 'blur(8px)',
            borderRadius: 10,
            padding: '10px 16px',
            border: `1px solid ${BORDER_COLOR}`,
            pointerEvents: 'auto',
            display: 'flex',
            gap: 6,
          }}
        >
          {(['all', 'highVol', 'lowVol'] as Regime[]).map((r) => {
            const labels: Record<Regime, string> = {
              all: 'All',
              highVol: 'High Vol',
              lowVol: 'Low Vol',
            };
            const isActive = regime === r;
            return (
              <button
                key={r}
                onClick={() => setRegime(r)}
                style={{
                  background: isActive ? ACCENT : '#1e1e3a',
                  color: isActive ? '#000' : TEXT_COLOR,
                  border: `1px solid ${isActive ? ACCENT : BORDER_COLOR}`,
                  borderRadius: 6,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 400,
                  transition: 'all 0.2s',
                }}
              >
                {labels[r]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Shock mode cursor indicator */}
      {shockMode && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            cursor: 'crosshair',
            pointerEvents: 'none',
            zIndex: 15,
            border: `3px solid ${ACCENT}44`,
            borderRadius: 0,
          }}
        />
      )}
    </div>
  );
}
