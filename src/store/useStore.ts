// ============================================================
// SweetReturns — Zustand Global Store
// ============================================================

import { create } from 'zustand';
import type {
  StockData, TimeSliderState, AgentFilters,
  LeaderboardEntry, GraphEdge, PageName,
} from '../types';
import { ZoomLevel } from '../types';

interface AppStore {
  // --- Stock Data ---
  stocks: StockData[];
  setStocks: (stocks: StockData[]) => void;

  // --- Selection ---
  selectedStock: StockData | null;
  selectStock: (stock: StockData | null) => void;
  selectedSector: string | null;
  selectSector: (sector: string | null) => void;

  // --- Camera ---
  zoomLevel: ZoomLevel;
  setZoomLevel: (level: ZoomLevel) => void;

  // --- Time Slider ---
  timeSlider: TimeSliderState;
  setCurrentDate: (date: string) => void;
  setPlayback: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setTimeMode: (mode: 'historical' | 'present' | 'future') => void;

  // --- Agent Filters ---
  agentFilters: AgentFilters;
  setAgentFilter: <K extends keyof AgentFilters>(key: K, value: AgentFilters[K]) => void;

  // --- Correlations ---
  correlationThreshold: number;
  setCorrelationThreshold: (threshold: number) => void;
  showCorrelations: boolean;
  toggleCorrelations: () => void;
  correlationEdges: GraphEdge[];
  setCorrelationEdges: (edges: GraphEdge[]) => void;

  // --- Leaderboard ---
  agentLeaderboard: LeaderboardEntry[];
  setAgentLeaderboard: (leaders: LeaderboardEntry[]) => void;

  // --- Navigation ---
  currentPage: PageName;
  setCurrentPage: (page: PageName) => void;

  // --- Simulation ---
  agentCount: number;
  setAgentCount: (count: number) => void;
  simulationSpeed: number;
  setSimulationSpeed: (speed: number) => void;
}

export const useStore = create<AppStore>((set) => ({
  // Stock Data
  stocks: [],
  setStocks: (stocks) => set({ stocks }),

  // Selection
  selectedStock: null,
  selectStock: (stock) => set({ selectedStock: stock }),
  selectedSector: null,
  selectSector: (sector) => set({ selectedSector: sector }),

  // Camera
  zoomLevel: ZoomLevel.MACRO,
  setZoomLevel: (level) => set({ zoomLevel: level }),

  // Time Slider
  timeSlider: {
    currentDate: '2023-06-15',
    minDate: '2019-01-02',
    maxDate: '2024-12-31',
    mode: 'historical',
    isPlaying: false,
    playbackSpeed: 1,
  },
  setCurrentDate: (date) =>
    set((s) => ({ timeSlider: { ...s.timeSlider, currentDate: date } })),
  setPlayback: (playing) =>
    set((s) => ({ timeSlider: { ...s.timeSlider, isPlaying: playing } })),
  setPlaybackSpeed: (speed) =>
    set((s) => ({ timeSlider: { ...s.timeSlider, playbackSpeed: speed } })),
  setTimeMode: (mode) =>
    set((s) => ({ timeSlider: { ...s.timeSlider, mode } })),

  // Agent Filters
  agentFilters: {
    sector: 'all',
    direction: 'all',
    urgencyRange: [0, 3],
    profitRange: [0, Infinity],
    searchAgent: '',
    showOnlyPlatinum: false,
  },
  setAgentFilter: (key, value) =>
    set((s) => ({ agentFilters: { ...s.agentFilters, [key]: value } })),

  // Correlations
  correlationThreshold: 0.5,
  setCorrelationThreshold: (threshold) => set({ correlationThreshold: threshold }),
  showCorrelations: false,
  toggleCorrelations: () => set((s) => ({ showCorrelations: !s.showCorrelations })),
  correlationEdges: [],
  setCorrelationEdges: (edges) => set({ correlationEdges: edges }),

  // Leaderboard
  agentLeaderboard: [],
  setAgentLeaderboard: (leaders) => set({ agentLeaderboard: leaders }),

  // Navigation
  currentPage: 'city',
  setCurrentPage: (page) => set({ currentPage: page }),

  // Simulation
  agentCount: 10000,
  setAgentCount: (count) => set({ agentCount: count }),
  simulationSpeed: 1,
  setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),
}));
