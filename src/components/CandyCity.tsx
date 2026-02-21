// ============================================================
// SweetReturns — CandyCity: Main 3D scene (candy-themed stock market city)
// ============================================================

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import StoreManager from './StoreManager';
import GroundPlane from './GroundPlane';
import { CrowdSimulation } from './CrowdSimulation';
import { CandyCaneNetwork } from './CandyCaneNetwork';
import { CandyParticles } from './CandyParticles';

// ---------------------------------------------------------------------------
// Skybox: large inverted sphere with a pink-to-purple gradient
// ---------------------------------------------------------------------------
function CandySkybox() {
  const geometry = useMemo(() => new THREE.SphereGeometry(400, 32, 32), []);

  // Build vertex colors: top = #9370DB (purple), bottom = #FFB6C1 (pink)
  const colorAttr = useMemo(() => {
    const posAttr = geometry.getAttribute('position');
    const count = posAttr.count;
    const colors = new Float32Array(count * 3);

    const pink = new THREE.Color('#FFB6C1');
    const purple = new THREE.Color('#9370DB');
    const temp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      // Normalize y from [-400, 400] to [0, 1]
      const t = (y + 400) / 800;
      temp.copy(pink).lerp(purple, t);
      colors[i * 3] = temp.r;
      colors[i * 3 + 1] = temp.g;
      colors[i * 3 + 2] = temp.b;
    }

    const attr = new THREE.BufferAttribute(colors, 3);
    geometry.setAttribute('color', attr);
    return attr;
  }, [geometry]);

  // Ensure attribute is applied (used by dependency)
  void colorAttr;

  return (
    <mesh geometry={geometry} scale={[-1, 1, 1]}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} />
    </mesh>
  );
}

// (Actual implementations imported above)

// ---------------------------------------------------------------------------
// CandyCity: top-level 3D scene
// ---------------------------------------------------------------------------
export default function CandyCity() {
  return (
    <Canvas
      camera={{ position: [0, 150, 150], fov: 60, near: 0.1, far: 1000 }}
      style={{ width: '100%', height: '100vh' }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      {/* Fog */}
      <fog attach="fog" args={['#2a1a3a', 100, 500]} />

      {/* Lighting */}
      <ambientLight intensity={0.6} color="#FFE4B5" />
      <directionalLight
        position={[50, 100, 50]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
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

      {/* Camera controls */}
      <OrbitControls
        maxPolarAngle={Math.PI / 2.2}
        minDistance={10}
        maxDistance={400}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
