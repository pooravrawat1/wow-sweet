// ============================================================
// CandyParticles — GPU particle system for Platinum store chaos effects
// ============================================================

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Color,
} from 'three';
import { useStore } from '../store/useStore.ts';
import type { StockData } from '../types/index.ts';

const PARTICLES_PER_STORE = 500;
const MAX_Y = 10;
const FALL_SPEED = 0.02;
const WOBBLE_AMPLITUDE = 0.3;

// Candy palette for particle colors
const CANDY_COLORS = [
  new Color(0xff69b4), // pink
  new Color(0xffd700), // gold
  new Color(0x00cc66), // green
  new Color(0x4488ff), // blue
  new Color(0xff3333), // red
  new Color(0xff8800), // orange
];

interface ParticleCloudProps {
  stock: StockData;
  storeIndex: number;
}

function ParticleCloud({ stock, storeIndex }: ParticleCloudProps) {
  const pointsRef = useRef<Points>(null);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(PARTICLES_PER_STORE * 3);
    const colors = new Float32Array(PARTICLES_PER_STORE * 3);
    const sizes = new Float32Array(PARTICLES_PER_STORE);

    const cx = stock.city_position.x;
    const cy = stock.city_position.y;
    const cz = stock.city_position.z;

    for (let i = 0; i < PARTICLES_PER_STORE; i++) {
      // Random position within radius 5 of store
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 5;
      positions[i * 3] = cx + Math.cos(angle) * radius;
      positions[i * 3 + 1] = cy + Math.random() * MAX_Y;
      positions[i * 3 + 2] = cz + Math.sin(angle) * radius;

      // Random candy color
      const color = CANDY_COLORS[Math.floor(Math.random() * CANDY_COLORS.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      // Random size between 0.1 and 0.3
      sizes[i] = 0.1 + Math.random() * 0.2;
    }

    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geom.setAttribute('size', new Float32BufferAttribute(sizes, 1));

    const mat = new PointsMaterial({
      vertexColors: true,
      size: 0.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });

    return { geometry: geom, material: mat };
  }, [stock.city_position.x, stock.city_position.y, stock.city_position.z]);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    const posAttr = pointsRef.current.geometry.getAttribute('position');
    const positions = posAttr.array as Float32Array;
    const baseY = stock.city_position.y;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < PARTICLES_PER_STORE; i++) {
      const idx = i * 3;

      // Fall slowly
      positions[idx + 1] -= FALL_SPEED * delta * 60;

      // Horizontal wobble using sin/cos
      const phase = i * 0.1 + storeIndex * 0.5;
      positions[idx] += Math.sin(time * 1.5 + phase) * WOBBLE_AMPLITUDE * delta;
      positions[idx + 2] += Math.cos(time * 1.2 + phase) * WOBBLE_AMPLITUDE * delta;

      // Respawn at top when fallen below ground
      if (positions[idx + 1] < baseY) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 5;
        positions[idx] = stock.city_position.x + Math.cos(angle) * radius;
        positions[idx + 1] = baseY + MAX_Y;
        positions[idx + 2] = stock.city_position.z + Math.sin(angle) * radius;
      }
    }

    posAttr.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

function CandyParticlesInner() {
  const stocks = useStore((s) => s.stocks);

  const platinumStocks = useMemo(
    () => stocks.filter((s) => s.is_platinum),
    [stocks],
  );

  if (platinumStocks.length === 0) return null;

  return (
    <group>
      {platinumStocks.map((stock, index) => (
        <ParticleCloud
          key={stock.ticker}
          stock={stock}
          storeIndex={index}
        />
      ))}
    </group>
  );
}

export const CandyParticles = React.memo(CandyParticlesInner);
