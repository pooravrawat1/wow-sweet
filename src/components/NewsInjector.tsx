// ============================================================
// SweetReturns — News Injector (URL + text, Gemini analysis)
// ============================================================

import { useState, useCallback, useMemo } from 'react';

const ACCENT = '#FFD700';
const PANEL_BG = 'rgba(15, 15, 35, 0.92)';
const BORDER = 'rgba(255,255,255,0.08)';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface SentimentResult {
  sentiment: string;
  score: number;
  affected_tickers?: string[];
  analysis?: string;
  trade_suggestion?: string;
  message?: string;
}

const URL_REGEX = /^https?:\/\//i;

function NewsInjector() {
  const [isOpen, setIsOpen] = useState(true);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SentimentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isUrl = useMemo(() => URL_REGEX.test(input.trim()), [input]);

  const handleInject = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setResult(null);
    setError(null);

    const body = URL_REGEX.test(trimmed)
      ? { news_url: trimmed }
      : { news_text: trimmed };

    try {
      const response = await fetch(`${API_URL}/inject-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data: SentimentResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to inject news');
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  const getSentimentColor = (sentiment: string): string => {
    switch (sentiment.toLowerCase()) {
      case 'bullish':
      case 'positive':
        return '#00FF7F';
      case 'bearish':
      case 'negative':
        return '#FF4500';
      default:
        return ACCENT;
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
        News
      </button>
    );
  }

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 20, width: 300,
      background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: 'monospace', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 12px', borderBottom: `1px solid ${BORDER}`,
        background: 'rgba(255,255,255,0.02)',
      }}>
        <span style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 0.8 }}>
          NEWS INJECTOR
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
          {isUrl ? 'URL detected — Gemini will analyze the article' : 'Paste a news URL or type market news'}
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://cnbc.com/... or type news here"
          disabled={isLoading}
          rows={3}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            color: isUrl ? '#00BFFF' : '#ddd',
            border: `1px solid ${isUrl ? 'rgba(0,191,255,0.2)' : BORDER}`,
            borderRadius: 4, padding: 8,
            fontFamily: 'monospace', fontSize: 10,
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            opacity: isLoading ? 0.5 : 1,
            transition: 'border-color 0.15s, color 0.15s',
          }}
        />

        <button
          onClick={handleInject}
          disabled={isLoading || !input.trim()}
          style={{
            width: '100%', marginTop: 6, padding: '6px 0',
            background: isLoading || !input.trim() ? 'rgba(255,255,255,0.04)' : ACCENT,
            color: isLoading || !input.trim() ? '#666' : '#0f0f23',
            border: 'none', borderRadius: 4,
            fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {isLoading ? (isUrl ? 'Analyzing article...' : 'Injecting...') : (isUrl ? 'Analyze with Gemini' : 'Inject')}
        </button>

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 6, padding: '5px 8px',
            background: 'rgba(255,69,0,0.06)', border: '1px solid rgba(255,69,0,0.15)',
            borderRadius: 4, color: '#FF4500', fontSize: 9,
          }}>
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{
            marginTop: 6, padding: '8px',
            background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}`, borderRadius: 4,
          }}>
            {/* Sentiment + Score */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 9 }}>
              <span style={{ color: '#666' }}>Sentiment</span>
              <span style={{ color: getSentimentColor(result.sentiment), fontWeight: 700, textTransform: 'uppercase' }}>
                {result.sentiment} ({result.score >= 0 ? '+' : ''}{result.score.toFixed(2)})
              </span>
            </div>

            {/* Gemini Analysis */}
            {result.analysis && (
              <div style={{
                padding: '6px 8px', marginBottom: 6,
                background: 'rgba(0,191,255,0.04)', borderRadius: 3,
                borderLeft: '2px solid rgba(0,191,255,0.3)',
              }}>
                <div style={{ fontSize: 8, color: '#00BFFF', fontWeight: 600, marginBottom: 3 }}>GEMINI ANALYSIS</div>
                <div style={{ fontSize: 9, color: '#bbb', lineHeight: 1.4 }}>{result.analysis}</div>
              </div>
            )}

            {/* Trade Suggestion */}
            {result.trade_suggestion && (
              <div style={{
                padding: '5px 8px', marginBottom: 6,
                background: 'rgba(255,215,0,0.04)', borderRadius: 3,
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
                      background: 'rgba(255,215,0,0.08)', color: ACCENT,
                      padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600,
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Engine */}
            {result.message && (
              <div style={{ color: '#555', fontSize: 7, fontStyle: 'italic', marginTop: 4 }}>
                {result.message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default NewsInjector;
