// ============================================================
// SweetReturns — Store: Individual candy store building
// ============================================================

import { useRef, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { StockData } from '../types';
import { useStore } from '../store/useStore';
import { TIER_COLORS, PLATINUM_COLOR } from '../data/stockData';

interface StoreProps {
  stock: StockData;
}

export default function Store({ stock }: StoreProps) {
  const selectStock = useStore((s) => s.selectStock);
  const [hovered, setHovered] = useState(false);

  const buildingRef = useRef<THREE.Mesh>(null);
  const candyRef = useRef<THREE.Mesh>(null);
  const emissiveRef = useRef<THREE.MeshStandardMaterial>(null);

  const { width, height, depth } = stock.store_dimensions;
  const { x, z } = stock.city_position;

  // Determine base color from golden_score / platinum
  const baseColor = stock.is_platinum
    ? PLATINUM_COLOR
    : TIER_COLORS[stock.golden_score] ?? TIER_COLORS[0];

  const baseEmissiveIntensity = stock.golden_score * 0.15;

  // Platinum pulsing + candy bobbing
  useFrame((_, delta) => {
    // Candy bobbing animation
    if (candyRef.current) {
      candyRef.current.position.y =
        height + 2.0 + Math.sin(Date.now() * 0.003 + x * 0.5 + z * 0.3) * 0.3;
    }

    // Platinum pulsing emissive
    if (stock.is_platinum && emissiveRef.current) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);
      emissiveRef.current.emissiveIntensity =
        baseEmissiveIntensity + pulse * 0.4;
    }

    // Hover scale feedback
    if (buildingRef.current) {
      const target = hovered ? 1.05 : 1.0;
      const platinumMultiplier = stock.is_platinum ? 1.5 : 1.0;
      const s = buildingRef.current.scale;
      const speed = 6 * delta;
      s.x = THREE.MathUtils.lerp(s.x, target * platinumMultiplier, speed);
      s.y = THREE.MathUtils.lerp(s.y, target * platinumMultiplier, speed);
      s.z = THREE.MathUtils.lerp(s.z, target * platinumMultiplier, speed);
    }
  });

  const handleClick = useCallback(() => {
    selectStock(stock);
  }, [selectStock, stock]);

  const handlePointerOver = useCallback(() => {
    setHovered(true);
    document.body.style.cursor = 'pointer';
  }, []);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = 'default';
  }, []);

  const platinumScale = stock.is_platinum ? 1.5 : 1.0;

  return (
    <group position={[x, 0, z]}>
      {/* Main building box */}
      <mesh
        ref={buildingRef}
        position={[0, (height * platinumScale) / 2, 0]}
        scale={[platinumScale, platinumScale, platinumScale]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          ref={emissiveRef}
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={baseEmissiveIntensity}
          roughness={0.5}
          metalness={stock.is_platinum ? 0.6 : 0.1}
        />
      </mesh>

      {/* Cone roof */}
      <mesh
        position={[
          0,
          height * platinumScale + (Math.min(width, depth) * platinumScale * 0.4),
          0,
        ]}
        scale={[platinumScale, platinumScale, platinumScale]}
      >
        <coneGeometry args={[Math.max(width, depth) * 0.6, Math.min(width, depth) * 0.8, 6]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={baseEmissiveIntensity * 0.5}
          roughness={0.4}
        />
      </mesh>

      {/* Ticker label above store */}
      <Text
        position={[0, height * platinumScale + 2.5, 0]}
        fontSize={0.6}
        color={hovered ? '#FFFFFF' : '#FFE4B5'}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.04}
        outlineColor="#000000"
      >
        {stock.ticker}
      </Text>

      {/* Floating candy sphere (brand color, bobbing) */}
      <mesh ref={candyRef} position={[0, height + 2.0, 0]}>
        <sphereGeometry args={[0.25, 12, 12]} />
        <meshStandardMaterial
          color={stock.brand_color}
          emissive={stock.brand_color}
          emissiveIntensity={0.3}
          roughness={0.2}
          metalness={0.3}
        />
      </mesh>
    </group>
  );
}
