// ============================================================
// SweetReturns — Store: Open-top candy store with swinging doors
// No roof so agents inside are visible from above.
// 4 trade-lane floor markers (BUY / CALL / PUT / SHORT).
// ============================================================

import { useRef, useState, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { StockData } from '../types';
import { useStore } from '../store/useStore';

interface StoreProps {
  stock: StockData;
}

function darkenColor(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - factor);
  return '#' + c.getHexString();
}

function lightenColor(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#ffffff'), factor);
  return '#' + c.getHexString();
}

// Shared geometries (reused across all 500 stores)
const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const sharedSphereGeo = new THREE.SphereGeometry(0.04, 4, 4);
const sharedCircleGeo = new THREE.CircleGeometry(0.18, 12);
const sharedStickGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4);

// Trade lane floor marker colours: BUY, CALL, PUT, SHORT
const LANE_COLORS = ['#00FF7F', '#00BFFF', '#FFD700', '#FF4500'];

export default function Store({ stock }: StoreProps) {
  const selectStock = useStore((s) => s.selectStock);
  const [hovered, setHovered] = useState(false);

  const groupRef = useRef<THREE.Group>(null);
  const wallMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const { width, height, depth } = stock.store_dimensions;
  const { x, z } = stock.city_position;
  const brandColor = stock.brand_color;
  const baseEmissiveIntensity = stock.golden_score * 0.15;
  const ps = stock.is_platinum ? 1.5 : 1.0;

  const scaledH = height * ps;
  const scaledW = width * ps;
  const scaledD = depth * ps;
  const hd = scaledD / 2;
  const wallT = 0.06; // wall thickness

  // Door opening = 30 % of store width, centered on front face
  const doorW = scaledW * 0.3;
  const doorH = scaledH * 0.6;        // opening height
  const lintelH = scaledH - doorH;    // wall above door
  const frontSegW = (scaledW - doorW) / 2; // each side piece

  const doorColor = useMemo(() => darkenColor(brandColor, 0.4), [brandColor]);
  const floorColor = useMemo(() => darkenColor(brandColor, 0.25), [brandColor]);
  const logoColor = useMemo(() => lightenColor(brandColor, 0.25), [brandColor]);

  // Platinum per-frame pulse + hover scale
  useFrame((_, delta) => {
    if (stock.is_platinum && wallMatRef.current) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);
      wallMatRef.current.emissiveIntensity = baseEmissiveIntensity + pulse * 0.4;
    }
    if (groupRef.current) {
      const target = hovered ? 1.05 : 1.0;
      const s = groupRef.current.scale;
      const spd = 6 * delta;
      s.x = THREE.MathUtils.lerp(s.x, target, spd);
      s.y = THREE.MathUtils.lerp(s.y, target, spd);
      s.z = THREE.MathUtils.lerp(s.z, target, spd);
    }
  });

  const handleClick = useCallback(() => selectStock(stock), [selectStock, stock]);
  const handlePointerOver = useCallback(() => {
    setHovered(true);
    document.body.style.cursor = 'pointer';
  }, []);
  const handlePointerOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = 'default';
  }, []);

  return (
    <group position={[x, 0, z]}>
      <group
        ref={groupRef}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {/* ===== WALLS — open top (no roof) ===== */}

        {/* Back wall */}
        <mesh geometry={sharedBoxGeo}
          position={[0, scaledH / 2, -hd]}
          scale={[scaledW, scaledH, wallT]}
          castShadow receiveShadow>
          <meshStandardMaterial ref={wallMatRef}
            color={brandColor} emissive={brandColor}
            emissiveIntensity={baseEmissiveIntensity}
            roughness={0.4} metalness={stock.is_platinum ? 0.5 : 0.1} />
        </mesh>

        {/* Left wall */}
        <mesh geometry={sharedBoxGeo}
          position={[-scaledW / 2, scaledH / 2, 0]}
          scale={[wallT, scaledH, scaledD]}
          castShadow receiveShadow>
          <meshStandardMaterial
            color={brandColor} emissive={brandColor}
            emissiveIntensity={baseEmissiveIntensity}
            roughness={0.4} metalness={stock.is_platinum ? 0.5 : 0.1} />
        </mesh>

        {/* Right wall */}
        <mesh geometry={sharedBoxGeo}
          position={[scaledW / 2, scaledH / 2, 0]}
          scale={[wallT, scaledH, scaledD]}
          castShadow receiveShadow>
          <meshStandardMaterial
            color={brandColor} emissive={brandColor}
            emissiveIntensity={baseEmissiveIntensity}
            roughness={0.4} metalness={stock.is_platinum ? 0.5 : 0.1} />
        </mesh>

        {/* Front wall — left segment */}
        <mesh geometry={sharedBoxGeo}
          position={[-(doorW / 2 + frontSegW / 2), scaledH / 2, hd]}
          scale={[frontSegW, scaledH, wallT]}
          castShadow>
          <meshStandardMaterial
            color={brandColor} emissive={brandColor}
            emissiveIntensity={baseEmissiveIntensity}
            roughness={0.4} metalness={stock.is_platinum ? 0.5 : 0.1} />
        </mesh>

        {/* Front wall — right segment */}
        <mesh geometry={sharedBoxGeo}
          position={[(doorW / 2 + frontSegW / 2), scaledH / 2, hd]}
          scale={[frontSegW, scaledH, wallT]}
          castShadow>
          <meshStandardMaterial
            color={brandColor} emissive={brandColor}
            emissiveIntensity={baseEmissiveIntensity}
            roughness={0.4} metalness={stock.is_platinum ? 0.5 : 0.1} />
        </mesh>

        {/* Front wall — lintel above door opening */}
        <mesh geometry={sharedBoxGeo}
          position={[0, doorH + lintelH / 2, hd]}
          scale={[doorW, lintelH, wallT]}>
          <meshStandardMaterial
            color={brandColor} emissive={brandColor}
            emissiveIntensity={baseEmissiveIntensity}
            roughness={0.4} metalness={stock.is_platinum ? 0.5 : 0.1} />
        </mesh>

        {/* ===== FLOOR ===== */}
        <mesh geometry={sharedBoxGeo}
          position={[0, 0.01, 0]}
          scale={[scaledW - wallT, 0.02, scaledD - wallT]}
          receiveShadow>
          <meshStandardMaterial color={floorColor} roughness={0.7} />
        </mesh>

        {/* ===== TRADE LANE MARKERS (visible from above) ===== */}
        {LANE_COLORS.map((color, lane) => {
          // 0=BUY back-left, 1=CALL back-right, 2=PUT front-left, 3=SHORT front-right
          const lx = lane % 2 === 0 ? -scaledW * 0.22 : scaledW * 0.22;
          const lz = lane < 2 ? -scaledD * 0.2 : scaledD * 0.12;
          return (
            <mesh key={lane} geometry={sharedBoxGeo}
              position={[lx, 0.03, lz]}
              scale={[scaledW * 0.32, 0.01, scaledD * 0.28]}>
              <meshStandardMaterial color={color} transparent opacity={0.35}
                emissive={color} emissiveIntensity={0.2} />
            </mesh>
          );
        })}

        {/* ===== SWINGING DOORS (hinged, swung open) ===== */}

        {/* Left door panel — hinged at left edge of opening */}
        <group position={[-doorW / 2, doorH / 2, hd]} rotation={[0, -0.6, 0]}>
          <mesh geometry={sharedBoxGeo}
            position={[doorW * 0.13, 0, 0]}
            scale={[doorW * 0.25, doorH * 0.95, 0.03]}>
            <meshStandardMaterial color={doorColor} roughness={0.6} />
          </mesh>
          <mesh geometry={sharedSphereGeo}
            position={[doorW * 0.23, 0, 0.04]}>
            <meshStandardMaterial color="#FFD700" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* Right door panel — hinged at right edge of opening */}
        <group position={[doorW / 2, doorH / 2, hd]} rotation={[0, 0.6, 0]}>
          <mesh geometry={sharedBoxGeo}
            position={[-doorW * 0.13, 0, 0]}
            scale={[doorW * 0.25, doorH * 0.95, 0.03]}>
            <meshStandardMaterial color={doorColor} roughness={0.6} />
          </mesh>
          <mesh geometry={sharedSphereGeo}
            position={[-doorW * 0.23, 0, 0.04]}>
            <meshStandardMaterial color="#FFD700" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* ===== AWNING ===== */}
        <mesh geometry={sharedBoxGeo}
          position={[0, scaledH * 0.7, hd + 0.12]}
          rotation={[0.4, 0, 0]}
          scale={[scaledW * 1.05, 0.04, scaledD * 0.35]}>
          <meshStandardMaterial color={brandColor} roughness={0.5} />
        </mesh>

        {/* ===== WINDOWS (on front wall segments) ===== */}
        <mesh geometry={sharedBoxGeo}
          position={[-(doorW / 2 + frontSegW / 2), scaledH * 0.45, hd + 0.02]}
          scale={[frontSegW * 0.5, scaledH * 0.2, 0.03]}>
          <meshStandardMaterial color="#FFF8DC" emissive="#FFF8DC"
            emissiveIntensity={0.35} roughness={0.1} transparent opacity={0.85} />
        </mesh>
        <mesh geometry={sharedBoxGeo}
          position={[(doorW / 2 + frontSegW / 2), scaledH * 0.45, hd + 0.02]}
          scale={[frontSegW * 0.5, scaledH * 0.2, 0.03]}>
          <meshStandardMaterial color="#FFF8DC" emissive="#FFF8DC"
            emissiveIntensity={0.35} roughness={0.1} transparent opacity={0.85} />
        </mesh>

        {/* ===== CANDY LOGO — lollipop on lintel ===== */}
        <mesh geometry={sharedCircleGeo}
          position={[0, doorH + lintelH * 0.55, hd + 0.04]}>
          <meshStandardMaterial color={logoColor} emissive={logoColor}
            emissiveIntensity={0.3} roughness={0.15} metalness={0.1}
            side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={sharedStickGeo}
          position={[0, doorH + lintelH * 0.15, hd + 0.04]}>
          <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
        </mesh>
      </group>

      {/* Ticker label on hover */}
      {hovered && (
        <Html
          position={[0, scaledH + 0.3, 0]}
          center
          style={{
            color: '#FFE4B5',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "'Leckerli One', cursive",
            textShadow: '0 0 6px #000, 0 0 3px #000',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {stock.ticker}
        </Html>
      )}
    </group>
  );
}
