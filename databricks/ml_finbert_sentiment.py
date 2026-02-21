# Databricks notebook source
# MAGIC %md
# MAGIC # ML: FinBERT Sentiment Analysis
# MAGIC Loads the ProsusAI/finbert model for financial sentiment scoring.
# MAGIC Applies batch sentiment analysis to news articles using a `pandas_udf`,
# MAGIC producing sentiment scores in the range [-1, +1].
# MAGIC
# MAGIC - Saves scored results to `sweetreturns.gold.news_sentiment`
# MAGIC - Registers the model with MLflow for Model Serving
# MAGIC
# MAGIC ## Prerequisites
# MAGIC - Cluster with GPU runtime (recommended) or CPU with sufficient memory
# MAGIC - `%pip install transformers torch mlflow`

# COMMAND ----------

# MAGIC %pip install transformers torch

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import DoubleType, StringType, StructType, StructField
from pyspark.sql.window import Window
import pandas as pd
import numpy as np
import mlflow
import mlflow.pyfunc

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load News Articles

# COMMAND ----------

news_df = spark.table("sweetreturns.bronze.news_articles")

# Filter to articles with titles (skip empty)
news_df = news_df.filter(
    (F.col("title").isNotNull()) & (F.length(F.trim(F.col("title"))) > 10)
)

print(f"Articles for sentiment scoring: {news_df.count()}")
news_df.select("title", "source", "published_date", "scenario", "tone").show(5, truncate=60)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load FinBERT Model
# MAGIC ProsusAI/finbert is a BERT model fine-tuned on financial text.
# MAGIC It classifies text into: positive, negative, or neutral.

# COMMAND ----------

from transformers import AutoTokenizer, AutoModelForSequenceClassification, pipeline
import torch

MODEL_NAME = "ProsusAI/finbert"

# Load tokenizer and model
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)

# Create pipeline
device = 0 if torch.cuda.is_available() else -1
finbert_pipeline = pipeline(
    "sentiment-analysis",
    model=model,
    tokenizer=tokenizer,
    device=device,
    max_length=512,
    truncation=True,
)

print(f"FinBERT loaded on {'GPU' if device == 0 else 'CPU'}")

# Quick test
test_result = finbert_pipeline("NVIDIA reports record quarterly revenue driven by AI chip demand")
print(f"Test result: {test_result}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define Pandas UDF for Batch Sentiment Scoring
# MAGIC Use a `pandas_udf` for efficient batch processing across Spark partitions.

# COMMAND ----------

# Broadcast the model name for use in UDF
BROADCAST_MODEL_NAME = spark.sparkContext.broadcast(MODEL_NAME)


@F.pandas_udf(DoubleType())
def finbert_sentiment_udf(titles: pd.Series) -> pd.Series:
    """
    Score a batch of news titles using FinBERT.

    Returns a sentiment score in the range [-1, +1]:
      - positive label -> +score
      - negative label -> -score
      - neutral label  ->  0.0

    Parameters:
        titles (pd.Series): Series of news article titles.

    Returns:
        pd.Series: Sentiment scores.
    """
    from transformers import pipeline as hf_pipeline
    import torch

    # Load model inside UDF (runs once per executor)
    device = 0 if torch.cuda.is_available() else -1
    local_pipeline = hf_pipeline(
        "sentiment-analysis",
        model=BROADCAST_MODEL_NAME.value,
        device=device,
        max_length=512,
        truncation=True,
    )

    scores = []
    # Process in mini-batches to avoid memory issues
    batch_size = 32
    title_list = titles.fillna("").tolist()

    for i in range(0, len(title_list), batch_size):
        batch = title_list[i:i + batch_size]
        # Truncate long texts to 512 chars before tokenization
        batch = [text[:512] if text else "" for text in batch]

        try:
            results = local_pipeline(batch)
            for result in results:
                label = result["label"].lower()
                score = result["score"]
                if label == "positive":
                    scores.append(score)
                elif label == "negative":
                    scores.append(-score)
                else:  # neutral
                    scores.append(0.0)
        except Exception:
            # Fallback: return 0.0 for failed batches
            scores.extend([0.0] * len(batch))

    return pd.Series(scores)


@F.pandas_udf(StringType())
def finbert_label_udf(titles: pd.Series) -> pd.Series:
    """
    Return the FinBERT label (positive/negative/neutral) for a batch of titles.
    """
    from transformers import pipeline as hf_pipeline
    import torch

    device = 0 if torch.cuda.is_available() else -1
    local_pipeline = hf_pipeline(
        "sentiment-analysis",
        model=BROADCAST_MODEL_NAME.value,
        device=device,
        max_length=512,
        truncation=True,
    )

    labels = []
    batch_size = 32
    title_list = titles.fillna("").tolist()

    for i in range(0, len(title_list), batch_size):
        batch = title_list[i:i + batch_size]
        batch = [text[:512] if text else "" for text in batch]

        try:
            results = local_pipeline(batch)
            for result in results:
                labels.append(result["label"].lower())
        except Exception:
            labels.extend(["neutral"] * len(batch))

    return pd.Series(labels)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Apply FinBERT to News Articles
# MAGIC Score all news articles with the FinBERT model.

# COMMAND ----------

# Repartition for optimal parallelism on the cluster
num_partitions = max(8, news_df.rdd.getNumPartitions())
news_partitioned = news_df.repartition(num_partitions)

# Apply sentiment UDFs
scored_news = news_partitioned.withColumn(
    "finbert_score", finbert_sentiment_udf(F.col("title"))
).withColumn(
    "finbert_label", finbert_label_udf(F.col("title"))
).withColumn(
    "sentiment_confidence", F.abs(F.col("finbert_score"))
)

# Cache for reuse
scored_news.cache()
print(f"Scored articles: {scored_news.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Aggregated Sentiment Features
# MAGIC Roll up sentiment to daily per-ticker level for downstream use.

# COMMAND ----------

# First, explode matched tickers from the news
from pyspark.sql.types import ArrayType

scored_with_tickers = scored_news.filter(
    F.col("matched_tickers_str").isNotNull()
).withColumn(
    "ticker", F.explode(F.split("matched_tickers_str", ","))
)

# Aggregate sentiment per (ticker, date)
daily_sentiment = (
    scored_with_tickers
    .groupBy("ticker", "published_date")
    .agg(
        F.count("*").alias("news_count"),
        F.avg("finbert_score").alias("sentiment_mean"),
        F.stddev("finbert_score").alias("sentiment_std"),
        F.min("finbert_score").alias("sentiment_min"),
        F.max("finbert_score").alias("sentiment_max"),
        F.avg("sentiment_confidence").alias("avg_confidence"),
        # Sentiment distribution
        F.sum(F.when(F.col("finbert_label") == "positive", 1).otherwise(0)).alias("positive_count"),
        F.sum(F.when(F.col("finbert_label") == "negative", 1).otherwise(0)).alias("negative_count"),
        F.sum(F.when(F.col("finbert_label") == "neutral", 1).otherwise(0)).alias("neutral_count"),
    )
)

# Compute positive ratio and sentiment dispersion
daily_sentiment = daily_sentiment.withColumn(
    "positive_ratio",
    F.col("positive_count").cast(DoubleType()) / F.col("news_count").cast(DoubleType())
).withColumn(
    "sentiment_dispersion",
    F.coalesce(F.col("sentiment_std"), F.lit(0.0))
)

# Rolling sentiment features
w_ticker_date = Window.partitionBy("ticker").orderBy("published_date")
w_3d = Window.partitionBy("ticker").orderBy("published_date").rowsBetween(-2, 0)

daily_sentiment = daily_sentiment.withColumn(
    "sentiment_delta_3d",
    F.col("sentiment_mean") - F.lag("sentiment_mean", 3).over(w_ticker_date)
).withColumn(
    "sentiment_momentum_3d", F.avg("sentiment_mean").over(w_3d)
)

print(f"Daily sentiment rows: {daily_sentiment.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Scored News to Gold

# COMMAND ----------

# Write the full scored news table
(scored_news
    .select(
        "title", "url", "source", "published_date", "published_timestamp",
        "tone", "scenario", "matched_tickers_str",
        "finbert_score", "finbert_label", "sentiment_confidence",
    )
    .withColumn("scored_at", F.current_timestamp())
    .write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.gold.news_sentiment")
)

print("Gold table written: sweetreturns.gold.news_sentiment")

# COMMAND ----------

# Write daily aggregated sentiment
(daily_sentiment.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.gold.daily_sentiment")
)

print("Gold table written: sweetreturns.gold.daily_sentiment")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Register Model with MLflow
# MAGIC Register the FinBERT sentiment model for potential Model Serving deployment.

# COMMAND ----------

class FinBERTSentimentModel(mlflow.pyfunc.PythonModel):
    """
    MLflow-compatible wrapper for FinBERT sentiment analysis.
    Accepts a DataFrame with a 'title' column and returns sentiment scores.
    """

    def load_context(self, context):
        from transformers import pipeline as hf_pipeline
        import torch
        device = 0 if torch.cuda.is_available() else -1
        self.pipeline = hf_pipeline(
            "sentiment-analysis",
            model="ProsusAI/finbert",
            device=device,
            max_length=512,
            truncation=True,
        )

    def predict(self, context, model_input):
        titles = model_input["title"].tolist()
        scores = []
        for title in titles:
            try:
                result = self.pipeline(title[:512])[0]
                label = result["label"].lower()
                score = result["score"]
                if label == "positive":
                    scores.append(score)
                elif label == "negative":
                    scores.append(-score)
                else:
                    scores.append(0.0)
            except Exception:
                scores.append(0.0)
        return pd.DataFrame({"sentiment_score": scores})

# COMMAND ----------

# Log and register the model
with mlflow.start_run(run_name="finbert_sentiment_v1") as run:
    # Log model parameters
    mlflow.log_param("model_name", MODEL_NAME)
    mlflow.log_param("max_length", 512)
    mlflow.log_param("score_range", "[-1.0, 1.0]")

    # Log metrics from the scored data
    sentiment_stats = scored_news.select(
        F.avg("finbert_score").alias("avg_score"),
        F.stddev("finbert_score").alias("std_score"),
        F.count("*").alias("total_scored"),
    ).collect()[0]

    mlflow.log_metric("avg_sentiment_score", float(sentiment_stats["avg_score"] or 0))
    mlflow.log_metric("std_sentiment_score", float(sentiment_stats["std_score"] or 0))
    mlflow.log_metric("total_articles_scored", int(sentiment_stats["total_scored"]))

    # Log label distribution
    label_dist = scored_news.groupBy("finbert_label").count().collect()
    for row in label_dist:
        mlflow.log_metric(f"count_{row['finbert_label']}", row["count"])

    # Log the model
    mlflow.pyfunc.log_model(
        artifact_path="finbert_sentiment",
        python_model=FinBERTSentimentModel(),
        pip_requirements=["transformers", "torch"],
    )

    print(f"Model logged with run_id: {run.info.run_id}")

# Register in MLflow Model Registry
model_uri = f"runs:/{run.info.run_id}/finbert_sentiment"
try:
    registered_model = mlflow.register_model(
        model_uri=model_uri,
        name="sweetreturns-finbert-sentiment",
    )
    print(f"Model registered: {registered_model.name} version {registered_model.version}")
except Exception as e:
    print(f"Model registration note: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Quality Validation

# COMMAND ----------

spark.sql("""
    SELECT
        finbert_label,
        COUNT(*) as count,
        ROUND(AVG(finbert_score), 4) as avg_score,
        ROUND(STDDEV(finbert_score), 4) as std_score,
        ROUND(AVG(sentiment_confidence), 4) as avg_confidence
    FROM sweetreturns.gold.news_sentiment
    GROUP BY finbert_label
    ORDER BY count DESC
""").show()

# COMMAND ----------

# Sentiment by scenario
spark.sql("""
    SELECT
        scenario,
        COUNT(*) as articles,
        ROUND(AVG(finbert_score), 4) as avg_sentiment,
        ROUND(STDDEV(finbert_score), 4) as sentiment_std,
        SUM(CASE WHEN finbert_label = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN finbert_label = 'negative' THEN 1 ELSE 0 END) as negative,
        SUM(CASE WHEN finbert_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count
    FROM sweetreturns.gold.news_sentiment
    GROUP BY scenario
    ORDER BY scenario
""").show(truncate=False)

# COMMAND ----------

# Sample scored articles
spark.sql("""
    SELECT finbert_label, ROUND(finbert_score, 3) as score,
           SUBSTRING(title, 1, 80) as title_preview, scenario
    FROM sweetreturns.gold.news_sentiment
    ORDER BY ABS(finbert_score) DESC
    LIMIT 15
""").show(truncate=False)
