import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

interface ShockRing {
  id: string;
  position: THREE.Vector3;
  startTime: number;
  duration: number; // ms
}

const SHOCK_DURATION = 3000; // 3 seconds slow-motion expansion
const MAX_RADIUS = 80;
const RING_COLOR = new THREE.Color('#FF4500');

export function ShockPropagation() {
  const stocks = useStore((s) => s.stocks);
  const ringsRef = useRef<ShockRing[]>([]);
  const seenShocksRef = useRef(new Set<string>());
  const meshesRef = useRef<THREE.Mesh[]>([]);

  // Detect new shock tickets and create rings
  const shockedStocks = useMemo(
    () => stocks.filter((s) => s.ticket_levels?.shock_ticket),
    [stocks],
  );

  // Spawn new rings for newly shocked stocks
  useFrame(() => {
    const now = Date.now();

    // Check for new shocks
    for (const stock of shockedStocks) {
      const key = stock.ticker;
      if (!seenShocksRef.current.has(key)) {
        seenShocksRef.current.add(key);
        const pos = stock.city_position;
        if (pos) {
          ringsRef.current.push({
            id: `${key}-${now}`,
            position: new THREE.Vector3(pos.x, 0.5, pos.z),
            startTime: now,
            duration: SHOCK_DURATION,
          });
        }
      }
    }

    // Clear seen shocks that are no longer shocked (so they can re-trigger)
    const currentShockTickers = new Set(shockedStocks.map((s) => s.ticker));
    for (const key of seenShocksRef.current) {
      if (!currentShockTickers.has(key)) {
        seenShocksRef.current.delete(key);
      }
    }

    // Update ring meshes
    const activeRings: ShockRing[] = [];
    for (const ring of ringsRef.current) {
      const elapsed = now - ring.startTime;
      if (elapsed < ring.duration) {
        activeRings.push(ring);
      }
    }
    ringsRef.current = activeRings;

    // Update mesh transforms
    meshesRef.current.forEach((mesh, i) => {
      if (i < activeRings.length) {
        const ring = activeRings[i];
        const t = (now - ring.startTime) / ring.duration; // 0-1
        const radius = t * MAX_RADIUS;
        const opacity = (1 - t) * 0.6;

        mesh.visible = true;
        mesh.position.copy(ring.position);
        mesh.scale.set(radius, radius, radius);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = opacity;
      } else {
        mesh.visible = false;
      }
    });
  });

  // Pre-allocate ring meshes (max 10 simultaneous)
  const ringGeometry = useMemo(
    () => new THREE.RingGeometry(0.9, 1.0, 64),
    [],
  );

  return (
    <group name="shock-propagation">
      {Array.from({ length: 10 }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { if (el) meshesRef.current[i] = el; }}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          geometry={ringGeometry}
        >
          <meshBasicMaterial
            color={RING_COLOR}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
