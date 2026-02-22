from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import os
import re
import requests
from pathlib import Path
from bs4 import BeautifulSoup
from .databricks_client import DatabricksClient

# Load .env from project root (parent of backend/)
_env_path = Path(__file__).resolve().parents[2] / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())

app = FastAPI(title="SweetReturns Agent Decision API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gemini setup
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", os.getenv("VITE_GEMINI_API_KEY", ""))
gemini_model = None

def get_gemini():
    global gemini_model
    if gemini_model is None and GEMINI_API_KEY:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel("gemini-2.0-flash")
    return gemini_model


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass


manager = ConnectionManager()
db_client = DatabricksClient()


class NewsInput(BaseModel):
    news_text: Optional[str] = None
    news_url: Optional[str] = None


def scrape_article(url: str) -> str:
    """Fetch a URL and extract article text."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    # Remove script/style/nav
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    # Try common article selectors
    article = soup.find("article")
    if article:
        text = article.get_text(separator=" ", strip=True)
    else:
        # Fallback: grab all <p> tags
        paragraphs = soup.find_all("p")
        text = " ".join(p.get_text(strip=True) for p in paragraphs)

    # Truncate to ~4000 chars for Gemini context
    return text[:4000] if text else ""


def gemini_analyze(article_text: str, source_url: str = "") -> dict:
    """Ask Gemini to analyze a finance article's market impact."""
    model = get_gemini()
    if not model:
        return {}

    prompt = f"""You are a Wall Street analyst. Analyze this financial news article and respond in EXACTLY this JSON format (no markdown, no code fences):

{{"sentiment": "bullish" or "bearish" or "neutral", "score": number from -1.0 to 1.0, "affected_tickers": ["TICKER1", "TICKER2"], "analysis": "2-3 sentence summary of market impact", "trade_suggestion": "what a trader should do based on this news"}}

Article{' from ' + source_url if source_url else ''}:
{article_text[:3000]}"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        # Strip markdown fences if present
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        import json
        return json.loads(text)
    except Exception as e:
        return {"error": str(e)}


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "sweetreturns-api", "gemini": bool(GEMINI_API_KEY)}


@app.get("/data-quality")
async def data_quality():
    """Monitor data quality of the frontend payload."""
    payload_path = Path(__file__).resolve().parents[2] / "public" / "frontend_payload.json"
    if not payload_path.exists():
        return {"status": "missing", "message": "frontend_payload.json not found. Run scripts/build_payload.py"}

    import json as _json
    with open(payload_path) as f:
        data = _json.load(f)

    stocks = data.get("stocks", [])
    edges = data.get("edges", [])
    quality = data.get("data_quality", {})

    # Live checks
    null_tickers = sum(1 for s in stocks if not s.get("ticker"))
    null_sectors = sum(1 for s in stocks if not s.get("sector"))
    zero_scores = sum(1 for s in stocks if s.get("golden_score", 0) == 0)
    platinum = sum(1 for s in stocks if s.get("is_platinum"))
    sectors = {}
    for s in stocks:
        sec = s.get("sector", "Unknown")
        sectors[sec] = sectors.get(sec, 0) + 1
    avg_news = sum(s.get("news_count", 0) for s in stocks) / len(stocks) if stocks else 0

    return {
        "status": "ok",
        "payload_stocks": len(stocks),
        "payload_edges": len(edges),
        "platinum_stocks": platinum,
        "null_tickers": null_tickers,
        "null_sectors": null_sectors,
        "zero_golden_scores": zero_scores,
        "avg_news_per_stock": round(avg_news, 1),
        "sector_distribution": sectors,
        "build_quality": quality,
    }


@app.websocket("/ws/agent-stream")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            scenario = data.get("scenario", "covid_crash")
            timestamp = data.get("timestamp", 0)
            flows = await db_client.get_agent_flows(scenario, timestamp)
            await websocket.send_json({"type": "agent_flows", "data": flows})
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.post("/inject-news")
async def inject_news(payload: NewsInput):
    """Inject news text or URL. If URL, scrapes article and runs Gemini analysis."""

    news_text = payload.news_text or ""
    news_url = payload.news_url or ""
    source = "text"
    gemini_result = {}

    # If URL provided, scrape and analyze with Gemini
    if news_url:
        try:
            article_text = scrape_article(news_url)
            if not article_text:
                return {"sentiment": "neutral", "score": 0.0, "message": "Could not extract article content"}
            news_text = article_text
            source = "url"

            # Gemini analysis
            gemini_result = gemini_analyze(article_text, news_url)
        except Exception as e:
            return {"sentiment": "neutral", "score": 0.0, "message": f"Failed to fetch URL: {str(e)}"}

    if not news_text:
        return {"sentiment": "neutral", "score": 0.0, "message": "No news text or URL provided"}

    # If Gemini returned a result, use it
    if gemini_result and "sentiment" in gemini_result:
        sentiment_label = gemini_result["sentiment"]
        score = gemini_result.get("score", 0.0)
        affected = gemini_result.get("affected_tickers", [])
        analysis = gemini_result.get("analysis", "")
        trade_suggestion = gemini_result.get("trade_suggestion", "")

        # Broadcast to connected clients
        await manager.broadcast({
            "type": "breaking_news",
            "news": news_text[:500],
            "sentiment": {"label": sentiment_label, "score": score},
            "affected_tickers": affected,
        })

        return {
            "sentiment": sentiment_label,
            "score": score,
            "affected_tickers": affected,
            "analysis": analysis,
            "trade_suggestion": trade_suggestion,
            "message": f"Analyzed by Gemini AI ({source})",
        }

    # Fallback: keyword-based analysis
    sentiment = await db_client.analyze_sentiment(news_text)
    affected_stocks = await db_client.get_affected_stocks(news_text)
    agent_reaction = await db_client.compute_agent_reaction(sentiment, affected_stocks)

    await manager.broadcast({
        "type": "breaking_news",
        "news": news_text[:500],
        "sentiment": sentiment,
        "agent_reaction": agent_reaction,
    })

    return {
        "sentiment": sentiment.get("label", "neutral"),
        "score": sentiment.get("score", 0.0),
        "affected_tickers": affected_stocks,
        "message": f"Processed by keyword engine ({source})",
    }
