// ============================================================
// Wolf of Wall Sweet — Whale Arena
// 4 competing hedge fund "Whales":
//   1. Wonka Fund — Hierarchical Gemini AI (11 analysts + PM + risk)
//   2. Slugworth Fund — Momentum strategy (algorithmic)
//   3. Oompa Fund — Value/Dip strategy (algorithmic)
//   4. Gobstopper Fund — Contrarian strategy (algorithmic)
// Each whale controls ~25% of agents with distinct faction colors.
// ============================================================

import type { StockData } from '../types';
import { runHierarchicalCycle, getLatestChain } from './geminiService';

export interface WhaleAllocation {
  ticker: string;
  weight: number;
  action: 'BUY' | 'CALL' | 'PUT' | 'SHORT';
}

export interface WhaleFund {
  id: number;
  name: string;
  strategy: string;
  color: string;
  colorRGB: [number, number, number];
  icon: string;
  allocations: WhaleAllocation[];
  totalProfit: number;
  tradeCount: number;
  lastUpdated: number;
  reasoning: string;
}

const FACTION_COLORS = {
  wonka:       { hex: '#FFD700', rgb: [1.0, 0.84, 0.0] as [number, number, number] },
  slugworth:   { hex: '#FF4500', rgb: [1.0, 0.27, 0.0] as [number, number, number] },
  oompa:       { hex: '#00FF7F', rgb: [0.0, 1.0, 0.5] as [number, number, number] },
  gobstopper:  { hex: '#9370DB', rgb: [0.58, 0.44, 0.86] as [number, number, number] },
};

const WHALES: WhaleFund[] = [
  {
    id: 0, name: 'Wonka Fund', strategy: 'Gemini AI (Hierarchical)',
    color: FACTION_COLORS.wonka.hex, colorRGB: FACTION_COLORS.wonka.rgb,
    icon: 'W',
    allocations: [], totalProfit: 0, tradeCount: 0, lastUpdated: 0,
    reasoning: 'Initializing 11 Sector Analysts + Portfolio Manager + Risk Desk...',
  },
  {
    id: 1, name: 'Slugworth Fund', strategy: 'Momentum',
    color: FACTION_COLORS.slugworth.hex, colorRGB: FACTION_COLORS.slugworth.rgb,
    icon: 'S',
    allocations: [], totalProfit: 0, tradeCount: 0, lastUpdated: 0,
    reasoning: 'Scanning for momentum runners...',
  },
  {
    id: 2, name: 'Oompa Fund', strategy: 'Value/Dip',
    color: FACTION_COLORS.oompa.hex, colorRGB: FACTION_COLORS.oompa.rgb,
    icon: 'O',
    allocations: [], totalProfit: 0, tradeCount: 0, lastUpdated: 0,
    reasoning: 'Hunting for deep value...',
  },
  {
    id: 3, name: 'Gobstopper Fund', strategy: 'Contrarian',
    color: FACTION_COLORS.gobstopper.hex, colorRGB: FACTION_COLORS.gobstopper.rgb,
    icon: 'G',
    allocations: [], totalProfit: 0, tradeCount: 0, lastUpdated: 0,
    reasoning: 'Fading the consensus...',
  },
];

export function getWhales(): WhaleFund[] {
  return WHALES;
}

export function getAgentFaction(agentIndex: number): number {
  return agentIndex % 4;
}

// ── Momentum Strategy ──
function momentumAllocations(stocks: StockData[], timeMode: string): WhaleAllocation[] {
  if (timeMode === 'future') {
    // In future mode, use forward returns instead of technicals
    return stocks
      .filter((s) => s.forward_return_distribution.median > 0.02)
      .sort((a, b) => b.forward_return_distribution.median - a.forward_return_distribution.median)
      .slice(0, 8)
      .map((s, _i, arr) => ({
        ticker: s.ticker,
        weight: 1.0 / arr.length,
        action: s.forward_return_distribution.median > 0.05 ? 'CALL' as const : 'BUY' as const,
      }));
  }
  return stocks
    .filter((s) => s.technicals && s.technicals.rsi_14 > 55 && s.technicals.macd_histogram > 0)
    .sort((a, b) => (b.technicals?.rsi_14 || 0) - (a.technicals?.rsi_14 || 0))
    .slice(0, 8)
    .map((s, _i, arr) => ({
      ticker: s.ticker,
      weight: 1.0 / arr.length,
      action: (s.technicals?.rsi_14 || 0) > 70 ? 'CALL' as const : 'BUY' as const,
    }));
}

// ── Value/Dip Strategy ──
function valueAllocations(stocks: StockData[], timeMode: string): WhaleAllocation[] {
  if (timeMode === 'future') {
    // In future: target negative median but positive skew (mean-reversion)
    return stocks
      .filter((s) => s.forward_return_distribution.median < 0 && s.forward_return_distribution.skew > 0.3)
      .sort((a, b) => a.forward_return_distribution.median - b.forward_return_distribution.median)
      .slice(0, 8)
      .map((s, _i, arr) => ({
        ticker: s.ticker,
        weight: 1.0 / arr.length,
        action: 'BUY' as const,
      }));
  }
  return stocks
    .filter((s) => s.drawdown_current < -0.08 && s.golden_score >= 1)
    .sort((a, b) => a.drawdown_current - b.drawdown_current)
    .slice(0, 8)
    .map((s, _i, arr) => ({
      ticker: s.ticker,
      weight: 1.0 / arr.length,
      action: 'BUY' as const,
    }));
}

// ── Contrarian Strategy ──
function contrarianAllocations(stocks: StockData[], timeMode: string): WhaleAllocation[] {
  if (timeMode === 'future') {
    // Short stocks with strongly positive projected returns, buy strongly negative
    const shorts = stocks
      .filter((s) => s.forward_return_distribution.median > 0.06)
      .sort((a, b) => b.forward_return_distribution.median - a.forward_return_distribution.median)
      .slice(0, 4)
      .map((s) => ({ ticker: s.ticker, weight: 0.12, action: 'SHORT' as const }));
    const longs = stocks
      .filter((s) => s.forward_return_distribution.median < -0.03)
      .sort((a, b) => a.forward_return_distribution.median - b.forward_return_distribution.median)
      .slice(0, 4)
      .map((s) => ({ ticker: s.ticker, weight: 0.13, action: 'BUY' as const }));
    return [...shorts, ...longs];
  }

  const shorts = stocks
    .filter((s) => s.technicals && s.technicals.rsi_14 > 72)
    .sort((a, b) => (b.technicals?.rsi_14 || 0) - (a.technicals?.rsi_14 || 0))
    .slice(0, 4)
    .map((s) => ({ ticker: s.ticker, weight: 0.12, action: 'SHORT' as const }));

  const longs = stocks
    .filter((s) => s.technicals && s.technicals.rsi_14 < 32)
    .sort((a, b) => (a.technicals?.rsi_14 || 0) - (b.technicals?.rsi_14 || 0))
    .slice(0, 4)
    .map((s) => ({ ticker: s.ticker, weight: 0.13, action: 'BUY' as const }));

  return [...shorts, ...longs];
}

// ── Wonka fallback (golden score picks) ──
function runWonkaFallback(stocks: StockData[], now: number, forced = false) {
  const goldenStocks = stocks
    .filter((s) => s.golden_score >= 2)
    .sort((a, b) => b.golden_score - a.golden_score)
    .slice(0, 8);

  if (goldenStocks.length > 0) {
    const weight = 1.0 / goldenStocks.length;
    WHALES[0].allocations = goldenStocks.map((s) => ({
      ticker: s.ticker,
      weight,
      action: s.golden_score >= 4
        ? 'BUY' as const
        : s.golden_score >= 3
          ? 'CALL' as const
          : 'BUY' as const,
    }));
    WHALES[0].lastUpdated = now;
    WHALES[0].reasoning = forced
      ? `Algorithmic mode: ${goldenStocks.length} golden ticket stocks (Gemini OFF)`
      : `Fallback mode (no API key): ${goldenStocks.length} golden ticket stocks. Add VITE_GEMINI_API_KEY for full AI.`;
  }
}

// ── Update all whales ──
export async function updateWhaleAllocations(
  stocks: StockData[],
  timeMode: 'historical' | 'present' | 'future' = 'present',
  useGemini = true,
): Promise<void> {
  if (stocks.length === 0) return;
  const now = Date.now();
  const modeLabel = timeMode === 'future' ? ' [FUTURE]' : '';

  // Algorithmic whales
  WHALES[1].allocations = momentumAllocations(stocks, timeMode);
  WHALES[1].lastUpdated = now;
  WHALES[1].reasoning = timeMode === 'future'
    ? `Projected ${WHALES[1].allocations.length} forward-return plays${modeLabel}`
    : `Riding ${WHALES[1].allocations.length} momentum plays (RSI > 55, MACD+)`;

  WHALES[2].allocations = valueAllocations(stocks, timeMode);
  WHALES[2].lastUpdated = now;
  WHALES[2].reasoning = timeMode === 'future'
    ? `${WHALES[2].allocations.length} mean-reversion candidates (neg median + pos skew)${modeLabel}`
    : `${WHALES[2].allocations.length} dip-buy candidates (DD + golden tickets)`;

  WHALES[3].allocations = contrarianAllocations(stocks, timeMode);
  WHALES[3].lastUpdated = now;
  const shorts = WHALES[3].allocations.filter((a) => a.action === 'SHORT').length;
  const longs = WHALES[3].allocations.filter((a) => a.action === 'BUY').length;
  WHALES[3].reasoning = timeMode === 'future'
    ? `Contrarian: shorting ${shorts} projected winners, buying ${longs} projected losers${modeLabel}`
    : `Fading ${shorts} overbought, buying ${longs} oversold`;

  // Wonka Fund: hierarchical Gemini cycle (or fallback)
  if (useGemini) {
    const geminiAllocs = await runHierarchicalCycle(stocks);
    if (geminiAllocs.length > 0) {
      WHALES[0].allocations = geminiAllocs.map((a) => ({
        ticker: a.ticker,
        weight: a.weight,
        action: a.action,
      }));
      WHALES[0].lastUpdated = now;

      const chain = getLatestChain();
      if (chain) {
        const sectors = chain.sectorReports.length;
        const risk = chain.riskReview?.overallRisk || 'unknown';
        WHALES[0].reasoning = `${sectors} analysts -> PM -> Risk(${risk}): ${chain.finalAllocations.length} positions in ${chain.cycleMs}ms`;
      }
      // If Gemini returned results, skip fallback
    } else {
      // Gemini returned empty (no key or cycle throttled) — use fallback
      runWonkaFallback(stocks, now);
    }
  } else {
    // Gemini explicitly disabled by user
    runWonkaFallback(stocks, now, true);
  }

  // Simulate profit using forward returns
  for (const whale of WHALES) {
    let totalReturn = 0;
    for (const alloc of whale.allocations) {
      const stock = stocks.find((s) => s.ticker === alloc.ticker);
      if (!stock) continue;
      let ret = stock.forward_return_distribution.median;
      if (alloc.action === 'SHORT' || alloc.action === 'PUT') ret = -ret;
      if (alloc.action === 'CALL') ret *= 1.5;
      totalReturn += ret * alloc.weight;
    }
    whale.totalProfit += totalReturn * 10000;
    whale.tradeCount += whale.allocations.length;
  }
}

// ── Apply whale allocations to simulation ──
export function applyWhaleToSimulation(
  stocks: StockData[],
  storeIndices: Int16Array,
  targets: Float32Array,
  doorPositions: Float32Array,
  states: Uint8Array,
  urgencies: Float32Array,
  tradeLanes: Uint8Array,
  colors: Float32Array,
  count: number,
) {
  const STATE_RUSHING = 1;
  const ACTION_TO_LANE: Record<string, number> = { BUY: 0, CALL: 1, PUT: 2, SHORT: 3 };

  // Build ticker->storeIdx lookup for performance
  const tickerToStore = new Map<string, number>();
  for (let si = 0; si < stocks.length; si++) {
    tickerToStore.set(stocks[si].ticker, si);
  }

  for (let i = 0; i < count; i++) {
    const faction = getAgentFaction(i);
    const whale = WHALES[faction];
    if (whale.allocations.length === 0) continue;
    if (states[i] !== STATE_RUSHING) continue;

    const allocIdx = i % whale.allocations.length;
    const alloc = whale.allocations[allocIdx];

    const targetStoreIdx = tickerToStore.get(alloc.ticker);
    if (targetStoreIdx === undefined) continue;

    const i3 = i * 3;
    const i4 = i * 4;

    storeIndices[i] = targetStoreIdx;
    targets[i3] = doorPositions[targetStoreIdx * 2];
    targets[i3 + 1] = 0;
    targets[i3 + 2] = doorPositions[targetStoreIdx * 2 + 1];
    tradeLanes[i] = ACTION_TO_LANE[alloc.action] ?? 0;
    urgencies[i] = 0.7 + alloc.weight * 1.5;

    // Faction color tint
    const fc = whale.colorRGB;
    colors[i4] = colors[i4] * 0.4 + fc[0] * 0.6;
    colors[i4 + 1] = colors[i4 + 1] * 0.4 + fc[1] * 0.6;
    colors[i4 + 2] = colors[i4 + 2] * 0.4 + fc[2] * 0.6;
  }
}
