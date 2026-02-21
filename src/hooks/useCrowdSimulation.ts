// ============================================================
// SweetReturns — Crowd Simulation Hook
// Manages 10,000 agents using TypedArrays for performance
// ============================================================

import { useRef, useMemo, useCallback } from 'react';
import { SpatialGrid } from '../utils/spatialGrid.ts';
import { useStore } from '../store/useStore.ts';

// --- Agent state encoding ---
const STATE_ANALYZING = 0;
const STATE_RUSHING = 1;
// const STATE_DOOR_FIGHTING = 2;  // reserved for future use
const STATE_INSIDE = 3;
const STATE_EXITING = 4;
// const STATE_THROWING = 5;       // reserved for future use

// --- Color constants (r, g, b, a in 0-1 range) ---
const MALE_COLOR = { r: 0x2C / 255, g: 0x3E / 255, b: 0x50 / 255 };   // #2C3E50
const FEMALE_COLOR = { r: 0x8E / 255, g: 0x44 / 255, b: 0xAD / 255 };  // #8E44AD

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16) / 255,
    g: parseInt(clean.substring(2, 4), 16) / 255,
    b: parseInt(clean.substring(4, 6), 16) / 255,
  };
}

// Seeded PRNG for deterministic initialization
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface SimulationData {
  positions: Float32Array;
  velocities: Float32Array;
  targets: Float32Array;
  states: Uint8Array;
  colors: Float32Array;
  genders: Uint8Array;             // 0=male, 1=female
  storeIndices: Int16Array;        // which store each agent belongs to
  stateTimers: Float32Array;       // countdown for inside/analyzing states
  urgencies: Float32Array;         // per-agent urgency
  maxSpeeds: Float32Array;         // per-agent max speed
  carriesCandy: Uint8Array;        // 0=no, 1=yes
  brandColors: Float32Array;       // 3 per agent (rgb of assigned store)
  count: number;
}

export interface CrowdSimulationResult {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
  update: (dt: number) => void;
}

export function useCrowdSimulation(): CrowdSimulationResult {
  const stocks = useStore((s) => s.stocks);
  const agentCount = useStore((s) => s.agentCount);
  const gridRef = useRef<SpatialGrid>(new SpatialGrid(4.0));

  const simRef = useRef<SimulationData | null>(null);

  // Initialize or re-initialize when stocks or agentCount change
  const sim = useMemo<SimulationData>(() => {
    if (stocks.length === 0) {
      const empty: SimulationData = {
        positions: new Float32Array(0),
        velocities: new Float32Array(0),
        targets: new Float32Array(0),
        states: new Uint8Array(0),
        colors: new Float32Array(0),
        genders: new Uint8Array(0),
        storeIndices: new Int16Array(0),
        stateTimers: new Float32Array(0),
        urgencies: new Float32Array(0),
        maxSpeeds: new Float32Array(0),
        carriesCandy: new Uint8Array(0),
        brandColors: new Float32Array(0),
        count: 0,
      };
      simRef.current = empty;
      return empty;
    }

    const rand = seededRandom(42);
    const NUM_AGENTS = agentCount;

    // Distribute agents across stores based on golden_score density
    const agentsPerStore: number[] = [];
    let totalAssigned = 0;

    for (let i = 0; i < stocks.length; i++) {
      const gs = stocks[i].golden_score;
      const count = Math.floor(10 + gs * gs * 20);
      agentsPerStore.push(count);
      totalAssigned += count;
    }

    // Scale to match NUM_AGENTS
    const scale = NUM_AGENTS / Math.max(totalAssigned, 1);
    let finalTotal = 0;
    for (let i = 0; i < agentsPerStore.length; i++) {
      agentsPerStore[i] = Math.max(1, Math.round(agentsPerStore[i] * scale));
      finalTotal += agentsPerStore[i];
    }

    // Adjust to exactly NUM_AGENTS
    const diff = NUM_AGENTS - finalTotal;
    if (diff > 0) {
      agentsPerStore[0] += diff;
    } else if (diff < 0) {
      let remaining = -diff;
      for (let i = agentsPerStore.length - 1; i >= 0 && remaining > 0; i--) {
        const remove = Math.min(agentsPerStore[i] - 1, remaining);
        agentsPerStore[i] -= remove;
        remaining -= remove;
      }
    }

    const actualCount = agentsPerStore.reduce((a, b) => a + b, 0);

    // Allocate TypedArrays
    const positions = new Float32Array(actualCount * 3);
    const velocities = new Float32Array(actualCount * 3);
    const targets = new Float32Array(actualCount * 3);
    const states = new Uint8Array(actualCount);
    const colors = new Float32Array(actualCount * 4);
    const genders = new Uint8Array(actualCount);
    const storeIndices = new Int16Array(actualCount);
    const stateTimers = new Float32Array(actualCount);
    const urgencies = new Float32Array(actualCount);
    const maxSpeeds = new Float32Array(actualCount);
    const carriesCandy = new Uint8Array(actualCount);
    const brandColors = new Float32Array(actualCount * 3);

    let agentIdx = 0;

    for (let storeIdx = 0; storeIdx < stocks.length; storeIdx++) {
      const stock = stocks[storeIdx];
      const storePos = stock.city_position;
      const storeColor = hexToRGB(stock.brand_color);
      const agentsForThisStore = agentsPerStore[storeIdx];

      for (let a = 0; a < agentsForThisStore; a++) {
        if (agentIdx >= actualCount) break;

        const i3 = agentIdx * 3;
        const i4 = agentIdx * 4;

        // Random position near store (within radius 5-15)
        const angle = rand() * Math.PI * 2;
        const dist = 5 + rand() * 10;
        positions[i3] = storePos.x + Math.cos(angle) * dist;
        positions[i3 + 1] = 0;
        positions[i3 + 2] = storePos.z + Math.sin(angle) * dist;

        // Target is the store position
        targets[i3] = storePos.x;
        targets[i3 + 1] = 0;
        targets[i3 + 2] = storePos.z;

        // Initial velocity (small random)
        velocities[i3] = (rand() - 0.5) * 0.5;
        velocities[i3 + 1] = 0;
        velocities[i3 + 2] = (rand() - 0.5) * 0.5;

        // State: start as rushing toward store
        states[agentIdx] = STATE_RUSHING;
        stateTimers[agentIdx] = 0;

        // Gender: 50/50
        const isMale = rand() < 0.5;
        genders[agentIdx] = isMale ? 0 : 1;

        // Base color by gender
        const baseColor = isMale ? MALE_COLOR : FEMALE_COLOR;
        colors[i4] = baseColor.r;
        colors[i4 + 1] = baseColor.g;
        colors[i4 + 2] = baseColor.b;
        colors[i4 + 3] = 1.0;

        // Store assignment
        storeIndices[agentIdx] = storeIdx;

        // Urgency based on golden_score
        urgencies[agentIdx] = 0.5 + rand() * 0.5 + stock.golden_score * 0.1;

        // Max speed based on golden_score
        maxSpeeds[agentIdx] = 3.0 + stock.golden_score * 2;

        // No candy initially
        carriesCandy[agentIdx] = 0;

        // Store brand color
        brandColors[i3] = storeColor.r;
        brandColors[i3 + 1] = storeColor.g;
        brandColors[i3 + 2] = storeColor.b;

        agentIdx++;
      }
    }

    const data: SimulationData = {
      positions,
      velocities,
      targets,
      states,
      colors,
      genders,
      storeIndices,
      stateTimers,
      urgencies,
      maxSpeeds,
      carriesCandy,
      brandColors,
      count: actualCount,
    };

    simRef.current = data;
    return data;
  }, [stocks, agentCount]);

  const update = useCallback((dt: number) => {
    const s = simRef.current;
    if (!s || s.count === 0) return;

    const grid = gridRef.current;
    const clampedDt = Math.min(dt, 0.05); // Prevent huge jumps

    // 1. Rebuild spatial grid
    grid.clear();
    for (let i = 0; i < s.count; i++) {
      const i3 = i * 3;
      grid.insert(i, s.positions[i3], s.positions[i3 + 2]);
    }

    // 2. Update each agent
    for (let i = 0; i < s.count; i++) {
      const i3 = i * 3;
      const i4 = i * 4;

      const px = s.positions[i3];
      const py = s.positions[i3 + 1];
      const pz = s.positions[i3 + 2];
      const tx = s.targets[i3];
      const tz = s.targets[i3 + 2];

      // Handle state timers
      if (s.states[i] === STATE_INSIDE) {
        s.stateTimers[i] -= 1;
        if (s.stateTimers[i] <= 0) {
          // Exit store, pick new target
          s.states[i] = STATE_EXITING;
          // Pick a random nearby store as new target
          const stocksArr = stocks;
          if (stocksArr.length > 0) {
            const newStoreIdx = Math.floor(Math.random() * stocksArr.length);
            const newStore = stocksArr[newStoreIdx];
            s.targets[i3] = newStore.city_position.x;
            s.targets[i3 + 1] = 0;
            s.targets[i3 + 2] = newStore.city_position.z;
            s.storeIndices[i] = newStoreIdx;

            // 30% chance to carry candy when exiting
            if (Math.random() < 0.3) {
              s.carriesCandy[i] = 1;
              const bc3 = i * 3;
              s.colors[i4] = s.brandColors[bc3];
              s.colors[i4 + 1] = s.brandColors[bc3 + 1];
              s.colors[i4 + 2] = s.brandColors[bc3 + 2];
            }

            // Update brand colors for new store
            const newColor = hexToRGB(newStore.brand_color);
            s.brandColors[i3] = newColor.r;
            s.brandColors[i3 + 1] = newColor.g;
            s.brandColors[i3 + 2] = newColor.b;
          }
        }
        // Agents inside don't move
        continue;
      }

      if (s.states[i] === STATE_ANALYZING) {
        s.stateTimers[i] -= 1;
        if (s.stateTimers[i] <= 0) {
          s.states[i] = STATE_RUSHING;
        }
        continue;
      }

      // a. Goal force
      let dx = tx - px;
      let dz = tz - pz;
      let dist = Math.sqrt(dx * dx + dz * dz);

      let fGoalX = 0;
      let fGoalZ = 0;
      if (dist > 0.01) {
        const goalStrength = 2.0 * s.urgencies[i];
        fGoalX = (dx / dist) * goalStrength;
        fGoalZ = (dz / dist) * goalStrength;
      }

      // b. Separation force
      let fSepX = 0;
      let fSepZ = 0;
      const neighbors = grid.getNeighbors(px, pz);
      const sepRadius = 2.0;

      for (let n = 0; n < neighbors.length; n++) {
        const j = neighbors[n];
        if (j === i) continue;

        const j3 = j * 3;
        const ndx = px - s.positions[j3];
        const ndz = pz - s.positions[j3 + 2];
        const ndist = ndx * ndx + ndz * ndz;

        if (ndist > 0.001 && ndist < sepRadius * sepRadius) {
          const invDist2 = 1.0 / ndist;
          fSepX += ndx * invDist2;
          fSepZ += ndz * invDist2;
        }
      }

      // c. Turbulence
      const fTurbX = (Math.random() - 0.5) * 0.6;
      const fTurbZ = (Math.random() - 0.5) * 0.6;

      // d. Total force
      const fTotalX = fGoalX + fSepX * 0.5 + fTurbX;
      const fTotalZ = fGoalZ + fSepZ * 0.5 + fTurbZ;

      // e. Update velocity
      let vx = s.velocities[i3] + fTotalX * clampedDt;
      let vz = s.velocities[i3 + 2] + fTotalZ * clampedDt;

      // Clamp speed
      const speed = Math.sqrt(vx * vx + vz * vz);
      const maxSpeed = s.maxSpeeds[i];
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        vx *= scale;
        vz *= scale;
      }

      s.velocities[i3] = vx;
      s.velocities[i3 + 1] = 0;
      s.velocities[i3 + 2] = vz;

      // f. Update position
      s.positions[i3] = px + vx * clampedDt;
      s.positions[i3 + 1] = py;
      s.positions[i3 + 2] = pz + vz * clampedDt;

      // g. Arrival check
      dx = s.targets[i3] - s.positions[i3];
      dz = s.targets[i3 + 2] - s.positions[i3 + 2];
      dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 1.0) {
        if (s.states[i] === STATE_RUSHING || s.states[i] === STATE_EXITING) {
          s.states[i] = STATE_INSIDE;
          s.stateTimers[i] = 60 + Math.random() * 60; // 60-120 frames
          // Stop movement
          s.velocities[i3] = 0;
          s.velocities[i3 + 2] = 0;
          // Drop candy if carrying
          if (s.carriesCandy[i]) {
            s.carriesCandy[i] = 0;
          }
        }
      }

      // Update color based on candy carry state
      if (s.carriesCandy[i]) {
        const bc3 = i * 3;
        s.colors[i4] = s.brandColors[bc3];
        s.colors[i4 + 1] = s.brandColors[bc3 + 1];
        s.colors[i4 + 2] = s.brandColors[bc3 + 2];
      } else {
        const baseColor = s.genders[i] === 0 ? MALE_COLOR : FEMALE_COLOR;
        s.colors[i4] = baseColor.r;
        s.colors[i4 + 1] = baseColor.g;
        s.colors[i4 + 2] = baseColor.b;
      }
      s.colors[i4 + 3] = 1.0;
    }
  }, [stocks]);

  return {
    positions: sim.positions,
    colors: sim.colors,
    count: sim.count,
    update,
  };
}
