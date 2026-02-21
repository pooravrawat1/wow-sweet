# Databricks notebook source
# MAGIC %md
# MAGIC # Gold Layer: Pre-compute Agent Flows for Historical Scenarios
# MAGIC Pre-computes agent trading decisions for 3 historical scenarios:
# MAGIC - **COVID Crash** (Feb 20 - Mar 23, 2020)
# MAGIC - **GME Squeeze** (Jan 20 - Feb 10, 2021)
# MAGIC - **AI Boom** (Jan 3 - Jun 30, 2023)
# MAGIC
# MAGIC For each scenario date, loads stock features, news sentiment, and market regime,
# MAGIC then runs all 100 agent archetypes through `compute_archetype_decision()`.
# MAGIC
# MAGIC Saves to `sweetreturns.gold.precomputed_agent_flows` Delta table.
# MAGIC
# MAGIC ## Dependencies
# MAGIC - `sweetreturns.silver.daily_features` (stock features)
# MAGIC - `sweetreturns.gold.news_sentiment` or `sweetreturns.gold.daily_sentiment` (sentiment)
# MAGIC - `sweetreturns.gold.market_regimes` (regime labels)
# MAGIC - `sweetreturns.gold.agent_archetypes` (100 archetypes)
# MAGIC - `compute_archetype_decision()` function from `gold_agent_archetypes`

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, IntegerType, DateType
)
from pyspark.sql.window import Window
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Scenario Definitions

# COMMAND ----------

SCENARIOS = {
    "covid_crash": {
        "name": "COVID-19 Market Crash",
        "start_date": "2020-02-20",
        "end_date": "2020-03-23",
        "description": "Fastest bear market in history, 34% SPY decline in 23 trading days",
        "key_tickers": ["SPY", "AAPL", "MSFT", "AMZN", "BA", "DAL", "CCL", "XOM", "ZM", "PFE"],
    },
    "gme_squeeze": {
        "name": "GameStop Short Squeeze",
        "start_date": "2021-01-20",
        "end_date": "2021-02-10",
        "description": "Retail-driven short squeeze, GME rose 1,600% in 10 trading days",
        "key_tickers": ["GME", "AMC", "BB", "NOK", "BBBY", "SPY", "PLTR", "TSLA", "AAPL"],
    },
    "ai_boom": {
        "name": "AI Technology Rally",
        "start_date": "2023-01-03",
        "end_date": "2023-06-30",
        "description": "ChatGPT-driven AI enthusiasm, NVDA +189%, tech sector leadership",
        "key_tickers": ["NVDA", "MSFT", "GOOGL", "META", "AMD", "AAPL", "CRM", "ADBE", "SPY"],
    },
}

print("Scenarios configured:")
for scenario_id, config in SCENARIOS.items():
    print(f"  {scenario_id}: {config['name']}")
    print(f"    Period: {config['start_date']} to {config['end_date']}")
    print(f"    Key tickers: {', '.join(config['key_tickers'])}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Required Data Tables

# COMMAND ----------

# Load silver daily features
silver_df = spark.table("sweetreturns.silver.daily_features")
print(f"Silver daily features: {silver_df.count()} rows")

# Load market regimes
try:
    regime_df = spark.table("sweetreturns.gold.market_regimes")
    regime_available = True
    print(f"Market regimes: {regime_df.count()} rows")
except Exception:
    regime_available = False
    print("[WARN] Market regimes table not available. Using default regime 'Neutral'.")

# Load daily sentiment (aggregated per ticker/date)
try:
    sentiment_df = spark.table("sweetreturns.gold.daily_sentiment")
    sentiment_available = True
    print(f"Daily sentiment: {sentiment_df.count()} rows")
except Exception:
    sentiment_available = False
    print("[WARN] Daily sentiment table not available. Running without sentiment.")

# Load archetypes
archetype_df = spark.table("sweetreturns.gold.agent_archetypes")
archetypes_pd = archetype_df.toPandas()
print(f"Agent archetypes: {len(archetypes_pd)} archetypes")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Replicate `compute_archetype_decision()` Function
# MAGIC The full decision engine from `gold_agent_archetypes.py`, replicated here
# MAGIC for standalone execution of this notebook.

# COMMAND ----------

def compute_archetype_decision(archetype, stocks, regime, news_sentiment=None):
    """
    Compute the trading decision for a single agent archetype.

    Parameters:
        archetype (dict): Agent archetype with personality parameters.
        stocks (list[dict]): Available stocks with features.
        regime (str): Current market regime ("Bull", "Bear", "Neutral").
        news_sentiment (dict|None): Optional per-ticker sentiment scores.

    Returns:
        dict: Decision with target_ticker, action, urgency, confidence, reasoning.
    """
    # STEP 1: Regime modulation
    regime_modifiers = {
        "Bull":    {"greed_boost": 0.15, "fear_reduction": 0.10, "buy_bias": 0.10, "urgency_base": 0.3},
        "Bear":    {"greed_boost": -0.10, "fear_reduction": -0.15, "buy_bias": -0.15, "urgency_base": 0.6},
        "Neutral": {"greed_boost": 0.0, "fear_reduction": 0.0, "buy_bias": 0.0, "urgency_base": 0.4},
    }
    mod = regime_modifiers.get(regime, regime_modifiers["Neutral"])

    effective_greed = np.clip(archetype["greed"] + mod["greed_boost"], 0, 1)
    effective_fear = np.clip(archetype["fear"] - mod["fear_reduction"], 0, 1)
    effective_risk = archetype["risk_tolerance"]
    contrarian = archetype["contrarian_factor"]
    news_sens = archetype["news_sensitivity"]

    # STEP 2: Score each stock
    stock_scores = []
    for stock in stocks:
        score = 0.0
        daily_ret = stock.get("daily_return", 0.0) or 0.0
        drawdown = stock.get("drawdown_pct", 0.0) or 0.0
        golden = stock.get("golden_score", 0) or 0
        vol_pct = stock.get("volume_percentile", 0.5) or 0.5
        rsi = stock.get("rsi_14", 50.0) or 50.0
        zscore = stock.get("zscore_20d", 0.0) or 0.0
        vol = stock.get("realized_vol_20d", 0.2) or 0.2

        # Momentum
        if daily_ret > 0:
            score += effective_greed * daily_ret * 50
        else:
            score += effective_fear * daily_ret * 30

        # Drawdown/value
        if contrarian > 0:
            score += contrarian * abs(drawdown) * 20
        else:
            score += contrarian * abs(drawdown) * 10

        # Golden score
        score += golden * 3.0 * effective_greed

        # Volume
        score += (1 - abs(contrarian)) * vol_pct * 5
        score -= abs(contrarian) * vol_pct * 3

        # RSI
        if rsi < 30:
            score += contrarian * 5
            score -= (1 - contrarian) * 3
        elif rsi > 70:
            score -= contrarian * 4
            score += effective_greed * 3

        # Z-score
        score += contrarian * (-zscore) * 4

        # Risk
        score -= (1 - effective_risk) * vol * 15

        # News sentiment
        if news_sentiment and stock.get("ticker") in news_sentiment:
            sent_score = news_sentiment[stock["ticker"]]
            score += news_sens * sent_score * 10
            if sent_score < -0.3:
                score -= effective_fear * abs(sent_score) * 8

        # Sector preference
        sector_pref = archetype.get("sector_preference", "ALL")
        if sector_pref != "ALL":
            preferred = sector_pref.split(",")
            if stock.get("sector") in preferred:
                score += 3.0
            else:
                score -= 1.0

        stock_scores.append({
            "ticker": stock.get("ticker", "???"),
            "sector": stock.get("sector", "Unknown"),
            "score": float(score),
            "golden_score": golden,
            "drawdown_pct": drawdown,
        })

    if not stock_scores:
        return {
            "target_ticker": None, "action": "HOLD", "urgency": 0.0,
            "confidence": 0.0, "reasoning": "No stocks available",
        }

    # STEP 3: Softmax stock selection
    scores_array = np.array([s["score"] for s in stock_scores])
    temperature = 0.5 + effective_risk * 1.5
    exp_scores = np.exp((scores_array - scores_array.max()) / max(temperature, 0.1))
    probabilities = exp_scores / exp_scores.sum()
    selected_idx = np.random.choice(len(stock_scores), p=probabilities)
    selected_stock = stock_scores[selected_idx]

    # STEP 4: Action selection
    action_probs = {
        "BUY": archetype.get("buy_prob", 0.25),
        "CALL": archetype.get("call_prob", 0.25),
        "PUT": archetype.get("put_prob", 0.25),
        "SHORT": archetype.get("short_prob", 0.25),
    }
    action_probs["BUY"] += mod["buy_bias"]
    action_probs["SHORT"] -= mod["buy_bias"]

    stock_match = next((s for s in stocks if s.get("ticker") == selected_stock["ticker"]), None)
    if stock_match:
        action_probs["BUY"] += stock_match.get("buy_pct", 0.25) * 0.3
        action_probs["CALL"] += stock_match.get("call_pct", 0.25) * 0.3
        action_probs["PUT"] += stock_match.get("put_pct", 0.25) * 0.3
        action_probs["SHORT"] += stock_match.get("short_pct", 0.25) * 0.3

    if selected_stock["drawdown_pct"] < -0.15:
        if contrarian > 0.3:
            action_probs["BUY"] += 0.15
            action_probs["CALL"] += 0.10
        else:
            action_probs["PUT"] += 0.10
            action_probs["SHORT"] += 0.10

    total = sum(max(0.01, v) for v in action_probs.values())
    action_probs = {k: max(0.01, v) / total for k, v in action_probs.items()}
    actions = list(action_probs.keys())
    probs = [action_probs[a] for a in actions]
    selected_action = np.random.choice(actions, p=probs)

    # STEP 5: Urgency calculation
    urgency = mod["urgency_base"]
    urgency += selected_stock["golden_score"] * 0.08
    if stock_match:
        urgency += stock_match.get("realized_vol_20d", 0.0) * 0.5
    if news_sentiment and selected_stock["ticker"] in news_sentiment:
        urgency += abs(news_sentiment[selected_stock["ticker"]]) * 0.3
    urgency *= (0.5 + effective_greed * 0.3 + (1 - effective_fear) * 0.2)
    urgency = float(np.clip(urgency, 0.0, 1.0))

    avg_score = scores_array.mean()
    confidence = float(np.clip(
        (selected_stock["score"] - avg_score) / (scores_array.std() + 1e-6) * 0.3 + 0.5,
        0.0, 1.0
    ))

    reasoning_parts = [f"Regime={regime}"]
    if selected_stock["golden_score"] >= 3:
        reasoning_parts.append(f"golden={selected_stock['golden_score']}")
    if selected_stock["drawdown_pct"] < -0.10:
        reasoning_parts.append(f"drawdown={selected_stock['drawdown_pct']:.1%}")
    if contrarian > 0.3:
        reasoning_parts.append("contrarian_signal")

    return {
        "target_ticker": selected_stock["ticker"],
        "target_sector": selected_stock["sector"],
        "action": selected_action,
        "urgency": round(urgency, 3),
        "confidence": round(confidence, 3),
        "stock_score": round(selected_stock["score"], 3),
        "reasoning": "; ".join(reasoning_parts),
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Prepare Data Lookups
# MAGIC Convert DataFrames to indexed dictionaries for fast per-date access.

# COMMAND ----------

# Collect silver features to pandas for fast filtering
# (Only keep columns needed for decision engine)
feature_cols = [
    "ticker", "Date", "sector", "daily_return", "drawdown_pct",
    "volume_percentile", "rsi_14", "zscore_20d", "realized_vol_20d",
    "vol_regime",
]

# Get golden ticket data if available
try:
    gold_df = spark.table("sweetreturns.gold.golden_tickets")
    gold_cols = ["ticker", "Date", "golden_score", "buy_pct", "call_pct", "put_pct", "short_pct"]
    gold_pd = gold_df.select(*gold_cols).toPandas()
    gold_pd["Date"] = pd.to_datetime(gold_pd["Date"])
    gold_available = True
    print(f"Golden tickets loaded: {len(gold_pd)} rows")
except Exception:
    gold_available = False
    print("[WARN] Golden tickets table not available. Using golden_score=0.")

# Load silver data
silver_pd = silver_df.select(*feature_cols).toPandas()
silver_pd["Date"] = pd.to_datetime(silver_pd["Date"])
print(f"Silver features loaded: {len(silver_pd)} rows")

# Load regimes
if regime_available:
    regime_pd = regime_df.select("Date", "regime_label").toPandas()
    regime_pd["Date"] = pd.to_datetime(regime_pd["Date"])
    regime_lookup = dict(zip(regime_pd["Date"], regime_pd["regime_label"]))
    print(f"Regime lookup built: {len(regime_lookup)} dates")
else:
    regime_lookup = {}

# Load sentiment
if sentiment_available:
    sentiment_pd = sentiment_df.select("ticker", "published_date", "sentiment_mean").toPandas()
    sentiment_pd["published_date"] = pd.to_datetime(sentiment_pd["published_date"])
    print(f"Sentiment data loaded: {len(sentiment_pd)} rows")
else:
    sentiment_pd = pd.DataFrame()

# Convert archetypes to list of dicts
archetypes_list = archetypes_pd.to_dict(orient="records")
print(f"Archetypes ready: {len(archetypes_list)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pre-compute Agent Flows for Each Scenario
# MAGIC For each trading date in each scenario, run all 100 archetypes through
# MAGIC the decision engine and record their choices.

# COMMAND ----------

np.random.seed(42)  # Reproducibility

all_flow_records = []
total_decisions = 0

for scenario_id, scenario_config in SCENARIOS.items():
    print(f"\n{'='*70}")
    print(f"Scenario: {scenario_config['name']}")
    print(f"Period: {scenario_config['start_date']} to {scenario_config['end_date']}")

    start_dt = pd.Timestamp(scenario_config["start_date"])
    end_dt = pd.Timestamp(scenario_config["end_date"])

    # Filter silver data to scenario date range
    scenario_mask = (silver_pd["Date"] >= start_dt) & (silver_pd["Date"] <= end_dt)
    scenario_silver = silver_pd[scenario_mask]

    # Get unique trading dates in this scenario
    trading_dates = sorted(scenario_silver["Date"].unique())
    print(f"Trading dates: {len(trading_dates)}")

    if len(trading_dates) == 0:
        print(f"  [WARN] No trading dates found for {scenario_id}. Skipping.")
        continue

    scenario_decisions = 0

    for date_idx, trade_date in enumerate(trading_dates):
        # Get stocks for this date
        date_stocks = scenario_silver[scenario_silver["Date"] == trade_date]

        if len(date_stocks) < 10:
            continue  # Skip dates with too few stocks

        # Merge golden scores if available
        if gold_available:
            date_gold = gold_pd[gold_pd["Date"] == trade_date]
            if len(date_gold) > 0:
                date_stocks = date_stocks.merge(
                    date_gold[["ticker", "golden_score", "buy_pct", "call_pct", "put_pct", "short_pct"]],
                    on="ticker", how="left",
                )
            else:
                date_stocks["golden_score"] = 0
                date_stocks["buy_pct"] = 0.25
                date_stocks["call_pct"] = 0.25
                date_stocks["put_pct"] = 0.25
                date_stocks["short_pct"] = 0.25
        else:
            date_stocks["golden_score"] = 0
            date_stocks["buy_pct"] = 0.25
            date_stocks["call_pct"] = 0.25
            date_stocks["put_pct"] = 0.25
            date_stocks["short_pct"] = 0.25

        # Fill NaN golden scores
        date_stocks["golden_score"] = date_stocks["golden_score"].fillna(0).astype(int)
        date_stocks["buy_pct"] = date_stocks["buy_pct"].fillna(0.25)
        date_stocks["call_pct"] = date_stocks["call_pct"].fillna(0.25)
        date_stocks["put_pct"] = date_stocks["put_pct"].fillna(0.25)
        date_stocks["short_pct"] = date_stocks["short_pct"].fillna(0.25)

        # Convert to list of dicts for the decision engine
        stocks_list = date_stocks.to_dict(orient="records")

        # Get regime for this date
        regime = regime_lookup.get(trade_date, "Neutral")

        # Get sentiment for this date
        date_sentiment = {}
        if sentiment_available and len(sentiment_pd) > 0:
            sent_mask = sentiment_pd["published_date"] == trade_date
            date_sent = sentiment_pd[sent_mask]
            date_sentiment = dict(zip(date_sent["ticker"], date_sent["sentiment_mean"]))

        # Run all 100 archetypes
        for archetype in archetypes_list:
            decision = compute_archetype_decision(
                archetype=archetype,
                stocks=stocks_list,
                regime=regime,
                news_sentiment=date_sentiment if date_sentiment else None,
            )

            if decision["target_ticker"] is None:
                continue

            record = {
                "scenario_id": scenario_id,
                "scenario_name": scenario_config["name"],
                "trade_date": trade_date.strftime("%Y-%m-%d"),
                "archetype_id": archetype["archetype_id"],
                "base_type": archetype["base_type"],
                "target_ticker": decision["target_ticker"],
                "target_sector": decision.get("target_sector", "Unknown"),
                "action": decision["action"],
                "urgency": decision["urgency"],
                "confidence": decision["confidence"],
                "stock_score": decision.get("stock_score", 0.0),
                "regime": regime,
                "reasoning": decision.get("reasoning", ""),
            }

            all_flow_records.append(record)
            scenario_decisions += 1

        # Progress reporting
        if (date_idx + 1) % 5 == 0 or date_idx == len(trading_dates) - 1:
            print(f"  Date {date_idx+1}/{len(trading_dates)}: "
                  f"{trade_date.strftime('%Y-%m-%d')} | "
                  f"Regime={regime} | "
                  f"Stocks={len(stocks_list)} | "
                  f"Decisions so far: {scenario_decisions:,}")

    total_decisions += scenario_decisions
    print(f"  Scenario total: {scenario_decisions:,} decisions")

print(f"\n{'='*70}")
print(f"GRAND TOTAL: {total_decisions:,} agent flow records across all scenarios")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Convert to Spark DataFrame & Write to Gold

# COMMAND ----------

flow_schema = StructType([
    StructField("scenario_id", StringType(), False),
    StructField("scenario_name", StringType(), True),
    StructField("trade_date", StringType(), False),
    StructField("archetype_id", StringType(), False),
    StructField("base_type", StringType(), True),
    StructField("target_ticker", StringType(), False),
    StructField("target_sector", StringType(), True),
    StructField("action", StringType(), False),
    StructField("urgency", DoubleType(), True),
    StructField("confidence", DoubleType(), True),
    StructField("stock_score", DoubleType(), True),
    StructField("regime", StringType(), True),
    StructField("reasoning", StringType(), True),
])

flow_rows = []
for rec in all_flow_records:
    flow_rows.append((
        rec["scenario_id"],
        rec["scenario_name"],
        rec["trade_date"],
        rec["archetype_id"],
        rec["base_type"],
        rec["target_ticker"],
        rec["target_sector"],
        rec["action"],
        rec["urgency"],
        rec["confidence"],
        rec["stock_score"],
        rec["regime"],
        rec["reasoning"],
    ))

flow_df = spark.createDataFrame(flow_rows, schema=flow_schema)
flow_df = (
    flow_df
    .withColumn("trade_date", F.to_date("trade_date", "yyyy-MM-dd"))
    .withColumn("computed_at", F.current_timestamp())
)

print(f"Agent flow DataFrame rows: {flow_df.count()}")
flow_df.printSchema()

# COMMAND ----------

(flow_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.gold.precomputed_agent_flows")
)

print("Gold table written: sweetreturns.gold.precomputed_agent_flows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Flow Aggregations
# MAGIC Summarize agent flows per (scenario, date, ticker) for visualization.

# COMMAND ----------

# Aggregate flows per scenario/date/ticker
flow_agg = (
    flow_df
    .groupBy("scenario_id", "trade_date", "target_ticker", "target_sector", "regime")
    .agg(
        F.count("*").alias("total_agents"),
        F.sum(F.when(F.col("action") == "BUY", 1).otherwise(0)).alias("buy_count"),
        F.sum(F.when(F.col("action") == "CALL", 1).otherwise(0)).alias("call_count"),
        F.sum(F.when(F.col("action") == "PUT", 1).otherwise(0)).alias("put_count"),
        F.sum(F.when(F.col("action") == "SHORT", 1).otherwise(0)).alias("short_count"),
        F.avg("urgency").alias("avg_urgency"),
        F.avg("confidence").alias("avg_confidence"),
        F.avg("stock_score").alias("avg_stock_score"),
        F.countDistinct("archetype_id").alias("unique_archetypes"),
    )
)

# Compute bullish/bearish ratio
flow_agg = flow_agg.withColumn(
    "bullish_ratio",
    (F.col("buy_count") + F.col("call_count")).cast(DoubleType()) / F.col("total_agents").cast(DoubleType())
).withColumn(
    "bearish_ratio",
    (F.col("short_count") + F.col("put_count")).cast(DoubleType()) / F.col("total_agents").cast(DoubleType())
).withColumn(
    "net_flow",
    F.col("buy_count") + F.col("call_count") - F.col("short_count") - F.col("put_count")
)

(flow_agg.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.gold.precomputed_flow_aggregations")
)

print("Gold table written: sweetreturns.gold.precomputed_flow_aggregations")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Export Scenario Flows as JSON for Frontend

# COMMAND ----------

# Build per-scenario JSON payloads
for scenario_id, scenario_config in SCENARIOS.items():
    scenario_flows = (
        flow_agg
        .filter(F.col("scenario_id") == scenario_id)
        .orderBy("trade_date", F.desc("total_agents"))
        .collect()
    )

    payload = {
        "scenario_id": scenario_id,
        "scenario_name": scenario_config["name"],
        "description": scenario_config["description"],
        "start_date": scenario_config["start_date"],
        "end_date": scenario_config["end_date"],
        "total_records": len(scenario_flows),
        "daily_flows": [],
    }

    current_date = None
    date_entry = None

    for row in scenario_flows:
        date_str = str(row["trade_date"])
        if date_str != current_date:
            if date_entry:
                payload["daily_flows"].append(date_entry)
            current_date = date_str
            date_entry = {
                "date": date_str,
                "regime": row["regime"],
                "stocks": [],
            }
        date_entry["stocks"].append({
            "ticker": row["target_ticker"],
            "sector": row["target_sector"],
            "total_agents": int(row["total_agents"]),
            "buy": int(row["buy_count"]),
            "call": int(row["call_count"]),
            "put": int(row["put_count"]),
            "short": int(row["short_count"]),
            "avg_urgency": round(float(row["avg_urgency"]), 3),
            "avg_confidence": round(float(row["avg_confidence"]), 3),
            "bullish_ratio": round(float(row["bullish_ratio"]), 3),
            "net_flow": int(row["net_flow"]),
        })

    if date_entry:
        payload["daily_flows"].append(date_entry)

    # Write to DBFS
    payload_json = json.dumps(payload, indent=2)
    dbfs_path = f"/FileStore/sweetreturns/scenario_{scenario_id}.json"
    dbutils.fs.put(dbfs_path, payload_json, overwrite=True)
    print(f"Scenario {scenario_id} exported to dbfs:{dbfs_path} ({len(payload_json):,} bytes)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Quality Validation

# COMMAND ----------

spark.sql("""
    SELECT
        scenario_id,
        COUNT(*) as total_records,
        COUNT(DISTINCT trade_date) as trading_days,
        COUNT(DISTINCT archetype_id) as unique_archetypes,
        COUNT(DISTINCT target_ticker) as unique_tickers,
        ROUND(AVG(urgency), 3) as avg_urgency,
        ROUND(AVG(confidence), 3) as avg_confidence
    FROM sweetreturns.gold.precomputed_agent_flows
    GROUP BY scenario_id
    ORDER BY scenario_id
""").show(truncate=False)

# COMMAND ----------

# Action distribution per scenario
spark.sql("""
    SELECT
        scenario_id,
        action,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(PARTITION BY scenario_id), 1) as pct
    FROM sweetreturns.gold.precomputed_agent_flows
    GROUP BY scenario_id, action
    ORDER BY scenario_id, count DESC
""").show(20, truncate=False)

# COMMAND ----------

# Top targeted tickers per scenario
spark.sql("""
    SELECT scenario_id, target_ticker, target_sector,
           COUNT(*) as agent_flow_count,
           ROUND(AVG(urgency), 3) as avg_urgency,
           SUM(CASE WHEN action IN ('BUY','CALL') THEN 1 ELSE 0 END) as bullish,
           SUM(CASE WHEN action IN ('SHORT','PUT') THEN 1 ELSE 0 END) as bearish
    FROM sweetreturns.gold.precomputed_agent_flows
    GROUP BY scenario_id, target_ticker, target_sector
    ORDER BY scenario_id, agent_flow_count DESC
""").show(30, truncate=False)

# COMMAND ----------

# Base type behavior across scenarios
spark.sql("""
    SELECT
        base_type,
        scenario_id,
        ROUND(AVG(urgency), 3) as avg_urgency,
        ROUND(AVG(confidence), 3) as avg_confidence,
        SUM(CASE WHEN action = 'BUY' THEN 1 ELSE 0 END) as buys,
        SUM(CASE WHEN action = 'SHORT' THEN 1 ELSE 0 END) as shorts,
        SUM(CASE WHEN action = 'CALL' THEN 1 ELSE 0 END) as calls,
        SUM(CASE WHEN action = 'PUT' THEN 1 ELSE 0 END) as puts
    FROM sweetreturns.gold.precomputed_agent_flows
    GROUP BY base_type, scenario_id
    ORDER BY base_type, scenario_id
""").show(30, truncate=False)

# COMMAND ----------

# Aggregated flow check
spark.sql("""
    SELECT scenario_id, trade_date, target_ticker,
           total_agents, buy_count, call_count, short_count, put_count,
           ROUND(bullish_ratio, 3) as bullish_ratio,
           net_flow,
           ROUND(avg_urgency, 3) as avg_urgency,
           regime
    FROM sweetreturns.gold.precomputed_flow_aggregations
    WHERE total_agents >= 5
    ORDER BY scenario_id, trade_date, total_agents DESC
    LIMIT 30
""").show(truncate=False)
