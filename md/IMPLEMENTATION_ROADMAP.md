# Wolf of Wall Sweet — Complete Overhaul Implementation Roadmap

## Executive Summary

This roadmap transforms your wow-street project from a client-side graphics demo into a powerhouse Data Science/AI project using cloud-based computation, advanced ML techniques, and real-time data pipelines. The strategy follows the "Pre-compute + Live Hero" approach for a successful 24-hour hackathon demo.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Target Architecture](#target-architecture)
3. [Phase 1: Cloud Infrastructure Setup](#phase-1-cloud-infrastructure-setup)
4. [Phase 2: Data Pipeline Enhancement](#phase-2-data-pipeline-enhancement)
5. [Phase 3: Advanced ML Implementation](#phase-3-advanced-ml-implementation)
6. [Phase 4: Cloud Computation Layer](#phase-4-cloud-computation-layer)
7. [Phase 5: Frontend Integration](#phase-5-frontend-integration)
8. [Phase 6: Live Hero Feature](#phase-6-live-hero-feature)
9. [24-Hour Hackathon Strategy](#24-hour-hackathon-strategy)
10. [Cloud Provider Setup Guide](#cloud-provider-setup-guide)
11. [Team Roles & Responsibilities](#team-roles-responsibilities)

---

## Current State Analysis

### ✅ What You Have

**Frontend:**
- React 19 + TypeScript + Three.js
- 10K agent simulation (client-side)
- Time slider, minimap, store visualization
- Basic Gemini API integration
- 4 pages: GoldenCity, AgentReactions, StockNetwork, GraphPlayground

**Data Pipeline:**
- Databricks medallion architecture (bronze/silver/gold)
- Stock data (stock_details_5_years.csv - 500 tickers, 5 years)
- 30-year financial events and market data
- Basic golden ticket computation
- 50+ technical indicators

**Backend:**
- Python scripts for local pipeline
- JSON export for frontend

### ❌ What's Missing (For Data Science Excellence)

1. **Cloud Computation:** All agent logic runs client-side (graphics, not DS)
2. **Advanced ML:** No FinBERT, GNN, HMM, or BERTopic
3. **Real-time Data:** No news feeds, Reddit data, or macroeconomic APIs
4. **Agent Archetypes:** No behavioral modeling or multi-agent RL
5. **WebSocket Streaming:** No real-time cloud-to-frontend communication
6. **Scalability:** Can't handle 500K agents or complex models client-side

---

## Target Architecture

### The "Macro-State Cloud, Micro-State Frontend" Pattern

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLOUD LAYER (Databricks)                     │
│                                                                       │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────┐ │
│  │ Data Pipelines│  │ ML Models     │  │ Agent Archetype Engine   │ │
│  │               │  │               │  │                          │ │
│  │ • Delta Lake  │  │ • FinBERT     │  │ • 100 Archetype Models   │ │
│  │ • Medallion   │  │ • GNN/Network │  │ • Behavioral Profiles    │ │
│  │ • Time Travel │  │ • HMM Regimes │  │ • Decision Engine        │ │
│  │ • Multi-source│  │ • BERTopic    │  │ • Stochastic Sampling    │ │
│  └──────┬───────┘  └───────┬───────┘  └──────────┬───────────────┘ │
│         │                  │                      │                  │
│         └──────────────────┴──────────────────────┘                  │
│                            │                                          │
│                    ┌───────▼────────┐                                │
│                    │ Decision API    │                                │
│                    │ (FastAPI)       │                                │
│                    └───────┬────────┘                                │
└────────────────────────────┼──────────────────────────────────────────┘
                             │
                    WebSocket│JSON Payloads
                             │ (lightweight)
                             │
┌────────────────────────────▼──────────────────────────────────────────┐
│                       FRONTEND (React + Three.js)                      │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ WebGPU Renderer  │  │ Agent Visualizer │  │ WebSocket Client │   │
│  │                  │  │                  │  │                  │   │
│  │ • 500K particles │  │ • Receives:      │  │ • Connects to    │   │
│  │ • Local physics  │  │   {cohort, target│  │   Databricks API │   │
│  │ • Pathfinding    │  │   , count, emotion}│  │ • Handles flow   │   │
│  │ • Collision      │  │ • Renders flows  │  │   instructions   │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Cloud computes decisions:**
   - FinBERT analyzes news → sentiment scores
   - HMM detects market regime → fear/greed baseline
   - GNN propagates shocks through correlation network
   - 100 agent archetypes make decisions → `{cohort, target_ticker, count, emotion}`

2. **Cloud streams to frontend via WebSocket:**
   ```json
   {
     "cohort": "retail_panic",
     "source": "AAPL",
     "target": "GME",
     "count": 10000,
     "emotion": "panic",
     "urgency": 0.9
   }
   ```

3. **Frontend renders locally:**
   - Receives instruction: "10K agents from AAPL → GME"
   - WebGPU handles particle movement, collision, pathfinding
   - Visual only—no complex logic

---

## Phase 1: Cloud Infrastructure Setup

**Duration:** 2-3 hours (pre-hackathon)

### 1.1 Databricks Workspace Setup

**Objective:** Production-ready Databricks environment with Delta Lake and Model Serving.

#### Step-by-Step:

1. **Create/Upgrade Databricks Workspace:**
   - **Option A: Community Edition (Free)**
     - Limited compute, but sufficient for prototyping
     - URL: https://community.cloud.databricks.com
   - **Option B: Standard/Premium ($300 student credits)**
     - Full features, Model Serving, Unity Catalog
     - Recommended for hackathon

2. **Configure Compute:**
   ```yaml
   Cluster Name: sweetreturns-ml-cluster
   Runtime: DBR 14.3 LTS ML (includes scikit-learn, transformers, torch)
   Driver: Standard_DS3_v2 (14 GB RAM, 4 cores)
   Workers: 2-4 x Standard_DS3_v2
   Autoscaling: Enabled (2-4 workers)
   Auto-termination: 20 minutes
   ```

3. **Install Additional Libraries:**
   ```python
   # Cluster Libraries → PyPI
   transformers==4.36.0
   sentence-transformers==2.2.2
   bertopic==0.16.0
   yfinance==0.2.32
   fredapi==0.5.1
   praw==7.7.1  # Reddit API
   networkx==3.2
   torch-geometric==2.4.0
   ```

4. **Create Unity Catalog Structure:**
   ```sql
   -- Create catalog and schemas
   CREATE CATALOG IF NOT EXISTS sweetreturns;
   USE CATALOG sweetreturns;

   CREATE SCHEMA IF NOT EXISTS bronze;
   CREATE SCHEMA IF NOT EXISTS silver;
   CREATE SCHEMA IF NOT EXISTS gold;
   CREATE SCHEMA IF NOT EXISTS ml_models;

   -- Create external volume for data
   CREATE EXTERNAL VOLUME sweetreturns.bronze.raw_data
   LOCATION 's3://your-bucket/sweetreturns/raw_data/';
   ```

### 1.2 FastAPI Backend Setup

**Objective:** Real-time API for streaming agent decisions to frontend.

#### Create Backend Structure:

```bash
cd wow-street
mkdir -p backend/app
touch backend/requirements.txt
touch backend/app/__init__.py
touch backend/app/main.py
touch backend/app/websocket_handler.py
touch backend/app/databricks_client.py
```

#### `backend/requirements.txt`:
```txt
fastapi==0.109.0
uvicorn[standard]==0.27.0
websockets==12.0
databricks-sql-connector==3.0.0
pydantic==2.5.3
python-dotenv==1.0.0
redis==5.0.1
```

#### `backend/app/main.py`:
```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import asyncio
import json
from .databricks_client import DatabricksClient

app = FastAPI(title="SweetReturns Agent Decision API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
            except:
                pass

manager = ConnectionManager()
db_client = DatabricksClient()

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.websocket("/ws/agent-stream")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Receive time/scenario from client
            data = await websocket.receive_json()
            scenario = data.get("scenario", "covid_crash")
            timestamp = data.get("timestamp", 0)

            # Query Databricks for agent flows
            flows = await db_client.get_agent_flows(scenario, timestamp)

            # Stream back to client
            await websocket.send_json({"type": "agent_flows", "data": flows})

            await asyncio.sleep(0.1)  # 10 FPS update rate
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/inject-news")
async def inject_news(news_text: str):
    """Live Hero Feature: Inject fake news and get real-time agent reaction"""
    # This will call FinBERT on Databricks Model Serving
    sentiment = await db_client.analyze_sentiment(news_text)
    affected_stocks = await db_client.get_affected_stocks(news_text)
    agent_reaction = await db_client.compute_agent_reaction(sentiment, affected_stocks)

    # Broadcast to all connected clients
    await manager.broadcast({
        "type": "breaking_news",
        "news": news_text,
        "sentiment": sentiment,
        "agent_reaction": agent_reaction
    })

    return {"status": "broadcasted", "sentiment": sentiment}
```

### 1.3 Deploy Backend

**Local Development:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Production (Docker + Cloud Run/ECS):**
```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Phase 2: Data Pipeline Enhancement

**Duration:** 4-6 hours (Hours 1-6 of hackathon)

### 2.1 Integrate Additional Datasets

#### 2.1.1 Financial News (GDELT or Kaggle)

**Source:** GDELT Project (free) or Kaggle Financial News datasets

**Databricks Notebook: `bronze_news_ingestion.py`**

```python
# Download financial news for 2020-2023
import requests
import pandas as pd
from datetime import datetime, timedelta

# Option 1: GDELT (real-time, free)
def fetch_gdelt_news(start_date, end_date):
    """Fetch financial news from GDELT"""
    base_url = "http://api.gdeltproject.org/api/v2/doc/doc"

    query = "stock market OR wall street OR finance OR trading"
    params = {
        "query": query,
        "mode": "artlist",
        "format": "json",
        "startdatetime": start_date.strftime("%Y%m%d%H%M%S"),
        "enddatetime": end_date.strftime("%Y%m%d%H%M%S"),
        "maxrecords": 250
    }

    response = requests.get(base_url, params=params)
    articles = response.json()

    df = pd.DataFrame(articles['articles'])
    return df[['seendate', 'url', 'title', 'domain', 'language']]

# Fetch news for each historical scenario
covid_news = fetch_gdelt_news(
    datetime(2020, 2, 1),
    datetime(2020, 4, 1)
)

gme_news = fetch_gdelt_news(
    datetime(2021, 1, 1),
    datetime(2021, 2, 15)
)

# Write to Delta Lake
spark.createDataFrame(covid_news).write.format("delta").mode("overwrite").saveAsTable("sweetreturns.bronze.news_articles")
```

#### 2.1.2 Reddit / WallStreetBets Data

**Source:** Pushshift API or pre-downloaded datasets

```python
# bronze_reddit_ingestion.py
import praw
import pandas as pd

reddit = praw.Reddit(
    client_id="YOUR_CLIENT_ID",
    client_secret="YOUR_SECRET",
    user_agent="sweetreturns"
)

def fetch_wsb_submissions(start_date, end_date):
    """Fetch WSB posts for a date range"""
    subreddit = reddit.subreddit("wallstreetbets")

    posts = []
    for submission in subreddit.top(time_filter="all", limit=1000):
        if start_date <= submission.created_utc <= end_date:
            posts.append({
                "timestamp": submission.created_utc,
                "title": submission.title,
                "selftext": submission.selftext,
                "score": submission.score,
                "num_comments": submission.num_comments,
                "author": str(submission.author)
            })

    return pd.DataFrame(posts)

# Fetch for GME squeeze period
wsb_gme = fetch_wsb_submissions(
    datetime(2021, 1, 1).timestamp(),
    datetime(2021, 2, 15).timestamp()
)

spark.createDataFrame(wsb_gme).write.format("delta").mode("overwrite").saveAsTable("sweetreturns.bronze.reddit_wsb")
```

#### 2.1.3 Macroeconomic Data (FRED API)

```python
# bronze_macro_ingestion.py
from fredapi import Fred
import pandas as pd

fred = Fred(api_key='YOUR_FRED_API_KEY')

# Fetch key indicators
indicators = {
    'DFF': 'Federal Funds Rate',
    'UNRATE': 'Unemployment Rate',
    'CPIAUCSL': 'CPI',
    'VIXCLS': 'VIX',
    'DGS10': '10-Year Treasury'
}

macro_data = {}
for code, name in indicators.items():
    series = fred.get_series(code, observation_start='2018-11-29', observation_end='2023-11-29')
    macro_data[name] = series

macro_df = pd.DataFrame(macro_data)
macro_df = macro_df.reset_index().rename(columns={'index': 'Date'})

spark.createDataFrame(macro_df).write.format("delta").mode("overwrite").saveAsTable("sweetreturns.bronze.macro_indicators")
```

### 2.2 Enhanced Silver Layer

**Databricks Notebook: `silver_multimodal_features.py`**

```python
# Read all bronze sources
stocks_df = spark.table("sweetreturns.bronze.raw_stock_data")
news_df = spark.table("sweetreturns.bronze.news_articles")
reddit_df = spark.table("sweetreturns.bronze.reddit_wsb")
macro_df = spark.table("sweetreturns.bronze.macro_indicators")

# Join news sentiment to stock dates
from pyspark.sql import functions as F

# Extract ticker mentions from news titles (simple regex)
news_with_tickers = news_df.withColumn(
    "mentioned_tickers",
    F.expr("regexp_extract_all(title, r'\\b([A-Z]{2,5})\\b', 1)")
)

# Explode to get one row per ticker mention per article
news_exploded = news_with_tickers.selectExpr(
    "cast(seendate as date) as date",
    "explode(mentioned_tickers) as ticker",
    "title",
    "url"
)

# Aggregate news volume per ticker per day
daily_news_volume = news_exploded.groupBy("date", "ticker").agg(
    F.count("*").alias("news_volume"),
    F.collect_list("title").alias("news_titles")
)

# Join to stocks
stocks_with_news = stocks_df.join(
    daily_news_volume,
    on=["date", "ticker"],
    how="left"
).fillna({"news_volume": 0})

# Write to silver
stocks_with_news.write.format("delta").mode("overwrite").saveAsTable("sweetreturns.silver.stocks_with_news")
```

---

## Phase 3: Advanced ML Implementation

**Duration:** 6-8 hours (Hours 6-14 of hackathon)

### 3.1 FinBERT Sentiment Analysis

**Databricks Notebook: `ml_finbert_sentiment.py`**

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
from pyspark.sql.functions import pandas_udf
from pyspark.sql.types import DoubleType
import pandas as pd

# Load FinBERT model (ProsusAI/finbert)
tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert")
model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert")
model.eval()

# Define UDF for batch sentiment scoring
@pandas_udf(DoubleType())
def finbert_sentiment_udf(texts: pd.Series) -> pd.Series:
    """
    Returns sentiment score: -1 (negative) to +1 (positive)
    """
    results = []
    for text in texts:
        if not text or pd.isna(text):
            results.append(0.0)
            continue

        inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits
            probs = torch.nn.functional.softmax(logits, dim=-1)
            # FinBERT outputs: [negative, neutral, positive]
            score = (probs[0][2].item() - probs[0][0].item())  # positive - negative
            results.append(score)

    return pd.Series(results)

# Apply to news data
news_df = spark.table("sweetreturns.silver.stocks_with_news")

news_with_sentiment = news_df.withColumn(
    "sentiment_score",
    finbert_sentiment_udf(F.col("news_titles")[0])  # Score first headline
)

news_with_sentiment.write.format("delta").mode("overwrite").saveAsTable("sweetreturns.silver.news_sentiment")

# Register as MLflow model for Model Serving
import mlflow
import mlflow.transformers

mlflow.set_experiment("/sweetreturns/finbert")
with mlflow.start_run():
    mlflow.transformers.log_model(
        transformers_model={"model": model, "tokenizer": tokenizer},
        artifact_path="finbert_model",
        registered_model_name="finbert_sentiment"
    )
```

**Deploy to Databricks Model Serving:**

```bash
# Via Databricks UI or API
# Navigate to: Machine Learning → Model Serving
# Create endpoint: finbert-sentiment
# Model: finbert_sentiment, Version: 1
# Cluster size: Small (GPU optional for faster inference)
```

### 3.2 Graph Neural Network (Stock Correlation Network)

**Objective:** Model shock propagation through correlated stocks.

**Databricks Notebook: `ml_stock_correlation_gnn.py`**

```python
import networkx as nx
import pandas as pd
import numpy as np
from pyspark.sql import functions as F

# Compute correlation matrix (already in your pipeline)
stocks_df = spark.table("sweetreturns.silver.daily_features").toPandas()

# Pivot to ticker x date matrix
price_matrix = stocks_df.pivot(index='Date', columns='ticker', values='Close')
returns_matrix = price_matrix.pct_change().dropna()

# Pearson correlation
corr_matrix = returns_matrix.corr()

# Build graph
G = nx.Graph()
tickers = list(corr_matrix.columns)

# Add nodes
for ticker in tickers:
    G.add_node(ticker)

# Add edges (threshold correlation > 0.5)
threshold = 0.5
for i, ticker1 in enumerate(tickers):
    for j, ticker2 in enumerate(tickers):
        if i < j:
            corr = corr_matrix.iloc[i, j]
            if abs(corr) > threshold:
                G.add_edge(ticker1, ticker2, weight=corr)

# Shock propagation function
def propagate_shock(graph, source_ticker, shock_magnitude, decay=0.7, max_hops=3):
    """
    Propagate shock from source_ticker through correlation network.
    Returns dict {ticker: shock_impact}
    """
    shock_impact = {source_ticker: shock_magnitude}
    visited = {source_ticker}
    queue = [(source_ticker, shock_magnitude, 0)]

    while queue:
        current, impact, hops = queue.pop(0)
        if hops >= max_hops:
            continue

        for neighbor in graph.neighbors(current):
            if neighbor in visited:
                continue

            edge_weight = graph[current][neighbor]['weight']
            propagated_impact = impact * edge_weight * decay

            if abs(propagated_impact) > 0.01:  # Minimum threshold
                shock_impact[neighbor] = propagated_impact
                visited.add(neighbor)
                queue.append((neighbor, propagated_impact, hops + 1))

    return shock_impact

# Example: TSMC shock (-10%) propagates to AAPL
shock_result = propagate_shock(G, "TSM", -0.10)
print(f"AAPL impacted by: {shock_result.get('AAPL', 0):.2%}")

# Save graph for API
nx.write_gpickle(G, "/dbfs/FileStore/sweetreturns/correlation_graph.gpickle")
```

### 3.3 Hidden Markov Model (Market Regime Detection)

**Objective:** Detect Bull/Bear/High-Vol regimes to modulate agent fear/greed.

**Databricks Notebook: `ml_regime_detection_hmm.py`**

```python
from hmmlearn import hmm
import numpy as np
import pandas as pd

# Load SPY returns
spy_df = spark.table("sweetreturns.bronze.raw_stock_data").filter(F.col("ticker") == "SPY").toPandas()
spy_df = spy_df.sort_values("Date")
spy_df['return'] = spy_df['Close'].pct_change()
spy_df['volatility'] = spy_df['return'].rolling(20).std()

# Features for HMM: [return, volatility]
X = spy_df[['return', 'volatility']].dropna().values

# Train HMM with 3 states (Bull, Bear, High-Vol)
model = hmm.GaussianHMM(n_components=3, covariance_type="full", n_iter=100)
model.fit(X)

# Predict regimes
spy_df['regime'] = np.nan
spy_df.loc[20:, 'regime'] = model.predict(X)

# Label regimes based on mean return
regime_stats = spy_df.groupby('regime')['return'].mean().sort_values(ascending=False)
regime_labels = {regime_stats.index[0]: "Bull", regime_stats.index[1]: "Neutral", regime_stats.index[2]: "Bear"}
spy_df['regime_label'] = spy_df['regime'].map(regime_labels)

# Save regime data
spark.createDataFrame(spy_df).write.format("delta").mode("overwrite").saveAsTable("sweetreturns.gold.market_regimes")
```

### 3.4 BERTopic (News Topic Clustering)

**Databricks Notebook: `ml_news_topics.py`**

```python
from bertopic import BERTopic
from sentence_transformers import SentenceTransformer

# Load news titles
news_df = spark.table("sweetreturns.silver.news_sentiment").toPandas()
titles = news_df['title'].dropna().tolist()

# Train BERTopic
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
topic_model = BERTopic(embedding_model=embedding_model, nr_topics=20)
topics, probs = topic_model.fit_transform(titles)

# Get topic info
topic_info = topic_model.get_topic_info()
print(topic_info.head(10))

# Assign topics back to news
news_df['topic'] = topics
news_df['topic_prob'] = probs.max(axis=1)

# Save
spark.createDataFrame(news_df).write.format("delta").mode("overwrite").saveAsTable("sweetreturns.gold.news_topics")
```

---

## Phase 4: Cloud Computation Layer

**Duration:** 4-6 hours (Hours 14-20 of hackathon)

### 4.1 Agent Archetype System

**Objective:** Create 100 behavioral archetypes that control swarms of agents.

**Databricks Notebook: `gold_agent_archetypes.py`**

```python
import numpy as np
import pandas as pd
from pyspark.sql import functions as F

# Define 100 archetypes (10 base types × 10 variants)
base_types = [
    "institutional_value",
    "institutional_growth",
    "hedge_fund_macro",
    "hedge_fund_quant",
    "retail_longterm",
    "retail_daytrader",
    "retail_wsb_degen",
    "algorithmic_hft",
    "contrarian",
    "momentum_chaser"
]

archetypes = []
for base in base_types:
    for variant in range(10):
        archetype = {
            "archetype_id": len(archetypes),
            "base_type": base,
            "variant": variant,
            "capital": np.random.lognormal(15, 2),  # $1M - $100M
            "risk_tolerance": np.random.beta(2, 5),  # 0-1, skewed conservative
            "greed": np.random.uniform(0.3, 0.9),
            "fear": np.random.uniform(0.1, 0.7),
            "strategy": base,
            "news_sensitivity": np.random.uniform(0.2, 1.0),
            "contrarian_factor": 1.0 if "contrarian" in base else np.random.uniform(0, 0.3)
        }
        archetypes.append(archetype)

archetypes_df = pd.DataFrame(archetypes)
spark.createDataFrame(archetypes_df).write.format("delta").mode("overwrite").saveAsTable("sweetreturns.gold.agent_archetypes")

# Decision function for each archetype
def compute_archetype_decision(archetype_row, market_state, stock_signals):
    """
    Compute decision for one archetype given market state and stock signals.

    Returns: {
        "target_ticker": str,
        "action": "buy" | "sell" | "short" | "call" | "put",
        "confidence": 0-1
    }
    """
    # Get current regime
    regime = market_state['regime']  # "Bull", "Bear", "Neutral"

    # Modulate fear/greed based on regime
    if regime == "Bear":
        fear_multiplier = 1.5
        greed_multiplier = 0.6
    elif regime == "Bull":
        fear_multiplier = 0.7
        greed_multiplier = 1.3
    else:
        fear_multiplier = 1.0
        greed_multiplier = 1.0

    effective_fear = archetype_row['fear'] * fear_multiplier
    effective_greed = archetype_row['greed'] * greed_multiplier

    # Score all stocks
    stock_scores = []
    for stock in stock_signals:
        # Base score from golden_score
        score = stock['golden_score']

        # Adjust by sentiment
        if stock['sentiment_score'] < -0.5:
            if archetype_row['contrarian_factor'] > 0.5:
                score += 1.0  # Contrarians buy the dip
            else:
                score -= effective_fear * 2.0

        # Adjust by news volume (hype indicator)
        if stock['news_volume'] > 10:
            if "wsb" in archetype_row['base_type']:
                score += 2.0  # WSB loves hype
            elif "institutional" in archetype_row['base_type']:
                score -= 0.5  # Institutions avoid hype

        stock_scores.append((stock['ticker'], score))

    # Softmax selection (stochastic)
    tickers, scores = zip(*stock_scores)
    scores = np.array(scores)
    probs = np.exp(scores) / np.sum(np.exp(scores))

    chosen_idx = np.random.choice(len(tickers), p=probs)
    chosen_ticker = tickers[chosen_idx]

    # Decide action based on sentiment and archetype
    chosen_stock = [s for s in stock_signals if s['ticker'] == chosen_ticker][0]

    if chosen_stock['sentiment_score'] > 0.3:
        action = "buy" if effective_greed > 0.6 else "call"
    elif chosen_stock['sentiment_score'] < -0.3:
        if archetype_row['contrarian_factor'] > 0.5:
            action = "buy"
        else:
            action = "short" if effective_fear > 0.6 else "put"
    else:
        action = "buy"

    return {
        "archetype_id": archetype_row['archetype_id'],
        "target_ticker": chosen_ticker,
        "action": action,
        "confidence": probs[chosen_idx],
        "swarm_size": 5000  # Each archetype controls 5K visual agents
    }

# This function will be called by the FastAPI backend every frame
```

### 4.2 Pre-compute Historical Scenarios

**Objective:** Pre-compute agent flows for 3 iconic events (COVID Crash, GME Squeeze, 2023 AI Boom).

**Databricks Notebook: `gold_precompute_scenarios.py`**

```python
# Define scenarios
scenarios = [
    {
        "name": "covid_crash",
        "start_date": "2020-02-19",
        "end_date": "2020-03-23",
        "description": "COVID-19 market crash"
    },
    {
        "name": "gme_squeeze",
        "start_date": "2021-01-04",
        "end_date": "2021-02-05",
        "description": "GameStop short squeeze"
    },
    {
        "name": "ai_boom",
        "start_date": "2023-01-01",
        "end_date": "2023-06-30",
        "description": "AI stock boom (NVDA, MSFT, etc.)"
    }
]

# For each scenario, compute agent flows per day
for scenario in scenarios:
    print(f"Processing {scenario['name']}...")

    # Load data for date range
    stocks = spark.table("sweetreturns.gold.golden_tickets").filter(
        (F.col("Date") >= scenario['start_date']) & (F.col("Date") <= scenario['end_date'])
    ).toPandas()

    # Load news sentiment
    news = spark.table("sweetreturns.gold.news_sentiment").filter(
        (F.col("date") >= scenario['start_date']) & (F.col("date") <= scenario['end_date'])
    ).toPandas()

    # Load market regime
    regime = spark.table("sweetreturns.gold.market_regimes").filter(
        (F.col("Date") >= scenario['start_date']) & (F.col("Date") <= scenario['end_date'])
    ).toPandas()

    # Load archetypes
    archetypes = spark.table("sweetreturns.gold.agent_archetypes").toPandas()

    # Simulate each day
    agent_flows = []
    for date in stocks['Date'].unique():
        day_stocks = stocks[stocks['Date'] == date]
        day_news = news[news['date'] == date] if len(news) > 0 else pd.DataFrame()
        day_regime = regime[regime['Date'] == date]['regime_label'].iloc[0] if len(regime) > 0 else "Neutral"

        # Join news sentiment to stocks
        stock_signals = []
        for _, stock in day_stocks.iterrows():
            stock_news = day_news[day_news['ticker'] == stock['ticker']]
            sentiment = stock_news['sentiment_score'].mean() if len(stock_news) > 0 else 0.0
            news_vol = len(stock_news)

            stock_signals.append({
                "ticker": stock['ticker'],
                "golden_score": stock['golden_score'],
                "sentiment_score": sentiment,
                "news_volume": news_vol
            })

        market_state = {"regime": day_regime}

        # Compute decision for each archetype
        for _, archetype in archetypes.iterrows():
            decision = compute_archetype_decision(archetype.to_dict(), market_state, stock_signals)
            decision['date'] = date
            decision['scenario'] = scenario['name']
            agent_flows.append(decision)

    # Save to Delta
    flows_df = pd.DataFrame(agent_flows)
    spark.createDataFrame(flows_df).write.format("delta").mode("append").saveAsTable("sweetreturns.gold.precomputed_agent_flows")

print("✅ Pre-computation complete!")
```

---

## Phase 5: Frontend Integration

**Duration:** 3-4 hours (Hours 20-24)

### 5.1 WebSocket Client

**File: `src/services/websocketClient.ts`**

```typescript
export class AgentStreamClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private messageHandlers: Array<(data: any) => void> = [];

  constructor(private url: string = 'ws://localhost:8000/ws/agent-stream') {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('✅ Connected to agent stream');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.messageHandlers.forEach(handler => handler(data));
      };

      this.ws.onclose = () => {
        console.log('Connection closed');
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
          }, 2000);
        }
      };
    });
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  onMessage(handler: (data: any) => void) {
    this.messageHandlers.push(handler);
  }

  disconnect() {
    this.ws?.close();
  }
}
```

### 5.2 Update Crowd Simulation Hook

**File: `src/hooks/useCrowdSimulation.ts`** (modify existing)

```typescript
import { useEffect, useRef } from 'react';
import { AgentStreamClient } from '../services/websocketClient';

export function useCrowdSimulation() {
  const wsClient = useRef<AgentStreamClient | null>(null);
  const agentFlowQueue = useRef<any[]>([]);

  useEffect(() => {
    // Connect to backend
    wsClient.current = new AgentStreamClient('ws://localhost:8000/ws/agent-stream');
    wsClient.current.connect().then(() => {
      console.log('Agent stream connected');
    });

    // Handle incoming flow instructions
    wsClient.current.onMessage((data) => {
      if (data.type === 'agent_flows') {
        agentFlowQueue.current.push(...data.data);
      } else if (data.type === 'breaking_news') {
        // Trigger visual chaos for live news injection
        handleBreakingNews(data);
      }
    });

    return () => {
      wsClient.current?.disconnect();
    };
  }, []);

  const update = useCallback((dt: number) => {
    // Process flow instructions from queue
    while (agentFlowQueue.current.length > 0) {
      const flow = agentFlowQueue.current.shift();
      applyAgentFlow(flow);
    }

    // ... existing simulation logic ...
  }, []);

  const applyAgentFlow = (flow: any) => {
    // flow = { archetype_id, target_ticker, action, confidence, swarm_size }

    // Find agents of this archetype
    // Redirect their targets to the new ticker
    // Update their urgency based on confidence

    const targetStore = stocks.find(s => s.ticker === flow.target_ticker);
    if (!targetStore) return;

    // Update ~swarm_size agents to rush to targetStore
    // This is where "macro state" from cloud drives "micro state" locally
  };

  return { positions, colors, update };
}
```

---

## Phase 6: Live Hero Feature

**Duration:** Final 2-3 hours

### 6.1 "Inject Fake News" Feature

**Frontend: `src/components/NewsInjector.tsx`**

```typescript
import { useState } from 'react';

export function NewsInjector() {
  const [newsText, setNewsText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInject = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/inject-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news_text: newsText })
      });
      const result = await response.json();
      console.log('News injected:', result);
    } catch (error) {
      console.error('Failed to inject news:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed top-4 right-4 bg-white p-4 rounded-lg shadow-lg z-50">
      <h3 className="font-bold mb-2">💥 Inject Breaking News</h3>
      <textarea
        className="w-full border p-2 rounded"
        rows={3}
        placeholder="e.g., Tesla factory explodes in California"
        value={newsText}
        onChange={(e) => setNewsText(e.target.value)}
      />
      <button
        className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        onClick={handleInject}
        disabled={isLoading || !newsText}
      >
        {isLoading ? 'Injecting...' : 'Inject News'}
      </button>
    </div>
  );
}
```

### 6.2 Backend Live News Handler

**Already implemented in Phase 1's `main.py`**, but here's the Databricks Model Serving integration:

```python
# backend/app/databricks_client.py
import requests
import os

class DatabricksClient:
    def __init__(self):
        self.workspace_url = os.getenv("DATABRICKS_WORKSPACE_URL")
        self.token = os.getenv("DATABRICKS_TOKEN")
        self.finbert_endpoint = f"{self.workspace_url}/serving-endpoints/finbert-sentiment/invocations"

    async def analyze_sentiment(self, text: str) -> dict:
        """Call FinBERT model serving endpoint"""
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

        payload = {
            "inputs": [text]
        }

        response = requests.post(self.finbert_endpoint, json=payload, headers=headers)
        result = response.json()

        return {
            "score": result['predictions'][0]['score'],
            "label": result['predictions'][0]['label']
        }

    async def get_affected_stocks(self, text: str) -> list:
        """Extract ticker mentions from text"""
        import re
        tickers = re.findall(r'\b([A-Z]{2,5})\b', text)
        return tickers

    async def compute_agent_reaction(self, sentiment: dict, affected_tickers: list) -> dict:
        """Compute how agents react to this news"""
        # Query archetypes and compute reactions
        # This would call compute_archetype_decision from Phase 4

        reactions = []
        for ticker in affected_tickers:
            if sentiment['label'] == 'negative':
                reactions.append({
                    "ticker": ticker,
                    "action": "panic_sell",
                    "agent_count": 10000,
                    "urgency": 0.95
                })
            else:
                reactions.append({
                    "ticker": ticker,
                    "action": "rush_buy",
                    "agent_count": 8000,
                    "urgency": 0.85
                })

        return {"reactions": reactions}
```

---

## 24-Hour Hackathon Strategy

### Hour-by-Hour Breakdown

| Hours | Phase | Tasks | Team Assignment |
|-------|-------|-------|-----------------|
| **0-2** | Setup | • Databricks cluster running<br>• FastAPI backend deployed locally<br>• Data uploaded to Delta Lake | Backend Dev |
| **2-6** | Data Pipeline | • Ingest news, Reddit, macro data<br>• Enhanced silver layer<br>• Run bronze → silver jobs | Data Engineer |
| **6-10** | ML Models | • Train FinBERT (or use pre-trained)<br>• Build correlation GNN<br>• Train HMM regime detector | ML Engineer |
| **10-14** | Pre-compute | • Run gold_precompute_scenarios.py<br>• Save 3 scenarios to Delta<br>• Export initial JSON | Data Engineer |
| **14-18** | Backend | • Implement FastAPI WebSocket<br>• Connect to Databricks<br>• Test playback API | Backend Dev |
| **18-20** | Frontend | • Integrate WebSocket client<br>• Update crowd simulation<br>• Test scenario playback | Frontend Dev |
| **20-22** | Live Feature | • Build News Injector UI<br>• Connect to FinBERT endpoint<br>• Test end-to-end | Full Team |
| **22-24** | Polish | • Bug fixes<br>• Demo rehearsal<br>• Deploy to Vercel | Full Team |

### What MUST Work for Demo

1. **Scenario Playback (Pre-computed):**
   - User selects "COVID Crash" from dropdown
   - Time slider scrubs through Feb-Mar 2020
   - Agents visibly panic-sell, rush between stores
   - Smooth, lag-free rendering

2. **Live News Injection:**
   - Judge types: "Apple announces bankruptcy"
   - System instantly shows:
     - FinBERT sentiment: -0.95 (Very Negative)
     - 10K agents flee AAPL store
     - GNN propagates shock to TSMC, MSFT
     - Visible panic in 3D city

3. **Visual Proof of DS:**
   - Show Databricks notebooks during presentation
   - Display correlation graph (GNN)
   - Show HMM regime detection chart
   - Show FinBERT API call logs

---

## Cloud Provider Setup Guide

### Option 1: Databricks on AWS (Recommended)

#### Prerequisites:
- AWS account with $300 student credits (AWS Educate)
- Databricks account (free trial or student program)

#### Setup Steps:

1. **Create AWS S3 Bucket:**
   ```bash
   aws s3 mb s3://sweetreturns-data-bucket
   aws s3 cp ../datasets/stock_details_5_years.csv s3://sweetreturns-data-bucket/bronze/
   ```

2. **Create Databricks Workspace:**
   - Go to https://accounts.cloud.databricks.com
   - Create workspace on AWS
   - Region: us-east-1 (cheapest)
   - Choose "Standard" tier

3. **Configure IAM Role:**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:GetObject",
           "s3:PutObject",
           "s3:ListBucket"
         ],
         "Resource": [
           "arn:aws:s3:::sweetreturns-data-bucket/*",
           "arn:aws:s3:::sweetreturns-data-bucket"
         ]
       }
     ]
   }
   ```

4. **Create Delta Lake External Location:**
   ```sql
   CREATE EXTERNAL LOCATION sweetreturns_bronze
   URL 's3://sweetreturns-data-bucket/bronze/'
   WITH (CREDENTIAL `aws-s3-credential`);
   ```

5. **Deploy FastAPI to AWS ECS:**
   ```bash
   # Build Docker image
   cd backend
   docker build -t sweetreturns-api .

   # Push to ECR
   aws ecr create-repository --repository-name sweetreturns-api
   docker tag sweetreturns-api:latest YOUR_ECR_URL/sweetreturns-api:latest
   docker push YOUR_ECR_URL/sweetreturns-api:latest

   # Deploy to ECS (or use AWS Copilot)
   copilot init --app sweetreturns --name api --type "Load Balanced Web Service"
   copilot deploy
   ```

### Option 2: Databricks on Azure

1. **Create Azure Storage Account:**
   ```bash
   az storage account create --name sweetreturnsdata --resource-group hackathon --location eastus
   az storage container create --name bronze --account-name sweetreturnsdata
   ```

2. **Upload Data:**
   ```bash
   az storage blob upload --account-name sweetreturnsdata --container-name bronze --file stock_details_5_years.csv
   ```

3. **Create Databricks Workspace:**
   - Azure Portal → Create Databricks Workspace
   - Pricing Tier: Standard
   - Deploy

4. **Mount Storage:**
   ```python
   # In Databricks notebook
   configs = {
     "fs.azure.account.key.sweetreturnsdata.blob.core.windows.net": dbutils.secrets.get(scope="storage", key="account-key")
   }

   dbutils.fs.mount(
     source="wasbs://bronze@sweetreturnsdata.blob.core.windows.net",
     mount_point="/mnt/bronze",
     extra_configs=configs
   )
   ```

### Cost Estimates (24-hour hackathon)

| Service | Cost |
|---------|------|
| Databricks Cluster (14 hrs runtime) | ~$50 |
| AWS S3 Storage (100 GB) | $2.30 |
| ECS Fargate (API backend) | ~$10 |
| Model Serving (GPU endpoint, 4 hrs) | ~$20 |
| **Total** | **~$82** |

**Optimization:** Use Community Edition Databricks (free) for prototyping, only spin up paid cluster for final 8 hours.

---

## Team Roles & Responsibilities

### Recommended 4-Person Team Split

#### Person 1: Data Engineer
- Set up Databricks workspace
- Build medallion pipeline (bronze → silver → gold)
- Ingest all datasets (news, Reddit, macro)
- Run pre-computation scripts
- Export JSON for frontend

#### Person 2: ML Engineer
- Train/deploy FinBERT
- Build GNN correlation network
- Implement HMM regime detection
- Create agent archetype system
- Handle Model Serving deployment

#### Person 3: Backend Developer
- Build FastAPI WebSocket server
- Integrate with Databricks SQL Connector
- Implement news injection endpoint
- Deploy to cloud (ECS/Cloud Run)
- Handle CORS, auth, error handling

#### Person 4: Frontend Developer
- Integrate WebSocket client
- Update crowd simulation to consume flows
- Build News Injector UI
- Polish 3D visualization
- Deploy to Vercel

---

## Success Criteria

### Must-Have (Demo Killers if Missing)

- [ ] 3 pre-computed scenarios playable via time slider
- [ ] Live news injection feature working
- [ ] Visible agent flow changes in real-time
- [ ] Databricks notebooks visible in presentation
- [ ] Deployed and accessible (not just localhost)

### Nice-to-Have (Bonus Points)

- [ ] GNN shock propagation visualization
- [ ] HMM regime indicator in UI
- [ ] BERTopic news clustering
- [ ] Whale leaderboard with AI-driven allocations
- [ ] Mobile-responsive

---

## Troubleshooting

### Common Issues

**Issue:** Databricks cluster won't start
- **Fix:** Check AWS/Azure service limits, reduce cluster size to 1 worker

**Issue:** FinBERT inference too slow
- **Fix:** Use CPU version, batch requests, or cache results

**Issue:** WebSocket connection fails
- **Fix:** Check CORS settings, ensure FastAPI is publicly accessible

**Issue:** Frontend drops frames with 500K agents
- **Fix:** Reduce to 50K agents, use LOD (level-of-detail), throttle WebSocket updates to 10 FPS

---

## Next Steps

1. **Pre-Hackathon (1 week before):**
   - Set up all cloud accounts
   - Upload datasets to cloud storage
   - Test Databricks cluster creation
   - Run sample ML notebook

2. **Day Before Hackathon:**
   - Clone this repo to all team machines
   - Test local backend startup
   - Verify API keys (FRED, Reddit, Databricks)
   - Sleep well!

3. **During Hackathon:**
   - Follow hour-by-hour schedule
   - Commit to git every 2 hours
   - Test demo every 4 hours
   - Keep judges informed of progress

---

## Conclusion

This architecture transforms your project from a client-side graphics demo into a legitimate Data Science powerhouse by:

1. **Moving complexity to the cloud** (Databricks handles heavy ML)
2. **Using real DS techniques** (FinBERT, GNN, HMM, BERTopic)
3. **Demonstrating scalability** (100 archetypes controlling 500K agents)
4. **Showing live ML** (news injection → FinBERT → real-time agent reaction)
5. **Leveraging Delta Lake** (time travel, point-in-time correctness)

The judges will see:
- Complex data pipelines
- Advanced ML models
- Real-time streaming architecture
- Beautiful visualization
- Technical depth AND visual impact

**You will win.**
