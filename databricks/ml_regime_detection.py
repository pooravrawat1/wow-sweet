# Databricks notebook source
# MAGIC %md
# MAGIC # ML: Market Regime Detection (Hidden Markov Model)
# MAGIC Trains a 3-state Gaussian HMM on SPY daily returns and volatility features
# MAGIC to classify market regimes as Bull, Bear, or Neutral.
# MAGIC
# MAGIC - Uses `hmmlearn.GaussianHMM` for unsupervised regime detection
# MAGIC - Labels states by their mean return characteristics
# MAGIC - Includes matplotlib visualizations of regime transitions
# MAGIC - Saves regimes to `sweetreturns.gold.market_regimes`
# MAGIC
# MAGIC ## Prerequisites
# MAGIC - `%pip install hmmlearn matplotlib`

# COMMAND ----------

# MAGIC %pip install hmmlearn matplotlib

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, DateType, IntegerType
from pyspark.sql.window import Window
import pandas as pd
import numpy as np
from hmmlearn.hmm import GaussianHMM
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for Databricks
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

N_REGIMES = 3              # Number of hidden states: Bull, Bear, Neutral
N_ITERATIONS = 200         # EM algorithm iterations
COVARIANCE_TYPE = "full"   # Full covariance matrix for each state
RANDOM_STATE = 42          # For reproducibility
VOL_WINDOW = 20            # Rolling window for volatility calculation
MIN_OBSERVATIONS = 252     # Minimum trading days required

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load SPY Data

# COMMAND ----------

# Read SPY data from silver features
silver_df = spark.table("sweetreturns.silver.daily_features")

spy_df = (
    silver_df
    .filter(F.col("ticker") == "SPY")
    .select("Date", "Close", "daily_return", "realized_vol_20d", "Volume")
    .orderBy("Date")
)

print(f"SPY observations: {spy_df.count()}")
spy_df.show(5)

# COMMAND ----------

# Convert to pandas for HMM fitting
spy_pd = spy_df.toPandas()
spy_pd["Date"] = pd.to_datetime(spy_pd["Date"])
spy_pd = spy_pd.sort_values("Date").reset_index(drop=True)

# Drop rows with null returns (first row)
spy_pd = spy_pd.dropna(subset=["daily_return", "realized_vol_20d"])

print(f"SPY observations after cleaning: {len(spy_pd)}")
print(f"Date range: {spy_pd['Date'].min()} to {spy_pd['Date'].max()}")
print(f"Mean return: {spy_pd['daily_return'].mean():.6f}")
print(f"Mean vol: {spy_pd['realized_vol_20d'].mean():.4f}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Feature Engineering for HMM
# MAGIC The HMM observes daily returns plus volatility features to identify regimes.

# COMMAND ----------

# Compute additional features for HMM
spy_pd["abs_return"] = spy_pd["daily_return"].abs()
spy_pd["return_5d"] = spy_pd["daily_return"].rolling(5).mean()
spy_pd["vol_change"] = spy_pd["realized_vol_20d"].pct_change()
spy_pd["log_volume"] = np.log1p(spy_pd["Volume"].astype(float))

# Drop rows with NaN from rolling calculations
spy_pd = spy_pd.dropna().reset_index(drop=True)

# Feature matrix for HMM: daily return + realized vol + 5d return momentum
feature_cols = ["daily_return", "realized_vol_20d", "return_5d"]
X = spy_pd[feature_cols].values

print(f"HMM feature matrix shape: {X.shape}")
print(f"Feature means: {X.mean(axis=0)}")
print(f"Feature stds:  {X.std(axis=0)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Train Gaussian HMM
# MAGIC Fit a 3-state Gaussian HMM using the Expectation-Maximization algorithm.

# COMMAND ----------

# Initialize and fit the HMM
hmm_model = GaussianHMM(
    n_components=N_REGIMES,
    covariance_type=COVARIANCE_TYPE,
    n_iter=N_ITERATIONS,
    random_state=RANDOM_STATE,
    verbose=False,
)

hmm_model.fit(X)

print(f"HMM converged: {hmm_model.monitor_.converged}")
print(f"Log-likelihood: {hmm_model.score(X):.2f}")
print(f"\nTransition matrix:")
print(np.round(hmm_model.transmat_, 3))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Predict Regimes & Label States
# MAGIC Use the Viterbi algorithm to find the most likely state sequence.
# MAGIC Then label states based on their mean return: highest = Bull, lowest = Bear.

# COMMAND ----------

# Predict the most likely state sequence
hidden_states = hmm_model.predict(X)
spy_pd["regime_id"] = hidden_states

# Compute state statistics for labeling
state_stats = []
for state_id in range(N_REGIMES):
    mask = spy_pd["regime_id"] == state_id
    state_data = spy_pd[mask]
    stats = {
        "state_id": state_id,
        "count": int(mask.sum()),
        "pct": float(mask.sum() / len(spy_pd) * 100),
        "mean_return": float(state_data["daily_return"].mean()),
        "std_return": float(state_data["daily_return"].std()),
        "mean_vol": float(state_data["realized_vol_20d"].mean()),
        "mean_5d_return": float(state_data["return_5d"].mean()),
    }
    state_stats.append(stats)
    print(f"State {state_id}: {stats['count']} days ({stats['pct']:.1f}%), "
          f"mean_return={stats['mean_return']:.6f}, mean_vol={stats['mean_vol']:.4f}")

# Label states by mean return
state_stats_sorted = sorted(state_stats, key=lambda x: x["mean_return"])
REGIME_LABELS = {}
REGIME_LABELS[state_stats_sorted[0]["state_id"]] = "Bear"     # Lowest mean return
REGIME_LABELS[state_stats_sorted[1]["state_id"]] = "Neutral"  # Middle mean return
REGIME_LABELS[state_stats_sorted[2]["state_id"]] = "Bull"     # Highest mean return

print(f"\nRegime label mapping: {REGIME_LABELS}")

# Apply labels
spy_pd["regime_label"] = spy_pd["regime_id"].map(REGIME_LABELS)

# Verify label distribution
print(f"\nRegime distribution:")
for label in ["Bull", "Neutral", "Bear"]:
    count = (spy_pd["regime_label"] == label).sum()
    pct = count / len(spy_pd) * 100
    mean_ret = spy_pd[spy_pd["regime_label"] == label]["daily_return"].mean()
    mean_vol = spy_pd[spy_pd["regime_label"] == label]["realized_vol_20d"].mean()
    print(f"  {label:8s}: {count:4d} days ({pct:5.1f}%), "
          f"avg_return={mean_ret:+.6f}, avg_vol={mean_vol:.4f}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Regime Configuration for Agent Behavior
# MAGIC Map each regime to agent behavior parameters used by the frontend simulation.

# COMMAND ----------

REGIME_CONFIG = {
    "Bull": {
        "agent_base_urgency": 1.0,
        "buy_bias": 0.55,
        "vol_threshold": 0.15,
        "skybox": "bright_cotton_candy",
        "agent_speed_multiplier": 1.0,
        "aggression_factor": 0.3,
    },
    "Neutral": {
        "agent_base_urgency": 1.3,
        "buy_bias": 0.40,
        "vol_threshold": 0.22,
        "skybox": "partly_cloudy",
        "agent_speed_multiplier": 1.2,
        "aggression_factor": 0.5,
    },
    "Bear": {
        "agent_base_urgency": 2.0,
        "buy_bias": 0.25,
        "vol_threshold": 0.30,
        "skybox": "stormy_dark",
        "agent_speed_multiplier": 1.8,
        "aggression_factor": 0.9,
    },
}

# Add regime config to DataFrame
spy_pd["agent_urgency"] = spy_pd["regime_label"].map(
    lambda r: REGIME_CONFIG[r]["agent_base_urgency"]
)
spy_pd["buy_bias"] = spy_pd["regime_label"].map(
    lambda r: REGIME_CONFIG[r]["buy_bias"]
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Visualization: Regimes Over Time

# COMMAND ----------

fig, axes = plt.subplots(3, 1, figsize=(16, 12), sharex=True)

# Color mapping for regimes
regime_colors = {"Bull": "#2ecc71", "Neutral": "#f39c12", "Bear": "#e74c3c"}

# Plot 1: SPY Close price colored by regime
ax1 = axes[0]
for regime_label, color in regime_colors.items():
    mask = spy_pd["regime_label"] == regime_label
    ax1.scatter(
        spy_pd.loc[mask, "Date"], spy_pd.loc[mask, "Close"],
        c=color, s=2, alpha=0.7, label=regime_label,
    )
ax1.set_ylabel("SPY Close Price")
ax1.set_title("Market Regime Detection: SPY Price with HMM Regimes")
ax1.legend(loc="upper left", markerscale=5)
ax1.grid(True, alpha=0.3)

# Plot 2: Daily returns colored by regime
ax2 = axes[1]
for regime_label, color in regime_colors.items():
    mask = spy_pd["regime_label"] == regime_label
    ax2.bar(
        spy_pd.loc[mask, "Date"], spy_pd.loc[mask, "daily_return"],
        color=color, alpha=0.6, width=1,
    )
ax2.set_ylabel("Daily Return")
ax2.set_title("Daily Returns by Regime")
ax2.axhline(y=0, color="black", linewidth=0.5)
ax2.grid(True, alpha=0.3)

# Plot 3: Realized volatility colored by regime
ax3 = axes[2]
for regime_label, color in regime_colors.items():
    mask = spy_pd["regime_label"] == regime_label
    ax3.scatter(
        spy_pd.loc[mask, "Date"], spy_pd.loc[mask, "realized_vol_20d"],
        c=color, s=2, alpha=0.7,
    )
ax3.set_ylabel("Realized Volatility (20d)")
ax3.set_title("Volatility by Regime")
ax3.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
ax3.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
ax3.grid(True, alpha=0.3)

plt.xticks(rotation=45)
plt.tight_layout()

# Save to DBFS
fig_path = "/tmp/regime_detection.png"
plt.savefig(fig_path, dpi=150, bbox_inches="tight")
dbutils.fs.cp(f"file:{fig_path}", "dbfs:/FileStore/sweetreturns/regime_detection.png")
print("Visualization saved to dbfs:/FileStore/sweetreturns/regime_detection.png")
plt.show()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Visualization: Regime Transition Heatmap

# COMMAND ----------

fig2, ax = plt.subplots(1, 1, figsize=(8, 6))

# Reorder transition matrix by Bull/Neutral/Bear
label_order = ["Bull", "Neutral", "Bear"]
state_order = [k for k, v in sorted(REGIME_LABELS.items(), key=lambda x: label_order.index(x[1]))]
trans_reordered = hmm_model.transmat_[np.ix_(state_order, state_order)]

im = ax.imshow(trans_reordered, cmap="YlOrRd", vmin=0, vmax=1)
ax.set_xticks(range(N_REGIMES))
ax.set_yticks(range(N_REGIMES))
ax.set_xticklabels(label_order)
ax.set_yticklabels(label_order)
ax.set_xlabel("To State")
ax.set_ylabel("From State")
ax.set_title("Regime Transition Probability Matrix")

# Add text annotations
for i in range(N_REGIMES):
    for j in range(N_REGIMES):
        text = f"{trans_reordered[i, j]:.3f}"
        ax.text(j, i, text, ha="center", va="center",
                color="white" if trans_reordered[i, j] > 0.5 else "black", fontsize=12)

plt.colorbar(im, ax=ax, label="Transition Probability")
plt.tight_layout()

fig2_path = "/tmp/regime_transitions.png"
plt.savefig(fig2_path, dpi=150, bbox_inches="tight")
dbutils.fs.cp(f"file:{fig2_path}", "dbfs:/FileStore/sweetreturns/regime_transitions.png")
print("Transition heatmap saved to dbfs:/FileStore/sweetreturns/regime_transitions.png")
plt.show()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Save Regimes to Gold Table

# COMMAND ----------

# Prepare DataFrame for writing
regime_rows = []
for _, row in spy_pd.iterrows():
    regime_rows.append((
        row["Date"].strftime("%Y-%m-%d"),
        float(row["Close"]),
        float(row["daily_return"]),
        float(row["realized_vol_20d"]),
        float(row["return_5d"]),
        int(row["regime_id"]),
        str(row["regime_label"]),
        float(row["agent_urgency"]),
        float(row["buy_bias"]),
    ))

regime_schema = StructType([
    StructField("Date", StringType(), True),
    StructField("spy_close", DoubleType(), True),
    StructField("spy_daily_return", DoubleType(), True),
    StructField("spy_realized_vol_20d", DoubleType(), True),
    StructField("spy_return_5d", DoubleType(), True),
    StructField("regime_id", IntegerType(), True),
    StructField("regime_label", StringType(), True),
    StructField("agent_base_urgency", DoubleType(), True),
    StructField("buy_bias", DoubleType(), True),
])

regime_df = spark.createDataFrame(regime_rows, schema=regime_schema)
regime_df = regime_df.withColumn("Date", F.to_date("Date", "yyyy-MM-dd"))

(regime_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.gold.market_regimes")
)

print("Gold table written: sweetreturns.gold.market_regimes")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Save HMM Model Parameters
# MAGIC Store model parameters as JSON for reproducibility and potential model serving.

# COMMAND ----------

import json

model_params = {
    "n_components": N_REGIMES,
    "covariance_type": COVARIANCE_TYPE,
    "n_iterations": N_ITERATIONS,
    "feature_columns": feature_cols,
    "regime_labels": {str(k): v for k, v in REGIME_LABELS.items()},
    "regime_config": REGIME_CONFIG,
    "means": hmm_model.means_.tolist(),
    "covars": hmm_model.covars_.tolist(),
    "transmat": hmm_model.transmat_.tolist(),
    "startprob": hmm_model.startprob_.tolist(),
    "log_likelihood": float(hmm_model.score(X)),
    "converged": bool(hmm_model.monitor_.converged),
}

params_json = json.dumps(model_params, indent=2)
dbfs_params_path = "/FileStore/sweetreturns/hmm_model_params.json"
dbutils.fs.put(dbfs_params_path, params_json, overwrite=True)
print(f"HMM model parameters saved to dbfs:{dbfs_params_path}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Quality Validation

# COMMAND ----------

spark.sql("""
    SELECT
        regime_label,
        COUNT(*) as days,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as pct,
        ROUND(AVG(spy_daily_return), 6) as avg_return,
        ROUND(STDDEV(spy_daily_return), 6) as std_return,
        ROUND(AVG(spy_realized_vol_20d), 4) as avg_vol,
        ROUND(AVG(agent_base_urgency), 2) as avg_urgency,
        ROUND(AVG(buy_bias), 2) as avg_buy_bias
    FROM sweetreturns.gold.market_regimes
    GROUP BY regime_label
    ORDER BY avg_return DESC
""").show(truncate=False)

# COMMAND ----------

# Regime during key scenario periods
spark.sql("""
    SELECT Date, spy_close, spy_daily_return, regime_label,
           agent_base_urgency, buy_bias
    FROM sweetreturns.gold.market_regimes
    WHERE Date BETWEEN '2020-02-15' AND '2020-04-01'
    ORDER BY Date
""").show(50, truncate=False)

# COMMAND ----------

# Regime transitions count
spark.sql("""
    SELECT
        prev_regime, regime_label as curr_regime, COUNT(*) as transitions
    FROM (
        SELECT regime_label,
               LAG(regime_label) OVER (ORDER BY Date) as prev_regime
        FROM sweetreturns.gold.market_regimes
    )
    WHERE prev_regime IS NOT NULL AND prev_regime != regime_label
    GROUP BY prev_regime, regime_label
    ORDER BY transitions DESC
""").show(truncate=False)
