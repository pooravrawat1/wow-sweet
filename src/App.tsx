import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useStore } from './store/useStore';
import { generateStockData, getCorrelationEdges, loadPipelineData, modulateStocksByTime } from './data/stockData';
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
      // Generate realistic leaderboard with trade details
      const agentNames = [
        'CandyTrader', 'SugarRush', 'GummyBear', 'ChocolateChip', 'LollipopKing',
        'MintCondition', 'CaramelQueen', 'ToffeeHammer', 'JellyRoller', 'FudgeMaster',
        'TaffyPuller', 'BonbonBoss', 'NougatNinja', 'TruffleHunter', 'PralineKnight',
        'SorbetSniper', 'WaferWolf', 'MarzibanMage', 'LicoriceViper', 'DropKicker',
      ];
      const actions: Array<'BUY' | 'CALL' | 'PUT' | 'SHORT'> = ['BUY', 'CALL', 'PUT', 'SHORT'];
      const reasons = [
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
      const leaders = Array.from({ length: 20 }, (_, i) => {
        const profit = Math.floor(85000 - i * 3800 + Math.random() * 2000);
        const numTrades = 5 + Math.floor(Math.random() * 15);
        const wins = Math.floor(numTrades * (0.55 + Math.random() * 0.35));
        const tradeTickers = stocks.slice(0, 50).sort(() => Math.random() - 0.5).slice(0, numTrades);
        const trades = tradeTickers.map((s, ti) => ({
          ticker: s.ticker,
          action: actions[Math.floor(Math.random() * actions.length)],
          profit: Math.floor((ti < wins ? 1 : -1) * (500 + Math.random() * 8000)),
          entryDate: `2023-${String(6 + Math.floor(ti / 4)).padStart(2, '0')}-${String(1 + (ti * 3) % 28).padStart(2, '0')}`,
          reasoning: reasons[Math.floor(Math.random() * reasons.length)],
        }));
        const currentStock = stocks[Math.floor(Math.random() * Math.min(stocks.length, 30))];
        return {
          id: `agent_${1000 + i}`,
          name: agentNames[i % agentNames.length] + (i >= agentNames.length ? `_${i}` : ''),
          profit,
          rank: i + 1,
          trades,
          currentAction: actions[Math.floor(Math.random() * actions.length)],
          currentTicker: currentStock?.ticker || 'AAPL',
          winRate: wins / numTrades,
          totalTrades: numTrades,
        };
      });
      setAgentLeaderboard(leaders);
    }
    init();
  }, [setStocks, setBaseStocks, setCorrelationEdges, setAgentLeaderboard]);

  // Time modulation: update biases when date/mode changes (without re-initializing simulation)
  useEffect(() => {
    if (baseStocks.length === 0) return;
    const modulated = modulateStocksByTime(baseStocks, timeSlider.currentDate, timeSlider.mode);
    setModulatedBiases(modulated.map((s) => s.direction_bias));
  }, [baseStocks, timeSlider.currentDate, timeSlider.mode, setModulatedBiases]);

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
