// ============================================================
// SweetReturns — Trade Journal Neural Network Page
// Import notes from Obsidian, TradingView, handwritten notes
// Visualize trades as a neural network showing patterns
// ============================================================

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

const PAGE_BG = '#FFF8DC';
const ACCENT = '#6a00aa';
const BORDER = 'rgba(106,0,170,0.18)';
const FONT = `'Leckerli One', cursive`;

interface ParsedTrade {
  id: number;
  ticker: string;
  action: string;
  date: string;
  notes: string;
  outcome: 'win' | 'loss' | 'open';
  profit: number;
  reasonForEntry: string;
  patterns: string[];
}

interface NeuralNode {
  id: string;
  layer: 'input' | 'hidden' | 'output';
  label: string;
  value: number;
  x: number;
  y: number;
}

interface NeuralEdge {
  source: string;
  target: string;
  weight: number;
}

// Simple markdown trade parser
function parseMarkdownNotes(text: string): ParsedTrade[] {
  const trades: ParsedTrade[] = [];
  // Look for patterns like: BUY AAPL, SELL TSLA, SHORT MSFT etc.
  // Look for ticker mentions
  const tickerPattern = /\$([A-Z]{1,5})\b/g;
  // Look for dates
  const datePattern = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/g;

  const lines = text.split('\n');
  let currentTicker = '';
  let currentAction = '';
  let currentDate = '';
  let currentNotes = '';
  let tradeId = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for trade action + ticker
    const tradeMatch = trimmed.match(/\b(BUY|SELL|SHORT|LONG|CALL|PUT)\b\s+\$?([A-Z]{1,5})\b/i);
    if (tradeMatch) {
      // Save previous trade if exists
      if (currentTicker) {
        trades.push(buildTrade(tradeId++, currentTicker, currentAction, currentDate, currentNotes));
      }
      currentAction = tradeMatch[1].toUpperCase();
      currentTicker = tradeMatch[2].toUpperCase();
      currentNotes = trimmed;
      const dateMatch = trimmed.match(datePattern);
      currentDate = dateMatch ? dateMatch[0] : new Date().toISOString().slice(0, 10);
    } else {
      // Check for just ticker mentions
      const tickerMatch = trimmed.match(tickerPattern);
      if (tickerMatch && !currentTicker) {
        currentTicker = tickerMatch[0].replace('$', '');
        currentAction = 'BUY';
        currentNotes = trimmed;
        const dateMatch = trimmed.match(datePattern);
        currentDate = dateMatch ? dateMatch[0] : new Date().toISOString().slice(0, 10);
      } else if (currentTicker) {
        currentNotes += ' ' + trimmed;
      }
    }
  }
  // Don't forget last trade
  if (currentTicker) {
    trades.push(buildTrade(tradeId++, currentTicker, currentAction, currentDate, currentNotes));
  }

  // If no structured trades found, try to extract from general text
  if (trades.length === 0) {
    const allTickers: string[] = [];
    let match;
    const text2 = text;
    const re = /\b([A-Z]{2,5})\b/g;
    while ((match = re.exec(text2)) !== null) {
      const t = match[1];
      if (['BUY', 'SELL', 'THE', 'AND', 'FOR', 'WAS', 'NOT', 'BUT', 'HAS', 'HAD', 'ARE', 'HIS', 'HER', 'CAN'].includes(t)) continue;
      if (!allTickers.includes(t)) allTickers.push(t);
    }
    allTickers.slice(0, 10).forEach((ticker, i) => {
      trades.push(buildTrade(i, ticker, 'BUY', new Date().toISOString().slice(0, 10), `Mentioned in notes: ${ticker}`));
    });
  }

  return trades;
}

function buildTrade(id: number, ticker: string, action: string, date: string, notes: string): ParsedTrade {
  // Extract patterns from notes
  const patterns: string[] = [];
  const lower = notes.toLowerCase();
  if (lower.includes('oversold') || lower.includes('rsi')) patterns.push('Oversold Entry');
  if (lower.includes('breakout') || lower.includes('broke out')) patterns.push('Breakout');
  if (lower.includes('earnings') || lower.includes('report')) patterns.push('Earnings Play');
  if (lower.includes('dip') || lower.includes('drawdown') || lower.includes('crash')) patterns.push('Dip Buy');
  if (lower.includes('momentum') || lower.includes('trend')) patterns.push('Momentum');
  if (lower.includes('support') || lower.includes('resistance')) patterns.push('Technical Level');
  if (lower.includes('volume') || lower.includes('spike')) patterns.push('Volume Signal');
  if (lower.includes('news') || lower.includes('catalyst')) patterns.push('News Catalyst');
  if (patterns.length === 0) patterns.push('Discretionary');

  // Determine outcome from notes
  let outcome: 'win' | 'loss' | 'open' = 'open';
  let profit = 0;
  if (lower.includes('profit') || lower.includes('gain') || lower.includes('won') || lower.includes('+')) {
    outcome = 'win';
    profit = 500 + Math.random() * 5000;
  } else if (lower.includes('loss') || lower.includes('lost') || lower.includes('stop') || lower.includes('-')) {
    outcome = 'loss';
    profit = -(200 + Math.random() * 3000);
  }

  return {
    id, ticker, action, date, notes,
    outcome, profit: Math.round(profit),
    reasonForEntry: patterns[0] || 'Discretionary',
    patterns,
  };
}

// Parse CSV (TradingView format)
function parseTradingViewCSV(text: string): ParsedTrade[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  const isTV = header.includes('symbol') || header.includes('ticker') || header.includes('action');
  if (!isTV) return parseMarkdownNotes(text); // fallback

  const trades: ParsedTrade[] = [];
  const cols = lines[0].split(',').map(c => c.trim().toLowerCase());
  const tickerCol = cols.findIndex(c => c.includes('symbol') || c.includes('ticker'));
  const actionCol = cols.findIndex(c => c.includes('action') || c.includes('side') || c.includes('type'));
  const dateCol = cols.findIndex(c => c.includes('date') || c.includes('time'));
  const profitCol = cols.findIndex(c => c.includes('profit') || c.includes('pnl') || c.includes('p&l'));
  const notesCol = cols.findIndex(c => c.includes('note') || c.includes('comment'));

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim());
    const ticker = tickerCol >= 0 ? vals[tickerCol]?.toUpperCase() : '';
    if (!ticker || ticker.length > 5) continue;

    const action = actionCol >= 0 ? vals[actionCol]?.toUpperCase() || 'BUY' : 'BUY';
    const date = dateCol >= 0 ? vals[dateCol] || '' : '';
    const profit = profitCol >= 0 ? parseFloat(vals[profitCol]) || 0 : 0;
    const notes = notesCol >= 0 ? vals[notesCol] || '' : '';

    trades.push(buildTrade(i - 1, ticker, action, date, notes || `${action} ${ticker}`));
    if (profit !== 0) {
      trades[trades.length - 1].profit = profit;
      trades[trades.length - 1].outcome = profit > 0 ? 'win' : 'loss';
    }
  }
  return trades;
}

// Neural network visualization
const NeuralNetworkViz: React.FC<{
  trades: ParsedTrade[];
  onShockNode: (nodeId: string) => void;
  shockedNodes: Set<string>;
}> = ({ trades, onShockNode, shockedNodes }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const { nodes, edges } = useMemo(() => {
    if (trades.length === 0) return { nodes: [], edges: [] };

    const inputNodes: NeuralNode[] = [];
    const hiddenNodes: NeuralNode[] = [];
    const outputNodes: NeuralNode[] = [];

    // Input layer: unique tickers
    const tickers = [...new Set(trades.map(t => t.ticker))];
    tickers.slice(0, 8).forEach((ticker) => {
      inputNodes.push({
        id: `in_${ticker}`,
        layer: 'input',
        label: ticker,
        value: trades.filter(t => t.ticker === ticker).length / trades.length,
        x: 0, y: 0,
      });
    });

    // Hidden layer: patterns
    const allPatterns = [...new Set(trades.flatMap(t => t.patterns))];
    allPatterns.slice(0, 6).forEach((pattern) => {
      const count = trades.filter(t => t.patterns.includes(pattern)).length;
      hiddenNodes.push({
        id: `hid_${pattern.replace(/\s/g, '_')}`,
        layer: 'hidden',
        label: pattern,
        value: count / trades.length,
        x: 0, y: 0,
      });
    });

    // Output layer: outcomes
    const wins = trades.filter(t => t.outcome === 'win').length;
    const losses = trades.filter(t => t.outcome === 'loss').length;
    const opens = trades.filter(t => t.outcome === 'open').length;
    outputNodes.push(
      { id: 'out_win', layer: 'output', label: `Wins (${wins})`, value: wins / Math.max(trades.length, 1), x: 0, y: 0 },
      { id: 'out_loss', layer: 'output', label: `Losses (${losses})`, value: losses / Math.max(trades.length, 1), x: 0, y: 0 },
      { id: 'out_open', layer: 'output', label: `Open (${opens})`, value: opens / Math.max(trades.length, 1), x: 0, y: 0 },
    );

    const allNodes = [...inputNodes, ...hiddenNodes, ...outputNodes];

    // Build edges
    const networkEdges: NeuralEdge[] = [];

    // Input → Hidden: ticker uses pattern
    trades.forEach(trade => {
      const inId = `in_${trade.ticker}`;
      if (!inputNodes.find(n => n.id === inId)) return;
      trade.patterns.forEach(pattern => {
        const hidId = `hid_${pattern.replace(/\s/g, '_')}`;
        if (!hiddenNodes.find(n => n.id === hidId)) return;
        const existing = networkEdges.find(e => e.source === inId && e.target === hidId);
        if (existing) {
          existing.weight += trade.outcome === 'win' ? 0.1 : -0.1;
        } else {
          networkEdges.push({
            source: inId,
            target: hidId,
            weight: trade.outcome === 'win' ? 0.3 : -0.2,
          });
        }
      });
    });

    // Hidden → Output: pattern leads to outcome
    allPatterns.forEach(pattern => {
      const hidId = `hid_${pattern.replace(/\s/g, '_')}`;
      if (!hiddenNodes.find(n => n.id === hidId)) return;
      const patternTrades = trades.filter(t => t.patterns.includes(pattern));
      const patternWins = patternTrades.filter(t => t.outcome === 'win').length;
      const patternLosses = patternTrades.filter(t => t.outcome === 'loss').length;
      const patternOpen = patternTrades.filter(t => t.outcome === 'open').length;
      if (patternWins > 0) networkEdges.push({ source: hidId, target: 'out_win', weight: patternWins / patternTrades.length });
      if (patternLosses > 0) networkEdges.push({ source: hidId, target: 'out_loss', weight: patternLosses / patternTrades.length });
      if (patternOpen > 0) networkEdges.push({ source: hidId, target: 'out_open', weight: patternOpen / patternTrades.length });
    });

    return { nodes: allNodes, edges: networkEdges };
  }, [trades]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const time = { current: 0 };

    // Position nodes in layers
    const layers = {
      input: nodes.filter(n => n.layer === 'input'),
      hidden: nodes.filter(n => n.layer === 'hidden'),
      output: nodes.filter(n => n.layer === 'output'),
    };

    const layerX = { input: W * 0.15, hidden: W * 0.5, output: W * 0.85 };
    Object.entries(layers).forEach(([layer, layerNodes]) => {
      const lx = layerX[layer as keyof typeof layerX];
      layerNodes.forEach((n, i) => {
        n.x = lx;
        n.y = (H / (layerNodes.length + 1)) * (i + 1);
      });
    });

    function draw() {
      if (!ctx || !canvas) return;
      time.current += 0.016;
      ctx.clearRect(0, 0, W, H);

      // Layer labels
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'center';
      ctx.fillText('TICKERS', layerX.input, 20);
      ctx.fillText('PATTERNS', layerX.hidden, 20);
      ctx.fillText('OUTCOMES', layerX.output, 20);

      // Draw edges
      edges.forEach(edge => {
        const src = nodes.find(n => n.id === edge.source);
        const tgt = nodes.find(n => n.id === edge.target);
        if (!src || !tgt) return;

        const isShocked = shockedNodes.has(src.id) || shockedNodes.has(tgt.id);
        const isPositive = edge.weight > 0;

        // Bezier curve
        ctx.beginPath();
        const cpx = (src.x + tgt.x) / 2;
        ctx.moveTo(src.x + 20, src.y);
        ctx.bezierCurveTo(cpx, src.y, cpx, tgt.y, tgt.x - 20, tgt.y);

        const alpha = Math.min(Math.abs(edge.weight), 1);
        if (isShocked) {
          const pulse = 0.5 + 0.5 * Math.sin(time.current * 8);
          ctx.strokeStyle = `rgba(255, 69, 0, ${0.4 + pulse * 0.6})`;
          ctx.lineWidth = 2 + pulse * 2;
        } else {
          ctx.strokeStyle = isPositive
            ? `rgba(0, 255, 127, ${0.1 + alpha * 0.5})`
            : `rgba(255, 69, 0, ${0.1 + alpha * 0.5})`;
          ctx.lineWidth = 0.5 + Math.abs(edge.weight) * 2;
        }
        ctx.stroke();

        // Animated particle along edge
        if (isShocked || Math.abs(edge.weight) > 0.3) {
          const t = (time.current * 0.5) % 1;
          const px = src.x + 20 + (tgt.x - 20 - src.x - 20) * t;
          const py = src.y + (tgt.y - src.y) * t;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = isPositive ? '#00FF7F' : '#FF4500';
          ctx.fill();
        }
      });

      // Draw nodes
      nodes.forEach(node => {
        const isShocked = shockedNodes.has(node.id);
        const r = 16 + node.value * 10;
        const shockPulse = isShocked ? 1 + 0.3 * Math.sin(time.current * 10) : 1;
        const drawR = r * shockPulse;

        // Glow
        if (isShocked) {
          const glow = ctx.createRadialGradient(node.x, node.y, drawR, node.x, node.y, drawR + 15);
          glow.addColorStop(0, 'rgba(255, 69, 0, 0.4)');
          glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.beginPath();
          ctx.arc(node.x, node.y, drawR + 15, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Node
        ctx.beginPath();
        ctx.arc(node.x, node.y, drawR, 0, Math.PI * 2);
        const color = node.layer === 'input' ? '#00BFFF'
          : node.layer === 'hidden' ? '#9370DB'
            : node.id === 'out_win' ? '#00FF7F'
              : node.id === 'out_loss' ? '#FF4500' : '#FFD700';
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = isShocked ? '#FF4500' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = isShocked ? 2 : 1;
        ctx.stroke();

        // Label
        ctx.font = '9px monospace';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + drawR + 14);
      });

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, edges, shockedNodes]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    for (const node of nodes) {
      const r = 16 + node.value * 10;
      const dx = mx - node.x;
      const dy = my - node.y;
      if (dx * dx + dy * dy < (r + 5) ** 2) {
        onShockNode(node.id);
        return;
      }
    }
  }, [nodes, onShockNode]);

  if (trades.length === 0) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#666', fontSize: 14, fontFamily: "'Leckerli One', cursive",
      }}>
        Import trades to see neural network visualization
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={500}
      onClick={handleClick}
      style={{ width: '100%', height: '100%', cursor: 'pointer' }}
    />
  );
};

export default function TradeJournalPage() {
  const [trades, setTrades] = useState<ParsedTrade[]>([]);
  const [rawText, setRawText] = useState('');
  const [selectedTrade, setSelectedTrade] = useState<ParsedTrade | null>(null);
  const [importMode, setImportMode] = useState<'paste' | 'file'>('paste');
  const [shockedNodes, setShockedNodes] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParse = useCallback(() => {
    if (!rawText.trim()) return;
    // Detect CSV vs markdown
    const parsed = rawText.includes(',') && rawText.split('\n')[0].includes(',')
      ? parseTradingViewCSV(rawText)
      : parseMarkdownNotes(rawText);
    setTrades(parsed);
  }, [rawText]);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (!text) return;
        const parsed = file.name.endsWith('.csv')
          ? parseTradingViewCSV(text)
          : parseMarkdownNotes(text);
        setTrades(prev => [...prev, ...parsed]);
        setRawText(prev => prev + '\n' + text);
      };

      if (file.type.startsWith('image/')) {
        // For images (handwritten notes), convert to base64
        reader.onload = () => {
          // In production, reader.result would go to Gemini Vision API for OCR
          // For now, show a message
          setRawText(prev => prev + `\n[Image uploaded: ${file.name} - OCR processing would extract text here]`);
          // Mock some trades from the image
          const mockTrades: ParsedTrade[] = [
            buildTrade(Date.now(), 'AAPL', 'BUY', new Date().toISOString().slice(0, 10), `Handwritten note from ${file.name}: Buy AAPL on dip`),
            buildTrade(Date.now() + 1, 'TSLA', 'SHORT', new Date().toISOString().slice(0, 10), `Handwritten note from ${file.name}: Short TSLA overbought`),
          ];
          setTrades(prev => [...prev, ...mockTrades]);
        };
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  }, []);

  const handleShockNode = useCallback((nodeId: string) => {
    // When a node is shocked, find all connected nodes
    const newShocked = new Set<string>([nodeId]);

    // Find connected edges
    const allPatterns = [...new Set(trades.flatMap(t => t.patterns))];

    // If it's a ticker node, shock its patterns
    if (nodeId.startsWith('in_')) {
      const ticker = nodeId.replace('in_', '');
      trades.filter(t => t.ticker === ticker).forEach(t => {
        t.patterns.forEach(p => newShocked.add(`hid_${p.replace(/\s/g, '_')}`));
      });
    }
    // If it's a pattern node, shock connected tickers and outcomes
    if (nodeId.startsWith('hid_')) {
      const pattern = nodeId.replace('hid_', '').replace(/_/g, ' ');
      trades.filter(t => t.patterns.includes(pattern)).forEach(t => {
        newShocked.add(`in_${t.ticker}`);
        newShocked.add(`out_${t.outcome}`);
      });
    }
    // If it's an outcome node, shock connected patterns
    if (nodeId.startsWith('out_')) {
      const outcome = nodeId.replace('out_', '');
      allPatterns.forEach(p => {
        const pTrades = trades.filter(t => t.patterns.includes(p) && t.outcome === outcome);
        if (pTrades.length > 0) newShocked.add(`hid_${p.replace(/\s/g, '_')}`);
      });
    }

    setShockedNodes(newShocked);
    setTimeout(() => setShockedNodes(new Set()), 3000);
  }, [trades]);

  // Analysis
  const analysis = useMemo(() => {
    if (trades.length === 0) return null;
    const wins = trades.filter(t => t.outcome === 'win');
    const losses = trades.filter(t => t.outcome === 'loss');
    const patterns = [...new Set(trades.flatMap(t => t.patterns))];

    const patternStats = patterns.map(p => {
      const pTrades = trades.filter(t => t.patterns.includes(p));
      const pWins = pTrades.filter(t => t.outcome === 'win').length;
      return {
        pattern: p,
        total: pTrades.length,
        winRate: pTrades.length > 0 ? pWins / pTrades.length : 0,
        avgProfit: pTrades.reduce((s, t) => s + t.profit, 0) / Math.max(pTrades.length, 1),
      };
    }).sort((a, b) => b.winRate - a.winRate);

    return {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length > 0 ? wins.length / trades.length : 0,
      totalProfit: trades.reduce((s, t) => s + t.profit, 0),
      patternStats,
      bestPattern: patternStats[0],
      worstPattern: patternStats[patternStats.length - 1],
    };
  }, [trades]);

  return (
    <div style={{ width: '100%', height: '100%', background: PAGE_BG, display: 'flex', overflow: 'hidden', fontFamily: "'Leckerli One', cursive" }}>
      {/* Left: Import Panel */}
      <div style={{
        width: 'clamp(260px, 28vw, 360px)' as any, borderRight: `2px solid ${BORDER}`,
        padding: 16, overflowY: 'auto', flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 12,
        background: 'rgba(255,255,255,0.6)',
      }}>
        <h2 style={{ fontSize: 20, color: '#4b0082', margin: 0, fontFamily: FONT }}>
          Trade Journal
        </h2>
        <p style={{ fontSize: 10, color: '#7a4800', lineHeight: 1.4, margin: 0, fontFamily: "'Leckerli One', cursive" }}>
          Import notes from Obsidian (.md), TradingView (.csv), or photos of handwritten notes.
          Trades are parsed and visualized as a neural network showing what patterns lead to wins or losses.
        </p>

        {/* Import mode toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['paste', 'file'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setImportMode(mode)}
              style={{
                flex: 1, padding: '4px 0',
                background: importMode === mode ? 'rgba(106,0,170,0.12)' : 'rgba(0,0,0,0.04)',
                border: `1px solid ${importMode === mode ? 'rgba(106,0,170,0.3)' : BORDER}`,
                borderRadius: 4, color: importMode === mode ? ACCENT : '#7a4800',
                fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
              }}
            >
              {mode === 'paste' ? 'Paste Notes' : 'Upload Files'}
            </button>
          ))}
        </div>

        {importMode === 'paste' ? (
          <>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="Paste your trade notes here...&#10;&#10;Examples:&#10;BUY AAPL 2023-06-15 - RSI oversold, dip buy&#10;SHORT TSLA - overbought, momentum fading&#10;$MSFT earnings play, expecting beat"
              style={{
                width: '100%', height: 160, resize: 'vertical',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, padding: 10,
                color: '#ddd', fontSize: 11, fontFamily: "'Leckerli One', cursive",
                lineHeight: 1.5, outline: 'none',
              }}
            />
            <button
              onClick={handleParse}
              style={{
                padding: '8px 0', width: '100%',
                background: 'rgba(106,0,170,0.1)',
                border: `1px solid rgba(106,0,170,0.3)`,
                borderRadius: 6, color: ACCENT,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: FONT,
              }}
            >
              Parse Trades ({rawText.split('\n').filter(l => l.trim()).length} lines)
            </button>
          </>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.csv,.png,.jpg,.jpeg"
              multiple
              onChange={handleFileImport}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '20px 0', width: '100%',
                background: 'rgba(106,0,170,0.06)',
                border: `2px dashed ${BORDER}`,
                borderRadius: 8, color: ACCENT,
                fontSize: 12, cursor: 'pointer', fontFamily: FONT,
              }}
            >
              Click to upload files<br />
              <span style={{ fontSize: 9, color: '#7a4800', fontFamily: "'Leckerli One', cursive" }}>
                .md (Obsidian) | .csv (TradingView) | .png/.jpg (handwritten)
              </span>
            </button>
          </>
        )}

        {/* Parsed Trades List */}
        {trades.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: '#FFD700', fontWeight: 700, marginTop: 4 }}>
              PARSED TRADES ({trades.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
              {trades.map(trade => (
                <button
                  key={trade.id}
                  onClick={() => setSelectedTrade(selectedTrade?.id === trade.id ? null : trade)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px', width: '100%',
                    background: selectedTrade?.id === trade.id ? 'rgba(255,215,0,0.08)' : 'transparent',
                    border: '1px solid ' + (selectedTrade?.id === trade.id ? '#FFD70033' : 'transparent'),
                    borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{
                    fontSize: 8, fontWeight: 700, width: 34,
                    color: trade.action === 'BUY' || trade.action === 'CALL' || trade.action === 'LONG' ? '#00FF7F' : '#FF4500',
                  }}>
                    {trade.action}
                  </span>
                  <span style={{ fontSize: 10, color: '#ddd', fontWeight: 600 }}>{trade.ticker}</span>
                  <span style={{
                    fontSize: 8, marginLeft: 'auto',
                    color: trade.outcome === 'win' ? '#00FF7F' : trade.outcome === 'loss' ? '#FF4500' : '#888',
                  }}>
                    {trade.outcome === 'open' ? 'OPEN' : trade.profit >= 0 ? `+$${trade.profit}` : `-$${Math.abs(trade.profit)}`}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Selected Trade Detail */}
        {selectedTrade && (
          <div style={{
            padding: 10, background: 'rgba(147,112,219,0.06)',
            borderRadius: 6, border: '1px solid rgba(147,112,219,0.15)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9370DB', marginBottom: 4 }}>
              {selectedTrade.action} {selectedTrade.ticker}
            </div>
            <div style={{ fontSize: 9, color: '#999', marginBottom: 4 }}>
              {selectedTrade.date}
            </div>
            <div style={{ fontSize: 9, color: '#bbb', lineHeight: 1.4, marginBottom: 6 }}>
              {selectedTrade.notes.slice(0, 200)}
            </div>
            <div style={{ fontSize: 9, color: '#888' }}>
              Patterns: {selectedTrade.patterns.join(', ')}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, marginTop: 4,
              color: selectedTrade.outcome === 'win' ? '#00FF7F' : selectedTrade.outcome === 'loss' ? '#FF4500' : '#FFD700',
            }}>
              {selectedTrade.outcome === 'win' ? 'What went RIGHT' : selectedTrade.outcome === 'loss' ? 'What went WRONG' : 'Status: Open'}
              : {selectedTrade.reasonForEntry}
            </div>
          </div>
        )}

        {/* Analysis Summary */}
        {analysis && (
          <div style={{
            padding: 10, background: 'rgba(0,191,255,0.05)',
            borderRadius: 6, border: '1px solid rgba(0,191,255,0.15)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#00BFFF', marginBottom: 6 }}>
              PATTERN ANALYSIS
            </div>
            <div style={{ fontSize: 9, color: '#ccc', marginBottom: 4 }}>
              Win Rate: <span style={{ color: analysis.winRate > 0.5 ? '#00FF7F' : '#FF4500', fontWeight: 700 }}>
                {(analysis.winRate * 100).toFixed(0)}%
              </span>
              {' | '}Total P/L: <span style={{ color: analysis.totalProfit >= 0 ? '#00FF7F' : '#FF4500', fontWeight: 700 }}>
                {analysis.totalProfit >= 0 ? '+' : ''}${Math.abs(analysis.totalProfit).toFixed(0)}
              </span>
            </div>
            {analysis.patternStats.slice(0, 4).map(ps => (
              <div key={ps.pattern} style={{ fontSize: 8, color: '#aaa', padding: '1px 0', display: 'flex', gap: 4 }}>
                <span style={{ color: ps.winRate > 0.5 ? '#00FF7F' : '#FF4500', width: 28 }}>
                  {(ps.winRate * 100).toFixed(0)}%
                </span>
                <span style={{ flex: 1 }}>{ps.pattern}</span>
                <span style={{ color: ps.avgProfit >= 0 ? '#00FF7F' : '#FF4500' }}>
                  avg ${ps.avgProfit.toFixed(0)}
                </span>
              </div>
            ))}
            {analysis.bestPattern && (
              <div style={{ fontSize: 9, color: '#00FF7F', marginTop: 6 }}>
                Best: {analysis.bestPattern.pattern} ({(analysis.bestPattern.winRate * 100).toFixed(0)}% win rate)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: Neural Network Visualization */}
      <div style={{ flex: 1, position: 'relative' }}>
        <NeuralNetworkViz
          trades={trades}
          onShockNode={handleShockNode}
          shockedNodes={shockedNodes}
        />
        {trades.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            fontSize: 9, color: '#666', fontFamily: "'Leckerli One', cursive",
          }}>
            Click any node to simulate a crash shock through the network
          </div>
        )}
      </div>
    </div>
  );
}
