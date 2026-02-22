// ============================================================
// SweetReturns — News Injector (Yellow/Purple theme, full panel)
// ============================================================

import { useState, useCallback, useMemo } from 'react';

const ACCENT = '#6a00aa';
const FONT = `'Leckerli One', cursive`;
const BORDER = 'rgba(106,0,170,0.18)';

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
                return '#1a7a00';
            case 'bearish':
            case 'negative':
                return '#a30000';
            default:
                return ACCENT;
        }
    };

    return (
        <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: FONT,
        }}>

            {/* ── Middle: plain text results, centred when idle ── */}
            <div className="sweet-scroll" style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: result || error || isLoading ? 'flex-start' : 'center',
                padding: '18px 16px',
                gap: 16,
            }}>
                {/* Idle placeholder */}
                {!result && !error && !isLoading && (
                    <div style={{ textAlign: 'center', userSelect: 'none' }}>
                        <div style={{ fontSize: 26, color: '#4b0082', fontFamily: FONT, marginBottom: 12 }}>
                            Future Prediction
                        </div>
                        <div style={{ color: 'rgba(106,0,170,0.35)', fontSize: 16, lineHeight: 1.8 }}>
                            Put any event in here,<br />we will tell you whatever<br />happens, sweet or sour
                        </div>
                    </div>
                )}

                {/* Loading */}
                {isLoading && (
                    <div style={{ textAlign: 'center', color: ACCENT, fontSize: 12, lineHeight: 2, marginTop: 40, opacity: 0.6 }}>
                        Tasting the market…
                    </div>
                )}

                {/* Error — plain text */}
                {error && (
                    <div style={{ color: '#a30000', fontSize: 12, lineHeight: 1.65 }}>
                        <span style={{ fontWeight: 700 }}>! </span>{error}
                    </div>
                )}

                {/* Result — plain text, no boxes */}
                {result && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        {/* Sentiment */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontSize: 9, color: 'rgba(106,0,170,0.4)', textTransform: 'uppercase', letterSpacing: 1.2 }}>sentiment</span>
                            <span style={{ fontSize: 17, color: getSentimentColor(result.sentiment), fontFamily: FONT }}>
                                {result.sentiment}
                            </span>
                            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)' }}>
                                {result.score >= 0 ? '+' : ''}{result.score.toFixed(2)}
                            </span>
                        </div>

                        {result.analysis && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <span style={{ fontSize: 9, color: 'rgba(106,0,170,0.4)', textTransform: 'uppercase', letterSpacing: 1.2 }}>analysis</span>
                                <span style={{ fontSize: 12, color: '#2d1a00', lineHeight: 1.7 }}>{result.analysis}</span>
                            </div>
                        )}

                        {result.trade_suggestion && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <span style={{ fontSize: 9, color: 'rgba(106,0,170,0.4)', textTransform: 'uppercase', letterSpacing: 1.2 }}>trade signal</span>
                                <span style={{ fontSize: 12, color: ACCENT, lineHeight: 1.7 }}>{result.trade_suggestion}</span>
                            </div>
                        )}

                        {result.affected_tickers && result.affected_tickers.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: 9, color: 'rgba(106,0,170,0.4)', textTransform: 'uppercase', letterSpacing: 1.2 }}>affected tickers</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {result.affected_tickers.map((t) => (
                                        <span key={t} style={{ color: ACCENT, fontSize: 12, fontFamily: FONT }}>{t}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {result.message && (
                            <div style={{ color: 'rgba(106,0,170,0.4)', fontSize: 10, fontStyle: 'italic' }}>
                                {result.message}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Bottom: input — matches left panel footer style ── */}
            <div style={{
                flexShrink: 0,
                padding: '10px 14px 13px',
                borderTop: '2px solid rgba(106,0,170,0.12)',
                background: 'rgba(255,255,255,0.85)',
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
            }}>
                {isUrl && (
                    <div style={{ fontSize: 10, color: '#005fa3', letterSpacing: 0.3, fontFamily: FONT }}>
                        ⬡ URL detected — Gemini will analyze the article
                    </div>
                )}

                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleInject(); }}
                    placeholder="Paste a URL or describe a market event…"
                    disabled={isLoading}
                    rows={3}
                    style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.95)',
                        color: isUrl ? '#005fa3' : '#2d1a00',
                        border: `1.5px solid ${isUrl ? 'rgba(0,95,163,0.3)' : BORDER}`,
                        borderRadius: 8,
                        padding: '9px 11px',
                        fontFamily: FONT,
                        fontSize: 12,
                        resize: 'none',
                        outline: 'none',
                        boxSizing: 'border-box',
                        opacity: isLoading ? 0.5 : 1,
                        transition: 'border-color 0.2s',
                        lineHeight: 1.6,
                        boxShadow: 'inset 0 1px 3px rgba(106,0,170,0.06)',
                    }}
                />

                <button
                    onClick={handleInject}
                    disabled={isLoading || !input.trim()}
                    style={{
                        padding: '9px 0',
                        background: isLoading || !input.trim() ? 'rgba(106,0,170,0.07)' : '#FFD700',
                        color: isLoading || !input.trim() ? 'rgba(106,0,170,0.35)' : '#3d0066',
                        border: `1.5px solid ${isLoading || !input.trim() ? 'rgba(106,0,170,0.15)' : 'rgba(106,0,170,0.35)'}`,
                        borderRadius: 8,
                        fontFamily: FONT,
                        fontSize: 14,
                        cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                        transition: 'all 0.18s',
                        letterSpacing: 0.3,
                        boxShadow: isLoading || !input.trim() ? 'none' : '0 2px 8px rgba(255,215,0,0.3)',
                    }}
                >
                    {isLoading ? '⟳  Tasting…' : 'Sweet or Sour?'}
                </button>
            </div>
        </div>
    );
}

export default NewsInjector;
