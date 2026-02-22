import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useStore } from './store/useStore';
import { loadStockData, modulateStocksByTime } from './data/stockData';
import { apiClient } from './services/apiClient';
import { initTrackedAgents, processDay, getLeaderboard, loadSimulationHistory } from './services/tradeTracker';
import { updateWhaleAllocations } from './services/whaleArena';
import { CandyCane, ChartLine, LightningBolt, WebNodes, Gumball, NoteBook, Lollipop } from './components/CandyIcons';
import type { PageName } from './types';

const GoldenCityPage = lazy(() => import('./pages/GoldenCityPage'));
const StockNetworkPage = lazy(() => import('./pages/StockNetworkPage'));
const AgentReactionsPage = lazy(() => import('./pages/AgentReactionsPage'));
const GraphPlaygroundPage = lazy(() => import('./pages/GraphPlaygroundPage'));
const AgentNetworkPage = lazy(() => import('./pages/AgentNetworkPage'));
const TradeJournalPage = lazy(() => import('./pages/TradeJournalPage'));

const NAV_ITEMS: { path: string; label: string; icon: React.ReactNode; page: PageName }[] = [
  { path: '/', label: 'City', icon: <CandyCane size={16} />, page: 'city' },
  { path: '/network', label: 'Stock Network', icon: <ChartLine size={16} />, page: 'network' },
  { path: '/agents', label: 'Agent Reactions', icon: <LightningBolt size={16} />, page: 'agents' },
  { path: '/agent-network', label: 'Agent Network', icon: <WebNodes size={16} />, page: 'agent-network' },
  { path: '/playground', label: 'Playground', icon: <Gumball size={16} />, page: 'playground' },
  { path: '/journal', label: 'Trade Journal', icon: <NoteBook size={16} />, page: 'journal' },
];

function LoadingScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: '#1a1a2e', color: '#FFD700',
      fontSize: 20, fontFamily: "'Leckerli One', cursive", gap: 16,
    }}>
      <div style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
        <Lollipop size={48} />
      </div>
      <div>Welcome to the sweets</div>
      <div style={{
        width: 160, height: 4, borderRadius: 2,
        background: 'rgba(255,215,0,0.15)', overflow: 'hidden',
      }}>
        <div style={{
          width: '40%', height: '100%', background: '#FFD700',
          borderRadius: 2, animation: 'slideRight 1.2s ease-in-out infinite',
        }} />
      </div>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes slideRight { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
      `}</style>
    </div>
  );
}

function ConnectionStatusBadge() {
  const dataSource = useStore((s) => s.dataSource);
  const databricksConnected = useStore((s) => s.databricksConnected);
  const backendConnected = useStore((s) => s.backendConnected);

  let color: string;
  let label: string;
  let tooltip: string;

  if (databricksConnected) {
    color = '#00FF7F';
    label = 'LIVE';
    tooltip = 'Connected to Databricks (live data)';
  } else if (backendConnected) {
    color = '#FFD700';
    label = 'API';
    tooltip = 'Backend connected, Databricks offline';
  } else if (dataSource === 'static') {
    color = '#FF8C00';
    label = 'STATIC';
    tooltip = 'Using cached static data';
  } else if (dataSource === 'synthetic') {
    color = '#FF4500';
    label = 'MOCK';
    tooltip = 'Using synthetic mock data';
  } else {
    color = '#666';
    label = '...';
    tooltip = 'Connecting...';
  }

  return (
    <div
      title={tooltip}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 12,
        background: `${color}15`,
        border: `1px solid ${color}40`,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.5px',
        color,
        cursor: 'default',
        transition: 'all 0.3s',
      }}
    >
      <div style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 4px ${color}`,
        animation: databricksConnected ? 'statusPulse 2s ease-in-out infinite' : 'none',
      }} />
      {label}
    </div>
  );
}

function NavBar() {
  const setCurrentPage = useStore((s) => s.setCurrentPage);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 56, zIndex: 1000,
      background: '#fff',
      boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', gap: 4,
      fontFamily: `'Leckerli One', cursive`,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Leckerli+One&display=swap');
        .nav-link:hover { background: rgba(100, 0, 140, 0.1) !important; color: #3d0066 !important; }
        .nav-link:focus-visible { outline: 2px solid #7b00cc; outline-offset: -2px; }
        @media (max-width: 900px) { .nav-label { display: none; } }
        @media (max-width: 600px) { .nav-link { padding: 8px 8px !important; } }
        @keyframes statusPulse { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
      `}</style>

      {/* Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontFamily: `'Leckerli One', cursive`,
        fontSize: 22, color: '#6a00aa',
        marginRight: 28, whiteSpace: 'nowrap',
        letterSpacing: '0.3px',
      }}>
        <img
          src="/assets/favicon/favicon-96x96.png"
          alt="logo"
          style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain' }}
        />
        Wolf of Wall Sweet
      </div>

      {/* Spacer — pushes nav + badge to the right */}
      <div style={{ flex: 1 }} />

      {/* Nav links */}
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          onClick={() => setCurrentPage(item.page)}
          className="nav-link"
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8,
            textDecoration: 'none',
            fontFamily: `'Leckerli One', cursive`,
            fontSize: 14,
            color: isActive ? '#4b0082' : '#7a4800',
            background: isActive ? 'rgba(100, 0, 160, 0.12)' : 'transparent',
            transition: 'all 0.18s',
          })}
        >
          <span className="nav-label">{item.label}</span>
        </NavLink>
      ))}
      <div style={{ flex: 1 }} />
      <ConnectionStatusBadge />
      <div style={{
        fontSize: 11, color: 'rgba(255,255,255,0.3)',
        letterSpacing: '0.5px', marginLeft: 8,
      }}>
        HACKLYTICS 2026
      </div>
    </nav>
  );
}

export default function App() {
  const setStocks = useStore((s) => s.setStocks);
  const setBaseStocks = useStore((s) => s.setBaseStocks);
  const setModulatedBiases = useStore((s) => s.setModulatedBiases);
  const setCorrelationEdges = useStore((s) => s.setCorrelationEdges);
  const setAgentLeaderboard = useStore((s) => s.setAgentLeaderboard);
  const setDataSource = useStore((s) => s.setDataSource);
  const setBackendConnected = useStore((s) => s.setBackendConnected);
  const setDatabricksConnected = useStore((s) => s.setDatabricksConnected);
  const baseStocks = useStore((s) => s.baseStocks);
  const timeSlider = useStore((s) => s.timeSlider);

  useEffect(() => {
    async function init() {
      setDataSource('loading');

      const { stocks, edges, source } = await loadStockData();

      setStocks(stocks);
      setBaseStocks(stocks);
      setCorrelationEdges(edges);
      setDataSource(source);

      // Initialize trade tracker and seed with historical trades
      initTrackedAgents(stocks);
      // Process 10 historical days so agents have trade history for network connections
      const today = new Date('2026-02-21');
      for (let d = 10; d >= 1; d--) {
        const past = new Date(today);
        past.setDate(past.getDate() - d);
        const dateStr = past.toISOString().slice(0, 10);
        processDay(dateStr, stocks);
      }
      setAgentLeaderboard(getLeaderboard());

      // Load simulation history from Databricks (async, non-blocking)
      // Agents will use this to make smarter decisions in future cycles
      loadSimulationHistory();
    }
    init();

    // Start health check for connection status indicator
    apiClient.startHealthCheck();
    const unsub = apiClient.onStatusChange((status) => {
      setBackendConnected(status === 'connected' || status === 'fallback');
      setDatabricksConnected(status === 'connected');
    });

    return () => {
      apiClient.stopHealthCheck();
      unsub();
    };
  }, [setStocks, setBaseStocks, setCorrelationEdges, setAgentLeaderboard, setDataSource, setBackendConnected, setDatabricksConnected]);

  // Auto-refresh: poll for new data every 60 seconds
  // Auto-trigger advance when data goes stale (same date for 3+ polls)
  const snapshotDateRef = useRef<string>('');
  const stalePollCountRef = useRef(0);
  const advanceTriggeredRef = useRef(false);
  useEffect(() => {
    if (baseStocks.length === 0) return;

    const pollInterval = setInterval(async () => {
      try {
        const result = await apiClient.fetchStocksWithDate();
        if (!result || result.stocks.length === 0) return;

        // Only refresh if snapshot_date changed (Databricks advanced to next day)
        if (result.snapshot_date && result.snapshot_date !== snapshotDateRef.current) {
          console.log(`[SweetReturns] New snapshot detected: ${snapshotDateRef.current} → ${result.snapshot_date}`);
          snapshotDateRef.current = result.snapshot_date;
          stalePollCountRef.current = 0;
          advanceTriggeredRef.current = false;

          const parsed = result.stocks.map((s: any) => ({
            ...s,
            direction_bias: s.direction_bias || { buy: 0.3, call: 0.25, put: 0.25, short: 0.2 },
            store_dimensions: s.store_dimensions || { width: 1.5, height: 2.0, depth: 1.0, glow: 0 },
            forward_return_distribution: s.forward_return_distribution || { p5: -0.05, p25: -0.01, median: 0.02, p75: 0.05, p95: 0.1, skew: 0 },
            technicals: s.technicals || { rsi_14: 50, macd_histogram: 0, bb_pct_b: 0.5, zscore_20d: 0, realized_vol_20d: 0.2 },
          }));

          setBaseStocks(parsed);
          setStocks(parsed);
          setDataSource('databricks');

          // Process the new day's trades
          processDay(result.snapshot_date, parsed);
          setAgentLeaderboard(getLeaderboard());

          // Refresh simulation history so agents learn from past cycles
          loadSimulationHistory();
        } else {
          // Same date — track staleness
          stalePollCountRef.current++;

          // After 3 consecutive stale polls (3 min), trigger advance
          if (stalePollCountRef.current >= 3 && !advanceTriggeredRef.current) {
            advanceTriggeredRef.current = true;
            console.log(`[SweetReturns] Data stale for ${stalePollCountRef.current} polls — triggering advance`);
            const advResult = await apiClient.triggerAdvance();
            if (advResult) {
              console.log(`[SweetReturns] Advance trigger: ${advResult.action} — ${advResult.message || ''}`);
            }
          }

          // Re-trigger every 10 polls (10 min) if still stale
          if (stalePollCountRef.current > 0 && stalePollCountRef.current % 10 === 0) {
            advanceTriggeredRef.current = false;
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 60_000);

    return () => clearInterval(pollInterval);
  }, [baseStocks, setBaseStocks, setStocks, setDataSource, setAgentLeaderboard]);

  // Time modulation: update biases when date/mode changes (without re-initializing simulation)
  useEffect(() => {
    if (baseStocks.length === 0) return;
    const modulated = modulateStocksByTime(baseStocks, timeSlider.currentDate, timeSlider.mode);
    setModulatedBiases(modulated.map((s) => s.direction_bias));
  }, [baseStocks, timeSlider.currentDate, timeSlider.mode, setModulatedBiases]);

  // Process trades when date changes — drives leaderboard
  const stocks = useStore((s) => s.stocks);
  const geminiEnabled = useStore((s) => s.geminiEnabled);
  const lastProcessedDate = useRef<string>('');
  useEffect(() => {
    if (stocks.length === 0 || timeSlider.currentDate === lastProcessedDate.current) return;
    lastProcessedDate.current = timeSlider.currentDate;
    processDay(timeSlider.currentDate, stocks);
    setAgentLeaderboard(getLeaderboard());
  }, [stocks, timeSlider.currentDate, setAgentLeaderboard]);

  // Whale arena: update allocations on init and every 15s (independent of city page)
  useEffect(() => {
    if (stocks.length === 0) return;
    const runUpdate = () => updateWhaleAllocations(stocks, timeSlider.mode, geminiEnabled);
    runUpdate(); // immediate first run
    const interval = setInterval(runUpdate, 15000);
    return () => clearInterval(interval);
  }, [stocks, timeSlider.mode, geminiEnabled]);

  const [minLoadDone, setMinLoadDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinLoadDone(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <BrowserRouter>
      <div style={{
        width: '100vw', height: '100vh',
        background: '#1a1a2e', color: '#fff',
        overflow: 'hidden',
        fontFamily: "'Leckerli One', cursive",
      }}>
        {!minLoadDone ? (
          <LoadingScreen />
        ) : (
          <>
            <NavBar />
            <div style={{ marginTop: 56, width: '100%', height: 'calc(100vh - 56px)' }}>
              <Suspense fallback={<LoadingScreen />}>
                <Routes>
                  <Route path="/" element={<GoldenCityPage />} />
                  <Route path="/network" element={<StockNetworkPage />} />
                  <Route path="/agents" element={<AgentReactionsPage />} />
                  <Route path="/agent-network" element={<AgentNetworkPage />} />
                  <Route path="/playground" element={<GraphPlaygroundPage />} />
                  <Route path="/journal" element={<TradeJournalPage />} />
                </Routes>
              </Suspense>
            </div>
          </>
        )}
      </div>
    </BrowserRouter>
  );
}
