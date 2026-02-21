# Advanced Data Science Techniques Guide — Wolf of Wall Sweet

Complete implementation guide for all advanced ML and data science techniques recommended for your hackathon project.

---

## Table of Contents

1. [Overview](#overview)
2. [Agent-Based Modeling (ABM)](#agent-based-modeling)
3. [FinBERT Sentiment Analysis](#finbert-sentiment-analysis)
4. [Graph Neural Networks](#graph-neural-networks)
5. [Hidden Markov Models](#hidden-markov-models)
6. [BERTopic for News Clustering](#bertopic)
7. [Multi-Agent Reinforcement Learning](#multi-agent-rl)
8. [Point-in-Time Architecture](#point-in-time)
9. [Stochastic Decision Making](#stochastic-decisions)
10. [Integration Strategy](#integration-strategy)

---

## Overview

### The Core Problem

Your current simulation has agents with simple rules. To make it a **Data Science project**, you need:

1. **Complex Decision Making:** Agents use ML models, not `if/else` statements
2. **Behavioral Economics:** Fear, greed, risk tolerance, herding behavior
3. **Real Data:** News sentiment, social media, macroeconomic indicators
4. **Network Effects:** Stock correlations, shock propagation
5. **Probabilistic:** Agents make stochastic (random but weighted) decisions

### The Solution: Multi-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MARKET STATE LAYER                        │
│  • HMM Regime Detection (Bull/Bear/Volatile)                │
│  • VIX levels                                                │
│  • Macroeconomic indicators (Fed rate, unemployment)        │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   STOCK SIGNAL LAYER                         │
│  • FinBERT Sentiment Analysis (news articles)               │
│  • BERTopic Clustering (trending topics)                    │
│  • GNN Shock Propagation (correlation network)              │
│  • Golden Ticket Scoring (technical indicators)             │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                 AGENT ARCHETYPE LAYER                        │
│  • 100 behavioral profiles (risk, greed, fear, strategy)   │
│  • Softmax decision function (stochastic selection)         │
│  • Action selection (BUY/SELL/CALL/PUT/SHORT)               │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  VISUALIZATION LAYER                         │
│  • 500K agents render locally (WebGPU)                      │
│  • Receive flow instructions from archetypes                │
│  • Local physics, collision, pathfinding                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Agent-Based Modeling (ABM)

### What is ABM?

Agent-Based Modeling simulates complex systems by defining autonomous agents that:
- Have **internal states** (capital, risk tolerance, emotions)
- Follow **behavioral rules** (decision logic)
- **Interact** with each other and the environment
- Produce **emergent behavior** (market crashes, bubbles, herding)

### Why It Matters for Your Project

Instead of 500K individual agents making independent decisions (computationally impossible), you create **100 archetypes** that represent different investor types. Each archetype controls a swarm of 5,000 visual agents.

### Implementation

#### Step 1: Define Archetype Schema

```python
# Databricks notebook: gold_agent_archetypes.py
import numpy as np
import pandas as pd

# Base investor types (behavioral economics)
base_types = {
    "institutional_value": {
        "risk_tolerance": 0.3,
        "greed": 0.5,
        "fear": 0.4,
        "news_sensitivity": 0.6,
        "contrarian_factor": 0.2,
        "holding_period": 180,  # days
        "strategy": "value_investing"
    },
    "institutional_growth": {
        "risk_tolerance": 0.5,
        "greed": 0.7,
        "fear": 0.3,
        "news_sensitivity": 0.7,
        "contrarian_factor": 0.1,
        "holding_period": 90,
        "strategy": "growth_investing"
    },
    "hedge_fund_macro": {
        "risk_tolerance": 0.7,
        "greed": 0.8,
        "fear": 0.2,
        "news_sensitivity": 0.9,
        "contrarian_factor": 0.6,
        "holding_period": 30,
        "strategy": "macro_trading"
    },
    "retail_longterm": {
        "risk_tolerance": 0.4,
        "greed": 0.6,
        "fear": 0.5,
        "news_sensitivity": 0.5,
        "contrarian_factor": 0.1,
        "holding_period": 365,
        "strategy": "buy_and_hold"
    },
    "retail_daytrader": {
        "risk_tolerance": 0.8,
        "greed": 0.9,
        "fear": 0.7,
        "news_sensitivity": 0.8,
        "contrarian_factor": 0.2,
        "holding_period": 1,
        "strategy": "momentum"
    },
    "retail_wsb_degen": {
        "risk_tolerance": 1.0,
        "greed": 1.0,
        "fear": 0.1,
        "news_sensitivity": 1.0,
        "contrarian_factor": 0.0,
        "holding_period": 7,
        "strategy": "yolo_options"
    },
    "algorithmic_hft": {
        "risk_tolerance": 0.5,
        "greed": 0.5,
        "fear": 0.1,
        "news_sensitivity": 0.3,
        "contrarian_factor": 0.0,
        "holding_period": 0.01,  # seconds
        "strategy": "mean_reversion"
    },
    "contrarian": {
        "risk_tolerance": 0.6,
        "greed": 0.6,
        "fear": 0.3,
        "news_sensitivity": 0.8,
        "contrarian_factor": 0.9,
        "holding_period": 60,
        "strategy": "contrarian"
    },
    "momentum_chaser": {
        "risk_tolerance": 0.7,
        "greed": 0.9,
        "fear": 0.6,
        "news_sensitivity": 0.7,
        "contrarian_factor": 0.0,
        "holding_period": 14,
        "strategy": "momentum"
    },
    "passive_index": {
        "risk_tolerance": 0.3,
        "greed": 0.3,
        "fear": 0.2,
        "news_sensitivity": 0.1,
        "contrarian_factor": 0.0,
        "holding_period": 10000,  # never sell
        "strategy": "index"
    }
}

# Generate 100 archetypes (10 base types × 10 variants)
archetypes = []
for base_name, base_attrs in base_types.items():
    for variant in range(10):
        # Add random noise to base attributes
        archetype = {
            "archetype_id": len(archetypes),
            "base_type": base_name,
            "variant": variant,
            "capital": np.random.lognormal(15, 2),  # $1M - $100M
            "risk_tolerance": np.clip(base_attrs["risk_tolerance"] + np.random.normal(0, 0.1), 0, 1),
            "greed": np.clip(base_attrs["greed"] + np.random.normal(0, 0.1), 0, 1),
            "fear": np.clip(base_attrs["fear"] + np.random.normal(0, 0.1), 0, 1),
            "news_sensitivity": np.clip(base_attrs["news_sensitivity"] + np.random.normal(0, 0.1), 0, 1),
            "contrarian_factor": np.clip(base_attrs["contrarian_factor"] + np.random.normal(0, 0.1), 0, 1),
            "holding_period": base_attrs["holding_period"],
            "strategy": base_attrs["strategy"]
        }
        archetypes.append(archetype)

archetypes_df = pd.DataFrame(archetypes)

# Save to Delta Lake
spark.createDataFrame(archetypes_df).write.format("delta").mode("overwrite").saveAsTable("sweetreturns.gold.agent_archetypes")
```

#### Step 2: Decision Function

```python
def compute_archetype_decision(archetype, market_state, stock_signals):
    """
    Core ABM logic: Given agent profile + market context, decide action.

    Args:
        archetype: dict with {risk_tolerance, greed, fear, ...}
        market_state: dict with {regime: "Bull/Bear/Neutral", vix: float, ...}
        stock_signals: list of dicts with {ticker, golden_score, sentiment, news_volume, ...}

    Returns:
        {
            "target_ticker": str,
            "action": "buy" | "sell" | "call" | "put" | "short",
            "confidence": float (0-1),
            "urgency": float (0-1)
        }
    """

    # === 1. Regime-Based Emotion Modulation ===
    regime = market_state.get("regime", "Neutral")
    vix = market_state.get("vix", 20)

    if regime == "Bear" or vix > 30:
        fear_multiplier = 1.5
        greed_multiplier = 0.6
    elif regime == "Bull" and vix < 15:
        fear_multiplier = 0.7
        greed_multiplier = 1.3
    else:
        fear_multiplier = 1.0
        greed_multiplier = 1.0

    effective_fear = archetype['fear'] * fear_multiplier
    effective_greed = archetype['greed'] * greed_multiplier

    # === 2. Score Each Stock ===
    stock_scores = []
    for stock in stock_signals:
        score = 0.0

        # Base score from golden ticket
        score += stock['golden_score'] * 2.0

        # Sentiment adjustment
        sentiment = stock.get('sentiment_score', 0.0)
        if sentiment < -0.5:
            if archetype['contrarian_factor'] > 0.5:
                score += 1.5  # Contrarians buy fear
            else:
                score -= effective_fear * 2.0  # Others flee
        elif sentiment > 0.5:
            score += effective_greed * 1.5

        # News volume (hype indicator)
        news_vol = stock.get('news_volume', 0)
        if news_vol > 10:
            if "wsb" in archetype['base_type']:
                score += 3.0  # WSB loves hype
            elif "institutional" in archetype['base_type']:
                score -= 1.0  # Institutions avoid hype

        # GNN shock propagation score
        shock_impact = stock.get('shock_impact', 0.0)
        score += shock_impact * archetype['news_sensitivity'] * 2.0

        # Volatility preference
        volatility = stock.get('volatility_percentile', 0.5)
        if "hft" in archetype['base_type']:
            score += volatility * 2.0  # HFT loves volatility
        elif archetype['risk_tolerance'] < 0.4:
            score -= volatility * 1.5  # Conservative avoids volatility

        stock_scores.append((stock['ticker'], score))

    # === 3. Softmax Selection (Stochastic) ===
    tickers, scores = zip(*stock_scores)
    scores = np.array(scores)

    # Add noise to prevent deterministic behavior
    scores += np.random.normal(0, 0.5, size=len(scores))

    # Softmax with temperature (higher temp = more random)
    temperature = 1.0 - archetype['risk_tolerance']  # Risk-averse = more random
    probs = np.exp(scores / temperature) / np.sum(np.exp(scores / temperature))

    # Sample from distribution
    chosen_idx = np.random.choice(len(tickers), p=probs)
    chosen_ticker = tickers[chosen_idx]
    confidence = probs[chosen_idx]

    # === 4. Action Selection ===
    chosen_stock = [s for s in stock_signals if s['ticker'] == chosen_ticker][0]
    sentiment = chosen_stock.get('sentiment_score', 0.0)

    if sentiment > 0.3:
        if effective_greed > 0.7:
            action = "buy"
        elif archetype['strategy'] == "yolo_options":
            action = "call"
        else:
            action = "buy"
    elif sentiment < -0.3:
        if archetype['contrarian_factor'] > 0.6:
            action = "buy"  # Buy the dip
        elif effective_fear > 0.7:
            action = "short"
        else:
            action = "put"
    else:
        # Neutral sentiment, follow strategy
        if archetype['strategy'] == "momentum":
            action = "buy" if chosen_stock.get('price_momentum', 0) > 0 else "short"
        else:
            action = "buy"

    # === 5. Urgency (How fast agents move) ===
    urgency = confidence * (1.0 + effective_greed) * 0.5
    urgency = np.clip(urgency, 0.1, 1.0)

    return {
        "archetype_id": archetype['archetype_id'],
        "target_ticker": chosen_ticker,
        "action": action,
        "confidence": float(confidence),
        "urgency": float(urgency),
        "swarm_size": 5000
    }
```

#### Step 3: Batch Process All Archetypes

```python
# For a given date/timestamp, compute decisions for all 100 archetypes
def batch_compute_decisions(date, stocks_df, news_df, regime_df, archetypes_df):
    """
    Compute decisions for all archetypes on a specific date.
    """
    # Get market state
    regime_row = regime_df[regime_df['Date'] == date].iloc[0]
    market_state = {
        "regime": regime_row['regime_label'],
        "vix": regime_row.get('vix', 20)
    }

    # Prepare stock signals
    day_stocks = stocks_df[stocks_df['Date'] == date]
    day_news = news_df[news_df['date'] == date]

    stock_signals = []
    for _, stock in day_stocks.iterrows():
        stock_news = day_news[day_news['ticker'] == stock['ticker']]
        sentiment = stock_news['sentiment_score'].mean() if len(stock_news) > 0 else 0.0
        news_vol = len(stock_news)

        stock_signals.append({
            "ticker": stock['ticker'],
            "golden_score": stock['golden_score'],
            "sentiment_score": sentiment,
            "news_volume": news_vol,
            "volatility_percentile": stock.get('vol_percentile', 0.5),
            "price_momentum": stock.get('return_20d', 0.0)
        })

    # Compute decision for each archetype
    decisions = []
    for _, archetype in archetypes_df.iterrows():
        decision = compute_archetype_decision(archetype.to_dict(), market_state, stock_signals)
        decision['date'] = date
        decisions.append(decision)

    return decisions
```

---

## FinBERT Sentiment Analysis

### What is FinBERT?

FinBERT is a BERT model fine-tuned on financial news and earnings call transcripts. It classifies text sentiment as:
- **Positive** (bullish)
- **Negative** (bearish)
- **Neutral**

It's **much better** than general sentiment models (like VADER) because it understands financial jargon.

### Implementation

#### Option 1: Use Pre-trained Model (Fast)

```python
# Databricks notebook: ml_finbert_sentiment.py
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
from pyspark.sql.functions import pandas_udf
from pyspark.sql.types import StructType, StructField, DoubleType, StringType
import pandas as pd

# Load FinBERT
tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert")
model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert")
model.eval()

# GPU support
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

@pandas_udf(StructType([
    StructField("score", DoubleType()),
    StructField("label", StringType())
]))
def finbert_sentiment(texts: pd.Series) -> pd.DataFrame:
    """
    Batch sentiment analysis.
    Returns score: -1 (negative) to +1 (positive)
    """
    results = []

    for text in texts:
        if not text or pd.isna(text):
            results.append({"score": 0.0, "label": "neutral"})
            continue

        # Tokenize
        inputs = tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        ).to(device)

        # Inference
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits
            probs = torch.nn.functional.softmax(logits, dim=-1)

            # FinBERT classes: [negative, neutral, positive]
            neg, neu, pos = probs[0].cpu().numpy()

            # Compute score: -1 to +1
            score = pos - neg

            # Determine label
            if pos > neg and pos > neu:
                label = "positive"
            elif neg > pos and neg > neu:
                label = "negative"
            else:
                label = "neutral"

            results.append({"score": float(score), "label": label})

    return pd.DataFrame(results)

# Apply to news data
news_df = spark.table("sweetreturns.silver.news_articles")

news_with_sentiment = news_df.withColumn(
    "sentiment",
    finbert_sentiment(F.col("title"))
)

news_final = news_with_sentiment.select(
    "*",
    F.col("sentiment.score").alias("sentiment_score"),
    F.col("sentiment.label").alias("sentiment_label")
).drop("sentiment")

# Save
news_final.write.format("delta").mode("overwrite").saveAsTable("sweetreturns.gold.news_sentiment")
```

#### Option 2: Deploy to Model Serving

```python
# Register with MLflow
import mlflow
import mlflow.transformers

mlflow.set_experiment("/sweetreturns/finbert")

with mlflow.start_run():
    mlflow.transformers.log_model(
        transformers_model={
            "model": model,
            "tokenizer": tokenizer
        },
        artifact_path="finbert_model",
        registered_model_name="finbert_sentiment"
    )

# Deploy to Model Serving (via UI or API)
# Then call via REST:
import requests

def analyze_sentiment_api(text):
    response = requests.post(
        "https://YOUR_WORKSPACE.cloud.databricks.com/serving-endpoints/finbert-sentiment/invocations",
        headers={"Authorization": f"Bearer {DATABRICKS_TOKEN}"},
        json={"inputs": [text]}
    )
    result = response.json()
    return result['predictions'][0]
```

---

## Graph Neural Networks

### What is GNN for Stock Networks?

Stocks don't move independently—they're connected through:
- **Industry correlation** (Apple ↔ Microsoft)
- **Supply chain** (TSMC ↔ Nvidia ↔ Apple)
- **Macro factors** (all tech stocks ↔ interest rates)

A GNN models these connections as a **graph** where:
- **Nodes** = stocks
- **Edges** = correlation (weighted by Pearson correlation)
- **Message passing** = shock propagates through edges

### Implementation

#### Step 1: Build Correlation Graph

```python
# Databricks notebook: ml_correlation_graph.py
import networkx as nx
import pandas as pd
import numpy as np

# Load daily returns
stocks_df = spark.table("sweetreturns.silver.daily_features").toPandas()

# Pivot to ticker x date matrix
price_matrix = stocks_df.pivot(index='Date', columns='ticker', values='Close')
returns_matrix = price_matrix.pct_change().dropna()

# Compute correlation matrix
corr_matrix = returns_matrix.corr()

# Build graph
G = nx.Graph()
tickers = list(corr_matrix.columns)

for ticker in tickers:
    G.add_node(ticker)

# Add edges (threshold: |correlation| > 0.5)
threshold = 0.5
for i, ticker1 in enumerate(tickers):
    for j, ticker2 in enumerate(tickers):
        if i < j:
            corr = corr_matrix.iloc[i, j]
            if abs(corr) > threshold:
                G.add_edge(ticker1, ticker2, weight=corr)

print(f"Graph: {len(G.nodes)} nodes, {len(G.edges)} edges")

# Save graph
nx.write_gpickle(G, "/dbfs/FileStore/sweetreturns/correlation_graph.gpickle")
```

#### Step 2: Shock Propagation Algorithm

```python
def propagate_shock(graph, source_ticker, shock_magnitude, decay=0.7, max_hops=3):
    """
    Simulate shock propagation through correlation network.

    Example: "TSMC reports chip shortage (-10%)"
    → AAPL: -7% (0.7 correlation)
    → NVDA: -6%
    → QCOM: -4%

    Args:
        graph: NetworkX graph
        source_ticker: str (e.g., "TSM")
        shock_magnitude: float (e.g., -0.10 for -10%)
        decay: float (0-1, how much shock decays per hop)
        max_hops: int (max propagation distance)

    Returns:
        dict {ticker: shock_impact}
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

            if abs(propagated_impact) > 0.005:  # Threshold: 0.5%
                shock_impact[neighbor] = shock_impact.get(neighbor, 0.0) + propagated_impact
                visited.add(neighbor)
                queue.append((neighbor, propagated_impact, hops + 1))

    return shock_impact

# Example: TSMC shock
shock_result = propagate_shock(G, "TSM", -0.10)
print("Top 10 impacted:")
sorted_impact = sorted(shock_result.items(), key=lambda x: x[1])
for ticker, impact in sorted_impact[:10]:
    print(f"{ticker}: {impact:.2%}")
```

#### Step 3: Integrate with Agent Decisions

```python
# When computing stock signals, add GNN shock score
def add_shock_scores(stock_signals, graph, trigger_events):
    """
    trigger_events: list of {ticker, magnitude} (e.g., from news)
    """
    # Compute combined shock impact
    total_shock = {}
    for event in trigger_events:
        shocks = propagate_shock(graph, event['ticker'], event['magnitude'])
        for ticker, impact in shocks.items():
            total_shock[ticker] = total_shock.get(ticker, 0.0) + impact

    # Add to stock signals
    for signal in stock_signals:
        signal['shock_impact'] = total_shock.get(signal['ticker'], 0.0)

    return stock_signals
```

---

## Hidden Markov Models

### What is HMM for Market Regimes?

Markets have hidden "states":
- **Bull Market:** Rising prices, low volatility
- **Bear Market:** Falling prices, high volatility
- **High Volatility:** Choppy, unpredictable

An HMM learns these states from data and predicts which state we're currently in.

### Implementation

```python
# Databricks notebook: ml_regime_detection.py
from hmmlearn import hmm
import numpy as np
import pandas as pd

# Load SPY data (market proxy)
spy_df = spark.table("sweetreturns.bronze.raw_stock_data").filter(F.col("ticker") == "SPY").toPandas()
spy_df = spy_df.sort_values("Date")

# Features
spy_df['return'] = spy_df['Close'].pct_change()
spy_df['volatility'] = spy_df['return'].rolling(20).std() * np.sqrt(252)  # Annualized

# Drop NaNs
spy_df = spy_df.dropna()

# Feature matrix [return, volatility]
X = spy_df[['return', 'volatility']].values

# Train HMM with 3 states
model = hmm.GaussianHMM(n_components=3, covariance_type="full", n_iter=100, random_state=42)
model.fit(X)

# Predict states
spy_df['regime'] = model.predict(X)

# Label states by mean return
regime_stats = spy_df.groupby('regime')['return'].mean().sort_values(ascending=False)
regime_labels = {
    regime_stats.index[0]: "Bull",
    regime_stats.index[1]: "Neutral",
    regime_stats.index[2]: "Bear"
}
spy_df['regime_label'] = spy_df['regime'].map(regime_labels)

# Visualize
import matplotlib.pyplot as plt

plt.figure(figsize=(14, 6))
plt.subplot(2, 1, 1)
plt.plot(spy_df['Date'], spy_df['Close'])
plt.title("SPY Price")

plt.subplot(2, 1, 2)
colors = {"Bull": "green", "Neutral": "yellow", "Bear": "red"}
for regime, label in regime_labels.items():
    mask = spy_df['regime'] == regime
    plt.scatter(spy_df[mask]['Date'], spy_df[mask]['Close'], c=colors[label], label=label, s=1)
plt.legend()
plt.title("Market Regimes")
plt.show()

# Save
spark.createDataFrame(spy_df).write.format("delta").mode("overwrite").saveAsTable("sweetreturns.gold.market_regimes")
```

### Use Regimes to Modulate Agent Behavior

```python
# In agent decision function:
regime = market_state['regime']

if regime == "Bear":
    effective_fear *= 1.5
    effective_greed *= 0.6
elif regime == "Bull":
    effective_fear *= 0.7
    effective_greed *= 1.3
```

---

## BERTopic

### What is BERTopic?

BERTopic clusters news articles into **topics** (e.g., "Supply Chain Issues", "AI Boom", "Inflation Fears"). This helps agents identify **trending themes**.

### Implementation

```python
# Databricks notebook: ml_news_topics.py
from bertopic import BERTopic
from sentence_transformers import SentenceTransformer

# Load news
news_df = spark.table("sweetreturns.gold.news_sentiment").toPandas()
titles = news_df['title'].dropna().tolist()

# Train BERTopic
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
topic_model = BERTopic(
    embedding_model=embedding_model,
    nr_topics=20,
    calculate_probabilities=True
)

topics, probs = topic_model.fit_transform(titles)

# Get topic keywords
topic_info = topic_model.get_topic_info()
print(topic_info[['Topic', 'Count', 'Name']].head(10))

# Assign topics to news
news_df['topic'] = topics
news_df['topic_prob'] = probs.max(axis=1)

# Get topic name
topic_names = {row['Topic']: row['Name'] for _, row in topic_info.iterrows()}
news_df['topic_name'] = news_df['topic'].map(topic_names)

# Save
spark.createDataFrame(news_df).write.format("delta").mode("overwrite").saveAsTable("sweetreturns.gold.news_topics")
```

### Use Topics in Agent Decisions

```python
# If "Supply Chain" is trending, agents with supply-chain exposure react
hot_topics = news_df[news_df['date'] == today]['topic_name'].value_counts().head(3).index.tolist()

if "Supply Chain" in hot_topics:
    # Boost scores for logistics/semiconductor stocks
    for signal in stock_signals:
        if signal['sector'] in ['Industrials', 'Technology']:
            signal['topic_boost'] = 1.5
```

---

## Multi-Agent Reinforcement Learning

### Simplified MARL for Hackathon

Full MARL is too complex for 24 hours. Instead, use **reward-based learning** post-hoc:

```python
# After simulation, compute which archetypes performed best
def evaluate_archetype_performance(decisions_df, outcomes_df):
    """
    decisions_df: {archetype_id, date, target_ticker, action}
    outcomes_df: {ticker, date, forward_return}
    """
    merged = decisions_df.merge(outcomes_df, on=['ticker', 'date'])

    # Compute reward based on action and outcome
    def compute_reward(row):
        if row['action'] == 'buy' and row['forward_return'] > 0:
            return row['forward_return']
        elif row['action'] == 'short' and row['forward_return'] < 0:
            return -row['forward_return']
        elif row['action'] == 'call' and row['forward_return'] > 0.05:
            return row['forward_return'] * 3  # Leveraged upside
        else:
            return row['forward_return'] * -1  # Loss

    merged['reward'] = merged.apply(compute_reward, axis=1)

    # Aggregate by archetype
    archetype_performance = merged.groupby('archetype_id')['reward'].sum()
    return archetype_performance

# Visualize which strategies work best
performance = evaluate_archetype_performance(decisions_df, outcomes_df)
print("Top 10 performing archetypes:")
print(performance.sort_values(ascending=False).head(10))
```

---

## Point-in-Time Architecture

### The Problem: Lookahead Bias

If you compute features using future data, agents "know the future" (cheating). Example:
```python
# BAD: Uses all data
df['forward_return'] = df['Close'].shift(-60) / df['Close'] - 1
```

Agents on date `t` see returns from date `t+60`.

### The Solution: Delta Lake Time Travel

```python
# Use Delta Lake's timestampAsOf
df_at_t = spark.read.format("delta")\
    .option("timestampAsOf", "2020-03-01")\
    .table("sweetreturns.gold.golden_tickets")

# Or versionAsOf
df_v10 = spark.read.format("delta")\
    .option("versionAsOf", 10)\
    .table("sweetreturns.gold.golden_tickets")
```

### Best Practice: Compute Forward Features Separately

```python
# In silver_features.py
from pyspark.sql.window import Window

# Sort by date
window = Window.partitionBy("ticker").orderBy("Date")

# Compute forward return (only after 60 days have passed)
df = df.withColumn(
    "forward_60d_return",
    F.lead("Close", 60).over(window) / F.col("Close") - 1
)

# Filter: Only use rows where forward data is available
train_df = df.filter(F.col("forward_60d_return").isNotNull())

# When querying for a specific date, ensure no lookahead
live_df = df.filter(F.col("Date") == "2020-03-01").drop("forward_60d_return")
```

---

## Stochastic Decision Making

### Why Randomness Matters

If agents always pick the highest-scoring stock, the simulation looks robotic. Real humans are:
- **Impulsive** (random noise)
- **Uncertain** (probabilistic choices)
- **Herding** (follow the crowd)

### Implementation: Softmax Sampling

```python
# Instead of:
chosen_ticker = max(stock_scores, key=lambda x: x[1])[0]  # Always pick best

# Use softmax:
tickers, scores = zip(*stock_scores)
scores = np.array(scores)

# Temperature controls randomness (lower = more deterministic)
temperature = 1.0
probs = np.exp(scores / temperature) / np.sum(np.exp(scores / temperature))

# Sample from distribution
chosen_ticker = np.random.choice(tickers, p=probs)
```

### Herding Behavior

```python
# Add "popularity" factor (how many other agents are targeting this stock)
current_flows = get_current_agent_targets()  # {ticker: count}

for signal in stock_signals:
    popularity = current_flows.get(signal['ticker'], 0) / total_agents
    if popularity > 0.1:  # More than 10% of agents
        signal['herd_boost'] = popularity * 2.0  # Positive feedback
```

---

## Integration Strategy

### Pre-Hackathon (Setup)

1. ✅ Set up Databricks
2. ✅ Upload datasets
3. ✅ Run bronze/silver pipelines
4. ✅ Train HMM, build graph

### During Hackathon (Hours 1-10)

1. ⏳ Run FinBERT on news (can run overnight)
2. ⏳ Run BERTopic clustering
3. ⏳ Create archetype system
4. ⏳ Pre-compute 3 historical scenarios

### Hours 10-20

1. ⏳ Build FastAPI backend
2. ⏳ Integrate WebSocket
3. ⏳ Test scenario playback

### Hours 20-24

1. ⏳ Build live news injection feature
2. ⏳ Polish UI
3. ⏳ Rehearse demo

---

## Demo Talking Points

When presenting to judges, emphasize:

1. **"We use FinBERT, a BERT model fine-tuned on financial text, to extract sentiment from 10,000 news articles"** (Show Databricks notebook)

2. **"Our Graph Neural Network models stock correlations—when TSMC has bad news, the shock propagates to Apple, Nvidia, and Qualcomm through the supply chain graph"** (Show visualization)

3. **"We use a Hidden Markov Model with 3 states to detect market regimes. During bear markets, agent fear increases by 50%"** (Show regime chart)

4. **"We model 100 behavioral archetypes using agent-based modeling principles from behavioral economics—each archetype represents a different investor psychology"** (Show archetype table)

5. **"Our decision function uses softmax sampling to create stochastic, human-like behavior—agents don't always pick the optimal choice"** (Show code)

6. **"All data is stored in Delta Lake with time travel, ensuring point-in-time correctness and preventing lookahead bias"** (Show Delta time travel query)

**Key phrase:** "This isn't just a pretty visualization—it's a complex multi-agent system powered by state-of-the-art NLP, graph neural networks, and Bayesian inference."

---

## Next Steps

1. **Read this guide thoroughly**
2. **Follow IMPLEMENTATION_ROADMAP.md for step-by-step execution**
3. **Test each DS technique in isolation first**
4. **Integrate incrementally**
5. **Don't try to perfect everything—good enough is good enough for a hackathon**

**Good luck! 🚀**
