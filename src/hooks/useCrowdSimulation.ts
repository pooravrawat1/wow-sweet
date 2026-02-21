// ============================================================
// SweetReturns — Crowd Simulation Hook
// Manages 10,000 agents using TypedArrays for performance
// Includes door fighting state and entry gating
// ============================================================

import { useRef, useMemo, useCallback, useEffect } from 'react';
import { SpatialGrid } from '../utils/spatialGrid.ts';
import { useStore } from '../store/useStore.ts';
import {
  initFeaturedAgents,
  fetchAgentDecisions,
  applyDecisions,
  type FeaturedAgent,
} from '../services/geminiService.ts';
import {
  updateWhaleAllocations,
  applyWhaleToSimulation,
  getWhales,
  type WhaleFund,
} from '../services/whaleArena.ts';
import { AgentStreamClient } from '../services/websocketClient.ts';

// --- WebSocket flow instruction ---
interface AgentFlowInstruction {
  archetype_id: number;
  target_ticker: string;
  action: string;
  confidence: number;
  swarm_size: number;
}

// --- Agent state encoding ---
const STATE_ANALYZING = 0;
const STATE_RUSHING = 1;
const STATE_DOOR_FIGHTING = 2;
const STATE_INSIDE = 3;
// STATE_EXITING = 4 was replaced by returning to STATE_ANALYZING

// --- Color constants (r, g, b in 0-1 range) ---
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
  genders: Uint8Array;
  storeIndices: Int16Array;
  stateTimers: Float32Array;
  urgencies: Float32Array;
  maxSpeeds: Float32Array;
  carriesCandy: Uint8Array;
  brandColors: Float32Array;
  doorPositions: Float32Array;    // precomputed door positions per store (x, z)
  storeAgentCounts: Int16Array;   // agents currently inside each store
  storeDoorCounts: Int16Array;    // agents fighting at each store's door
  staggerTimers: Float32Array;    // stagger timer per agent
  tradeLanes: Uint8Array;         // 0=BUY 1=CALL 2=PUT 3=SHORT
  storeLaneCounts: Int16Array;    // per-store per-lane counts (numStores * 4)
  count: number;
  numStores: number;
}

export interface CrowdSimulationResult {
  positions: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  states: Uint8Array;
  count: number;
  storeAgentCounts: Int16Array;
  storeDoorCounts: Int16Array;
  storeLaneCounts: Int16Array;
  featuredAgents: FeaturedAgent[];
  whales: WhaleFund[];
  update: (dt: number) => void;
}

export function useCrowdSimulation(): CrowdSimulationResult {
  const stocks = useStore((s) => s.stocks);
  const agentCount = useStore((s) => s.agentCount);
  const modulatedBiases = useStore((s) => s.modulatedBiases);
  const timeMode = useStore((s) => s.timeSlider.mode);
  const gridRef = useRef<SpatialGrid>(new SpatialGrid(4.0));

  // Refs for per-frame access without triggering useMemo
  const modulatedBiasesRef = useRef(modulatedBiases);
  modulatedBiasesRef.current = modulatedBiases;
  const timeModeRef = useRef(timeMode);
  timeModeRef.current = timeMode;

  const simRef = useRef<SimulationData | null>(null);

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
        doorPositions: new Float32Array(0),
        storeAgentCounts: new Int16Array(0),
        storeDoorCounts: new Int16Array(0),
        staggerTimers: new Float32Array(0),
        tradeLanes: new Uint8Array(0),
        storeLaneCounts: new Int16Array(0),
        count: 0,
        numStores: 0,
      };
      simRef.current = empty;
      return empty;
    }

    const rand = seededRandom(42);
    const NUM_AGENTS = agentCount;

    // Precompute door positions per store (front face center, z + depth/2)
    const doorPositions = new Float32Array(stocks.length * 2);
    for (let i = 0; i < stocks.length; i++) {
      doorPositions[i * 2] = stocks[i].city_position.x;
      doorPositions[i * 2 + 1] = stocks[i].city_position.z + stocks[i].store_dimensions.depth / 2 + 0.3;
    }

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
    const staggerTimers = new Float32Array(actualCount);
    const tradeLanes = new Uint8Array(actualCount);

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

        // Target is the door position
        targets[i3] = doorPositions[storeIdx * 2];
        targets[i3 + 1] = 0;
        targets[i3 + 2] = doorPositions[storeIdx * 2 + 1];

        // Initial velocity
        velocities[i3] = (rand() - 0.5) * 0.5;
        velocities[i3 + 1] = 0;
        velocities[i3 + 2] = (rand() - 0.5) * 0.5;

        states[agentIdx] = STATE_RUSHING;
        stateTimers[agentIdx] = 0;
        staggerTimers[agentIdx] = 0;

        // Gender: 50/50
        const isMale = rand() < 0.5;
        genders[agentIdx] = isMale ? 0 : 1;

        const baseColor = isMale ? MALE_COLOR : FEMALE_COLOR;
        colors[i4] = baseColor.r;
        colors[i4 + 1] = baseColor.g;
        colors[i4 + 2] = baseColor.b;
        colors[i4 + 3] = 1.0;

        storeIndices[agentIdx] = storeIdx;
        urgencies[agentIdx] = 0.5 + rand() * 0.5 + stock.golden_score * 0.1;
        maxSpeeds[agentIdx] = 6.0 + stock.golden_score * 3;
        carriesCandy[agentIdx] = 0;

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
      doorPositions,
      storeAgentCounts: new Int16Array(stocks.length),
      storeDoorCounts: new Int16Array(stocks.length),
      staggerTimers,
      tradeLanes,
      storeLaneCounts: new Int16Array(stocks.length * 4),
      count: actualCount,
      numStores: stocks.length,
    };

    simRef.current = data;
    return data;
  }, [stocks, agentCount]);

  // Initialize featured agents for Gemini AI
  const featuredRef = useRef<FeaturedAgent[]>([]);
  useEffect(() => {
    if (sim.count > 0 && stocks.length > 0) {
      featuredRef.current = initFeaturedAgents(sim.count, stocks, sim.storeIndices);
    }
  }, [sim.count, stocks, sim.storeIndices]);

  // Poll Gemini for featured agent decisions + whale arena
  const geminiEnabled = useStore((s) => s.geminiEnabled);
  const geminiRef = useRef(geminiEnabled);
  geminiRef.current = geminiEnabled;

  useEffect(() => {
    if (sim.count === 0 || stocks.length === 0) return;

    const runWhaleUpdate = async () => {
      // Update whale allocations (Gemini + algorithmic)
      await updateWhaleAllocations(stocks, timeModeRef.current, geminiRef.current);
      // Apply whale directions to agents
      applyWhaleToSimulation(
        stocks, sim.storeIndices, sim.targets, sim.doorPositions,
        sim.states, sim.urgencies, sim.tradeLanes, sim.colors, sim.count,
      );
      // Also run featured agent decisions
      const decisions = await fetchAgentDecisions(stocks, sim.storeIndices);
      if (decisions.length > 0) {
        applyDecisions(
          decisions, stocks, sim.storeIndices, sim.targets,
          sim.doorPositions, sim.states, sim.urgencies, sim.tradeLanes,
        );
      }
    };

    const interval = setInterval(runWhaleUpdate, 15000);
    const timeout = setTimeout(runWhaleUpdate, 2000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [sim, stocks]);

  // --- WebSocket integration for backend agent flow instructions ---
  const wsFlowQueue = useRef<AgentFlowInstruction[]>([]);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    if (!apiUrl) return; // No backend configured, skip WebSocket

    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws/agent-stream';
    const client = new AgentStreamClient(wsUrl);

    client.onMessage((data: any) => {
      if (data.type === 'agent_flows' && Array.isArray(data.data)) {
        wsFlowQueue.current.push(...data.data);
      } else if (data.type === 'breaking_news' && data.agent_reaction?.reactions) {
        // Convert breaking news reactions into flow instructions
        for (const reaction of data.agent_reaction.reactions) {
          wsFlowQueue.current.push({
            archetype_id: -1,
            target_ticker: reaction.ticker,
            action: reaction.action,
            confidence: reaction.urgency,
            swarm_size: reaction.agent_count,
          });
        }
      }
    });

    client.connect().catch(() => {
      // Backend not available — silent fail, frontend runs standalone
    });

    return () => { client.disconnect(); };
  }, []);

  // Process WebSocket flow queue: redirect agents to target stores
  const applyWsFlows = useCallback(() => {
    const s = simRef.current;
    if (!s || s.count === 0 || stocks.length === 0) return;

    while (wsFlowQueue.current.length > 0) {
      const flow = wsFlowQueue.current.shift()!;
      const targetStoreIdx = stocks.findIndex((st) => st.ticker === flow.target_ticker);
      if (targetStoreIdx === -1) continue;

      // Redirect `swarm_size` agents to this store
      let redirected = 0;
      const maxRedirect = Math.min(flow.swarm_size, s.count);

      for (let i = 0; i < s.count && redirected < maxRedirect; i++) {
        // Only redirect agents that are RUSHING or ANALYZING
        if (s.states[i] !== STATE_RUSHING && s.states[i] !== STATE_ANALYZING) continue;

        const i3 = i * 3;
        s.storeIndices[i] = targetStoreIdx;
        s.targets[i3] = s.doorPositions[targetStoreIdx * 2];
        s.targets[i3 + 1] = 0;
        s.targets[i3 + 2] = s.doorPositions[targetStoreIdx * 2 + 1];
        s.urgencies[i] = 0.5 + flow.confidence * 0.5;
        s.maxSpeeds[i] = 6.0 + flow.confidence * 8.0;

        if (s.states[i] === STATE_ANALYZING) {
          s.states[i] = STATE_RUSHING;
          s.stateTimers[i] = 0;
        }

        redirected++;
      }
    }
  }, [stocks]);

  // Pre-allocate entry gating buffer (avoid per-frame allocation)
  const admittedRef = useRef<Uint8Array>(new Uint8Array(0));

  // Fast PRNG for simulation (avoids slow Math.random())
  const prngRef = useRef({ s: 12345 });
  const fastRand = useCallback(() => {
    let s = prngRef.current.s;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    prngRef.current.s = s;
    return s / 0x7fffffff;
  }, []);

  const update = useCallback((dt: number) => {
    const s = simRef.current;
    if (!s || s.count === 0) return;

    // Process any pending WebSocket flow instructions
    applyWsFlows();

    const grid = gridRef.current;
    const clampedDt = Math.min(dt, 0.05);

    // Reset per-store counters
    s.storeAgentCounts.fill(0);
    s.storeDoorCounts.fill(0);
    s.storeLaneCounts.fill(0);

    // 1. Rebuild spatial grid
    grid.clear();
    for (let i = 0; i < s.count; i++) {
      const i3 = i * 3;
      grid.insert(i, s.positions[i3], s.positions[i3 + 2]);
    }

    // Track which stores have admitted an agent this frame (entry gating)
    if (admittedRef.current.length !== s.numStores) {
      admittedRef.current = new Uint8Array(s.numStores);
    }
    const storeAdmittedThisFrame = admittedRef.current;
    storeAdmittedThisFrame.fill(0);

    // 2. Update each agent
    for (let i = 0; i < s.count; i++) {
      const i3 = i * 3;
      const i4 = i * 4;

      // Velocity damping (friction) — prevents oscillation
      s.velocities[i3] *= 0.96;
      s.velocities[i3 + 2] *= 0.96;

      const px = s.positions[i3];
      const pz = s.positions[i3 + 2];
      const storeIdx = s.storeIndices[i];

      // Count agents per store state
      if (s.states[i] === STATE_INSIDE) {
        s.storeAgentCounts[storeIdx]++;
        s.storeLaneCounts[storeIdx * 4 + s.tradeLanes[i]]++;
      } else if (s.states[i] === STATE_DOOR_FIGHTING) {
        s.storeDoorCounts[storeIdx]++;
      }

      // Stagger timer
      if (s.staggerTimers[i] > 0) {
        s.staggerTimers[i] -= 1;
      }

      // Handle INSIDE state — agents stand at their trade lane quadrant
      if (s.states[i] === STATE_INSIDE) {
        // Subtle idle drift inside the store
        s.positions[i3] += (fastRand() - 0.5) * 0.008;
        s.positions[i3 + 2] += (fastRand() - 0.5) * 0.008;

        // Tint color toward trade lane colour
        const lane = s.tradeLanes[i];
        const laneR = [0, 0, 1, 1];          // BUY=green, CALL=blue, PUT=gold, SHORT=red
        const laneG = [1, 0.75, 0.84, 0.27];
        const laneB = [0.5, 1, 0, 0];
        const baseColor = s.genders[i] === 0 ? MALE_COLOR : FEMALE_COLOR;
        s.colors[i4]     = baseColor.r * 0.45 + laneR[lane] * 0.55;
        s.colors[i4 + 1] = baseColor.g * 0.45 + laneG[lane] * 0.55;
        s.colors[i4 + 2] = baseColor.b * 0.45 + laneB[lane] * 0.55;
        s.colors[i4 + 3] = 1.0;

        s.stateTimers[i] -= 1;
        if (s.stateTimers[i] <= 0) {
          // Transition to ANALYZING with a pause before rushing to next store
          s.states[i] = STATE_ANALYZING;
          s.stateTimers[i] = 20 + fastRand() * 30; // 20-50 frame pause

          // Teleport to current store's door so agent exits cleanly
          s.positions[i3]     = s.doorPositions[storeIdx * 2];
          s.positions[i3 + 2] = s.doorPositions[storeIdx * 2 + 1];

          // Give a small kick velocity away from the door
          s.velocities[i3] = (fastRand() - 0.5) * 4;
          s.velocities[i3 + 2] = (fastRand() + 0.5) * 3; // bias forward (away from store)

          const stocksArr = stocks;
          if (stocksArr.length > 1) {
            // Force a DIFFERENT store than current one
            let newStoreIdx = Math.floor(fastRand() * (stocksArr.length - 1));
            if (newStoreIdx >= storeIdx) newStoreIdx++;
            const newStore = stocksArr[newStoreIdx];
            s.targets[i3] = s.doorPositions[newStoreIdx * 2];
            s.targets[i3 + 1] = 0;
            s.targets[i3 + 2] = s.doorPositions[newStoreIdx * 2 + 1];
            s.storeIndices[i] = newStoreIdx;

            // Future mode: urgency scales with |forward_return median|
            if (timeModeRef.current === 'future') {
              const fwdMedian = Math.abs(newStore.forward_return_distribution.median);
              s.urgencies[i] = 0.5 + fwdMedian * 8.0 + newStore.golden_score * 0.1;
              s.maxSpeeds[i] = 6.0 + fwdMedian * 20.0 + newStore.golden_score * 3;
            } else {
              s.urgencies[i] = 0.5 + fastRand() * 0.5 + newStore.golden_score * 0.1;
              s.maxSpeeds[i] = 6.0 + newStore.golden_score * 3;
            }

            if (fastRand() < 0.3) {
              s.carriesCandy[i] = 1;
              const bc3 = i * 3;
              s.colors[i4] = s.brandColors[bc3];
              s.colors[i4 + 1] = s.brandColors[bc3 + 1];
              s.colors[i4 + 2] = s.brandColors[bc3 + 2];
            }

            const newColor = hexToRGB(newStore.brand_color);
            s.brandColors[i3] = newColor.r;
            s.brandColors[i3 + 1] = newColor.g;
            s.brandColors[i3 + 2] = newColor.b;
          }
        }
        continue;
      }

      if (s.states[i] === STATE_ANALYZING) {
        s.stateTimers[i] -= 1;
        // Apply velocity so agents drift away from the store they just exited
        s.velocities[i3] *= 0.94;
        s.velocities[i3 + 2] *= 0.94;
        s.positions[i3] += s.velocities[i3] * clampedDt;
        s.positions[i3 + 2] += s.velocities[i3 + 2] * clampedDt;
        if (s.stateTimers[i] <= 0) {
          s.states[i] = STATE_RUSHING;
        }
        continue;
      }

      // Get door position for this agent's target store
      const doorX = s.doorPositions[storeIdx * 2];
      const doorZ = s.doorPositions[storeIdx * 2 + 1];

      const tx = s.targets[i3];
      const tz = s.targets[i3 + 2];

      // Distance to door
      let dx = doorX - px;
      let dz = doorZ - pz;
      let distToDoor = Math.sqrt(dx * dx + dz * dz);

      // === Transition RUSHING → DOOR_FIGHTING ===
      if (s.states[i] === STATE_RUSHING && distToDoor < 2.5) {
        s.states[i] = STATE_DOOR_FIGHTING;
      }

      // === DOOR_FIGHTING behavior ===
      if (s.states[i] === STATE_DOOR_FIGHTING) {
        // Try to enter the store (entry gating: 1 per store per frame)
        if (distToDoor < 0.5 && !storeAdmittedThisFrame[storeIdx]) {
          // This agent gets in!
          storeAdmittedThisFrame[storeIdx] = 1;
          s.states[i] = STATE_INSIDE;
          s.stateTimers[i] = 60 + fastRand() * 60;
          s.velocities[i3] = 0;
          s.velocities[i3 + 2] = 0;
          if (s.carriesCandy[i]) s.carriesCandy[i] = 0;

          // Assign trade lane based on modulated or stock's direction_bias
          const stock = stocks[storeIdx];
          const bias = modulatedBiasesRef.current.length > storeIdx
            ? modulatedBiasesRef.current[storeIdx]
            : stock.direction_bias;
          const biases = [bias.buy, bias.call, bias.put, bias.short];
          const totalBias = biases[0] + biases[1] + biases[2] + biases[3];
          let roll = fastRand() * totalBias;
          let lane = 0;
          for (let l = 0; l < 4; l++) {
            roll -= biases[l];
            if (roll <= 0) { lane = l; break; }
          }
          s.tradeLanes[i] = lane;

          // Position at the corresponding interior quadrant
          const sw = stock.store_dimensions.width * (stock.is_platinum ? 1.5 : 1.0);
          const sd = stock.store_dimensions.depth * (stock.is_platinum ? 1.5 : 1.0);
          const sx = stock.city_position.x;
          const sz = stock.city_position.z;
          // BUY=back-left, CALL=back-right, PUT=front-left, SHORT=front-right
          const laneX = lane % 2 === 0 ? -0.22 : 0.22;
          const laneZ = lane < 2 ? -0.2 : 0.12;
          s.positions[i3]     = sx + laneX * sw + (fastRand() - 0.5) * sw * 0.12;
          s.positions[i3 + 1] = 0;
          s.positions[i3 + 2] = sz + laneZ * sd + (fastRand() - 0.5) * sd * 0.12;

          continue;
        }

        // Strong force toward door
        const doorStrength = 6.0 * s.urgencies[i];
        let fGoalX = 0;
        let fGoalZ = 0;
        if (distToDoor > 0.01) {
          fGoalX = (dx / distToDoor) * doorStrength;
          fGoalZ = (dz / distToDoor) * doorStrength;
        }

        // Tight separation (agents pack closer at the door)
        let fSepX = 0;
        let fSepZ = 0;
        const neighbors = grid.getNeighbors(px, pz);
        const sepRadius = 0.5;

        for (let n = 0; n < neighbors.length; n++) {
          const j = neighbors[n];
          if (j === i) continue;
          const j3 = j * 3;
          const ndx = px - s.positions[j3];
          const ndz = pz - s.positions[j3 + 2];
          const ndist2 = ndx * ndx + ndz * ndz;

          if (ndist2 > 0.001 && ndist2 < sepRadius * sepRadius) {
            const invDist = 1.0 / Math.sqrt(ndist2);
            fSepX += ndx * invDist;
            fSepZ += ndz * invDist;

            // Stagger on very close collision
            if (ndist2 < 0.09 && s.staggerTimers[i] <= 0) {
              s.staggerTimers[i] = 10;
              const kickStrength = 0.8;
              s.velocities[i3] += ndx * kickStrength;
              s.velocities[i3 + 2] += ndz * kickStrength;
            }
          }
        }

        // Lateral jostling (shoving noise)
        const jostleX = (fastRand() - 0.5) * 0.8;
        const jostleZ = (fastRand() - 0.5) * 0.8;

        // Stagger reduces movement
        const staggerMult = s.staggerTimers[i] > 0 ? 0.3 : 1.0;

        const fTotalX = (fGoalX + fSepX * 0.5 + jostleX) * staggerMult;
        const fTotalZ = (fGoalZ + fSepZ * 0.5 + jostleZ) * staggerMult;

        let vx = s.velocities[i3] + fTotalX * clampedDt;
        let vz = s.velocities[i3 + 2] + fTotalZ * clampedDt;

        const speed = Math.sqrt(vx * vx + vz * vz);
        const maxSpeed = s.maxSpeeds[i] * 0.5; // Slower near door
        if (speed > maxSpeed) {
          const sc = maxSpeed / speed;
          vx *= sc;
          vz *= sc;
        }

        s.velocities[i3] = vx;
        s.velocities[i3 + 2] = vz;
        s.positions[i3] += vx * clampedDt;
        s.positions[i3 + 2] += vz * clampedDt;

      } else {
        // === RUSHING or EXITING behavior ===
        dx = tx - px;
        dz = tz - pz;
        let dist = Math.sqrt(dx * dx + dz * dz);

        let fGoalX = 0;
        let fGoalZ = 0;
        if (dist > 0.01) {
          const goalStrength = 10.0 * s.urgencies[i];
          fGoalX = (dx / dist) * goalStrength;
          fGoalZ = (dz / dist) * goalStrength;
        }

        // Separation force (reduced radius to prevent deadlock)
        let fSepX = 0;
        let fSepZ = 0;
        const neighbors = grid.getNeighbors(px, pz);
        const sepRadius = 1.0;

        for (let n = 0; n < neighbors.length; n++) {
          const j = neighbors[n];
          if (j === i) continue;
          const j3 = j * 3;
          const ndx = px - s.positions[j3];
          const ndz = pz - s.positions[j3 + 2];
          const ndist2 = ndx * ndx + ndz * ndz;

          if (ndist2 > 0.001 && ndist2 < sepRadius * sepRadius) {
            const invDist = 1.0 / Math.sqrt(ndist2);
            fSepX += ndx * invDist;
            fSepZ += ndz * invDist;
          }
        }

        const fTurbX = (fastRand() - 0.5) * 0.4;
        const fTurbZ = (fastRand() - 0.5) * 0.4;

        const fTotalX = fGoalX + fSepX * 0.4 + fTurbX;
        const fTotalZ = fGoalZ + fSepZ * 0.4 + fTurbZ;

        let vx = s.velocities[i3] + fTotalX * clampedDt;
        let vz = s.velocities[i3 + 2] + fTotalZ * clampedDt;

        const speed = Math.sqrt(vx * vx + vz * vz);
        const maxSpeed = s.maxSpeeds[i];
        if (speed > maxSpeed) {
          const sc = maxSpeed / speed;
          vx *= sc;
          vz *= sc;
        }

        s.velocities[i3] = vx;
        s.velocities[i3 + 1] = 0;
        s.velocities[i3 + 2] = vz;

        s.positions[i3] += vx * clampedDt;
        s.positions[i3 + 2] += vz * clampedDt;

        // Arrival check — transition to door fighting zone
        dx = doorX - s.positions[i3];
        dz = doorZ - s.positions[i3 + 2];
        dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 2.5) {
          s.states[i] = STATE_DOOR_FIGHTING;
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
  }, [stocks, fastRand, applyWsFlows]);

  return {
    positions: sim.positions,
    velocities: sim.velocities,
    colors: sim.colors,
    states: sim.states,
    count: sim.count,
    storeAgentCounts: sim.storeAgentCounts,
    storeDoorCounts: sim.storeDoorCounts,
    storeLaneCounts: sim.storeLaneCounts,
    featuredAgents: featuredRef.current,
    whales: getWhales(),
    update,
  };
}
