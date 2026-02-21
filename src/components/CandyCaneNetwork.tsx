// ============================================================
// CandyCaneNetwork — Renders correlation connections as candy cane arcs in 3D
// ============================================================

import React, { useMemo, useRef } from 'react';
import {
  CatmullRomCurve3,
  Vector3,
  TubeGeometry,
  Color,
  Group,
} from 'three';
import { useStore } from '../store/useStore.ts';
import type { StockData, GraphEdge } from '../types/index.ts';

const MAX_EDGES = 200;
const GREEN_TINT = new Color(0x00cc66);
const RED_TINT = new Color(0xcc3333);

interface ArcData {
  edge: GraphEdge;
  source: StockData;
  target: StockData;
  absWeight: number;
}

interface ArcMeshEntry {
  geometry: TubeGeometry;
  color: Color;
  key: string;
  edge: GraphEdge;
}

function CandyCaneNetworkInner() {
  const stocks = useStore((s) => s.stocks);
  const correlationEdges = useStore((s) => s.correlationEdges);
  const showCorrelations = useStore((s) => s.showCorrelations);
  const selectedStock = useStore((s) => s.selectedStock);
  const groupRef = useRef<Group>(null);

  // Build a ticker -> StockData lookup
  const stockMap = useMemo(() => {
    const map = new Map<string, StockData>();
    for (const stock of stocks) {
      map.set(stock.ticker, stock);
    }
    return map;
  }, [stocks]);

  // Sort edges by |weight| descending and take the strongest MAX_EDGES
  const topEdges = useMemo<ArcData[]>(() => {
    const sorted = [...correlationEdges]
      .map((edge) => ({
        edge,
        absWeight: Math.abs(edge.weight),
      }))
      .sort((a, b) => b.absWeight - a.absWeight)
      .slice(0, MAX_EDGES);

    const results: ArcData[] = [];
    for (const { edge, absWeight } of sorted) {
      const source = stockMap.get(edge.source);
      const target = stockMap.get(edge.target);
      if (source && target) {
        results.push({ edge, source, target, absWeight });
      }
    }
    return results;
  }, [correlationEdges, stockMap]);

  // Pre-compute geometries and blended colors for each arc
  const arcMeshData = useMemo<ArcMeshEntry[]>(() => {
    return topEdges.map(({ edge, source, target, absWeight }) => {
      const startPos = new Vector3(
        source.city_position.x,
        source.city_position.y,
        source.city_position.z,
      );
      const endPos = new Vector3(
        target.city_position.x,
        target.city_position.y,
        target.city_position.z,
      );

      const midPos = new Vector3()
        .addVectors(startPos, endPos)
        .multiplyScalar(0.5);
      midPos.y = absWeight * 8;

      const curve = new CatmullRomCurve3([startPos, midPos, endPos]);
      const tubeRadius = absWeight * 0.08;
      const geometry = new TubeGeometry(curve, 32, tubeRadius, 8, false);

      // Blend source + target brand colors
      const blended = new Color(source.brand_color).lerp(
        new Color(target.brand_color),
        0.5,
      );

      // Tint based on positive/negative correlation
      const tint = edge.weight >= 0 ? GREEN_TINT : RED_TINT;
      blended.lerp(tint, 0.3);

      return { geometry, color: blended, key: `${edge.source}-${edge.target}`, edge };
    });
  }, [topEdges]);

  if (!showCorrelations || arcMeshData.length === 0) {
    return null;
  }

  return (
    <group ref={groupRef}>
      {arcMeshData.map(({ geometry, color, key, edge }) => {
        // When a stock is selected, highlight only its connections
        let opacity = 1.0;
        if (selectedStock) {
          const isConnected =
            edge.source === selectedStock.ticker ||
            edge.target === selectedStock.ticker;
          opacity = isConnected ? 1.0 : 0.1;
        }

        return (
          <mesh key={key} geometry={geometry}>
            <meshStandardMaterial
              color={color}
              transparent
              opacity={opacity}
              roughness={0.4}
              metalness={0.2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export const CandyCaneNetwork = React.memo(CandyCaneNetworkInner);
