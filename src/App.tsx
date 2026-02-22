import { useEffect, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useStore } from './store/useStore';
import { generateStockData, getCorrelationEdges, loadPipelineData, modulateStocksByTime } from './data/stockData';
import { initTrackedAgents, processDay, getLeaderboard } from './services/tradeTracker';
import { CandyCane, ChartLine, LightningBolt, WebNodes, Gumball, NoteBook, Lollipop, ChocolateBar } from './components/CandyIcons';
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
      fontSize: 20, fontFamily: 'system-ui', gap: 16,
    }}>
      <div style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
        <Lollipop size={48} />
      </div>
      <div>Loading Golden City...</div>
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

function NavBar() {
  const setCurrentPage = useStore((s) => s.setCurrentPage);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 48, zIndex: 1000,
      background: 'rgba(16, 12, 30, 0.95)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255, 215, 0, 0.15)',
      display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 4,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <style>{`
        .nav-link:hover { background: rgba(255, 215, 0, 0.06) !important; color: rgba(255,255,255,0.85) !important; }
        .nav-link:focus-visible { outline: 2px solid #FFD700; outline-offset: -2px; }
        @media (max-width: 900px) { .nav-label { display: none; } }
        @media (max-width: 600px) { .nav-link { padding: 8px 8px !important; } }
      `}</style>
      <div style={{
        fontWeight: 700, fontSize: 16, color: '#FFD700',
        marginRight: 24, letterSpacing: '0.5px', whiteSpace: 'nowrap',
      }}>
        <ChocolateBar size={18} /> Wolf of Wall Sweet
      </div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          onClick={() => setCurrentPage(item.page)}
          className="nav-link"
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8,
            textDecoration: 'none', fontSize: 13, fontWeight: 500,
            color: isActive ? '#FFD700' : 'rgba(255,255,255,0.6)',
            background: isActive ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
            transition: 'all 0.2s',
          })}
        >
          <span>{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </NavLink>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{
        fontSize: 11, color: 'rgba(255,255,255,0.3)',
        letterSpacing: '0.5px',
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
  const baseStocks = useStore((s) => s.baseStocks);
  const timeSlider = useStore((s) => s.timeSlider);

  useEffect(() => {
    async function init() {
      let stocks;
      let edges;
      try {
        // Load real pipeline data
        const pipeline = await loadPipelineData();
        stocks = pipeline.stocks;
        edges = pipeline.edges;
        console.log(`[SweetReturns] Loaded ${stocks.length} stocks from pipeline data`);
      } catch {
        // Fallback to synthetic data
        console.warn('[SweetReturns] Pipeline data unavailable, using synthetic data');
        stocks = generateStockData();
        edges = getCorrelationEdges(stocks, 0.5);
      }
      setStocks(stocks);
      setBaseStocks(stocks);
      setCorrelationEdges(edges);
      // Initialize trade tracker with live agents
      initTrackedAgents(stocks);
      setAgentLeaderboard(getLeaderboard());
    }
    init();
  }, [setStocks, setBaseStocks, setCorrelationEdges, setAgentLeaderboard]);

  // Track the last processed date for trade simulation
  const lastProcessedDate = useRef<string>('');

  // Time modulation: update biases when date/mode changes (without re-initializing simulation)
  useEffect(() => {
    if (baseStocks.length === 0) return;
    const modulated = modulateStocksByTime(baseStocks, timeSlider.currentDate, timeSlider.mode);
    setModulatedBiases(modulated.map((s) => s.direction_bias));

    // Process trades when date changes
    if (timeSlider.currentDate !== lastProcessedDate.current) {
      lastProcessedDate.current = timeSlider.currentDate;
      processDay(timeSlider.currentDate, modulated);
      setAgentLeaderboard(getLeaderboard());
    }
  }, [baseStocks, timeSlider.currentDate, timeSlider.mode, setModulatedBiases, setAgentLeaderboard]);

  return (
    <BrowserRouter>
      <div style={{
        width: '100vw', height: '100vh',
        background: '#1a1a2e', color: '#fff',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <NavBar />
        <div style={{ marginTop: 48, width: '100%', height: 'calc(100vh - 48px)' }}>
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
      </div>
    </BrowserRouter>
  );
}
