import { useState, useCallback } from 'react';

const COLORS = {
  PAGE_BG: '#1a1a2e',
  ACCENT: '#FFD700',
  PANEL_BG: '#0f0f23',
  BORDER: '#2a2a4a',
  TEXT: '#e0e0e0',
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface SentimentResult {
  sentiment: string;
  score: number;
  affected_tickers?: string[];
  message?: string;
}

function NewsInjector() {
  const [isOpen, setIsOpen] = useState(true);
  const [newsText, setNewsText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SentimentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInject = useCallback(async () => {
    if (!newsText.trim()) return;

    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/inject-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news_text: newsText.trim() }),
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
  }, [newsText]);

  const getSentimentColor = (sentiment: string): string => {
    switch (sentiment.toLowerCase()) {
      case 'bullish':
      case 'positive':
        return '#4caf50';
      case 'bearish':
      case 'negative':
        return '#f44336';
      default:
        return COLORS.ACCENT;
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 1000,
          background: COLORS.PANEL_BG,
          color: COLORS.ACCENT,
          border: `1px solid ${COLORS.BORDER}`,
          borderRadius: 8,
          padding: '10px 16px',
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: 14,
          fontWeight: 'bold',
          boxShadow: `0 4px 20px rgba(255, 215, 0, 0.15)`,
        }}
      >
        News Injector
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 20,
        width: 340,
        background: COLORS.PANEL_BG,
        border: `1px solid ${COLORS.BORDER}`,
        borderRadius: 12,
        padding: 20,
        boxShadow: `0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 215, 0, 0.08)`,
        fontFamily: 'monospace',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <span
          style={{
            color: COLORS.ACCENT,
            fontSize: 15,
            fontWeight: 'bold',
            letterSpacing: 1,
          }}
        >
          NEWS INJECTOR
        </span>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: COLORS.TEXT,
            fontSize: 18,
            cursor: 'pointer',
            padding: '2px 6px',
            lineHeight: 1,
            opacity: 0.7,
          }}
        >
          x
        </button>
      </div>

      {/* Textarea */}
      <textarea
        value={newsText}
        onChange={(e) => setNewsText(e.target.value)}
        placeholder="Enter market news to inject..."
        disabled={isLoading}
        rows={4}
        style={{
          width: '100%',
          background: COLORS.PAGE_BG,
          color: COLORS.TEXT,
          border: `1px solid ${COLORS.BORDER}`,
          borderRadius: 6,
          padding: 10,
          fontFamily: 'monospace',
          fontSize: 13,
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
          opacity: isLoading ? 0.5 : 1,
        }}
      />

      {/* Inject Button */}
      <button
        onClick={handleInject}
        disabled={isLoading || !newsText.trim()}
        style={{
          width: '100%',
          marginTop: 10,
          padding: '10px 0',
          background: isLoading || !newsText.trim()
            ? COLORS.BORDER
            : COLORS.ACCENT,
          color: isLoading || !newsText.trim()
            ? COLORS.TEXT
            : COLORS.PANEL_BG,
          border: 'none',
          borderRadius: 6,
          fontFamily: 'monospace',
          fontSize: 14,
          fontWeight: 'bold',
          cursor: isLoading || !newsText.trim() ? 'not-allowed' : 'pointer',
          letterSpacing: 1,
          transition: 'background 0.2s ease',
        }}
      >
        {isLoading ? 'INJECTING...' : 'INJECT NEWS'}
      </button>

      {/* Error Display */}
      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: 'rgba(244, 67, 54, 0.1)',
            border: '1px solid rgba(244, 67, 54, 0.3)',
            borderRadius: 6,
            color: '#f44336',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Sentiment Result */}
      {result && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: COLORS.PAGE_BG,
            border: `1px solid ${COLORS.BORDER}`,
            borderRadius: 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <span style={{ color: COLORS.TEXT, fontSize: 11, opacity: 0.7 }}>
              SENTIMENT
            </span>
            <span
              style={{
                color: getSentimentColor(result.sentiment),
                fontSize: 13,
                fontWeight: 'bold',
                textTransform: 'uppercase',
              }}
            >
              {result.sentiment}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: result.affected_tickers?.length ? 8 : 0,
            }}
          >
            <span style={{ color: COLORS.TEXT, fontSize: 11, opacity: 0.7 }}>
              SCORE
            </span>
            <span
              style={{
                color: COLORS.ACCENT,
                fontSize: 13,
                fontWeight: 'bold',
              }}
            >
              {result.score.toFixed(2)}
            </span>
          </div>

          {result.affected_tickers && result.affected_tickers.length > 0 && (
            <div>
              <span
                style={{
                  color: COLORS.TEXT,
                  fontSize: 11,
                  opacity: 0.7,
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                AFFECTED TICKERS
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {result.affected_tickers.map((ticker) => (
                  <span
                    key={ticker}
                    style={{
                      background: COLORS.BORDER,
                      color: COLORS.ACCENT,
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 'bold',
                    }}
                  >
                    {ticker}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.message && (
            <div
              style={{
                marginTop: 8,
                color: COLORS.TEXT,
                fontSize: 11,
                opacity: 0.7,
                fontStyle: 'italic',
              }}
            >
              {result.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NewsInjector;
