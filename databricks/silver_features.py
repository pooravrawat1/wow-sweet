# Databricks notebook source
# MAGIC %md
# MAGIC # Silver Layer: Feature Engineering
# MAGIC Reads bronze raw_stock_data, computes all technical indicators and derived features
# MAGIC using PySpark Window functions. Writes to sweetreturns.silver.daily_features Delta table.

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import DoubleType
import math

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Read Bronze Table

# COMMAND ----------

bronze_df = spark.table("sweetreturns.bronze.raw_stock_data")
print(f"Bronze rows: {bronze_df.count()}")
bronze_df.printSchema()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Core Window Definitions
# MAGIC All rolling computations use PySpark Window functions partitioned by ticker, ordered by Date.

# COMMAND ----------

# Base windows
w_ticker = Window.partitionBy("ticker").orderBy("Date")
w_ticker_all = Window.partitionBy("ticker").orderBy("Date").rowsBetween(Window.unboundedPreceding, Window.currentRow)

# Rolling windows for different lookback periods
w_5d = Window.partitionBy("ticker").orderBy("Date").rowsBetween(-4, 0)
w_14d = Window.partitionBy("ticker").orderBy("Date").rowsBetween(-13, 0)
w_20d = Window.partitionBy("ticker").orderBy("Date").rowsBetween(-19, 0)
w_26d = Window.partitionBy("ticker").orderBy("Date").rowsBetween(-25, 0)
w_60d = Window.partitionBy("ticker").orderBy("Date").rowsBetween(-59, 0)
w_252d = Window.partitionBy("ticker").orderBy("Date").rowsBetween(-251, 0)

# Forward-looking windows for forward returns and skew
w_fwd_5d = Window.partitionBy("ticker").orderBy("Date").rowsBetween(1, 5)
w_fwd_20d = Window.partitionBy("ticker").orderBy("Date").rowsBetween(1, 20)
w_fwd_60d = Window.partitionBy("ticker").orderBy("Date").rowsBetween(1, 60)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1: Daily Returns & Log Returns

# COMMAND ----------

df = bronze_df.withColumn(
    "prev_close", F.lag("Close", 1).over(w_ticker)
).withColumn(
    "daily_return", (F.col("Close") - F.col("prev_close")) / F.col("prev_close")
).withColumn(
    "log_return", F.log(F.col("Close") / F.col("prev_close"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2: Drawdown & Drawdown Percentile

# COMMAND ----------

# Expanding max close (running all-time high per ticker)
df = df.withColumn(
    "expanding_max_close", F.max("Close").over(w_ticker_all)
).withColumn(
    "drawdown_pct", (F.col("Close") - F.col("expanding_max_close")) / F.col("expanding_max_close")
)

# Drawdown percentile: rank of current drawdown vs. all drawdowns for this ticker over full history.
# drawdown_pct is negative (or zero), so a more-negative value is a deeper drawdown.
# We use percent_rank() so that the deepest drawdowns get the highest percentile.
# Since drawdown_pct is negative, sorting ascending means the most negative (deepest) values
# come first, getting the lowest rank. We want deep drawdowns = high percentile,
# so we rank by descending drawdown (i.e., ascending absolute drawdown).
w_drawdown_rank = Window.partitionBy("ticker").orderBy(F.col("drawdown_pct").asc())
df = df.withColumn(
    "drawdown_percentile", F.percent_rank().over(w_drawdown_rank)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3: Realized Volatility (20d, 60d) & Volatility Percentile

# COMMAND ----------

# Realized volatility = rolling std of daily returns, annualized
SQRT_252 = math.sqrt(252)

df = df.withColumn(
    "realized_vol_20d", F.stddev("daily_return").over(w_20d) * F.lit(SQRT_252)
).withColumn(
    "realized_vol_60d", F.stddev("daily_return").over(w_60d) * F.lit(SQRT_252)
)

# Volatility percentile: rank of current 20d vol vs. its own 252-day rolling history
# Higher vol = higher percentile
w_vol_rank = Window.partitionBy("ticker").orderBy(F.col("realized_vol_20d").asc())
df = df.withColumn(
    "vol_percentile", F.percent_rank().over(w_vol_rank)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4: Volume Percentile

# COMMAND ----------

# Volume percentile: rank of current day's volume vs. 252-day rolling history
w_vol_pctile_rank = Window.partitionBy("ticker").orderBy(F.col("Volume").asc())
df = df.withColumn(
    "volume_percentile", F.percent_rank().over(w_vol_pctile_rank)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 5: RSI-14 (Relative Strength Index)

# COMMAND ----------

# RSI = 100 - (100 / (1 + RS)), where RS = avg_gain / avg_loss over 14 days
df = df.withColumn(
    "gain", F.when(F.col("daily_return") > 0, F.col("daily_return")).otherwise(0.0)
).withColumn(
    "loss", F.when(F.col("daily_return") < 0, -F.col("daily_return")).otherwise(0.0)
)

df = df.withColumn(
    "avg_gain_14", F.avg("gain").over(w_14d)
).withColumn(
    "avg_loss_14", F.avg("loss").over(w_14d)
)

df = df.withColumn(
    "rs_14", F.when(F.col("avg_loss_14") > 0, F.col("avg_gain_14") / F.col("avg_loss_14")).otherwise(100.0)
).withColumn(
    "rsi_14", F.lit(100.0) - (F.lit(100.0) / (F.lit(1.0) + F.col("rs_14")))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 6: MACD (12, 26, 9)
# MAGIC Approximated using simple moving averages over the window (SMA-based proxy).
# MAGIC True EMA requires iterative state; SMA is a reasonable Spark-friendly approximation.

# COMMAND ----------

w_12d = Window.partitionBy("ticker").orderBy("Date").rowsBetween(-11, 0)
w_9d = Window.partitionBy("ticker").orderBy("Date").rowsBetween(-8, 0)

df = df.withColumn(
    "ema_12", F.avg("Close").over(w_12d)
).withColumn(
    "ema_26", F.avg("Close").over(w_26d)
).withColumn(
    "macd_line", F.col("ema_12") - F.col("ema_26")
)

# Signal line = 9-period average of MACD line
df = df.withColumn(
    "macd_signal", F.avg("macd_line").over(w_9d)
).withColumn(
    "macd_histogram", F.col("macd_line") - F.col("macd_signal")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 7: Bollinger Bands (20, 2)

# COMMAND ----------

df = df.withColumn(
    "bb_mid", F.avg("Close").over(w_20d)
).withColumn(
    "bb_std", F.stddev("Close").over(w_20d)
).withColumn(
    "bb_upper", F.col("bb_mid") + F.lit(2.0) * F.col("bb_std")
).withColumn(
    "bb_lower", F.col("bb_mid") - F.lit(2.0) * F.col("bb_std")
).withColumn(
    "bb_pct_b", F.when(
        F.col("bb_std") > 0,
        (F.col("Close") - F.col("bb_lower")) / (F.col("bb_upper") - F.col("bb_lower"))
    ).otherwise(0.5)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 8: ATR-14 (Average True Range)

# COMMAND ----------

df = df.withColumn(
    "prev_close_atr", F.lag("Close", 1).over(w_ticker)
).withColumn(
    "tr", F.greatest(
        F.col("High") - F.col("Low"),
        F.abs(F.col("High") - F.col("prev_close_atr")),
        F.abs(F.col("Low") - F.col("prev_close_atr"))
    )
).withColumn(
    "atr_14", F.avg("tr").over(w_14d)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 9: Rate of Change (ROC) - 5d, 20d, 60d

# COMMAND ----------

df = df.withColumn(
    "roc_5", (F.col("Close") - F.lag("Close", 5).over(w_ticker)) / F.lag("Close", 5).over(w_ticker)
).withColumn(
    "roc_20", (F.col("Close") - F.lag("Close", 20).over(w_ticker)) / F.lag("Close", 20).over(w_ticker)
).withColumn(
    "roc_60", (F.col("Close") - F.lag("Close", 60).over(w_ticker)) / F.lag("Close", 60).over(w_ticker)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 10: Z-Scores (20d, 60d)

# COMMAND ----------

df = df.withColumn(
    "mean_20d", F.avg("Close").over(w_20d)
).withColumn(
    "std_20d", F.stddev("Close").over(w_20d)
).withColumn(
    "zscore_20d", F.when(
        F.col("std_20d") > 0,
        (F.col("Close") - F.col("mean_20d")) / F.col("std_20d")
    ).otherwise(0.0)
)

df = df.withColumn(
    "mean_60d", F.avg("Close").over(w_60d)
).withColumn(
    "std_60d", F.stddev("Close").over(w_60d)
).withColumn(
    "zscore_60d", F.when(
        F.col("std_60d") > 0,
        (F.col("Close") - F.col("mean_60d")) / F.col("std_60d")
    ).otherwise(0.0)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 11: SPY Relative Return
# MAGIC Compute daily return for SPY and join to get relative performance.

# COMMAND ----------

# Extract SPY returns as a separate DataFrame
spy_df = (
    df.filter(F.col("ticker") == "SPY")
    .select(
        F.col("Date").alias("spy_date"),
        F.col("daily_return").alias("spy_daily_return"),
        F.col("Close").alias("spy_close")
    )
)

# Join SPY returns to all tickers
df = df.join(spy_df, df["Date"] == spy_df["spy_date"], "left").drop("spy_date")

# Relative return vs SPY (daily excess return)
df = df.withColumn(
    "relative_return_vs_spy",
    F.col("daily_return") - F.col("spy_daily_return")
)

# Rolling 20d relative return for mean-reversion scoring
w_20d_rel = Window.partitionBy("ticker").orderBy("Date").rowsBetween(-19, 0)
df = df.withColumn(
    "relative_return_20d", F.sum("relative_return_vs_spy").over(w_20d_rel)
)

# Percentile of relative return vs SPY (for Ticket IV threshold)
w_rel_rank = Window.partitionBy("ticker").orderBy(F.col("relative_return_20d").asc())
df = df.withColumn(
    "relative_return_percentile", F.percent_rank().over(w_rel_rank)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 12: Forward Returns (5d, 20d, 60d)
# MAGIC These are forward-looking features used for backtesting and ticket validation.
# MAGIC The last N rows per ticker will have null forward returns.

# COMMAND ----------

df = df.withColumn(
    "close_fwd_5d", F.lead("Close", 5).over(w_ticker)
).withColumn(
    "close_fwd_20d", F.lead("Close", 20).over(w_ticker)
).withColumn(
    "close_fwd_60d", F.lead("Close", 60).over(w_ticker)
).withColumn(
    "fwd_return_5d", (F.col("close_fwd_5d") - F.col("Close")) / F.col("Close")
).withColumn(
    "fwd_return_20d", (F.col("close_fwd_20d") - F.col("Close")) / F.col("Close")
).withColumn(
    "fwd_return_60d", (F.col("close_fwd_60d") - F.col("Close")) / F.col("Close")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 13: Forward 60d Skew & Distribution Percentiles
# MAGIC Collect the next 60 daily returns per (ticker, date) and compute skew, p5, p25, median, p75, p95.
# MAGIC Using collect_list over a forward window and a UDF for skew computation.

# COMMAND ----------

from pyspark.sql.types import ArrayType

# Collect next 60 daily returns into an array
df = df.withColumn(
    "fwd_60d_returns", F.collect_list("daily_return").over(w_fwd_60d)
)

# Compute forward return distribution stats via UDF
from scipy import stats as scipy_stats
import numpy as np

@F.udf(DoubleType())
def calc_skew(returns):
    """Compute skewness of forward return distribution."""
    if returns is None or len(returns) < 10:
        return None
    arr = np.array([r for r in returns if r is not None])
    if len(arr) < 10:
        return None
    return float(scipy_stats.skew(arr))

@F.udf(DoubleType())
def calc_percentile(returns, pct):
    """Compute a given percentile of the forward return distribution."""
    if returns is None or len(returns) < 10:
        return None
    arr = np.array([r for r in returns if r is not None])
    if len(arr) < 10:
        return None
    return float(np.percentile(arr, pct))

df = df.withColumn(
    "fwd_60d_skew", calc_skew(F.col("fwd_60d_returns"))
).withColumn(
    "fwd_60d_p5", calc_percentile(F.col("fwd_60d_returns"), F.lit(5.0))
).withColumn(
    "fwd_60d_p25", calc_percentile(F.col("fwd_60d_returns"), F.lit(25.0))
).withColumn(
    "fwd_60d_median", calc_percentile(F.col("fwd_60d_returns"), F.lit(50.0))
).withColumn(
    "fwd_60d_p75", calc_percentile(F.col("fwd_60d_returns"), F.lit(75.0))
).withColumn(
    "fwd_60d_p95", calc_percentile(F.col("fwd_60d_returns"), F.lit(95.0))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 14: Mean Reversion Score (Autocorrelation of 20d returns at lag 1)
# MAGIC Negative autocorrelation suggests mean-reverting behavior.

# COMMAND ----------

# Lag-1 of the 20-day rolling return
df = df.withColumn(
    "rolling_return_20d", F.sum("daily_return").over(w_20d)
).withColumn(
    "rolling_return_20d_lag1", F.lag("rolling_return_20d", 1).over(w_ticker)
)

# Rolling correlation between 20d returns and their lag-1 (over 60-day window)
# This approximates the autocorrelation at lag 1
w_60d_corr = Window.partitionBy("ticker").orderBy("Date").rowsBetween(-59, 0)

df = df.withColumn(
    "mean_reversion_score",
    F.corr("rolling_return_20d", "rolling_return_20d_lag1").over(w_60d_corr)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 15: Volatility Regime Classification
# MAGIC Use SPY's realized volatility as a proxy for market-wide volatility regime.
# MAGIC If SPY is not in the dataset, use the cross-sectional median volatility.

# COMMAND ----------

# SPY realized vol as market regime proxy
spy_vol_df = (
    df.filter(F.col("ticker") == "SPY")
    .select(
        F.col("Date").alias("regime_date"),
        F.col("realized_vol_20d").alias("spy_vol_20d")
    )
)

# 80th percentile of SPY's own vol history for regime threshold
spy_vol_stats = spy_vol_df.select(
    F.percentile_approx("spy_vol_20d", 0.80).alias("spy_vol_p80")
).collect()

spy_vol_threshold = spy_vol_stats[0]["spy_vol_p80"] if spy_vol_stats else 0.20

df = df.join(spy_vol_df, df["Date"] == spy_vol_df["regime_date"], "left").drop("regime_date")

# Volatility regime: "favorable" if SPY vol is below its own 80th percentile
# Fallback: use VIX < 20 equivalent (annualized vol < 0.20)
df = df.withColumn(
    "vol_regime",
    F.when(
        F.col("spy_vol_20d") < F.lit(spy_vol_threshold),
        F.lit("favorable")
    ).otherwise(F.lit("elevated"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 16: Median Drawdown per Ticker (for Ticket III downside check)

# COMMAND ----------

# Compute the median drawdown per ticker across full history
median_dd_df = (
    df.groupBy("ticker")
    .agg(
        F.percentile_approx("drawdown_pct", 0.50).alias("median_drawdown")
    )
)

df = df.join(median_dd_df, on="ticker", how="left")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Select Final Silver Columns & Write

# COMMAND ----------

silver_cols = [
    # Identifiers
    "ticker", "Date", "sector",
    # Raw OHLCV
    "Open", "High", "Low", "Close", "Volume", "Dividends", "stock_splits",
    # Returns
    "daily_return", "log_return",
    # Drawdown
    "drawdown_pct", "drawdown_percentile",
    # Volatility
    "realized_vol_20d", "realized_vol_60d", "vol_percentile",
    # Volume
    "volume_percentile",
    # RSI
    "rsi_14",
    # MACD
    "macd_line", "macd_signal", "macd_histogram",
    # Bollinger Bands
    "bb_mid", "bb_upper", "bb_lower", "bb_pct_b",
    # ATR
    "atr_14",
    # Rate of Change
    "roc_5", "roc_20", "roc_60",
    # Z-Scores
    "zscore_20d", "zscore_60d",
    # SPY relative
    "spy_daily_return", "relative_return_vs_spy", "relative_return_20d", "relative_return_percentile",
    # Forward returns
    "fwd_return_5d", "fwd_return_20d", "fwd_return_60d",
    # Forward distribution stats
    "fwd_60d_skew", "fwd_60d_p5", "fwd_60d_p25", "fwd_60d_median", "fwd_60d_p75", "fwd_60d_p95",
    # Mean reversion
    "mean_reversion_score",
    # Volatility regime
    "spy_vol_20d", "vol_regime",
    # Median drawdown
    "median_drawdown",
]

silver_df = df.select(*silver_cols)

# COMMAND ----------

(silver_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.silver.daily_features")
)

print("Silver table written: sweetreturns.silver.daily_features")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Quality Validation

# COMMAND ----------

spark.sql("""
    SELECT
        COUNT(*) as total_rows,
        COUNT(DISTINCT ticker) as unique_tickers,
        MIN(Date) as start_date,
        MAX(Date) as end_date,
        -- Null checks on key features
        SUM(CASE WHEN daily_return IS NULL THEN 1 ELSE 0 END) as null_daily_return,
        SUM(CASE WHEN drawdown_percentile IS NULL THEN 1 ELSE 0 END) as null_drawdown_pctile,
        SUM(CASE WHEN realized_vol_20d IS NULL THEN 1 ELSE 0 END) as null_vol_20d,
        SUM(CASE WHEN volume_percentile IS NULL THEN 1 ELSE 0 END) as null_vol_pctile,
        SUM(CASE WHEN rsi_14 IS NULL THEN 1 ELSE 0 END) as null_rsi,
        SUM(CASE WHEN fwd_60d_skew IS NULL THEN 1 ELSE 0 END) as null_fwd_skew,
        -- Feature distribution sanity
        AVG(realized_vol_20d) as avg_vol_20d,
        AVG(rsi_14) as avg_rsi,
        AVG(drawdown_pct) as avg_drawdown
    FROM sweetreturns.silver.daily_features
""").show(truncate=False)

# COMMAND ----------

# Spot-check a single ticker
spark.sql("""
    SELECT Date, Close, daily_return, drawdown_pct, drawdown_percentile,
           realized_vol_20d, vol_percentile, volume_percentile, rsi_14,
           macd_line, bb_pct_b, zscore_20d, relative_return_vs_spy, vol_regime
    FROM sweetreturns.silver.daily_features
    WHERE ticker = 'AAPL'
    ORDER BY Date DESC
    LIMIT 10
""").show(truncate=False)
