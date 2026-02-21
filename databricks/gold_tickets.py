# Databricks notebook source
# MAGIC %md
# MAGIC # Gold Layer: Golden Ticket Computation
# MAGIC Reads silver daily_features table, computes all 5 golden tickets with exact thresholds
# MAGIC from the SweetReturns plan, derives golden_score, rarity_percentile, platinum detection,
# MAGIC direction_bias, store_dimensions, and agent_density.
# MAGIC
# MAGIC Writes to sweetreturns.gold.golden_tickets Delta table.

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import DoubleType, BooleanType, IntegerType, StringType
import math

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Read Silver Features

# COMMAND ----------

silver_df = spark.table("sweetreturns.silver.daily_features")
print(f"Silver rows: {silver_df.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ticket I -- Dip Ticket (The Sour Candy Drop)
# MAGIC ```
# MAGIC QUALIFIES IF:
# MAGIC   drawdown_percentile(ticker, date) > 0.80
# MAGIC ```
# MAGIC A sour candy that makes you pucker -- the drop is painful but it is a signal.

# COMMAND ----------

df = silver_df.withColumn(
    "ticket_1_dip",
    F.when(F.col("drawdown_percentile") > 0.80, F.lit(True)).otherwise(F.lit(False))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ticket II -- Shock Ticket (The Jawbreaker)
# MAGIC ```
# MAGIC QUALIFIES IF:
# MAGIC   drawdown_percentile(ticker, date) > 0.85
# MAGIC   AND volume_percentile(ticker, date) > 0.90
# MAGIC   AND volatility_percentile(ticker, date) > 0.85
# MAGIC ```
# MAGIC A jawbreaker -- hard hitting, multi-layered shock to the system.

# COMMAND ----------

df = df.withColumn(
    "ticket_2_shock",
    F.when(
        (F.col("drawdown_percentile") > 0.85) &
        (F.col("volume_percentile") > 0.90) &
        (F.col("vol_percentile") > 0.85),
        F.lit(True)
    ).otherwise(F.lit(False))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ticket III -- Asymmetry Ticket (The Fortune Cookie)
# MAGIC ```
# MAGIC QUALIFIES IF:
# MAGIC   drawdown_percentile(ticker, date) > 0.85
# MAGIC   AND forward_60d_skew(ticker, date) > 0   (positive skew)
# MAGIC   AND p95_forward_return(ticker, date) > 2 * median_forward_return(ticker, date)
# MAGIC   AND p5_forward_return(ticker, date) > -median_drawdown(ticker)  (limited downside)
# MAGIC ```
# MAGIC A fortune cookie -- crack it open and the upside surprise is much bigger than the downside.

# COMMAND ----------

df = df.withColumn(
    "ticket_3_asymmetry",
    F.when(
        (F.col("drawdown_percentile") > 0.85) &
        (F.col("fwd_60d_skew") > 0.0) &
        (F.col("fwd_60d_p95") > F.lit(2.0) * F.col("fwd_60d_median")) &
        # p5 downside must be less severe than the stock's median drawdown (which is negative)
        # i.e., the 5th percentile forward return is not worse than the typical drawdown
        (F.col("fwd_60d_p5") > F.col("median_drawdown")),
        F.lit(True)
    ).otherwise(F.lit(False))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ticket IV -- Relative Dislocation Ticket (The Taffy Pull)
# MAGIC ```
# MAGIC QUALIFIES IF:
# MAGIC   drawdown_percentile(ticker, date) > 0.80
# MAGIC   AND relative_return_vs_spy(ticker, date) < percentile_15(relative_return_history)
# MAGIC   AND mean_reversion_score(ticker) > threshold
# MAGIC     where mean_reversion_score = autocorrelation of 20-day returns at lag 1 < -0.1
# MAGIC     (negative autocorrelation suggests mean-reverting behavior)
# MAGIC ```
# MAGIC Taffy getting pulled too far -- it snaps back.

# COMMAND ----------

df = df.withColumn(
    "ticket_4_dislocation",
    F.when(
        (F.col("drawdown_percentile") > 0.80) &
        # Relative return percentile below 15th (extreme underperformance vs SPY)
        (F.col("relative_return_percentile") < 0.15) &
        # Negative autocorrelation indicates mean reversion tendency
        (F.col("mean_reversion_score") < -0.1),
        F.lit(True)
    ).otherwise(F.lit(False))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ticket V -- Structural Convexity Ticket (The Golden Gummy Bear)
# MAGIC ```
# MAGIC QUALIFIES IF:
# MAGIC   drawdown_percentile(ticker, date) > 0.90
# MAGIC   AND volume_percentile(ticker, date) > 0.90
# MAGIC   AND relative_return_vs_spy < percentile_15
# MAGIC   AND forward_60d_skew > 0.5 (strongly positive)
# MAGIC   AND volatility_regime == "favorable" (VIX < 20 or below its own 80th percentile)
# MAGIC ```
# MAGIC The golden gummy bear -- rare, structurally perfect, chewy upside.

# COMMAND ----------

df = df.withColumn(
    "ticket_5_convexity",
    F.when(
        (F.col("drawdown_percentile") > 0.90) &
        (F.col("volume_percentile") > 0.90) &
        (F.col("relative_return_percentile") < 0.15) &
        (F.col("fwd_60d_skew") > 0.5) &
        (F.col("vol_regime") == "favorable"),
        F.lit(True)
    ).otherwise(F.lit(False))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Golden Score
# MAGIC ```python
# MAGIC golden_score = sum([ticket_1, ticket_2, ticket_3, ticket_4, ticket_5])  # 0 to 5
# MAGIC ```

# COMMAND ----------

df = df.withColumn(
    "golden_score",
    (
        F.col("ticket_1_dip").cast(IntegerType()) +
        F.col("ticket_2_shock").cast(IntegerType()) +
        F.col("ticket_3_asymmetry").cast(IntegerType()) +
        F.col("ticket_4_dislocation").cast(IntegerType()) +
        F.col("ticket_5_convexity").cast(IntegerType())
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Rarity Percentile
# MAGIC Cross-sectional rank of golden_score per date across all 500 stocks.
# MAGIC Highest scores get highest rarity percentile.

# COMMAND ----------

w_date_rank = Window.partitionBy("Date").orderBy(
    F.col("golden_score").asc(),
    F.col("drawdown_percentile").asc()  # tiebreaker: deeper drawdown = more rare
)

df = df.withColumn(
    "rarity_percentile", F.percent_rank().over(w_date_rank)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Platinum Detection (The Wonka Bar)
# MAGIC ```
# MAGIC QUALIFIES IF:
# MAGIC   golden_score(ticker, date) >= 4
# MAGIC   AND rarity_percentile(ticker, date) > 0.98  (top 2% across all 500 stocks on that date)
# MAGIC   AND forward_60d_skew > 1.0  (extreme asymmetry)
# MAGIC   AND relative_return_vs_spy < percentile_5  (extreme divergence)
# MAGIC   AND volatility_regime == "favorable"
# MAGIC ```

# COMMAND ----------

df = df.withColumn(
    "is_platinum",
    F.when(
        (F.col("golden_score") >= 4) &
        (F.col("rarity_percentile") > 0.98) &
        (F.col("fwd_60d_skew") > 1.0) &
        (F.col("relative_return_percentile") < 0.05) &
        (F.col("vol_regime") == "favorable"),
        F.lit(True)
    ).otherwise(F.lit(False))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Direction Bias
# MAGIC Derived from forward return distribution skew and downside risk.
# MAGIC ```python
# MAGIC Positive skew + positive median -> bullish: BUY 0.50, CALL 0.30, PUT 0.10, SHORT 0.10
# MAGIC Positive skew + near-zero median -> options play: BUY 0.20, CALL 0.50, PUT 0.20, SHORT 0.10
# MAGIC Negative skew -> bearish: BUY 0.10, CALL 0.10, PUT 0.45, SHORT 0.35
# MAGIC Neutral -> balanced: BUY 0.30, CALL 0.25, PUT 0.25, SHORT 0.20
# MAGIC ```

# COMMAND ----------

df = df.withColumn(
    "buy_pct",
    F.when(
        (F.col("fwd_60d_skew") > 0.5) & (F.col("fwd_60d_median") > 0.02), F.lit(0.50)
    ).when(
        (F.col("fwd_60d_skew") > 0.3) & (F.abs(F.col("fwd_60d_median")) < 0.02), F.lit(0.20)
    ).when(
        F.col("fwd_60d_skew") < -0.3, F.lit(0.10)
    ).otherwise(F.lit(0.30))
).withColumn(
    "call_pct",
    F.when(
        (F.col("fwd_60d_skew") > 0.5) & (F.col("fwd_60d_median") > 0.02), F.lit(0.30)
    ).when(
        (F.col("fwd_60d_skew") > 0.3) & (F.abs(F.col("fwd_60d_median")) < 0.02), F.lit(0.50)
    ).when(
        F.col("fwd_60d_skew") < -0.3, F.lit(0.10)
    ).otherwise(F.lit(0.25))
).withColumn(
    "put_pct",
    F.when(
        (F.col("fwd_60d_skew") > 0.5) & (F.col("fwd_60d_median") > 0.02), F.lit(0.10)
    ).when(
        (F.col("fwd_60d_skew") > 0.3) & (F.abs(F.col("fwd_60d_median")) < 0.02), F.lit(0.20)
    ).when(
        F.col("fwd_60d_skew") < -0.3, F.lit(0.45)
    ).otherwise(F.lit(0.25))
).withColumn(
    "short_pct",
    F.when(
        (F.col("fwd_60d_skew") > 0.5) & (F.col("fwd_60d_median") > 0.02), F.lit(0.10)
    ).when(
        (F.col("fwd_60d_skew") > 0.3) & (F.abs(F.col("fwd_60d_median")) < 0.02), F.lit(0.10)
    ).when(
        F.col("fwd_60d_skew") < -0.3, F.lit(0.35)
    ).otherwise(F.lit(0.20))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Store Dimensions
# MAGIC Building size scales with market cap rank (approximated by volume rank as proxy).
# MAGIC Golden score controls emissive glow.
# MAGIC ```
# MAGIC width  = lerp(1.0, 3.0, market_cap_percentile)
# MAGIC height = lerp(1.5, 4.0, market_cap_percentile)
# MAGIC depth  = lerp(1.0, 2.0, market_cap_percentile)
# MAGIC glow   = golden_score / 5.0
# MAGIC ```

# COMMAND ----------

# Use average volume as a proxy for market cap (larger companies trade more volume)
avg_vol_df = (
    df.groupBy("ticker")
    .agg(F.avg("Volume").alias("avg_volume"))
)

w_vol_rank_global = Window.orderBy(F.col("avg_volume").asc())
avg_vol_df = avg_vol_df.withColumn(
    "market_cap_percentile", F.percent_rank().over(w_vol_rank_global)
)

df = df.join(avg_vol_df.select("ticker", "market_cap_percentile"), on="ticker", how="left")

# Store dimensions via linear interpolation (lerp)
df = df.withColumn(
    "store_width", F.lit(1.0) + F.col("market_cap_percentile") * F.lit(2.0)   # lerp(1.0, 3.0)
).withColumn(
    "store_height", F.lit(1.5) + F.col("market_cap_percentile") * F.lit(2.5)  # lerp(1.5, 4.0)
).withColumn(
    "store_depth", F.lit(1.0) + F.col("market_cap_percentile") * F.lit(1.0)   # lerp(1.0, 2.0)
).withColumn(
    "store_glow", F.col("golden_score").cast(DoubleType()) / F.lit(5.0)
)

# Platinum stores get 2.5x scale multiplier
df = df.withColumn(
    "store_width", F.when(F.col("is_platinum"), F.col("store_width") * 2.5).otherwise(F.col("store_width"))
).withColumn(
    "store_height", F.when(F.col("is_platinum"), F.col("store_height") * 2.5).otherwise(F.col("store_height"))
).withColumn(
    "store_depth", F.when(F.col("is_platinum"), F.col("store_depth") * 2.5).otherwise(F.col("store_depth"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent Density
# MAGIC ```python
# MAGIC base_agents_per_store = 200
# MAGIC agent_count = base_agents_per_store + floor(golden_score^2.5 * 800)
# MAGIC # Score 0: 200 agents
# MAGIC # Score 1: 200 + 800 = 1,000
# MAGIC # Score 3: 200 + 12,470 = 12,670
# MAGIC # Score 5: 200 + 44,721 = 44,921  (Platinum: absolute insanity)
# MAGIC #
# MAGIC # Platinum stores: agent_count *= 3.0
# MAGIC ```

# COMMAND ----------

df = df.withColumn(
    "agent_density",
    F.lit(200) + F.floor(F.pow(F.col("golden_score").cast(DoubleType()), 2.5) * F.lit(800))
)

# Platinum multiplier
df = df.withColumn(
    "agent_density",
    F.when(F.col("is_platinum"), (F.col("agent_density") * 3).cast("long")).otherwise(F.col("agent_density"))
)

# Speed multiplier: 1.0 + golden_score * 1.5
df = df.withColumn(
    "speed_multiplier",
    F.lit(1.0) + F.col("golden_score").cast(DoubleType()) * F.lit(1.5)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Select Final Gold Columns & Write

# COMMAND ----------

gold_cols = [
    # Identifiers
    "ticker", "Date", "sector",
    # Price context
    "Close", "Volume", "daily_return",
    # Drawdown context
    "drawdown_pct", "drawdown_percentile",
    # Volatility context
    "realized_vol_20d", "vol_percentile", "volume_percentile",
    # RSI / technicals for reference
    "rsi_14", "macd_histogram", "bb_pct_b", "zscore_20d",
    # SPY relative
    "relative_return_vs_spy", "relative_return_percentile",
    # Forward returns (for validation / direction bias)
    "fwd_return_5d", "fwd_return_20d", "fwd_return_60d",
    "fwd_60d_skew", "fwd_60d_p5", "fwd_60d_p25", "fwd_60d_median", "fwd_60d_p75", "fwd_60d_p95",
    # Mean reversion
    "mean_reversion_score",
    # Volatility regime
    "vol_regime",
    # ---------- GOLDEN TICKETS ----------
    "ticket_1_dip",
    "ticket_2_shock",
    "ticket_3_asymmetry",
    "ticket_4_dislocation",
    "ticket_5_convexity",
    "golden_score",
    "rarity_percentile",
    "is_platinum",
    # Direction bias
    "buy_pct", "call_pct", "put_pct", "short_pct",
    # Store dimensions
    "market_cap_percentile",
    "store_width", "store_height", "store_depth", "store_glow",
    # Agent density
    "agent_density", "speed_multiplier",
]

gold_df = df.select(*gold_cols)

# COMMAND ----------

(gold_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.gold.golden_tickets")
)

print("Gold table written: sweetreturns.gold.golden_tickets")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Quality Validation

# COMMAND ----------

# Distribution of golden scores
spark.sql("""
    SELECT
        golden_score,
        COUNT(*) as row_count,
        COUNT(DISTINCT ticker) as ticker_count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as pct_of_total
    FROM sweetreturns.gold.golden_tickets
    GROUP BY golden_score
    ORDER BY golden_score
""").show()

# COMMAND ----------

# Ticket activation rates
spark.sql("""
    SELECT
        SUM(CASE WHEN ticket_1_dip THEN 1 ELSE 0 END) as ticket_1_count,
        SUM(CASE WHEN ticket_2_shock THEN 1 ELSE 0 END) as ticket_2_count,
        SUM(CASE WHEN ticket_3_asymmetry THEN 1 ELSE 0 END) as ticket_3_count,
        SUM(CASE WHEN ticket_4_dislocation THEN 1 ELSE 0 END) as ticket_4_count,
        SUM(CASE WHEN ticket_5_convexity THEN 1 ELSE 0 END) as ticket_5_count,
        SUM(CASE WHEN is_platinum THEN 1 ELSE 0 END) as platinum_count,
        COUNT(*) as total_rows
    FROM sweetreturns.gold.golden_tickets
""").show()

# COMMAND ----------

# Platinum store examples
spark.sql("""
    SELECT ticker, Date, sector, golden_score, rarity_percentile,
           drawdown_pct, fwd_60d_skew, vol_regime,
           buy_pct, call_pct, put_pct, short_pct,
           agent_density, store_glow
    FROM sweetreturns.gold.golden_tickets
    WHERE is_platinum = true
    ORDER BY Date DESC
    LIMIT 20
""").show(truncate=False)

# COMMAND ----------

# Top golden_score stocks by sector
spark.sql("""
    SELECT sector, ticker, Date, golden_score, rarity_percentile, is_platinum
    FROM sweetreturns.gold.golden_tickets
    WHERE golden_score >= 3
    ORDER BY golden_score DESC, rarity_percentile DESC
    LIMIT 30
""").show(truncate=False)

# COMMAND ----------

# Direction bias distribution check
spark.sql("""
    SELECT
        ROUND(AVG(buy_pct), 3) as avg_buy,
        ROUND(AVG(call_pct), 3) as avg_call,
        ROUND(AVG(put_pct), 3) as avg_put,
        ROUND(AVG(short_pct), 3) as avg_short,
        ROUND(AVG(agent_density), 0) as avg_agents,
        ROUND(AVG(store_glow), 3) as avg_glow
    FROM sweetreturns.gold.golden_tickets
""").show()
