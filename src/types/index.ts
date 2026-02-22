// ============================================================
// SweetReturns — Golden City: Core Type Definitions
// ============================================================

// --- Stock / Company Data ---
export interface StockData {
  ticker: string;
  company: string;
  sector: string;
  market_cap_rank: number;
  golden_score: number; // 0-5
  ticket_levels: TicketLevels;
  is_platinum: boolean;
  rarity_percentile: number;
  direction_bias: DirectionBias;
  forward_return_distribution: ForwardReturnDistribution;
  drawdown_current: number;
  volume_percentile: number;
  volatility_percentile: number;
  brand_color: string;
  candy_type: string;
  city_position: { x: number; y: number; z: number };
  store_dimensions: { width: number; height: number; depth: number };
  agent_density?: number;
  speed_multiplier?: number;
  technicals?: {
    rsi_14: number;
    macd_histogram: number;
    bb_pct_b: number;
    zscore_20d: number;
    realized_vol_20d: number;
  };
}

export interface TicketLevels {
  dip_ticket: boolean;
  shock_ticket: boolean;
  asymmetry_ticket: boolean;
  dislocation_ticket: boolean;
  convexity_ticket: boolean;
}

export interface DirectionBias {
  buy: number;
  call: number;
  put: number;
  short: number;
}

export interface ForwardReturnDistribution {
  p5: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
  skew: number;
}

// --- AI Agent ---
export type AgentState = 'analyzing' | 'rushing' | 'door_fighting' | 'inside' | 'exiting' | 'throwing';
export type TradeLane = 'BUY' | 'SHORT' | 'CALL' | 'PUT';

export interface AIAgent {
  id: string;
  name: string;
  gender: 'male' | 'female';
  position: [number, number, number];
  velocity: [number, number, number];
  mass: number;
  radius: number;
  targetStore: number;
  targetLane: TradeLane | null;
  confidence: number;
  reasoning: string;
  state: AgentState;
  carriesCandy: CandyReward | null;
  totalProfit: number;
  tradesCompleted: number;
  isGrabbing: string | null;
  isBeingGrabbed: boolean;
  throwCooldown: number;
  staggerTimer: number;
  speed: number;
  urgency: number;
}

export interface CandyReward {
  type: string;
  color: string;
  size: 'small' | 'medium' | 'large' | 'king_size';
  profitAmount: number;
}

// --- Time Slider ---
export interface TimeSliderState {
  currentDate: string;
  minDate: string;
  maxDate: string;
  mode: 'historical' | 'present' | 'future';
  isPlaying: boolean;
  playbackSpeed: number;
}

export interface TimelineEvent {
  date: string;
  type: 'earnings' | 'dividend' | 'split' | 'crash' | 'rally';
  ticker: string;
  description: string;
  impactScore: number;
}

// --- Graph ---
export interface GraphNode {
  id: string;
  sector: string;
  goldenScore: number;
  isPlatinum: boolean;
  size: number;
  color: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

// --- Candy Cane Correlation ---
export interface CandyCaneConnection {
  sourceStore: string;
  targetStore: string;
  weight: number;
  sourceCaneColor: string;
  targetCaneColor: string;
}

// --- Sector ---
export interface SectorInfo {
  name: string;
  icon: string;
  district: string;
  color: string;
  position: [number, number];
}

// --- Agent Filters ---
export interface AgentFilters {
  sector: string;
  direction: TradeLane | 'all';
  urgencyRange: [number, number];
  profitRange: [number, number];
  searchAgent: string;
  showOnlyPlatinum: boolean;
}

// --- Camera ---
export const ZoomLevel = {
  MACRO: 0,
  SECTOR: 1,
  STORE: 2,
  INTERIOR: 3,
} as const;
export type ZoomLevel = (typeof ZoomLevel)[keyof typeof ZoomLevel];

// --- Store Interior ---
export interface StoreInteriorData {
  ticker: string;
  sections: {
    buy: { percentage: number; agentCount: number };
    short: { percentage: number; agentCount: number };
    call: { percentage: number; agentCount: number };
    put: { percentage: number; agentCount: number };
  };
}

// --- Animation Config ---
export interface AnimationConfig {
  name: string;
  duration: number;
  easing: string;
  stagger: number;
  properties: {
    from: Record<string, number>;
    to: Record<string, number>;
  };
}

// --- Leaderboard Entry ---
export interface TradeRecord {
  ticker: string;
  action: 'BUY' | 'CALL' | 'PUT' | 'SHORT';
  profit: number;
  entryDate: string;
  reasoning: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  profit: number;
  rank: number;
  trades: TradeRecord[];
  currentAction?: string;
  currentTicker?: string;
  winRate?: number;
  totalTrades?: number;
}

// --- Trade Journal ---
export interface ParsedTrade {
  ticker: string;
  action: string;
  date: string;
  price?: number;
  notes: string;
  outcome?: 'win' | 'loss' | 'open';
  reasonForEntry: string;
  reasonForExit?: string;
  profit?: number;
}

// --- Agent Network ---
export interface AgentNode {
  id: string;
  name: string;
  type: 'whale' | 'featured';
  color: string;
  portfolioValue: number;
  positions: { ticker: string; action: string; weight: number }[];
}

export interface AgentEdge {
  source: string;
  target: string;
  sharedTickers: string[];
  impactWeight: number;
}

// --- Pages ---
export type PageName = 'city' | 'network' | 'agents' | 'playground';
