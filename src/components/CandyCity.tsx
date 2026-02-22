// ============================================================
// SweetReturns — CandyCity: Main 3D scene (candy-themed stock market city)
// ============================================================

import { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import StoreManager from './StoreManager';
import GroundPlane from './GroundPlane';
import { CrowdSimulation } from './CrowdSimulation';
import { CandyCaneNetwork } from './CandyCaneNetwork';
import { CandyParticles } from './CandyParticles';
import { FirstPersonControls } from './FirstPersonControls';
import { useStore } from '../store/useStore';

// ---------------------------------------------------------------------------
// Skybox: large inverted sphere with a pink-to-purple gradient
// ---------------------------------------------------------------------------
function CandySkybox() {
  const geometry = useMemo(() => new THREE.SphereGeometry(1600, 32, 32), []);

  const colorAttr = useMemo(() => {
    const posAttr = geometry.getAttribute('position');
    const count = posAttr.count;
    const colors = new Float32Array(count * 3);

    const pink = new THREE.Color('#FFB6C1');
    const purple = new THREE.Color('#9370DB');
    const temp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      const t = (y + 1600) / 3200;
      temp.copy(pink).lerp(purple, t);
      colors[i * 3] = temp.r;
      colors[i * 3 + 1] = temp.g;
      colors[i * 3 + 2] = temp.b;
    }

    const attr = new THREE.BufferAttribute(colors, 3);
    geometry.setAttribute('color', attr);
    return attr;
  }, [geometry]);

  void colorAttr;

  return (
    <mesh geometry={geometry} scale={[-1, 1, 1]}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Camera controller: flies toward selected store (orbit mode only)
// ---------------------------------------------------------------------------
function CameraController({ enabled }: { enabled: boolean }) {
  const selectedStock = useStore((s) => s.selectedStock);
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 400, 400));
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const isAnimating = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (selectedStock) {
      const { x, z } = selectedStock.city_position;
      const h = selectedStock.store_dimensions.height * (selectedStock.is_platinum ? 1.5 : 1);
      const maxDim = Math.max(selectedStock.store_dimensions.width, h, selectedStock.store_dimensions.depth);
      const platScale = selectedStock.is_platinum ? 1.8 : 1.0;
      const dist = maxDim * 6 * platScale;
      targetPos.current.set(x + dist * 0.5, h + dist * 0.8, z + dist);
      targetLookAt.current.set(x, h * 0.4, z);
      isAnimating.current = true;
    } else {
      targetPos.current.set(0, 400, 400);
      targetLookAt.current.set(0, 0, 0);
      isAnimating.current = true;
    }
  }, [selectedStock, enabled]);

  useFrame(() => {
    if (!enabled || !isAnimating.current) return;

    const speed = 0.06;
    camera.position.lerp(targetPos.current, speed);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, speed);
      controlsRef.current.update();
    }

    const dist = camera.position.distanceTo(targetPos.current);
    if (dist < 0.5) {
      isAnimating.current = false;
    }
  });

  if (!enabled) return null;

  return (
    <OrbitControls
      ref={controlsRef}
      maxPolarAngle={Math.PI / 2.2}
      minDistance={5}
      maxDistance={1800}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

// ---------------------------------------------------------------------------
// CandyCity: top-level 3D scene with POV toggle
// ---------------------------------------------------------------------------
export default function CandyCity() {
  const [povMode, setPovMode] = useState(false);

  return (
    <>
      <Canvas
        camera={{ position: [0, 550, 550], fov: 60, near: 0.1, far: 3600 }}
        style={{ width: '100%', height: '100vh' }}
        gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
      >
        {/* Fog */}
        <fog attach="fog" args={['#2a1a3a', 400, 2000]} />

        {/* Lighting */}
        <ambientLight intensity={0.6} color="#FFE4B5" />
        <directionalLight
          position={[50, 100, 50]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />

        {/* Skybox */}
        <CandySkybox />

        {/* Ground */}
        <GroundPlane />

        {/* Store buildings */}
        <StoreManager />

        {/* Crowd AI agents */}
        <CrowdSimulation />

        {/* Candy cane correlation network */}
        <CandyCaneNetwork />

        {/* Platinum store particle effects */}
        <CandyParticles />

        {/* Camera: orbit or first-person */}
        {povMode ? <FirstPersonControls /> : <CameraController enabled={!povMode} />}
      </Canvas>

      {/* POV Toggle Button */}
      <button
        onClick={() => {
          setPovMode((p) => !p);
          // Exit pointer lock when switching back to orbit
          if (document.pointerLockElement) document.exitPointerLock();
        }}
        style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          zIndex: 1000,
          background: povMode ? '#FFD700' : 'rgba(16, 12, 30, 0.85)',
          color: povMode ? '#1a1a2e' : '#FFD700',
          border: '1px solid #FFD700',
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 700,
          fontFamily: 'monospace',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          transition: 'all 0.2s',
        }}
      >
        {povMode ? 'EXIT POV (ESC)' : 'POV MODE (Walk)'}
      </button>

      {/* POV instructions overlay */}
      {povMode && (
        <div style={{
          position: 'fixed',
          top: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 999,
          background: 'rgba(10, 8, 20, 0.85)',
          border: '1px solid rgba(255, 215, 0, 0.3)',
          borderRadius: 8,
          padding: '8px 16px',
          fontFamily: 'monospace',
          fontSize: 11,
          color: 'rgba(255, 255, 255, 0.7)',
          pointerEvents: 'none',
          textAlign: 'center',
        }}>
          Click to look around | WASD to move | Shift to sprint
        </div>
      )}
    </>
  );
}
