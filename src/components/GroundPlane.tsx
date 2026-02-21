// ============================================================
// SweetReturns — GroundPlane: Chocolate ground with sector zones
// ============================================================

import { useMemo } from 'react';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { SECTORS } from '../data/stockData';

const SECTOR_SIZE = 50;

export default function GroundPlane() {
  const stocks = useStore((s) => s.stocks);

  // Build sector bounding boxes from actual stock positions
  const sectorZones = useMemo(() => {
    const sectorMap = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number; color: string }>();

    for (const stock of stocks) {
      const existing = sectorMap.get(stock.sector);
      if (existing) {
        existing.minX = Math.min(existing.minX, stock.city_position.x);
        existing.maxX = Math.max(existing.maxX, stock.city_position.x);
        existing.minZ = Math.min(existing.minZ, stock.city_position.z);
        existing.maxZ = Math.max(existing.maxZ, stock.city_position.z);
      } else {
        const sectorInfo = SECTORS.find((s) => s.name === stock.sector);
        sectorMap.set(stock.sector, {
          minX: stock.city_position.x,
          maxX: stock.city_position.x,
          minZ: stock.city_position.z,
          maxZ: stock.city_position.z,
          color: sectorInfo?.color ?? '#555555',
        });
      }
    }

    return Array.from(sectorMap.entries()).map(([name, bounds]) => {
      const padding = 3;
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cz = (bounds.minZ + bounds.maxZ) / 2;
      const w = bounds.maxX - bounds.minX + padding * 2;
      const d = bounds.maxZ - bounds.minZ + padding * 2;
      return { name, cx, cz, w, d, color: bounds.color };
    });
  }, [stocks]);

  // Grid helper lines at sector boundaries
  const gridLines = useMemo(() => {
    const positions: number[] = [];
    const cols = Math.max(...SECTORS.map((s) => s.position[0])) + 1;
    const rows = Math.max(...SECTORS.map((s) => s.position[1])) + 1;

    // Vertical lines
    for (let c = 0; c <= cols; c++) {
      const x = c * SECTOR_SIZE - SECTOR_SIZE * 0.1;
      positions.push(x, 0.02, -SECTOR_SIZE * 0.2);
      positions.push(x, 0.02, rows * SECTOR_SIZE + SECTOR_SIZE * 0.1);
    }
    // Horizontal lines
    for (let r = 0; r <= rows; r++) {
      const z = r * SECTOR_SIZE - SECTOR_SIZE * 0.2;
      positions.push(-SECTOR_SIZE * 0.1, 0.02, z);
      positions.push(cols * SECTOR_SIZE + SECTOR_SIZE * 0.1, 0.02, z);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  return (
    <group>
      {/* Main chocolate ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color="#3E2723" roughness={0.9} />
      </mesh>

      {/* Sector zone overlays */}
      {sectorZones.map((zone) => (
        <mesh
          key={zone.name}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[zone.cx, 0.01, zone.cz]}
        >
          <planeGeometry args={[zone.w, zone.d]} />
          <meshStandardMaterial
            color={zone.color}
            transparent
            opacity={0.08}
            roughness={1}
          />
        </mesh>
      ))}

      {/* Grid lines at sector boundaries */}
      <lineSegments geometry={gridLines}>
        <lineBasicMaterial color="#5D4037" opacity={0.4} transparent />
      </lineSegments>
    </group>
  );
}
