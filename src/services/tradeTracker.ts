// ============================================================
// SweetReturns — Trade Tracker Service
// Tracks P&L for 24 named agents (20 featured + 4 whales)
// Deterministic synthetic returns per ticker+date
// ============================================================

import type { StockData, LeaderboardEntry, TradeRecord } from '../types';
import { hashStr, seededRandom } from '../data/stockData';
import { apiClient } from './apiClient';

// ── Agent names ──

const FEATURED_NAMES = [
  'CandyTrader', 'SugarRush', 'GummyBear', 'ChocolateChip', 'LollipopKing',
  'MintCondition', 'CaramelQueen', 'ToffeeHammer', 'JellyRoller', 'FudgeMaster',
  'TaffyPuller', 'BonbonBoss', 'NougatNinja', 'TruffleHunter', 'PralineKnight',
  'SorbetSniper', 'WaferWolf', 'MarzibanMage', 'LicoriceViper', 'DropKicker',
];

const WHALE_NAMES = ['Wonka Fund', 'Slugworth Fund', 'Oompa Fund', 'Gobstopper Fund'];

const REASONS = [
  'Deep drawdown reversal signal (DD -18%, RSI oversold)',
  'Golden ticket dip + positive forward skew detected',
  'Volume spike + mean reversion setup (z-score -2.1)',
  'Sector rotation into oversold territory',
  'Momentum breakout above BB upper band',
  'Convexity play: asymmetric risk/reward profile',
  'SPY underperformance + favorable vol regime',
  'MACD crossover with bullish divergence',
  'Fortune cookie signal: limited downside, high upside potential',
  'Shock absorption: post-jawbreaker recovery pattern',
];

const ACTIONS: Array<'BUY' | 'CALL' | 'PUT' | 'SHORT'> = ['BUY', 'CALL', 'PUT', 'SHORT'];

// ── Tracked Agent State ──

interface TrackedAgent {
  id: string;
  name: string;
  profit: number;
  trades: TradeRecord[];
  currentTicker?: string;
  currentAction?: string;
  tradeCount: number;
  winCount: number;
}

let agents: TrackedAgent[] = [];
let initialized = false;

// ── Simulation history from Databricks (populated asynchronously) ──

interface TickerPerformance {
  ticker: string;
  avg_profit: number;
  best_action: string;
  trade_count: number;
}

let tickerPerformanceMap = new Map<string, TickerPerformance>();
let historyLoaded = false;

/** Load simulation history from Databricks — called once after init, then periodically */
export async function loadSimulationHistory(): Promise<void> {
  try {
    const history = await apiClient.fetchSimulationHistory();
    if (!history || !history.ticker_performance) return;

    tickerPerformanceMap.clear();
    for (const tp of history.ticker_performance) {
      tickerPerformanceMap.set(tp.ticker, tp);
    }
    historyLoaded = true;
    console.log(`[TradeTracker] Loaded simulation history: ${tickerPerformanceMap.size} tickers, ${history.cycles.count} cycles`);
  } catch {
    // silently fail — agents work without history
  }
}

// ── Deterministic synthetic return ──

function getSyntheticReturn(ticker: string, date: string): number {
  const seed = hashStr(ticker + date);
  const rand = seededRandom(seed);
  // Returns between -3% and +5% (slight bullish bias)
  return (rand() - 0.4) * 0.08;
}

// ── Public API ──

export function initTrackedAgents(_stocks: StockData[]): void {
  agents = [];

  // 20 featured agents
  for (let i = 0; i < FEATURED_NAMES.length; i++) {
    agents.push({
      id: `agent_${1000 + i}`,
      name: FEATURED_NAMES[i],
      profit: 0,
      trades: [],
      tradeCount: 0,
      winCount: 0,
    });
  }

  // 4 whale funds
  for (let i = 0; i < WHALE_NAMES.length; i++) {
    agents.push({
      id: `whale_${i}`,
      name: WHALE_NAMES[i],
      profit: 0,
      trades: [],
      tradeCount: 0,
      winCount: 0,
    });
  }

  initialized = true;
}

// Track the last submitted date to avoid duplicate submissions
let lastSubmittedDate = '';

export function processDay(date: string, stocks: StockData[]): void {
  if (!initialized || stocks.length === 0) return;

  // Collect trades for write-back
  const dayTrades: Array<{
    ticker: string;
    agent_name: string;
    action: string;
    profit: number;
    whale_fund?: string | null;
  }> = [];

  // Track crowd per store for this day
  const crowdMap = new Map<string, { buy: number; call: number; put: number; short: number }>();

  for (let a = 0; a < agents.length; a++) {
    const agent = agents[a];

    // Pick a store deterministically per agent+date
    const seed = hashStr(agent.id + date);
    const rand = seededRandom(seed);

    // Pick a store — if we have historical data, bias toward profitable tickers
    let storeIdx: number;
    if (historyLoaded && tickerPerformanceMap.size > 0 && rand() < 0.3) {
      // 30% of the time, pick a historically profitable ticker
      const profitableTickers = Array.from(tickerPerformanceMap.values())
        .filter(tp => tp.avg_profit > 0)
        .sort((a, b) => b.avg_profit - a.avg_profit);

      if (profitableTickers.length > 0) {
        // Pick from top profitable tickers with some randomness
        const pickIdx = Math.floor(rand() * Math.min(profitableTickers.length, 20));
        const targetTicker = profitableTickers[pickIdx].ticker;
        const foundIdx = stocks.findIndex(s => s.ticker === targetTicker);
        storeIdx = foundIdx >= 0 ? foundIdx : Math.floor(rand() * stocks.length);
      } else {
        storeIdx = Math.floor(rand() * stocks.length);
      }
    } else {
      storeIdx = Math.floor(rand() * stocks.length);
    }

    const stock = stocks[storeIdx];
    const ticker = stock.ticker;

    // Pick action: blend stock's direction bias with historical best action
    const bias = stock.direction_bias;
    const biases = [bias.buy, bias.call, bias.put, bias.short];

    // If we have historical performance for this ticker, boost the best action
    const tickerHistory = historyLoaded ? tickerPerformanceMap.get(ticker) : undefined;
    if (tickerHistory && tickerHistory.trade_count >= 3) {
      const bestIdx = ACTIONS.indexOf(tickerHistory.best_action as typeof ACTIONS[number]);
      if (bestIdx >= 0) {
        // Boost the historically best action by 20%
        biases[bestIdx] *= 1.2;
      }
    }
    const totalBias = biases[0] + biases[1] + biases[2] + biases[3];
    let roll = rand() * totalBias;
    let actionIdx = 0;
    for (let l = 0; l < 4; l++) {
      roll -= biases[l];
      if (roll <= 0) { actionIdx = l; break; }
    }
    const action = ACTIONS[actionIdx];

    // Compute P&L
    const returnPct = getSyntheticReturn(ticker, date);
    // Position size: $5K-$20K per trade
    const positionSize = 5000 + rand() * 15000;

    // BUY/CALL profit on positive returns, SHORT/PUT profit on negative returns
    let tradeProfit: number;
    if (action === 'BUY' || action === 'CALL') {
      tradeProfit = positionSize * returnPct;
      if (action === 'CALL') tradeProfit *= 2.5; // options leverage
    } else {
      tradeProfit = positionSize * -returnPct;
      if (action === 'PUT') tradeProfit *= 2.5;
    }

    tradeProfit = Math.round(tradeProfit);

    // Pick reasoning
    const reasonIdx = Math.floor(rand() * REASONS.length);

    const trade: TradeRecord = {
      ticker,
      action,
      profit: tradeProfit,
      entryDate: date,
      reasoning: REASONS[reasonIdx],
    };

    // Update agent
    agent.profit += tradeProfit;
    agent.trades.unshift(trade); // newest first
    if (agent.trades.length > 20) agent.trades.length = 20; // keep last 20
    agent.tradeCount++;
    if (tradeProfit >= 0) agent.winCount++;
    agent.currentTicker = ticker;
    agent.currentAction = action;

    // Collect for write-back
    dayTrades.push({
      ticker,
      agent_name: agent.name,
      action,
      profit: tradeProfit,
      whale_fund: agent.id.startsWith('whale_') ? agent.name : null,
    });

    // Accumulate crowd counts
    if (!crowdMap.has(ticker)) {
      crowdMap.set(ticker, { buy: 0, call: 0, put: 0, short: 0 });
    }
    const crowd = crowdMap.get(ticker)!;
    if (action === 'BUY') crowd.buy++;
    else if (action === 'CALL') crowd.call++;
    else if (action === 'PUT') crowd.put++;
    else if (action === 'SHORT') crowd.short++;
  }

  // Fire-and-forget: submit simulation results to Databricks
  if (date !== lastSubmittedDate && apiClient.status !== 'disconnected') {
    lastSubmittedDate = date;
    const crowdMetrics = Array.from(crowdMap.entries()).map(([ticker, counts]) => ({
      ticker,
      ...counts,
    }));
    apiClient.submitSimulationResults({
      snapshot_date: date,
      trades: dayTrades,
      crowd_metrics: crowdMetrics,
    }).catch(() => {}); // swallow errors silently
  }
}

export function getLeaderboard(): LeaderboardEntry[] {
  if (!initialized) return [];

  // Sort by profit descending
  const sorted = [...agents].sort((a, b) => b.profit - a.profit);

  return sorted.map((agent, idx) => ({
    id: agent.id,
    name: agent.name,
    profit: agent.profit,
    rank: idx + 1,
    trades: agent.trades.slice(0, 8),
    currentAction: agent.currentAction,
    currentTicker: agent.currentTicker,
    winRate: agent.tradeCount > 0 ? agent.winCount / agent.tradeCount : undefined,
    totalTrades: agent.tradeCount,
  }));
}

export function resetTracker(): void {
  for (const agent of agents) {
    agent.profit = 0;
    agent.trades = [];
    agent.tradeCount = 0;
    agent.winCount = 0;
    agent.currentTicker = undefined;
    agent.currentAction = undefined;
  }
}

export function isTrackerInitialized(): boolean {
  return initialized;
}

// ── Simulation stats for Agent Reactions display ──

export interface SimulationStats {
  topTickers: Array<{ ticker: string; avgProfit: number; bestAction: string; tradeCount: number }>;
  cycleCount: number;
  isLoaded: boolean;
}

export function getSimulationStats(): SimulationStats {
  if (!historyLoaded || tickerPerformanceMap.size === 0) {
    return { topTickers: [], cycleCount: 0, isLoaded: false };
  }

  const sorted = Array.from(tickerPerformanceMap.values())
    .sort((a, b) => b.avg_profit - a.avg_profit)
    .slice(0, 10);

  return {
    topTickers: sorted.map(tp => ({
      ticker: tp.ticker,
      avgProfit: tp.avg_profit,
      bestAction: tp.best_action,
      tradeCount: tp.trade_count,
    })),
    cycleCount: tickerPerformanceMap.size,
    isLoaded: true,
  };
}
