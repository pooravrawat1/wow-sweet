// ============================================================
// SweetReturns — News Injector (Yellow/Purple theme, full panel)
// ============================================================

import { useState, useCallback, useMemo } from 'react';

const ACCENT = '#6a00aa';
const FONT = `'Leckerli One', cursive`;
const BORDER = 'rgba(106,0,170,0.18)';

// Auto-detect backend URL: use env var if set, otherwise derive from current hostname
const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

interface PredictionResult {
  sentiment: string;
  score: number;
  affected_tickers?: string[];
  analysis?: string;
  trade_suggestion?: string;
  message?: string;
}

const URL_REGEX = /^https?:\/\//i;

function FuturePredictions() {
  const [isOpen, setIsOpen] = useState(true);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isUrl = useMemo(() => URL_REGEX.test(input.trim()), [input]);

  const handlePredict = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setResult(null);
    setError(null);

    const body = URL_REGEX.test(trimmed)
      ? { news_url: trimmed }
      : { news_text: trimmed };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_URL}/inject-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data: PredictionResult = await response.json();
      setResult(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Backend not reachable — start the server with: cd backend && uvicorn app.main:app');
      } else if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network'))) {
        setError('Cannot connect to backend — ensure the API server is running on port 8000');
      } else {
        setError(err instanceof Error ? err.message : 'Prediction failed');
      }
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  const getSentimentColor = (sentiment: string): string => {
    switch (sentiment.toLowerCase()) {
      case 'bullish':
      case 'positive':
        return '#1a7a00';
      case 'bearish':
      case 'negative':
        return '#a30000';
      default:
        return '#FFD700';
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'absolute',
          top: 12, right: 12, zIndex: 20,
          background: PANEL_BG, color: ACCENT,
          border: `1px solid ${BORDER}`, borderRadius: 6,
          padding: '5px 12px', cursor: 'pointer',
          fontFamily: 'monospace', fontSize: 10, fontWeight: 600,
          backdropFilter: 'blur(12px)',
        }}
      >
        Predictions
      </button>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: FONT,
    }}>

      {/* Header */}
      <div style={{
        background: '#FFFFFF',
        padding: '12px 16px',
        borderBottom: `2px solid rgba(106,0,170,0.2)`,
        flexShrink: 0,
      }}>
        <span style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 0.8 }}>
          FUTURE PREDICTIONS
        </span>
        <button
          onClick={() => setIsOpen(false)}
          style={{ background: 'none', border: 'none', color: '#666', fontSize: 12, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
        >
          x
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '10px 12px' }}>
        {/* Mode indicator */}
        <div style={{ fontSize: 8, color: isUrl ? '#00BFFF' : '#666', marginBottom: 4, transition: 'color 0.15s' }}>
          {isUrl ? 'URL detected — Gemini will analyze the article' : 'Paste a news URL or describe a market scenario'}
        </div>

        {/* Textarea */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://cnbc.com/... or describe a market event"
          disabled={isLoading}
          rows={5}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.7)',
            color: isUrl ? '#005fa3' : '#2d1a00',
            border: `2px solid ${isUrl ? 'rgba(0,95,163,0.35)' : BORDER}`,
            borderRadius: 8,
            padding: '10px 12px',
            fontFamily: "'Leckerli One', cursive",
            fontSize: 12,
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
            opacity: isLoading ? 0.5 : 1,
            transition: 'border-color 0.2s',
            boxShadow: 'inset 0 1px 4px rgba(106,0,170,0.06)',
          }}
        />

        {/* Inject button */}
        <button
          onClick={handlePredict}
          disabled={isLoading || !input.trim()}
          style={{
            padding: '12px 0',
            background: isLoading || !input.trim()
              ? 'rgba(106,0,170,0.08)'
              : '#FFFFFF',
            color: isLoading || !input.trim() ? '#9b30d9' : '#3d0066',
            border: `2px solid ${isLoading || !input.trim() ? 'rgba(106,0,170,0.2)' : 'rgba(106,0,170,0.4)'}`,
            borderRadius: 8,
            fontFamily: FONT,
            fontSize: 16,
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.18s',
            boxShadow: isLoading || !input.trim() ? 'none' : '0 2px 8px rgba(106,0,170,0.3)',
          }}
        >
          {isLoading ? (isUrl ? 'Analyzing article...' : 'Predicting...') : (isUrl ? 'Analyze with Gemini' : 'Predict')}
        </button>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 12px',
            background: 'rgba(163,0,0,0.06)',
            border: '1px solid rgba(163,0,0,0.2)',
            borderRadius: 8,
            color: '#a30000',
            fontSize: 11,
            fontFamily: "'Leckerli One', cursive",
          }}>
            Warning: {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{
            background: 'rgba(255,255,255,0.6)',
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            {/* Sentiment + Score */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 9 }}>
              <span style={{ color: '#666' }}>Prediction</span>
              <span style={{ color: getSentimentColor(result.sentiment), fontWeight: 700, textTransform: 'uppercase' }}>
                {result.sentiment} ({result.score >= 0 ? '+' : ''}{result.score.toFixed(2)})
              </span>
            </div>

            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Gemini Analysis */}
              {result.analysis && (
                <div style={{
                  padding: '8px 10px',
                  background: 'rgba(0,95,163,0.06)', borderRadius: 6,
                  borderLeft: '3px solid rgba(0,95,163,0.4)',
                }}>
                  <div style={{ fontSize: 10, color: '#005fa3', fontFamily: FONT, marginBottom: 4 }}>Gemini Analysis</div>
                  <div style={{ fontSize: 11, color: '#2d1a00', lineHeight: 1.5, fontFamily: "'Leckerli One', cursive" }}>{result.analysis}</div>
                </div>
              )}

              {/* Trade Suggestion */}
              {result.trade_suggestion && (
                <div style={{
                  padding: '5px 8px', marginBottom: 6,
                  background: 'rgba(255,105,180,0.04)', borderRadius: 3,
                  borderLeft: `2px solid ${ACCENT}44`,
                }}>
                  <div style={{ fontSize: 8, color: ACCENT, fontWeight: 600, marginBottom: 2 }}>TRADE SIGNAL</div>
                  <div style={{ fontSize: 9, color: '#bbb', lineHeight: 1.4 }}>{result.trade_suggestion}</div>
                </div>
              )}

              {/* Affected Tickers */}
              {result.affected_tickers && result.affected_tickers.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 8, color: '#666', marginBottom: 3 }}>Affected tickers</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {result.affected_tickers.map((t) => (
                      <span key={t} style={{
                        background: 'rgba(255,105,180,0.08)', color: ACCENT,
                        padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600,
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Engine note */}
              {result.message && (
                <div style={{ color: '#9b30d9', fontSize: 9, fontStyle: 'italic', fontFamily: "'Leckerli One', cursive", marginTop: 2 }}>
                  {result.message}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FuturePredictions;
