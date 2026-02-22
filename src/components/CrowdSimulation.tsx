// ============================================================
// SweetReturns — Crowd Rendering: Oompa Loompa agents
// Body (capsule) + Head (sphere) + Hair (sphere) + Legs (2 capsules)
// 5 InstancedMeshes = 5 draw calls total for all 10,000 agents
// ============================================================

import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useCrowdSimulation } from '../hooks/useCrowdSimulation.ts';
import { useStore } from '../store/useStore.ts';

// Agent state constants (must match useCrowdSimulation.ts)
const STATE_INSIDE = 3;
const STATE_DOOR_FIGHTING = 2;

export function CrowdSimulation() {
  const { positions, velocities, states, count, featuredAgents, storeAgentCounts, storeDoorCounts, storeLaneCounts, update } = useCrowdSimulation();
  const setStoreCrowdData = useStore((s) => s.setStoreCrowdData);
  const crowdFrameRef = useRef(0);
  const [bubbles, setBubbles] = useState<Array<{
    x: number; y: number; z: number;
    name: string; action: string; reasoning: string; ticker: string;
  }>>([]);

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const hairRef = useRef<THREE.InstancedMesh>(null);
  const leftLegRef = useRef<THREE.InstancedMesh>(null);
  const rightLegRef = useRef<THREE.InstancedMesh>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Torso: wider capsule for white overalls
  const bodyGeo = useMemo(() => new THREE.CapsuleGeometry(0.13, 0.18, 4, 8), []);
  // Head: orange Oompa Loompa face
  const headGeo = useMemo(() => new THREE.SphereGeometry(0.08, 6, 6), []);
  // Hair: green puff on top of head
  const hairGeo = useMemo(() => new THREE.SphereGeometry(0.07, 6, 4), []);
  // Legs: thin capsules (white pants)
  const legGeo = useMemo(() => new THREE.CapsuleGeometry(0.035, 0.14, 3, 6), []);

  // Materials — Oompa Loompa palette
  const bodyMat = useMemo(() => new THREE.MeshLambertMaterial(), []);             // per-instance white overalls
  const headMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#D4721A' }), []);  // orange skin
  const hairMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#2E8B57' }), []);  // green hair
  const legMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#F0EDE5' }), []);   // white pants

  useFrame((_state, delta) => {
    if (!bodyRef.current || !headRef.current || !hairRef.current
        || !leftLegRef.current || !rightLegRef.current || count === 0) return;

    // Run physics
    update(delta);

    const bodyMesh = bodyRef.current;
    const headMesh = headRef.current;
    const hairMesh = hairRef.current;
    const leftLeg = leftLegRef.current;
    const rightLeg = rightLegRef.current;
    const time = _state.clock.elapsedTime;

    // Ensure instanceColor on body (white overalls with slight variation)
    if (!bodyMesh.instanceColor) {
      bodyMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(count * 3), 3,
      );
    }

    const bodyColorArray = bodyMesh.instanceColor.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const px = positions[i3];
      const pz = positions[i3 + 2];
      const state = states[i];

      // Agents inside stores — visible, standing idle at their trade lane
      if (state === STATE_INSIDE) {
        const idlePhase = time * 2 + i * 1.3;
        const idleSway = Math.sin(idlePhase) * 0.008;
        const baseY = 0.22;

        // Body (standing upright, white overalls)
        dummy.position.set(px + idleSway, baseY, pz);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bodyMesh.setMatrixAt(i, dummy.matrix);

        // Head (orange Oompa Loompa face)
        dummy.position.set(px + idleSway, baseY + 0.26, pz);
        dummy.updateMatrix();
        headMesh.setMatrixAt(i, dummy.matrix);

        // Hair puff (on top of head, squished sphere)
        dummy.position.set(px + idleSway, baseY + 0.36, pz);
        dummy.scale.set(1.0, 0.6, 1.0);
        dummy.updateMatrix();
        hairMesh.setMatrixAt(i, dummy.matrix);

        // Legs (standing still)
        dummy.position.set(px - 0.04, baseY - 0.18, pz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        leftLeg.setMatrixAt(i, dummy.matrix);

        dummy.position.set(px + 0.04, baseY - 0.18, pz);
        dummy.updateMatrix();
        rightLeg.setMatrixAt(i, dummy.matrix);

        // White overalls body color
        bodyColorArray[i3] = 0.94;
        bodyColorArray[i3 + 1] = 0.91;
        bodyColorArray[i3 + 2] = 0.87;
        continue;
      }

      // Animation phase per agent
      const phase = time * 8 + i * 1.7;
      const runBob = Math.abs(Math.sin(phase)) * 0.04;
      const legSwing = Math.sin(phase) * 0.4; // leg swing angle
      const isFighting = state === STATE_DOOR_FIGHTING;

      // Fighting agents jostle more
      const fightBob = isFighting ? Math.sin(time * 12 + i * 2.3) * 0.03 : 0;
      const baseY = 0.22;
      const y = baseY + runBob + fightBob;

      // Face direction of movement using actual velocity data
      const vx = velocities[i3];
      const vz = velocities[i3 + 2];
      const speed = Math.sqrt(vx * vx + vz * vz);
      const facingAngle = speed > 0.1 ? Math.atan2(vx, vz) : 0;

      // Forward lean proportional to speed
      const lean = isFighting ? 0.2 : Math.min(0.15, speed * 0.02);

      // Offsets rotated by facing angle for legs
      const sinF = Math.sin(facingAngle);
      const cosF = Math.cos(facingAngle);

      // Body (torso — white overalls)
      dummy.position.set(px, y, pz);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(lean, facingAngle, 0);
      dummy.updateMatrix();
      bodyMesh.setMatrixAt(i, dummy.matrix);

      // Head (on top of body — orange face)
      dummy.position.set(px, y + 0.26, pz);
      dummy.rotation.set(0, facingAngle, 0);
      dummy.updateMatrix();
      headMesh.setMatrixAt(i, dummy.matrix);

      // Green hair puff (on top of head, slight bob)
      const hairBob = Math.sin(phase * 0.5) * 0.01;
      dummy.position.set(px, y + 0.36 + hairBob, pz);
      dummy.scale.set(1.0, 0.6, 1.0);
      dummy.rotation.set(0, facingAngle, 0);
      dummy.updateMatrix();
      hairMesh.setMatrixAt(i, dummy.matrix);

      // Left leg (forward swing, offset rotated)
      const llx = px + sinF * (-0.04);
      const llz = pz + cosF * (-0.04);
      dummy.position.set(llx, y - 0.18, llz);
      dummy.rotation.set(legSwing, facingAngle, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      leftLeg.setMatrixAt(i, dummy.matrix);

      // Right leg (opposite swing, offset rotated)
      const rlx = px + sinF * 0.04;
      const rlz = pz + cosF * 0.04;
      dummy.position.set(rlx, y - 0.18, rlz);
      dummy.rotation.set(-legSwing, facingAngle, 0);
      dummy.updateMatrix();
      rightLeg.setMatrixAt(i, dummy.matrix);

      // White overalls body color (with slight per-agent warmth variation)
      const warmth = ((i * 7) % 13) / 130; // 0–0.1 subtle variation
      bodyColorArray[i3] = 0.94 + warmth;
      bodyColorArray[i3 + 1] = 0.91;
      bodyColorArray[i3 + 2] = 0.87 - warmth;
    }

    // Highlight featured (Gemini-powered) agents with golden overalls
    for (const agent of featuredAgents) {
      const idx = agent.index;
      if (idx < count) {
        // Golden overalls for AI agents
        bodyColorArray[idx * 3] = 1.0;       // R
        bodyColorArray[idx * 3 + 1] = 0.84;  // G (gold)
        bodyColorArray[idx * 3 + 2] = 0.0;   // B
      }
    }

    bodyMesh.instanceMatrix.needsUpdate = true;
    bodyMesh.instanceColor.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    hairMesh.instanceMatrix.needsUpdate = true;
    leftLeg.instanceMatrix.needsUpdate = true;
    rightLeg.instanceMatrix.needsUpdate = true;

    // Push per-store crowd data to Zustand every 60 frames (~1s)
    crowdFrameRef.current++;
    if (crowdFrameRef.current % 60 === 0) {
      setStoreCrowdData(storeAgentCounts, storeDoorCounts, storeLaneCounts);
    }

    // Update thought bubbles every 30 frames
    if (Math.floor(time * 60) % 30 === 0) {
      const newBubbles = featuredAgents
        .filter((a) => a.decision && Date.now() - a.lastUpdated < 15000 && a.index < count)
        .slice(0, 5) // Show max 5 bubbles at a time
        .map((a) => ({
          x: positions[a.index * 3],
          y: 1.2,
          z: positions[a.index * 3 + 2],
          name: a.name,
          action: a.decision!.action,
          reasoning: a.decision!.reasoning,
          ticker: a.decision!.targetTicker,
        }));
      setBubbles(newBubbles);
    }
  });

  if (count === 0) return null;

  const actionColors: Record<string, string> = {
    BUY: '#00FF7F', CALL: '#00BFFF', PUT: '#FFD700', SHORT: '#FF4500',
  };

  return (
    <group>
      {/* Oompa Loompa torso (white overalls) */}
      <instancedMesh ref={bodyRef} args={[bodyGeo, bodyMat, count]} frustumCulled={false} />
      {/* Oompa Loompa head (orange skin) */}
      <instancedMesh ref={headRef} args={[headGeo, headMat, count]} frustumCulled={false} />
      {/* Oompa Loompa green hair puff */}
      <instancedMesh ref={hairRef} args={[hairGeo, hairMat, count]} frustumCulled={false} />
      {/* Left leg (white pants) */}
      <instancedMesh ref={leftLegRef} args={[legGeo, legMat, count]} frustumCulled={false} />
      {/* Right leg (white pants) */}
      <instancedMesh ref={rightLegRef} args={[legGeo, legMat, count]} frustumCulled={false} />

      {/* Gemini AI thought bubbles */}
      {bubbles.map((b, i) => (
        <Html key={i} position={[b.x, b.y, b.z]} center
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{
            background: 'rgba(10, 8, 20, 0.92)',
            border: `1px solid ${actionColors[b.action] || '#FFD700'}`,
            borderRadius: 8,
            padding: '6px 10px',
            maxWidth: 180,
            fontFamily: 'monospace',
            fontSize: 10,
            lineHeight: 1.3,
            color: '#fff',
            boxShadow: `0 0 12px ${actionColors[b.action] || '#FFD700'}44`,
          }}>
            <div style={{ fontWeight: 700, color: '#FFD700', marginBottom: 2 }}>
              {b.name} <span style={{ color: actionColors[b.action], fontSize: 9 }}>{b.action}</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9 }}>
              {b.ticker}: {b.reasoning}
            </div>
          </div>
        </Html>
      ))}
    </group>
  );
}
