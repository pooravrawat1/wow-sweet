import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useStore } from './store/useStore';
import { generateStockData, getCorrelationEdges, loadPipelineData, modulateStocksByTime } from './data/stockData';
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
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#1a1a2e', color: '#FFD700',
      fontSize: 24, fontFamily: 'system-ui',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 16 }}><Lollipop size={48} /></div>
        <div>Loading Golden City...</div>
      </div>
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
      <div style={{
        fontWeight: 700, fontSize: 16, color: '#FFD700',
        marginRight: 24, letterSpacing: '0.5px',
      }}>
        <ChocolateBar size={18} /> Wolf of Wall Sweet
      </div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          onClick={() => setCurrentPage(item.page)}
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
          <span>{item.label}</span>
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

  return (
    <BrowserRouter>
      <div style={{
        width: '100vw', height: '100vh',
        background: '#1a1a2e', color: '#fff',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <NavBar />
        <div style={{ paddingTop: 48, width: '100%', height: 'calc(100vh - 48px)' }}>
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
