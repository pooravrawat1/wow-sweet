// ============================================================
// SweetReturns — Future Predictions (Gemini-powered, no backend needed)
// ============================================================

import { useState, useCallback, useMemo } from 'react';

const ACCENT = '#6a00aa';
const FONT = `'Leckerli One', cursive`;
const BORDER = 'rgba(106,0,170,0.18)';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

interface PredictionResult {
  sentiment: string;
  score: number;
  affected_tickers: string[];
  analysis: string;
  trade_suggestion: string;
}

const URL_REGEX = /^https?:\/\//i;

async function callGemini(prompt: string): Promise<PredictionResult> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 100)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!text) throw new Error('Gemini returned empty response');

  // Strip markdown fences and find JSON object
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  // If there's extra text around the JSON, extract just the object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];

  const result = JSON.parse(cleaned);
  // Ensure score is a number
  if (typeof result.score !== 'number') result.score = parseFloat(result.score) || 0;
  return result;
}

function buildPrompt(input: string, isUrl: boolean): string {
  const context = isUrl
    ? `Analyze this financial news based on the URL. Infer the topic from the URL path, domain, and any keywords visible in it. URL: ${input}`
    : `Analyze this market event/scenario: "${input}"`;

  return `You are a senior financial analyst at a top Wall Street firm. ${context}

IMPORTANT RULES:
- The score MUST reflect real market impact. A major negative event (rate hike, earnings miss, war, recession) should have score -0.5 to -1.0. A major positive event (earnings beat, rate cut, stimulus) should have score +0.5 to +1.0. NEVER return 0 unless truly neutral.
- Pick the score FIRST based on how markets would actually react, then write the analysis.
- affected_tickers must be real US stock tickers that would be most impacted.
- Be specific and actionable in trade suggestions.

Respond ONLY with valid JSON (no markdown, no code fences, no explanation outside JSON):
{"sentiment":"bullish","score":0.75,"affected_tickers":["AAPL","MSFT"],"analysis":"2-3 sentences explaining the market impact.","trade_suggestion":"1-2 sentence specific trade idea."}`;
}

function FuturePredictions() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isUrl = useMemo(() => URL_REGEX.test(input.trim()), [input]);
  const hasKey = Boolean(API_KEY);

  const handlePredict = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (!hasKey) {
      setError('Set VITE_GEMINI_API_KEY in your .env file to enable predictions');
      return;
    }

    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const prediction = await callGemini(buildPrompt(trimmed, isUrl));
      setResult(prediction);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Gemini returned an invalid response — try rephrasing');
      } else {
        setError(err instanceof Error ? err.message : 'Prediction failed');
      }
    } finally {
      setIsLoading(false);
    }
  }, [input, isUrl, hasKey]);

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

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: FONT,
    }}>
      <div style={{ padding: '10px 12px' }}>
        {/* Mode indicator */}
        <div style={{ fontSize: 8, color: isUrl ? '#00BFFF' : '#666', marginBottom: 4, transition: 'color 0.15s' }}>
          {!hasKey ? 'VITE_GEMINI_API_KEY required' : isUrl ? 'URL detected — Gemini will analyze the article' : 'Paste a news URL or describe a market scenario'}
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
            width: '100%',
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FuturePredictions;
