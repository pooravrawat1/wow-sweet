# Databricks notebook source
# MAGIC %md
# MAGIC # Gold Layer: Agent Archetypes
# MAGIC Defines 10 base investor types x 10 variants = 100 unique agent archetypes
# MAGIC for the SweetReturns candy-themed stock market simulation.
# MAGIC
# MAGIC Each archetype has unique parameters:
# MAGIC - `capital`: Starting capital allocation
# MAGIC - `risk_tolerance`: Willingness to take on risk (0-1)
# MAGIC - `greed`: Tendency to chase gains (0-1)
# MAGIC - `fear`: Tendency to panic sell (0-1)
# MAGIC - `news_sensitivity`: Reaction to news sentiment (0-1)
# MAGIC - `contrarian_factor`: Tendency to go against the crowd (-1 to 1)
# MAGIC
# MAGIC Includes the full `compute_archetype_decision()` function with:
# MAGIC - Regime modulation
# MAGIC - Stock scoring
# MAGIC - Softmax stock selection
# MAGIC - Action selection (BUY/SHORT/CALL/PUT)
# MAGIC - Urgency calculation
# MAGIC
# MAGIC Saves to `sweetreturns.gold.agent_archetypes` Delta table.

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, IntegerType,
    MapType, ArrayType
)
import numpy as np
import json

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Base Archetype Definitions
# MAGIC 10 investor personality types that drive agent behavior in the simulation.

# COMMAND ----------

BASE_ARCHETYPES = {
    "institutional_value": {
        "description": "Patient value investor, seeks undervalued stocks with strong fundamentals",
        "capital_range": (500000, 2000000),
        "risk_tolerance": 0.35,
        "greed": 0.20,
        "fear": 0.15,
        "news_sensitivity": 0.25,
        "contrarian_factor": 0.40,
        "preferred_actions": {"BUY": 0.60, "CALL": 0.15, "PUT": 0.10, "SHORT": 0.15},
        "sector_preference": ["Financials", "Consumer Staples", "Utilities", "Healthcare"],
        "holding_period": "long",
        "visual_traits": {
            "suit_color": "#1a1a2e",  # Dark navy
            "walk_speed": 0.6,
            "aggression": 0.2,
        },
    },
    "institutional_growth": {
        "description": "Growth-focused institutional investor, chases momentum in tech/healthcare",
        "capital_range": (500000, 1500000),
        "risk_tolerance": 0.55,
        "greed": 0.50,
        "fear": 0.25,
        "news_sensitivity": 0.45,
        "contrarian_factor": -0.10,
        "preferred_actions": {"BUY": 0.55, "CALL": 0.25, "PUT": 0.10, "SHORT": 0.10},
        "sector_preference": ["Technology", "Healthcare", "Communication Services"],
        "holding_period": "medium",
        "visual_traits": {
            "suit_color": "#16213e",  # Dark blue
            "walk_speed": 0.8,
            "aggression": 0.3,
        },
    },
    "hedge_fund_macro": {
        "description": "Global macro strategist, trades based on regime and macro indicators",
        "capital_range": (1000000, 5000000),
        "risk_tolerance": 0.70,
        "greed": 0.45,
        "fear": 0.20,
        "news_sensitivity": 0.70,
        "contrarian_factor": 0.25,
        "preferred_actions": {"BUY": 0.30, "CALL": 0.25, "PUT": 0.25, "SHORT": 0.20},
        "sector_preference": ["Energy", "Financials", "Materials", "Industrials"],
        "holding_period": "medium",
        "visual_traits": {
            "suit_color": "#0f3460",  # Deep navy
            "walk_speed": 1.0,
            "aggression": 0.5,
        },
    },
    "hedge_fund_quant": {
        "description": "Quantitative strategist using statistical arbitrage and mean reversion",
        "capital_range": (1000000, 3000000),
        "risk_tolerance": 0.60,
        "greed": 0.35,
        "fear": 0.10,
        "news_sensitivity": 0.15,
        "contrarian_factor": 0.55,
        "preferred_actions": {"BUY": 0.35, "CALL": 0.20, "PUT": 0.20, "SHORT": 0.25},
        "sector_preference": None,  # Sector-agnostic
        "holding_period": "short",
        "visual_traits": {
            "suit_color": "#1a1a3e",  # Almost black
            "walk_speed": 1.2,
            "aggression": 0.4,
        },
    },
    "retail_longterm": {
        "description": "Buy-and-hold retail investor, follows Buffett-style value investing",
        "capital_range": (10000, 100000),
        "risk_tolerance": 0.30,
        "greed": 0.25,
        "fear": 0.35,
        "news_sensitivity": 0.40,
        "contrarian_factor": 0.15,
        "preferred_actions": {"BUY": 0.70, "CALL": 0.10, "PUT": 0.10, "SHORT": 0.10},
        "sector_preference": ["Technology", "Consumer Discretionary", "Consumer Staples"],
        "holding_period": "long",
        "visual_traits": {
            "suit_color": "#2c3e50",  # Charcoal
            "walk_speed": 0.5,
            "aggression": 0.1,
        },
    },
    "retail_daytrader": {
        "description": "Active day trader, chases momentum and technical patterns",
        "capital_range": (25000, 200000),
        "risk_tolerance": 0.75,
        "greed": 0.70,
        "fear": 0.40,
        "news_sensitivity": 0.65,
        "contrarian_factor": -0.20,
        "preferred_actions": {"BUY": 0.35, "CALL": 0.30, "PUT": 0.15, "SHORT": 0.20},
        "sector_preference": ["Technology", "Consumer Discretionary"],
        "holding_period": "intraday",
        "visual_traits": {
            "suit_color": "#34495e",  # Slate gray
            "walk_speed": 1.5,
            "aggression": 0.7,
        },
    },
    "retail_wsb_degen": {
        "description": "r/WallStreetBets degenerate, YOLO into meme stocks with max leverage",
        "capital_range": (5000, 50000),
        "risk_tolerance": 0.95,
        "greed": 0.95,
        "fear": 0.05,
        "news_sensitivity": 0.90,
        "contrarian_factor": -0.40,
        "preferred_actions": {"BUY": 0.30, "CALL": 0.50, "PUT": 0.05, "SHORT": 0.15},
        "sector_preference": ["Consumer Discretionary", "Technology", "Communication Services"],
        "holding_period": "yolo",
        "visual_traits": {
            "suit_color": "#e74c3c",  # Red (the WSB ape)
            "walk_speed": 2.0,
            "aggression": 1.0,
        },
    },
    "algorithmic_hft": {
        "description": "High-frequency trading algorithm, exploits microstructure and latency",
        "capital_range": (2000000, 10000000),
        "risk_tolerance": 0.50,
        "greed": 0.30,
        "fear": 0.05,
        "news_sensitivity": 0.10,
        "contrarian_factor": 0.00,
        "preferred_actions": {"BUY": 0.35, "CALL": 0.15, "PUT": 0.15, "SHORT": 0.35},
        "sector_preference": None,  # Sector-agnostic
        "holding_period": "microsecond",
        "visual_traits": {
            "suit_color": "#2d3436",  # Dark gray
            "walk_speed": 2.5,
            "aggression": 0.3,
        },
    },
    "contrarian": {
        "description": "Pure contrarian, buys when others sell and sells when others buy",
        "capital_range": (100000, 500000),
        "risk_tolerance": 0.65,
        "greed": 0.30,
        "fear": 0.10,
        "news_sensitivity": 0.50,
        "contrarian_factor": 0.85,
        "preferred_actions": {"BUY": 0.45, "CALL": 0.20, "PUT": 0.15, "SHORT": 0.20},
        "sector_preference": None,  # Sector-agnostic contrarian
        "holding_period": "medium",
        "visual_traits": {
            "suit_color": "#6c5ce7",  # Purple (stands out)
            "walk_speed": 0.9,
            "aggression": 0.4,
        },
    },
    "momentum_chaser": {
        "description": "Trend-following momentum trader, buys winners and shorts losers",
        "capital_range": (50000, 500000),
        "risk_tolerance": 0.70,
        "greed": 0.80,
        "fear": 0.30,
        "news_sensitivity": 0.55,
        "contrarian_factor": -0.50,
        "preferred_actions": {"BUY": 0.40, "CALL": 0.30, "PUT": 0.10, "SHORT": 0.20},
        "sector_preference": ["Technology", "Consumer Discretionary", "Communication Services"],
        "holding_period": "short",
        "visual_traits": {
            "suit_color": "#00cec9",  # Teal
            "walk_speed": 1.8,
            "aggression": 0.6,
        },
    },
}

print(f"Base archetypes defined: {len(BASE_ARCHETYPES)}")
for name, config in BASE_ARCHETYPES.items():
    print(f"  {name}: {config['description'][:60]}...")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate 10 Variants per Base Type
# MAGIC Each base archetype spawns 10 variants with jittered parameters.
# MAGIC This creates 100 unique agent personalities.

# COMMAND ----------

np.random.seed(42)

VARIANTS_PER_BASE = 10
all_archetypes = []

for base_name, base_config in BASE_ARCHETYPES.items():
    for variant_idx in range(VARIANTS_PER_BASE):
        variant_id = f"{base_name}_v{variant_idx:02d}"

        # Jitter parameters with controlled randomness
        jitter_scale = 0.15  # +/- 15% variation

        def jitter(value, scale=jitter_scale, min_val=0.0, max_val=1.0):
            """Apply random jitter to a parameter, clamping to valid range."""
            noise = np.random.uniform(-scale, scale)
            return float(np.clip(value + noise * value, min_val, max_val))

        # Capital with wider variation
        cap_low, cap_high = base_config["capital_range"]
        capital = float(np.random.uniform(cap_low, cap_high))

        archetype = {
            "archetype_id": variant_id,
            "base_type": base_name,
            "variant_index": variant_idx,
            "description": base_config["description"],
            "capital": round(capital, 2),
            "risk_tolerance": round(jitter(base_config["risk_tolerance"]), 3),
            "greed": round(jitter(base_config["greed"]), 3),
            "fear": round(jitter(base_config["fear"]), 3),
            "news_sensitivity": round(jitter(base_config["news_sensitivity"]), 3),
            "contrarian_factor": round(
                jitter(base_config["contrarian_factor"], min_val=-1.0, max_val=1.0), 3
            ),
            # Action probabilities (slightly jittered, then normalized)
            "buy_prob": base_config["preferred_actions"]["BUY"],
            "call_prob": base_config["preferred_actions"]["CALL"],
            "put_prob": base_config["preferred_actions"]["PUT"],
            "short_prob": base_config["preferred_actions"]["SHORT"],
            "holding_period": base_config["holding_period"],
            "suit_color": base_config["visual_traits"]["suit_color"],
            "walk_speed": round(
                jitter(base_config["visual_traits"]["walk_speed"], min_val=0.3, max_val=3.0), 2
            ),
            "aggression": round(
                jitter(base_config["visual_traits"]["aggression"]), 2
            ),
        }

        # Jitter action probabilities and re-normalize
        actions = ["buy_prob", "call_prob", "put_prob", "short_prob"]
        for action in actions:
            archetype[action] = max(0.01, archetype[action] + np.random.uniform(-0.05, 0.05))
        total_prob = sum(archetype[a] for a in actions)
        for action in actions:
            archetype[action] = round(archetype[action] / total_prob, 3)

        # Sector preference (as comma-separated string)
        if base_config["sector_preference"]:
            archetype["sector_preference"] = ",".join(base_config["sector_preference"])
        else:
            archetype["sector_preference"] = "ALL"

        all_archetypes.append(archetype)

print(f"Total archetypes generated: {len(all_archetypes)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## The Decision Engine: `compute_archetype_decision()`
# MAGIC This is the core function that determines what action an agent takes
# MAGIC given the current market state. It integrates:
# MAGIC 1. Market regime modulation
# MAGIC 2. Stock scoring based on archetype personality
# MAGIC 3. Softmax stock selection
# MAGIC 4. Action selection (BUY/SHORT/CALL/PUT)
# MAGIC 5. Urgency calculation

# COMMAND ----------

def compute_archetype_decision(archetype, stocks, regime, news_sentiment=None):
    """
    Compute the trading decision for a single agent archetype.

    Parameters:
        archetype (dict): Agent archetype with personality parameters.
        stocks (list[dict]): Available stocks with features. Each stock dict has:
            - ticker, sector, daily_return, drawdown_pct, volume_percentile,
            - golden_score, rsi_14, zscore_20d, realized_vol_20d,
            - buy_pct, call_pct, put_pct, short_pct (direction bias from gold)
        regime (str): Current market regime ("Bull", "Bear", "Neutral").
        news_sentiment (dict|None): Optional per-ticker sentiment scores.

    Returns:
        dict: Decision containing:
            - target_ticker (str): Selected stock
            - action (str): BUY, SHORT, CALL, or PUT
            - urgency (float): 0-1 urgency score
            - confidence (float): 0-1 confidence in the decision
            - reasoning (str): Brief explanation
    """
    # ================================================================
    # STEP 1: Regime Modulation
    # Adjust base parameters based on market regime.
    # ================================================================
    regime_modifiers = {
        "Bull": {
            "greed_boost": 0.15,
            "fear_reduction": 0.10,
            "buy_bias": 0.10,
            "urgency_base": 0.3,
        },
        "Bear": {
            "greed_boost": -0.10,
            "fear_reduction": -0.15,
            "buy_bias": -0.15,
            "urgency_base": 0.6,
        },
        "Neutral": {
            "greed_boost": 0.0,
            "fear_reduction": 0.0,
            "buy_bias": 0.0,
            "urgency_base": 0.4,
        },
    }

    mod = regime_modifiers.get(regime, regime_modifiers["Neutral"])

    effective_greed = np.clip(archetype["greed"] + mod["greed_boost"], 0, 1)
    effective_fear = np.clip(archetype["fear"] - mod["fear_reduction"], 0, 1)
    effective_risk = archetype["risk_tolerance"]
    contrarian = archetype["contrarian_factor"]
    news_sens = archetype["news_sensitivity"]

    # ================================================================
    # STEP 2: Score Each Stock
    # Each stock gets a composite score based on the archetype's personality.
    # ================================================================
    stock_scores = []

    for stock in stocks:
        score = 0.0

        # --- Momentum Component ---
        # Positive returns attract greedy agents, repel fearful ones
        daily_ret = stock.get("daily_return", 0.0) or 0.0
        if daily_ret > 0:
            score += effective_greed * daily_ret * 50  # Scale factor
        else:
            score += effective_fear * daily_ret * 30  # Fear amplifies drops

        # --- Drawdown/Value Component ---
        # Deep drawdowns attract contrarians, repel momentum chasers
        drawdown = stock.get("drawdown_pct", 0.0) or 0.0
        if contrarian > 0:
            # Contrarians are attracted to deep drawdowns (buying the dip)
            score += contrarian * abs(drawdown) * 20
        else:
            # Momentum chasers avoid stocks in drawdown
            score += contrarian * abs(drawdown) * 10

        # --- Golden Score Component ---
        # Higher golden scores attract more agents (the candy is sweeter)
        golden = stock.get("golden_score", 0) or 0
        score += golden * 3.0 * effective_greed

        # --- Volume Excitement ---
        # High volume = crowd, attracts momentum players, repels contrarians
        vol_pct = stock.get("volume_percentile", 0.5) or 0.5
        score += (1 - abs(contrarian)) * vol_pct * 5  # Crowd followers like volume
        score -= abs(contrarian) * vol_pct * 3  # Contrarians avoid crowds

        # --- RSI Component ---
        # RSI < 30 = oversold (contrarian buy signal)
        # RSI > 70 = overbought (contrarian sell signal, momentum buy signal)
        rsi = stock.get("rsi_14", 50.0) or 50.0
        if rsi < 30:
            score += contrarian * 5  # Contrarians love oversold
            score -= (1 - contrarian) * 3  # Momentum avoids oversold
        elif rsi > 70:
            score -= contrarian * 4  # Contrarians avoid overbought
            score += effective_greed * 3  # Greedy chasers pile in

        # --- Z-Score Component ---
        # Measures deviation from mean; contrarians buy negative z-scores
        zscore = stock.get("zscore_20d", 0.0) or 0.0
        score += contrarian * (-zscore) * 4  # Contrarians buy low z-score

        # --- Volatility Risk Adjustment ---
        # High volatility reduces score for risk-averse agents
        vol = stock.get("realized_vol_20d", 0.2) or 0.2
        risk_penalty = (1 - effective_risk) * vol * 15
        score -= risk_penalty

        # --- News Sentiment Component ---
        if news_sentiment and stock.get("ticker") in news_sentiment:
            sent_score = news_sentiment[stock["ticker"]]
            score += news_sens * sent_score * 10
            # Negative sentiment + high fear = panic amplifier
            if sent_score < -0.3:
                score -= effective_fear * abs(sent_score) * 8

        # --- Sector Preference ---
        sector_pref = archetype.get("sector_preference", "ALL")
        if sector_pref != "ALL":
            preferred = sector_pref.split(",")
            if stock.get("sector") in preferred:
                score += 3.0  # Bonus for preferred sectors
            else:
                score -= 1.0  # Small penalty for non-preferred

        stock_scores.append({
            "ticker": stock.get("ticker", "???"),
            "sector": stock.get("sector", "Unknown"),
            "score": float(score),
            "golden_score": golden,
            "drawdown_pct": drawdown,
        })

    # ================================================================
    # STEP 3: Softmax Stock Selection
    # Convert scores to probabilities and sample.
    # ================================================================
    if not stock_scores:
        return {
            "target_ticker": None,
            "action": "HOLD",
            "urgency": 0.0,
            "confidence": 0.0,
            "reasoning": "No stocks available",
        }

    scores_array = np.array([s["score"] for s in stock_scores])

    # Temperature parameter: lower = more deterministic
    # Risk-tolerant agents have higher temperature (more random)
    temperature = 0.5 + effective_risk * 1.5

    # Softmax with temperature
    exp_scores = np.exp((scores_array - scores_array.max()) / max(temperature, 0.1))
    probabilities = exp_scores / exp_scores.sum()

    # Sample a stock
    selected_idx = np.random.choice(len(stock_scores), p=probabilities)
    selected_stock = stock_scores[selected_idx]

    # ================================================================
    # STEP 4: Action Selection
    # Determine BUY, SHORT, CALL, or PUT based on archetype + stock state.
    # ================================================================
    # Start with archetype's base action probabilities
    action_probs = {
        "BUY": archetype.get("buy_prob", 0.25),
        "CALL": archetype.get("call_prob", 0.25),
        "PUT": archetype.get("put_prob", 0.25),
        "SHORT": archetype.get("short_prob", 0.25),
    }

    # Modulate by regime
    action_probs["BUY"] += mod["buy_bias"]
    action_probs["SHORT"] -= mod["buy_bias"]

    # Modulate by stock direction bias (from gold layer)
    stock_match = next((s for s in stocks if s.get("ticker") == selected_stock["ticker"]), None)
    if stock_match:
        action_probs["BUY"] += stock_match.get("buy_pct", 0.25) * 0.3
        action_probs["CALL"] += stock_match.get("call_pct", 0.25) * 0.3
        action_probs["PUT"] += stock_match.get("put_pct", 0.25) * 0.3
        action_probs["SHORT"] += stock_match.get("short_pct", 0.25) * 0.3

    # Modulate by drawdown (deep drawdown + contrarian = BUY, else SHORT/PUT)
    if selected_stock["drawdown_pct"] < -0.15:
        if contrarian > 0.3:
            action_probs["BUY"] += 0.15
            action_probs["CALL"] += 0.10
        else:
            action_probs["PUT"] += 0.10
            action_probs["SHORT"] += 0.10

    # Normalize
    total = sum(max(0.01, v) for v in action_probs.values())
    action_probs = {k: max(0.01, v) / total for k, v in action_probs.items()}

    # Sample action
    actions = list(action_probs.keys())
    probs = [action_probs[a] for a in actions]
    selected_action = np.random.choice(actions, p=probs)

    # ================================================================
    # STEP 5: Urgency Calculation
    # How fast does the agent run to this store?
    # ================================================================
    urgency = mod["urgency_base"]

    # Golden score increases urgency (golden tickets draw crowds)
    urgency += selected_stock["golden_score"] * 0.08

    # Volatility increases urgency (fear of missing out or fear of loss)
    if stock_match:
        urgency += stock_match.get("realized_vol_20d", 0.0) * 0.5

    # News spike increases urgency
    if news_sentiment and selected_stock["ticker"] in news_sentiment:
        urgency += abs(news_sentiment[selected_stock["ticker"]]) * 0.3

    # Archetype personality modulates urgency
    urgency *= (0.5 + effective_greed * 0.3 + (1 - effective_fear) * 0.2)

    urgency = float(np.clip(urgency, 0.0, 1.0))

    # Confidence = how much higher the selected stock scored vs average
    avg_score = scores_array.mean()
    confidence = float(np.clip(
        (selected_stock["score"] - avg_score) / (scores_array.std() + 1e-6) * 0.3 + 0.5,
        0.0, 1.0
    ))

    # ================================================================
    # Build Reasoning String
    # ================================================================
    reasoning_parts = [f"Regime={regime}"]
    if selected_stock["golden_score"] >= 3:
        reasoning_parts.append(f"golden={selected_stock['golden_score']}")
    if selected_stock["drawdown_pct"] < -0.10:
        reasoning_parts.append(f"drawdown={selected_stock['drawdown_pct']:.1%}")
    if contrarian > 0.3:
        reasoning_parts.append("contrarian_signal")
    reasoning = "; ".join(reasoning_parts)

    return {
        "target_ticker": selected_stock["ticker"],
        "target_sector": selected_stock["sector"],
        "action": selected_action,
        "urgency": round(urgency, 3),
        "confidence": round(confidence, 3),
        "stock_score": round(selected_stock["score"], 3),
        "reasoning": reasoning,
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Test Decision Engine with Sample Data

# COMMAND ----------

# Sample stocks for testing
sample_stocks = [
    {"ticker": "NVDA", "sector": "Technology", "daily_return": 0.03, "drawdown_pct": -0.05,
     "volume_percentile": 0.92, "golden_score": 3, "rsi_14": 72, "zscore_20d": 1.8,
     "realized_vol_20d": 0.35, "buy_pct": 0.50, "call_pct": 0.30, "put_pct": 0.10, "short_pct": 0.10},
    {"ticker": "AAPL", "sector": "Technology", "daily_return": -0.01, "drawdown_pct": -0.12,
     "volume_percentile": 0.65, "golden_score": 1, "rsi_14": 42, "zscore_20d": -0.8,
     "realized_vol_20d": 0.22, "buy_pct": 0.40, "call_pct": 0.20, "put_pct": 0.20, "short_pct": 0.20},
    {"ticker": "GME", "sector": "Consumer Discretionary", "daily_return": 0.15, "drawdown_pct": -0.30,
     "volume_percentile": 0.99, "golden_score": 4, "rsi_14": 85, "zscore_20d": 3.5,
     "realized_vol_20d": 0.90, "buy_pct": 0.30, "call_pct": 0.50, "put_pct": 0.10, "short_pct": 0.10},
    {"ticker": "JNJ", "sector": "Healthcare", "daily_return": 0.002, "drawdown_pct": -0.03,
     "volume_percentile": 0.45, "golden_score": 0, "rsi_14": 55, "zscore_20d": 0.1,
     "realized_vol_20d": 0.12, "buy_pct": 0.35, "call_pct": 0.20, "put_pct": 0.20, "short_pct": 0.25},
]

sample_sentiment = {"NVDA": 0.7, "GME": 0.9, "AAPL": -0.2, "JNJ": 0.1}

# Test with a few archetypes
test_archetypes = [all_archetypes[0], all_archetypes[60], all_archetypes[95]]
for arch in test_archetypes:
    decision = compute_archetype_decision(
        archetype=arch,
        stocks=sample_stocks,
        regime="Bull",
        news_sentiment=sample_sentiment,
    )
    print(f"\n{arch['archetype_id']} ({arch['base_type']}):")
    print(f"  -> {decision['action']} {decision['target_ticker']} "
          f"(urgency={decision['urgency']}, confidence={decision['confidence']})")
    print(f"  -> {decision['reasoning']}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Archetypes to Gold Table

# COMMAND ----------

archetype_schema = StructType([
    StructField("archetype_id", StringType(), False),
    StructField("base_type", StringType(), False),
    StructField("variant_index", IntegerType(), False),
    StructField("description", StringType(), True),
    StructField("capital", DoubleType(), False),
    StructField("risk_tolerance", DoubleType(), False),
    StructField("greed", DoubleType(), False),
    StructField("fear", DoubleType(), False),
    StructField("news_sensitivity", DoubleType(), False),
    StructField("contrarian_factor", DoubleType(), False),
    StructField("buy_prob", DoubleType(), False),
    StructField("call_prob", DoubleType(), False),
    StructField("put_prob", DoubleType(), False),
    StructField("short_prob", DoubleType(), False),
    StructField("holding_period", StringType(), True),
    StructField("sector_preference", StringType(), True),
    StructField("suit_color", StringType(), True),
    StructField("walk_speed", DoubleType(), True),
    StructField("aggression", DoubleType(), True),
])

rows = []
for arch in all_archetypes:
    rows.append((
        arch["archetype_id"],
        arch["base_type"],
        arch["variant_index"],
        arch["description"],
        arch["capital"],
        arch["risk_tolerance"],
        arch["greed"],
        arch["fear"],
        arch["news_sensitivity"],
        arch["contrarian_factor"],
        arch["buy_prob"],
        arch["call_prob"],
        arch["put_prob"],
        arch["short_prob"],
        arch["holding_period"],
        arch["sector_preference"],
        arch["suit_color"],
        arch["walk_speed"],
        arch["aggression"],
    ))

archetype_df = spark.createDataFrame(rows, schema=archetype_schema)

(archetype_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.gold.agent_archetypes")
)

print("Gold table written: sweetreturns.gold.agent_archetypes")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Save Decision Function & Archetype Config as JSON

# COMMAND ----------

# Save archetype definitions as JSON for frontend reference
archetype_json = {
    "total_archetypes": len(all_archetypes),
    "base_types": len(BASE_ARCHETYPES),
    "variants_per_base": VARIANTS_PER_BASE,
    "base_definitions": {
        name: {
            "description": config["description"],
            "capital_range": config["capital_range"],
            "risk_tolerance": config["risk_tolerance"],
            "greed": config["greed"],
            "fear": config["fear"],
            "news_sensitivity": config["news_sensitivity"],
            "contrarian_factor": config["contrarian_factor"],
            "preferred_actions": config["preferred_actions"],
            "holding_period": config["holding_period"],
            "visual_traits": config["visual_traits"],
        }
        for name, config in BASE_ARCHETYPES.items()
    },
    "archetypes": all_archetypes,
}

archetype_json_str = json.dumps(archetype_json, indent=2)
dbfs_path = "/FileStore/sweetreturns/agent_archetypes.json"
dbutils.fs.put(dbfs_path, archetype_json_str, overwrite=True)
print(f"Archetype config saved to dbfs:{dbfs_path} ({len(archetype_json_str):,} bytes)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Quality Validation

# COMMAND ----------

spark.sql("""
    SELECT
        base_type,
        COUNT(*) as variants,
        ROUND(AVG(capital), 0) as avg_capital,
        ROUND(AVG(risk_tolerance), 3) as avg_risk,
        ROUND(AVG(greed), 3) as avg_greed,
        ROUND(AVG(fear), 3) as avg_fear,
        ROUND(AVG(news_sensitivity), 3) as avg_news_sens,
        ROUND(AVG(contrarian_factor), 3) as avg_contrarian,
        ROUND(AVG(walk_speed), 2) as avg_speed,
        ROUND(AVG(aggression), 2) as avg_aggression
    FROM sweetreturns.gold.agent_archetypes
    GROUP BY base_type
    ORDER BY base_type
""").show(truncate=False)

# COMMAND ----------

# Action probability distribution per base type
spark.sql("""
    SELECT
        base_type,
        ROUND(AVG(buy_prob), 3) as avg_buy,
        ROUND(AVG(call_prob), 3) as avg_call,
        ROUND(AVG(put_prob), 3) as avg_put,
        ROUND(AVG(short_prob), 3) as avg_short
    FROM sweetreturns.gold.agent_archetypes
    GROUP BY base_type
    ORDER BY avg_buy DESC
""").show(truncate=False)

# COMMAND ----------

# Capital distribution
spark.sql("""
    SELECT
        base_type,
        ROUND(MIN(capital), 0) as min_capital,
        ROUND(AVG(capital), 0) as avg_capital,
        ROUND(MAX(capital), 0) as max_capital,
        sector_preference
    FROM sweetreturns.gold.agent_archetypes
    GROUP BY base_type, sector_preference
    ORDER BY avg_capital DESC
""").show(truncate=False)
