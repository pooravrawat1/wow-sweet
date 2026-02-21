// ============================================================
// Wolf of Wall Sweet — Hierarchical Gemini Multi-Agent System
//
// Architecture:
//   Layer 1: 11 Sector Analysts (Gemini Flash) — analyze per-sector
//   Layer 2: 1 Portfolio Manager (Gemini Flash) — final allocation
//   Layer 3: 1 Risk Desk (Gemini Flash) — validate/override
//
// The Wonka Fund's AI brain.
// ============================================================

import type { StockData } from '../types';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const FLASH_MODEL = 'gemini-2.0-flash';
const FLASH_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${FLASH_MODEL}:generateContent?key=${API_KEY}`;

// ── Types ──

export interface SectorReport {
  sector: string;
  topPicks: Array<{ ticker: string; action: string; conviction: number; reason: string }>;
  sectorSentiment: 'bullish' | 'bearish' | 'neutral';
  riskLevel: 'low' | 'medium' | 'high';
}

export interface PortfolioAllocation {
  ticker: string;
  weight: number;
  action: 'BUY' | 'CALL' | 'PUT' | 'SHORT';
  sectorSource: string;
}

export interface RiskOverride {
  approved: boolean;
  adjustments: Array<{ ticker: string; reason: string; newWeight: number }>;
  overallRisk: string;
}

export interface AgentDecision {
  agentIndex: number;
  targetTicker: string;
  action: 'BUY' | 'CALL' | 'PUT' | 'SHORT';
  reasoning: string;
  confidence: number;
}

export interface FeaturedAgent {
  index: number;
  name: string;
  currentTicker: string;
  decision: AgentDecision | null;
  lastUpdated: number;
}

// ── State ──

let featuredAgents: FeaturedAgent[] = [];
let lastCycleTime = 0;
let isCycleRunning = false;
const CYCLE_INTERVAL = 10000; // 10 seconds with $1,200 credits

// Reasoning chain (visible in UI)
export interface ReasoningChain {
  sectorReports: SectorReport[];
  portfolioAllocations: PortfolioAllocation[];
  riskReview: RiskOverride | null;
  finalAllocations: PortfolioAllocation[];
  timestamp: number;
  cycleMs: number;
}

let latestChain: ReasoningChain | null = null;

export function getLatestChain(): ReasoningChain | null {
  return latestChain;
}

// ── Helpers ──

async function callGemini(prompt: string, temperature = 0.7): Promise<string> {
  const res = await fetch(FLASH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseJSON<T>(text: string): T {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

function stockSummary(s: StockData): string {
  const t = s.technicals;
  const tech = t ? `RSI:${t.rsi_14.toFixed(0)} MACD:${t.macd_histogram.toFixed(2)} BB%B:${t.bb_pct_b.toFixed(2)} Z:${t.zscore_20d.toFixed(1)} Vol:${t.realized_vol_20d.toFixed(2)}` : '';
  return `${s.ticker}|GS:${s.golden_score}|DD:${(s.drawdown_current * 100).toFixed(1)}%|${tech}`;
}

// ── Layer 1: Sector Analysts (Flash) ──

async function runSectorAnalyst(sector: string, stocks: StockData[]): Promise<SectorReport> {
  const sectorStocks = stocks.filter((s) => s.sector === sector);
  if (sectorStocks.length === 0) {
    return { sector, topPicks: [], sectorSentiment: 'neutral', riskLevel: 'low' };
  }

  const summaries = sectorStocks.map(stockSummary).join('\n');

  const prompt = `You are a ${sector} Sector Analyst at the Wonka Fund. Analyze these stocks and pick the top 3 opportunities.

Stocks (ticker|golden_score|drawdown|RSI|MACD|BB%B|Z-score|volatility):
${summaries}

Scoring guide:
- Golden Score 1+ = dip ticket (buy the dip opportunity)
- RSI > 70 = overbought (consider PUT/SHORT), RSI < 30 = oversold (BUY/CALL)
- Negative Z-score + Golden Score = mean reversion play
- Deep drawdown + low volatility = value opportunity

Respond with ONLY valid JSON:
{"sector":"${sector}","topPicks":[{"ticker":"XX","action":"BUY|CALL|PUT|SHORT","conviction":1-100,"reason":"brief reason"}],"sectorSentiment":"bullish|bearish|neutral","riskLevel":"low|medium|high"}`;

  try {
    const text = await callGemini(prompt, 0.6);
    return parseJSON<SectorReport>(text);
  } catch {
    return { sector, topPicks: [], sectorSentiment: 'neutral', riskLevel: 'medium' };
  }
}

// ── Layer 2: Portfolio Manager ──

async function runPortfolioManager(reports: SectorReport[]): Promise<PortfolioAllocation[]> {
  const reportSummary = reports
    .filter((r) => r.topPicks.length > 0)
    .map((r) => {
      const picks = r.topPicks.map((p) => `${p.ticker}(${p.action},${p.conviction})`).join(', ');
      return `${r.sector} [${r.sectorSentiment}/${r.riskLevel}]: ${picks}`;
    })
    .join('\n');

  const prompt = `You are the Portfolio Manager at the Wonka Fund. Your Sector Analysts have submitted these reports:

${reportSummary}

Build a diversified portfolio of 6-10 positions. Rules:
- Weights must sum to ~1.0 (each position 0.05-0.25)
- Diversify across sectors — no more than 30% in one sector
- Higher conviction picks get higher weight
- Balance long (BUY/CALL) vs short (PUT/SHORT) positions
- Prioritize high Golden Score stocks

Respond with ONLY valid JSON array:
[{"ticker":"XX","weight":0.15,"action":"BUY","sectorSource":"Technology"},...]`;

  try {
    const text = await callGemini(prompt, 0.5);
    return parseJSON<PortfolioAllocation[]>(text);
  } catch {
    return [];
  }
}

// ── Layer 3: Risk Desk ──

async function runRiskDesk(allocations: PortfolioAllocation[], stocks: StockData[]): Promise<RiskOverride> {
  const allocSummary = allocations.map((a) => {
    const stock = stocks.find((s) => s.ticker === a.ticker);
    const dd = stock ? (stock.drawdown_current * 100).toFixed(1) : '?';
    const vol = stock?.technicals?.realized_vol_20d.toFixed(2) || '?';
    return `${a.ticker}|${a.action}|${(a.weight * 100).toFixed(0)}%|DD:${dd}%|Vol:${vol}`;
  }).join('\n');

  const prompt = `You are the Risk Manager at the Wonka Fund. Review this portfolio:

${allocSummary}

Risk checks:
- Any single position > 25%? Flag it.
- Any SHORT on a stock in deep drawdown (DD < -20%)? Dangerous — reduce weight.
- Total SHORT exposure > 40%? Too bearish — flag.
- Any high-volatility (Vol > 0.4) position with weight > 15%? Reduce.

If portfolio passes all checks, approve it. Otherwise, provide adjustments.

Respond with ONLY valid JSON:
{"approved":true|false,"adjustments":[{"ticker":"XX","reason":"why","newWeight":0.1}],"overallRisk":"low|medium|high|extreme"}`;

  try {
    const text = await callGemini(prompt, 0.3);
    return parseJSON<RiskOverride>(text);
  } catch {
    return { approved: true, adjustments: [], overallRisk: 'medium' };
  }
}

// ── Full Cycle ──

export async function runHierarchicalCycle(stocks: StockData[]): Promise<PortfolioAllocation[]> {
  if (!API_KEY) {
    console.warn('[Wonka] No VITE_GEMINI_API_KEY set — running fallback mode. Get your key at https://aistudio.google.com/apikey');
    return [];
  }
  if (isCycleRunning) return [];

  const now = Date.now();
  if (now - lastCycleTime < CYCLE_INTERVAL) return [];

  isCycleRunning = true;
  lastCycleTime = now;
  const cycleStart = now;

  try {
    // Get unique sectors
    const sectors = [...new Set(stocks.map((s) => s.sector))];

    // Layer 1: Run all sector analysts in parallel
    console.log(`[Wonka] Running ${sectors.length} sector analysts...`);
    const sectorReports = await Promise.all(
      sectors.map((sector) => runSectorAnalyst(sector, stocks))
    );

    const validReports = sectorReports.filter((r) => r.topPicks.length > 0);
    console.log(`[Wonka] ${validReports.length}/${sectors.length} sectors reported picks`);

    if (validReports.length === 0) {
      isCycleRunning = false;
      return [];
    }

    // Layer 2: Portfolio Manager combines sector reports
    console.log('[Wonka] Portfolio Manager synthesizing...');
    const allocations = await runPortfolioManager(validReports);
    console.log(`[Wonka] Portfolio: ${allocations.length} positions`);

    if (allocations.length === 0) {
      isCycleRunning = false;
      return [];
    }

    // Layer 3: Risk Desk reviews
    console.log('[Wonka] Risk Desk reviewing...');
    const riskReview = await runRiskDesk(allocations, stocks);
    console.log(`[Wonka] Risk: ${riskReview.overallRisk}, approved: ${riskReview.approved}`);

    // Apply risk adjustments
    let finalAllocations = [...allocations];
    if (!riskReview.approved && riskReview.adjustments.length > 0) {
      for (const adj of riskReview.adjustments) {
        const idx = finalAllocations.findIndex((a) => a.ticker === adj.ticker);
        if (idx !== -1) {
          finalAllocations[idx] = { ...finalAllocations[idx], weight: adj.newWeight };
        }
      }
    }

    // Normalize weights
    const totalWeight = finalAllocations.reduce((sum, a) => sum + a.weight, 0);
    if (totalWeight > 0) {
      finalAllocations = finalAllocations.map((a) => ({
        ...a,
        weight: a.weight / totalWeight,
      }));
    }

    const cycleMs = Date.now() - cycleStart;

    // Store reasoning chain for UI
    latestChain = {
      sectorReports: validReports,
      portfolioAllocations: allocations,
      riskReview,
      finalAllocations,
      timestamp: now,
      cycleMs,
    };

    console.log(`[Wonka] Cycle complete in ${cycleMs}ms — ${finalAllocations.length} final positions`);
    return finalAllocations;

  } catch (err) {
    console.warn('[Wonka] Cycle error:', err);
    return [];
  } finally {
    isCycleRunning = false;
  }
}

// ── Featured Agents (kept for backward compatibility) ──

export function initFeaturedAgents(
  agentCount: number,
  stocks: StockData[],
  storeIndices: Int16Array,
): FeaturedAgent[] {
  const count = Math.min(20, agentCount);
  const step = Math.floor(agentCount / count);
  featuredAgents = [];

  const names = [
    'Atlas', 'Blaze', 'Cipher', 'Delta', 'Echo',
    'Flux', 'Granite', 'Helix', 'Ion', 'Jade',
    'Krypton', 'Luna', 'Maven', 'Nexus', 'Onyx',
    'Prism', 'Quartz', 'Raven', 'Sage', 'Titan',
  ];

  for (let i = 0; i < count; i++) {
    const agentIdx = i * step;
    const storeIdx = storeIndices[agentIdx];
    featuredAgents.push({
      index: agentIdx,
      name: names[i % names.length],
      currentTicker: stocks[storeIdx]?.ticker || 'AAPL',
      decision: null,
      lastUpdated: 0,
    });
  }

  return featuredAgents;
}

export function getFeaturedAgents(): FeaturedAgent[] {
  return featuredAgents;
}

// Simplified: fetchAgentDecisions now uses hierarchical cycle results
export async function fetchAgentDecisions(
  _stocks: StockData[],
  _storeIndices: Int16Array,
): Promise<AgentDecision[]> {
  // The hierarchical cycle is handled by whaleArena calling runHierarchicalCycle
  // This function now just returns empty — decisions come from the whale system
  return [];
}

export function applyDecisions(
  decisions: AgentDecision[],
  stocks: StockData[],
  storeIndices: Int16Array,
  targets: Float32Array,
  doorPositions: Float32Array,
  states: Uint8Array,
  urgencies: Float32Array,
  tradeLanes: Uint8Array,
) {
  const STATE_RUSHING = 1;
  const ACTION_TO_LANE: Record<string, number> = { BUY: 0, CALL: 1, PUT: 2, SHORT: 3 };

  for (const d of decisions) {
    const targetStoreIdx = stocks.findIndex((s) => s.ticker === d.targetTicker);
    if (targetStoreIdx === -1) continue;

    const i = d.agentIndex;
    const i3 = i * 3;

    storeIndices[i] = targetStoreIdx;
    targets[i3] = doorPositions[targetStoreIdx * 2];
    targets[i3 + 1] = 0;
    targets[i3 + 2] = doorPositions[targetStoreIdx * 2 + 1];
    tradeLanes[i] = ACTION_TO_LANE[d.action] ?? 0;
    urgencies[i] = 0.8 + d.confidence * 0.4;
    states[i] = STATE_RUSHING;
  }
}
