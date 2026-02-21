# Databricks notebook source
# MAGIC %md
# MAGIC # Silver Layer: Multimodal Feature Engineering
# MAGIC Reads bronze stock data and news articles, extracts ticker mentions from news titles
# MAGIC via regex, computes daily news volume per ticker, and joins to stock data.
# MAGIC
# MAGIC Produces an enriched stock dataset with news-derived features for downstream
# MAGIC sentiment analysis and agent decision-making.
# MAGIC
# MAGIC Writes to `sweetreturns.silver.stocks_with_news` Delta table.

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import ArrayType, StringType, DoubleType, IntegerType
import re

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Read Bronze Tables

# COMMAND ----------

# Stock data from bronze (or silver daily features if available)
try:
    stock_df = spark.table("sweetreturns.silver.daily_features")
    print(f"Using silver.daily_features: {stock_df.count()} rows")
except Exception:
    stock_df = spark.table("sweetreturns.bronze.raw_stock_data")
    print(f"Using bronze.raw_stock_data: {stock_df.count()} rows")

stock_df.printSchema()

# COMMAND ----------

# News articles from bronze
news_df = spark.table("sweetreturns.bronze.news_articles")
print(f"News articles: {news_df.count()} rows")
news_df.printSchema()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Extract Ticker Mentions from News Titles
# MAGIC Use regex to find stock ticker symbols in article titles.
# MAGIC We look for both `$TICKER` patterns and known company names.

# COMMAND ----------

# Full ticker-to-keyword mapping for all sectors
TICKER_KEYWORDS = {
    # Technology
    "AAPL": ["Apple", "AAPL"],
    "MSFT": ["Microsoft", "MSFT"],
    "NVDA": ["NVIDIA", "Nvidia", "NVDA"],
    "GOOGL": ["Google", "Alphabet", "GOOGL", "GOOG"],
    "META": ["Meta Platforms", "Facebook", "META"],
    "AMZN": ["Amazon", "AMZN"],
    "TSLA": ["Tesla", "TSLA"],
    "AMD": ["AMD", "Advanced Micro Devices"],
    "INTC": ["Intel", "INTC"],
    "CRM": ["Salesforce", "CRM"],
    "ADBE": ["Adobe", "ADBE"],
    "ORCL": ["Oracle", "ORCL"],
    # Healthcare
    "UNH": ["UnitedHealth", "UNH"],
    "JNJ": ["Johnson & Johnson", "J&J", "JNJ"],
    "LLY": ["Eli Lilly", "LLY"],
    "PFE": ["Pfizer", "PFE"],
    "MRNA": ["Moderna", "MRNA"],
    "ABBV": ["AbbVie", "ABBV"],
    "MRK": ["Merck", "MRK"],
    # Financials
    "JPM": ["JPMorgan", "JP Morgan", "JPM"],
    "BAC": ["Bank of America", "BAC"],
    "GS": ["Goldman Sachs", "GS"],
    "MS": ["Morgan Stanley"],
    "WFC": ["Wells Fargo", "WFC"],
    # Consumer Discretionary
    "HD": ["Home Depot", "HD"],
    "MCD": ["McDonald", "MCD"],
    "NKE": ["Nike", "NKE"],
    "SBUX": ["Starbucks", "SBUX"],
    # Meme stocks
    "GME": ["GameStop", "GME"],
    "AMC": ["AMC Entertainment", "AMC"],
    "BB": ["BlackBerry"],
    "BBBY": ["Bed Bath", "BBBY"],
    # Energy
    "XOM": ["ExxonMobil", "Exxon", "XOM"],
    "CVX": ["Chevron", "CVX"],
    "COP": ["ConocoPhillips", "COP"],
    # Market indices/ETFs
    "SPY": ["S&P 500", "S&P500", "SPY"],
    "QQQ": ["Nasdaq", "QQQ"],
}


@F.udf(ArrayType(StringType()))
def extract_tickers_udf(title):
    """Extract ticker symbols mentioned in a news article title."""
    if not title:
        return []
    title_text = title.lower()
    matched = []
    for ticker, keywords in TICKER_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in title_text:
                matched.append(ticker)
                break
    return matched

# COMMAND ----------

# MAGIC %md
# MAGIC ## Apply Ticker Extraction to News

# COMMAND ----------

# Extract tickers from news titles
news_with_tickers = news_df.withColumn(
    "extracted_tickers", extract_tickers_udf(F.col("title"))
).withColumn(
    "has_ticker_match", F.size("extracted_tickers") > 0
)

# Explode to create one row per (article, ticker) pair
news_exploded = (
    news_with_tickers
    .filter(F.size("extracted_tickers") > 0)
    .withColumn("ticker", F.explode("extracted_tickers"))
    .select(
        "ticker",
        F.col("published_date").alias("news_date"),
        "title",
        "source",
        "tone",
        "scenario",
    )
)

print(f"News-ticker pairs: {news_exploded.count()}")
news_exploded.show(10, truncate=False)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Daily News Features per Ticker
# MAGIC Aggregate news data per (ticker, date) to produce features.

# COMMAND ----------

daily_news_features = (
    news_exploded
    .groupBy("ticker", "news_date")
    .agg(
        F.count("*").alias("news_count"),
        F.avg("tone").alias("avg_news_tone"),
        F.stddev("tone").alias("std_news_tone"),
        F.min("tone").alias("min_news_tone"),
        F.max("tone").alias("max_news_tone"),
        F.countDistinct("source").alias("unique_sources"),
        F.collect_list("title").alias("news_titles"),
        F.first("scenario").alias("news_scenario"),
    )
)

# Replace null std with 0 (happens when only 1 article)
daily_news_features = daily_news_features.withColumn(
    "std_news_tone", F.coalesce(F.col("std_news_tone"), F.lit(0.0))
)

print(f"Daily news features rows: {daily_news_features.count()}")
daily_news_features.show(10, truncate=False)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Rolling News Features
# MAGIC Add rolling windows for news volume and sentiment trends.

# COMMAND ----------

w_ticker_date = Window.partitionBy("ticker").orderBy("news_date")
w_3d = Window.partitionBy("ticker").orderBy("news_date").rowsBetween(-2, 0)
w_7d = Window.partitionBy("ticker").orderBy("news_date").rowsBetween(-6, 0)

daily_news_features = daily_news_features.withColumn(
    "news_count_3d_avg", F.avg("news_count").over(w_3d)
).withColumn(
    "news_count_7d_avg", F.avg("news_count").over(w_7d)
).withColumn(
    "news_tone_3d_avg", F.avg("avg_news_tone").over(w_3d)
).withColumn(
    "news_tone_delta_3d",
    F.col("avg_news_tone") - F.lag("avg_news_tone", 3).over(w_ticker_date)
).withColumn(
    "news_count_zscore",
    F.when(
        F.stddev("news_count").over(w_7d) > 0,
        (F.col("news_count") - F.avg("news_count").over(w_7d)) / F.stddev("news_count").over(w_7d)
    ).otherwise(0.0)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Join News Features to Stock Data
# MAGIC Left join so all stock rows are preserved; tickers without news get null news features.

# COMMAND ----------

# Rename news_date to match stock Date column
news_features_for_join = daily_news_features.withColumnRenamed("news_date", "Date")

# Drop the collected titles array (too large for join) and keep only numeric features
news_cols_to_join = [
    "ticker", "Date",
    "news_count", "avg_news_tone", "std_news_tone",
    "min_news_tone", "max_news_tone", "unique_sources",
    "news_scenario",
    "news_count_3d_avg", "news_count_7d_avg",
    "news_tone_3d_avg", "news_tone_delta_3d", "news_count_zscore",
]

news_join_df = news_features_for_join.select(*news_cols_to_join)

# Left join on (ticker, Date)
stocks_with_news = stock_df.join(
    news_join_df,
    on=["ticker", "Date"],
    how="left",
)

# Fill nulls for stocks with no news on a given day
stocks_with_news = stocks_with_news.withColumn(
    "news_count", F.coalesce(F.col("news_count"), F.lit(0))
).withColumn(
    "avg_news_tone", F.coalesce(F.col("avg_news_tone"), F.lit(0.0))
).withColumn(
    "std_news_tone", F.coalesce(F.col("std_news_tone"), F.lit(0.0))
).withColumn(
    "unique_sources", F.coalesce(F.col("unique_sources"), F.lit(0))
).withColumn(
    "news_count_zscore", F.coalesce(F.col("news_count_zscore"), F.lit(0.0))
).withColumn(
    "has_news", F.when(F.col("news_count") > 0, F.lit(True)).otherwise(F.lit(False))
)

print(f"Stocks with news features: {stocks_with_news.count()} rows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute News Attention Score
# MAGIC A composite score that captures unusual news activity for a ticker.

# COMMAND ----------

# News attention score: combines volume spike and tone extremity
stocks_with_news = stocks_with_news.withColumn(
    "news_attention_score",
    F.when(
        F.col("has_news"),
        (
            F.lit(0.5) * F.abs(F.col("news_count_zscore")) +
            F.lit(0.3) * F.abs(F.col("avg_news_tone")) +
            F.lit(0.2) * F.col("std_news_tone")
        )
    ).otherwise(F.lit(0.0))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write to Silver Delta Table

# COMMAND ----------

(stocks_with_news.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.silver.stocks_with_news")
)

print("Silver table written: sweetreturns.silver.stocks_with_news")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Quality Validation

# COMMAND ----------

spark.sql("""
    SELECT
        COUNT(*) as total_rows,
        COUNT(DISTINCT ticker) as unique_tickers,
        SUM(CASE WHEN has_news THEN 1 ELSE 0 END) as rows_with_news,
        ROUND(AVG(news_count), 3) as avg_news_per_row,
        ROUND(AVG(CASE WHEN has_news THEN avg_news_tone ELSE NULL END), 4) as avg_tone_when_news,
        ROUND(AVG(news_attention_score), 4) as avg_attention_score
    FROM sweetreturns.silver.stocks_with_news
""").show(truncate=False)

# COMMAND ----------

# Top tickers by news coverage
spark.sql("""
    SELECT ticker, SUM(news_count) as total_articles,
           ROUND(AVG(avg_news_tone), 4) as avg_tone,
           COUNT(DISTINCT Date) as days_with_news
    FROM sweetreturns.silver.stocks_with_news
    WHERE has_news = true
    GROUP BY ticker
    ORDER BY total_articles DESC
    LIMIT 20
""").show(truncate=False)

# COMMAND ----------

# News coverage by scenario
spark.sql("""
    SELECT news_scenario, COUNT(*) as rows,
           COUNT(DISTINCT ticker) as tickers,
           ROUND(AVG(avg_news_tone), 4) as avg_tone,
           ROUND(AVG(news_attention_score), 4) as avg_attention
    FROM sweetreturns.silver.stocks_with_news
    WHERE news_scenario IS NOT NULL
    GROUP BY news_scenario
    ORDER BY news_scenario
""").show(truncate=False)
