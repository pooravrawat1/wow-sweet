# Databricks notebook source
# MAGIC %md
# MAGIC # ML: LightGBM Trade Direction Classifier
# MAGIC Trains a multi-class LightGBM model to predict the optimal trade action
# MAGIC (BUY, CALL, PUT, SHORT) for each stock on each trading date.
# MAGIC
# MAGIC - **Labels:** Optimal profit action — which of 4 actions would have maximized
# MAGIC   profit given actual 5-day forward price movement
# MAGIC - **Features:** 25+ technical indicators from silver.daily_features (NO forward returns)
# MAGIC - **Train/test split:** Time-based (last 20% of dates = test, NO random shuffle)
# MAGIC - **Logs:** Model, metrics, confusion matrix, and feature importance to MLflow
# MAGIC - **Output:** `sweetreturns.gold.ml_trade_signals`
# MAGIC
# MAGIC ## Prerequisites
# MAGIC - `%pip install lightgbm mlflow matplotlib seaborn scikit-learn`

# COMMAND ----------

# MAGIC %pip install lightgbm mlflow matplotlib seaborn scikit-learn

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType
from pyspark.sql.window import Window
import pandas as pd
import numpy as np
import lightgbm as lgb
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix, f1_score
)
from sklearn.preprocessing import LabelEncoder
import mlflow
import mlflow.lightgbm
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
import math
import warnings
warnings.filterwarnings("ignore", category=UserWarning)

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

# Label engineering
OPTION_PREMIUM_FACTOR = 1.0   # premium = realized_vol_20d * sqrt(5/252) * factor
FWD_HORIZON = "fwd_return_5d"  # forward return column for labels

# Train/test split
TEST_FRACTION = 0.20  # last 20% of dates = test set

# LightGBM hyperparameters
LGBM_PARAMS = {
    "objective": "multiclass",
    "num_class": 4,
    "metric": "multi_logloss",
    "boosting_type": "gbdt",
    "num_leaves": 63,
    "learning_rate": 0.05,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "verbose": -1,
    "n_jobs": -1,
    "seed": 42,
    "class_weight": "balanced",
}
NUM_BOOST_ROUND = 500
EARLY_STOPPING_ROUNDS = 30

ACTION_LABELS = ["BUY", "CALL", "PUT", "SHORT"]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Silver Features & Compute Optimal Action Labels
# MAGIC
# MAGIC Label = argmax(BUY_profit, CALL_profit, PUT_profit, SHORT_profit)
# MAGIC - BUY profit  = fwd_return_5d
# MAGIC - SHORT profit = -fwd_return_5d
# MAGIC - CALL profit  = max(0, fwd_return_5d) - premium
# MAGIC - PUT profit   = max(0, -fwd_return_5d) - premium
# MAGIC - premium ≈ realized_vol_20d × √(5/252)

# COMMAND ----------

silver_df = spark.table("sweetreturns.silver.daily_features")
print(f"Silver rows: {silver_df.count()}")

# Filter to rows where we have forward returns AND volatility for premium calc
labeled_df = silver_df.filter(
    F.col("fwd_return_5d").isNotNull() &
    F.col("realized_vol_20d").isNotNull() &
    F.col("realized_vol_20d") > 0
)

SQRT_5_252 = math.sqrt(5.0 / 252.0)

# Compute action profits
labeled_df = (
    labeled_df
    .withColumn("premium",
                F.col("realized_vol_20d") * F.lit(SQRT_5_252) * F.lit(OPTION_PREMIUM_FACTOR))
    .withColumn("buy_profit", F.col("fwd_return_5d"))
    .withColumn("short_profit", -F.col("fwd_return_5d"))
    .withColumn("call_profit",
                F.greatest(F.lit(0.0), F.col("fwd_return_5d")) - F.col("premium"))
    .withColumn("put_profit",
                F.greatest(F.lit(0.0), -F.col("fwd_return_5d")) - F.col("premium"))
)

# Optimal action = argmax of the 4 profits
labeled_df = labeled_df.withColumn(
    "optimal_action",
    F.when(
        (F.col("buy_profit") >= F.col("short_profit")) &
        (F.col("buy_profit") >= F.col("call_profit")) &
        (F.col("buy_profit") >= F.col("put_profit")),
        F.lit("BUY")
    ).when(
        (F.col("short_profit") >= F.col("buy_profit")) &
        (F.col("short_profit") >= F.col("call_profit")) &
        (F.col("short_profit") >= F.col("put_profit")),
        F.lit("SHORT")
    ).when(
        F.col("call_profit") >= F.col("put_profit"),
        F.lit("CALL")
    ).otherwise(F.lit("PUT"))
)

print(f"Labeled rows: {labeled_df.count()}")
labeled_df.groupBy("optimal_action").count().orderBy("count", ascending=False).show()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Feature Selection
# MAGIC Use all numeric silver features EXCEPT forward-looking ones (data leakage).
# MAGIC Add cross-sectional rank features (percentile within each date).

# COMMAND ----------

# Features to EXCLUDE (forward-looking = data leakage, or non-numeric/internal)
EXCLUDED_COLS = {
    # Forward-looking (leakage)
    "fwd_return_5d", "fwd_return_20d", "fwd_return_60d",
    "fwd_60d_skew", "fwd_60d_p5", "fwd_60d_p25", "fwd_60d_median",
    "fwd_60d_p75", "fwd_60d_p95",
    "close_fwd_5d", "close_fwd_20d", "close_fwd_60d",
    "fwd_60d_returns",
    # Identifiers / non-numeric
    "ticker", "Date", "sector", "vol_regime", "company_name", "industry",
    # Raw OHLCV (captured in derived features)
    "Open", "High", "Low", "Close", "Volume", "Dividends", "stock_splits",
    # Internal intermediaries
    "premium", "buy_profit", "short_profit", "call_profit", "put_profit",
    "optimal_action",
    "prev_close", "expanding_max_close", "gain", "loss",
    "avg_gain_14", "avg_loss_14", "rs_14",
    "ema_12", "ema_26", "bb_std",
    "prev_close_atr", "tr",
    "mean_20d", "std_20d", "mean_60d", "std_60d",
    "rolling_return_20d", "rolling_return_20d_lag1",
    "spy_close", "median_drawdown",
}

# Determine numeric feature columns
all_cols = set(labeled_df.columns)
feature_cols = sorted(all_cols - EXCLUDED_COLS)

# Filter to only numeric types
numeric_types = {"double", "float", "int", "bigint", "long", "short", "decimal"}
schema_map = {f.name: f.dataType.simpleString() for f in labeled_df.schema.fields}
feature_cols = [c for c in feature_cols if schema_map.get(c, "") in numeric_types]

# Encode vol_regime as binary
labeled_df = labeled_df.withColumn(
    "vol_regime_encoded",
    F.when(F.col("vol_regime") == "favorable", F.lit(1.0)).otherwise(F.lit(0.0))
)
feature_cols.append("vol_regime_encoded")

# Add cross-sectional rank features (percentile within each date)
w_date = Window.partitionBy("Date")
for rank_col in ["daily_return", "realized_vol_20d", "rsi_14", "drawdown_pct"]:
    if rank_col in all_cols:
        rank_name = f"xsrank_{rank_col}"
        labeled_df = labeled_df.withColumn(
            rank_name,
            F.percent_rank().over(w_date.orderBy(F.col(rank_col).asc()))
        )
        feature_cols.append(rank_name)

print(f"Feature columns ({len(feature_cols)}):")
for fc in sorted(feature_cols):
    print(f"  {fc}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Time-Based Train/Test Split
# MAGIC First 80% of dates → train. Last 20% → test. No random shuffle.

# COMMAND ----------

# Convert to pandas for LightGBM
pdf = labeled_df.select(
    "ticker", "Date", "optimal_action", *feature_cols
).toPandas()

pdf["Date"] = pd.to_datetime(pdf["Date"])
pdf = pdf.sort_values("Date").reset_index(drop=True)

# Drop rows with NaN in feature columns
pdf = pdf.dropna(subset=feature_cols)
print(f"Rows after NaN drop: {len(pdf):,}")

# Determine cutoff date
unique_dates = sorted(pdf["Date"].unique())
n_dates = len(unique_dates)
cutoff_idx = int(n_dates * (1 - TEST_FRACTION))
cutoff_date = unique_dates[cutoff_idx]

train_mask = pdf["Date"] < cutoff_date
test_mask = pdf["Date"] >= cutoff_date

X_train = pdf.loc[train_mask, feature_cols].values.astype(np.float32)
X_test = pdf.loc[test_mask, feature_cols].values.astype(np.float32)

le = LabelEncoder()
le.fit(ACTION_LABELS)
y_train = le.transform(pdf.loc[train_mask, "optimal_action"])
y_test = le.transform(pdf.loc[test_mask, "optimal_action"])

print(f"Train: {len(X_train):,} rows ({cutoff_idx} dates, up to {cutoff_date.date()})")
print(f"Test:  {len(X_test):,} rows ({n_dates - cutoff_idx} dates, from {cutoff_date.date()})")
print(f"\nLabel distribution (train):")
for label, count in zip(*np.unique(y_train, return_counts=True)):
    print(f"  {le.inverse_transform([label])[0]}: {count:,} "
          f"({count / len(y_train) * 100:.1f}%)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Train LightGBM with MLflow

# COMMAND ----------

train_data = lgb.Dataset(X_train, label=y_train, feature_name=feature_cols)
val_data = lgb.Dataset(X_test, label=y_test, feature_name=feature_cols,
                       reference=train_data)

with mlflow.start_run(run_name="lgbm_trade_direction_v1") as run:
    # Log parameters
    mlflow.log_params(LGBM_PARAMS)
    mlflow.log_param("num_boost_round", NUM_BOOST_ROUND)
    mlflow.log_param("early_stopping_rounds", EARLY_STOPPING_ROUNDS)
    mlflow.log_param("n_features", len(feature_cols))
    mlflow.log_param("n_train", len(X_train))
    mlflow.log_param("n_test", len(X_test))
    mlflow.log_param("cutoff_date", str(cutoff_date.date()))
    mlflow.log_param("fwd_horizon", FWD_HORIZON)
    mlflow.log_param("option_premium_factor", OPTION_PREMIUM_FACTOR)

    callbacks = [
        lgb.early_stopping(EARLY_STOPPING_ROUNDS),
        lgb.log_evaluation(50),
    ]

    model = lgb.train(
        LGBM_PARAMS,
        train_data,
        num_boost_round=NUM_BOOST_ROUND,
        valid_sets=[train_data, val_data],
        valid_names=["train", "test"],
        callbacks=callbacks,
    )

    # Predict on test set
    y_pred_proba = model.predict(X_test)
    y_pred = y_pred_proba.argmax(axis=1)

    # Metrics
    accuracy = accuracy_score(y_test, y_pred)
    f1_macro = f1_score(y_test, y_pred, average="macro")
    f1_weighted = f1_score(y_test, y_pred, average="weighted")
    f1_per_class = f1_score(y_test, y_pred, average=None)

    mlflow.log_metric("test_accuracy", accuracy)
    mlflow.log_metric("test_f1_macro", f1_macro)
    mlflow.log_metric("test_f1_weighted", f1_weighted)
    for i, label in enumerate(ACTION_LABELS):
        mlflow.log_metric(f"test_f1_{label}", f1_per_class[i])

    print(f"\nTest Accuracy: {accuracy:.4f}")
    print(f"F1 Macro:      {f1_macro:.4f}")
    print(f"F1 Weighted:   {f1_weighted:.4f}")
    print(f"\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=ACTION_LABELS))

    # Log model artifact
    mlflow.lightgbm.log_model(model, "lgbm_trade_direction",
                               input_example=X_test[:5])

    print(f"MLflow run_id: {run.info.run_id}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Confusion Matrix & Feature Importance

# COMMAND ----------

    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    fig, axes = plt.subplots(1, 2, figsize=(18, 6))

    sns.heatmap(cm, annot=True, fmt="d", cmap="YlOrRd",
                xticklabels=ACTION_LABELS, yticklabels=ACTION_LABELS,
                ax=axes[0])
    axes[0].set_xlabel("Predicted")
    axes[0].set_ylabel("Actual")
    axes[0].set_title(f"Confusion Matrix (Accuracy={accuracy:.3f})")

    # Feature importance (top 20 by gain)
    importance = model.feature_importance(importance_type="gain")
    feat_imp = (pd.DataFrame({"feature": feature_cols, "importance": importance})
                .sort_values("importance", ascending=False)
                .head(20))

    axes[1].barh(feat_imp["feature"], feat_imp["importance"], color="#3498db")
    axes[1].set_xlabel("Importance (Gain)")
    axes[1].set_title("Top 20 Features by Gain")
    axes[1].invert_yaxis()

    plt.tight_layout()
    fig_path = "/tmp/lgbm_trade_direction_eval.png"
    plt.savefig(fig_path, dpi=150, bbox_inches="tight")
    mlflow.log_artifact(fig_path)
    dbutils.fs.cp(f"file:{fig_path}",
                  "dbfs:/FileStore/sweetreturns/lgbm_trade_direction_eval.png")
    plt.show()
    print("Evaluation artifacts saved.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Inference: Score All Dates
# MAGIC Generate direction probabilities for every (ticker, date) in silver.

# COMMAND ----------

# Prepare full dataset
full_pdf = labeled_df.select("ticker", "Date", *feature_cols).toPandas()
full_pdf["Date"] = pd.to_datetime(full_pdf["Date"])
full_pdf = full_pdf.dropna(subset=feature_cols)

X_full = full_pdf[feature_cols].values.astype(np.float32)

# Predict probabilities: (N, 4) → [BUY, CALL, PUT, SHORT]
pred_proba = model.predict(X_full)

full_pdf["ml_action"] = le.inverse_transform(pred_proba.argmax(axis=1))
full_pdf["buy_prob"] = pred_proba[:, le.transform(["BUY"])[0]]
full_pdf["call_prob"] = pred_proba[:, le.transform(["CALL"])[0]]
full_pdf["put_prob"] = pred_proba[:, le.transform(["PUT"])[0]]
full_pdf["short_prob"] = pred_proba[:, le.transform(["SHORT"])[0]]
full_pdf["ml_confidence"] = pred_proba.max(axis=1)

print(f"Predictions generated: {len(full_pdf):,} rows")
print(f"\nAction distribution:")
print(full_pdf["ml_action"].value_counts())

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write to Gold Table: sweetreturns.gold.ml_trade_signals

# COMMAND ----------

output_pdf = full_pdf[[
    "ticker", "Date", "ml_action",
    "buy_prob", "call_prob", "put_prob", "short_prob",
    "ml_confidence",
]].copy()
output_pdf["Date"] = output_pdf["Date"].dt.strftime("%Y-%m-%d")

signal_schema = StructType([
    StructField("ticker", StringType(), False),
    StructField("date", StringType(), False),
    StructField("ml_action", StringType(), False),
    StructField("buy_prob", DoubleType(), False),
    StructField("call_prob", DoubleType(), False),
    StructField("put_prob", DoubleType(), False),
    StructField("short_prob", DoubleType(), False),
    StructField("ml_confidence", DoubleType(), False),
])

signal_rows = [tuple(row) for row in output_pdf.itertuples(index=False, name=None)]
signal_df = spark.createDataFrame(signal_rows, schema=signal_schema)
signal_df = (
    signal_df
    .withColumn("date", F.to_date("date", "yyyy-MM-dd"))
    .withColumn("model_version", F.lit("lgbm_v1"))
    .withColumn("scored_at", F.current_timestamp())
)

(signal_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.gold.ml_trade_signals")
)

print("Gold table written: sweetreturns.gold.ml_trade_signals")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Register Model & Quality Validation

# COMMAND ----------

# Register in MLflow Model Registry
model_uri = f"runs:/{run.info.run_id}/lgbm_trade_direction"
try:
    registered = mlflow.register_model(
        model_uri=model_uri,
        name="sweetreturns-lgbm-trade-direction",
    )
    print(f"Model registered: {registered.name} version {registered.version}")
except Exception as e:
    print(f"Model registration note: {e}")

# Quality validation
print("\n── Action distribution with avg confidence ──")
spark.sql("""
    SELECT
        ml_action,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as pct,
        ROUND(AVG(ml_confidence), 4) as avg_confidence,
        ROUND(AVG(buy_prob), 4) as avg_buy,
        ROUND(AVG(call_prob), 4) as avg_call,
        ROUND(AVG(put_prob), 4) as avg_put,
        ROUND(AVG(short_prob), 4) as avg_short
    FROM sweetreturns.gold.ml_trade_signals
    GROUP BY ml_action
    ORDER BY count DESC
""").show(truncate=False)

print("── Coverage stats ──")
spark.sql("""
    SELECT
        COUNT(DISTINCT date) as dates_covered,
        COUNT(DISTINCT ticker) as tickers_covered,
        COUNT(*) as total_predictions,
        MIN(date) as first_date,
        MAX(date) as last_date
    FROM sweetreturns.gold.ml_trade_signals
""").show(truncate=False)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Save Model Parameters to DBFS

# COMMAND ----------

import json

model_info = {
    "model_type": "LightGBM",
    "objective": "multiclass (BUY/CALL/PUT/SHORT)",
    "label_strategy": "optimal_profit_action",
    "fwd_horizon": FWD_HORIZON,
    "option_premium_factor": OPTION_PREMIUM_FACTOR,
    "feature_columns": feature_cols,
    "n_features": len(feature_cols),
    "lgbm_params": LGBM_PARAMS,
    "num_boost_round": NUM_BOOST_ROUND,
    "early_stopping_rounds": EARLY_STOPPING_ROUNDS,
    "test_fraction": TEST_FRACTION,
    "metrics": {
        "accuracy": round(accuracy, 4),
        "f1_macro": round(f1_macro, 4),
        "f1_weighted": round(f1_weighted, 4),
        "f1_per_class": {
            label: round(float(f1_per_class[i]), 4)
            for i, label in enumerate(ACTION_LABELS)
        },
    },
    "mlflow_run_id": run.info.run_id,
}

params_json = json.dumps(model_info, indent=2)
dbutils.fs.put("/FileStore/sweetreturns/lgbm_trade_direction_params.json",
               params_json, overwrite=True)
print("Model parameters saved to DBFS.")
