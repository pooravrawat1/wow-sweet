// ============================================================
// SweetReturns — Crowd Rendering with InstancedMesh
// Renders thousands of agents using Three.js instanced rendering
// ============================================================

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCrowdSimulation } from '../hooks/useCrowdSimulation.ts';

export function CrowdSimulation() {
  const { positions, colors, count, update } = useCrowdSimulation();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Create geometry once
  const geometry = useMemo(() => {
    return new THREE.SphereGeometry(0.15, 8, 6);
  }, []);

  // Create material once
  const material = useMemo(() => {
    return new THREE.MeshLambertMaterial();
  }, []);

  useFrame((_state, delta) => {
    if (!meshRef.current || count === 0) return;

    // Run physics update
    update(delta);

    const mesh = meshRef.current;

    // Update instance matrices from positions
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      dummy.position.set(
        positions[i3],
        positions[i3 + 1] + 0.15, // offset Y so agents sit on ground
        positions[i3 + 2],
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    // Update instance colors from colors array
    if (!mesh.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(count * 3), 3,
      );
    }

    const colorAttr = mesh.instanceColor;
    const colorArray = colorAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const i4 = i * 4;
      const i3c = i * 3;
      // colors is RGBA (4 per agent), instanceColor needs RGB (3 per agent)
      colorArray[i3c] = colors[i4];
      colorArray[i3c + 1] = colors[i4 + 1];
      colorArray[i3c + 2] = colors[i4 + 2];
    }

    mesh.instanceMatrix.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      frustumCulled={false}
    />
  );
}
