# Databricks notebook source
# MAGIC %md
# MAGIC # Bronze Layer: News Ingestion (GDELT API)
# MAGIC Fetches financial news articles from GDELT's DOC API for historical market scenarios:
# MAGIC - **COVID Crash** (Feb-Mar 2020)
# MAGIC - **GME Squeeze** (Jan-Feb 2021)
# MAGIC - **AI Boom** (Jan-Jun 2023)
# MAGIC
# MAGIC Writes to `sweetreturns.bronze.news_articles` Delta table.

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType,
    DoubleType, IntegerType, ArrayType
)
import requests
import json
import time
from datetime import datetime, timedelta

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration
# MAGIC Define historical scenarios and query parameters for GDELT DOC API.

# COMMAND ----------

# GDELT DOC 2.0 API endpoint
GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"

# Historical scenarios with date ranges and search terms
SCENARIOS = {
    "covid_crash": {
        "start": "2020-02-01",
        "end": "2020-03-31",
        "queries": [
            "stock market crash coronavirus",
            "pandemic economy recession",
            "federal reserve emergency rate cut",
            "oil price collapse",
            "circuit breaker trading halt",
        ],
        "description": "COVID-19 pandemic market crash",
    },
    "gme_squeeze": {
        "start": "2021-01-15",
        "end": "2021-02-15",
        "queries": [
            "GameStop short squeeze wallstreetbets",
            "AMC meme stock retail investors",
            "Robinhood trading halt GameStop",
            "hedge fund short selling reddit",
            "retail investors vs wall street",
        ],
        "description": "GameStop / meme stock short squeeze",
    },
    "ai_boom": {
        "start": "2023-01-01",
        "end": "2023-06-30",
        "queries": [
            "artificial intelligence stock market boom",
            "NVIDIA AI chip demand",
            "ChatGPT impact technology stocks",
            "AI investment opportunities",
            "tech rally artificial intelligence",
        ],
        "description": "AI-driven tech rally (ChatGPT era)",
    },
}

# Ticker keywords for matching articles to specific stocks
TICKER_KEYWORDS = {
    "AAPL": ["Apple", "AAPL"],
    "MSFT": ["Microsoft", "MSFT"],
    "NVDA": ["NVIDIA", "Nvidia", "NVDA"],
    "GOOGL": ["Google", "Alphabet", "GOOGL"],
    "META": ["Meta", "Facebook", "META"],
    "AMZN": ["Amazon", "AMZN"],
    "TSLA": ["Tesla", "TSLA"],
    "JPM": ["JPMorgan", "JP Morgan", "JPM"],
    "GME": ["GameStop", "GME"],
    "AMC": ["AMC Entertainment", "AMC"],
    "SPY": ["S&P 500", "S&P500", "SPY", "stock market"],
    "XOM": ["ExxonMobil", "Exxon", "XOM"],
    "PFE": ["Pfizer", "PFE"],
    "MRNA": ["Moderna", "MRNA"],
    "BA": ["Boeing", "BA"],
    "DAL": ["Delta Air Lines", "DAL"],
    "CCL": ["Carnival", "CCL"],
    "ZM": ["Zoom Video", "ZM"],
    "CRM": ["Salesforce", "CRM"],
    "AMD": ["AMD", "Advanced Micro"],
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## GDELT DOC API Fetcher
# MAGIC The GDELT DOC 2.0 API returns articles matching a keyword query within a time range.
# MAGIC We paginate through results and extract title, URL, source, date, and tone.

# COMMAND ----------

def fetch_gdelt_articles(query, start_date, end_date, max_records=250):
    """
    Fetch articles from GDELT DOC 2.0 API.

    Parameters:
        query (str): Search query string.
        start_date (str): Start date in YYYY-MM-DD format.
        end_date (str): End date in YYYY-MM-DD format.
        max_records (int): Maximum number of records to fetch per query.

    Returns:
        list[dict]: List of article dictionaries.
    """
    # Convert dates to GDELT format (YYYYMMDDHHMMSS)
    start_ts = start_date.replace("-", "") + "000000"
    end_ts = end_date.replace("-", "") + "235959"

    params = {
        "query": query,
        "mode": "artlist",
        "maxrecords": str(min(max_records, 250)),
        "startdatetime": start_ts,
        "enddatetime": end_ts,
        "format": "json",
        "sort": "datedesc",
    }

    articles = []
    try:
        response = requests.get(GDELT_DOC_API, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if "articles" in data:
            for art in data["articles"]:
                articles.append({
                    "title": art.get("title", ""),
                    "url": art.get("url", ""),
                    "source": art.get("domain", art.get("source", "")),
                    "published_at": art.get("seendate", ""),
                    "language": art.get("language", "English"),
                    "tone": float(art.get("tone", 0.0)),
                    "query": query,
                })
    except requests.exceptions.RequestException as e:
        print(f"  [WARN] GDELT request failed for query '{query}': {e}")
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  [WARN] GDELT response parse error for query '{query}': {e}")

    return articles


def parse_gdelt_date(date_str):
    """Parse GDELT date string (YYYYMMDDTHHMMSS or similar) to datetime."""
    if not date_str:
        return None
    try:
        # GDELT uses YYYYMMDDTHHMMSS format
        clean = date_str.replace("T", "").replace("Z", "")[:14]
        return datetime.strptime(clean, "%Y%m%d%H%M%S")
    except (ValueError, IndexError):
        try:
            return datetime.strptime(date_str[:10], "%Y-%m-%d")
        except (ValueError, IndexError):
            return None

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Articles for All Scenarios
# MAGIC Iterate through each scenario and its queries, collecting articles with rate limiting.

# COMMAND ----------

all_articles = []

for scenario_name, scenario_config in SCENARIOS.items():
    print(f"\n{'='*60}")
    print(f"Scenario: {scenario_name} ({scenario_config['description']})")
    print(f"  Period: {scenario_config['start']} to {scenario_config['end']}")
    print(f"  Queries: {len(scenario_config['queries'])}")

    scenario_articles = []

    for query in scenario_config["queries"]:
        print(f"  Fetching: '{query}'...")
        articles = fetch_gdelt_articles(
            query=query,
            start_date=scenario_config["start"],
            end_date=scenario_config["end"],
            max_records=250,
        )
        print(f"    -> {len(articles)} articles")

        for art in articles:
            art["scenario"] = scenario_name
            art["scenario_description"] = scenario_config["description"]
            art["scenario_start"] = scenario_config["start"]
            art["scenario_end"] = scenario_config["end"]

        scenario_articles.extend(articles)

        # Rate limiting: GDELT allows ~1 request per second
        time.sleep(1.5)

    print(f"  Total for {scenario_name}: {len(scenario_articles)} articles")
    all_articles.extend(scenario_articles)

print(f"\n{'='*60}")
print(f"Grand total: {len(all_articles)} articles across all scenarios")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Deduplicate & Parse Dates

# COMMAND ----------

# Deduplicate by URL
seen_urls = set()
unique_articles = []
for art in all_articles:
    url = art.get("url", "")
    if url and url not in seen_urls:
        seen_urls.add(url)
        unique_articles.append(art)

print(f"After deduplication: {len(unique_articles)} unique articles (removed {len(all_articles) - len(unique_articles)} duplicates)")

# Parse dates
for art in unique_articles:
    parsed_dt = parse_gdelt_date(art.get("published_at", ""))
    if parsed_dt:
        art["published_date"] = parsed_dt.strftime("%Y-%m-%d")
        art["published_timestamp"] = parsed_dt.strftime("%Y-%m-%d %H:%M:%S")
    else:
        art["published_date"] = None
        art["published_timestamp"] = None

# COMMAND ----------

# MAGIC %md
# MAGIC ## Match Tickers to Articles
# MAGIC Scan article titles for known ticker keywords and create ticker association.

# COMMAND ----------

def match_tickers(title):
    """Return a list of ticker symbols mentioned in the title."""
    if not title:
        return []
    title_upper = title.upper()
    title_lower = title.lower()
    matched = []
    for ticker, keywords in TICKER_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in title_lower or kw.upper() in title_upper:
                matched.append(ticker)
                break
    return matched

for art in unique_articles:
    art["matched_tickers"] = match_tickers(art.get("title", ""))
    art["ticker_count"] = len(art["matched_tickers"])
    art["matched_tickers_str"] = ",".join(art["matched_tickers"]) if art["matched_tickers"] else None

# COMMAND ----------

# MAGIC %md
# MAGIC ## Convert to Spark DataFrame

# COMMAND ----------

news_schema = StructType([
    StructField("title", StringType(), True),
    StructField("url", StringType(), True),
    StructField("source", StringType(), True),
    StructField("published_date", StringType(), True),
    StructField("published_timestamp", StringType(), True),
    StructField("language", StringType(), True),
    StructField("tone", DoubleType(), True),
    StructField("query", StringType(), True),
    StructField("scenario", StringType(), True),
    StructField("scenario_description", StringType(), True),
    StructField("scenario_start", StringType(), True),
    StructField("scenario_end", StringType(), True),
    StructField("matched_tickers_str", StringType(), True),
    StructField("ticker_count", IntegerType(), True),
])

# Build rows for DataFrame
rows = []
for art in unique_articles:
    rows.append((
        art.get("title"),
        art.get("url"),
        art.get("source"),
        art.get("published_date"),
        art.get("published_timestamp"),
        art.get("language"),
        art.get("tone"),
        art.get("query"),
        art.get("scenario"),
        art.get("scenario_description"),
        art.get("scenario_start"),
        art.get("scenario_end"),
        art.get("matched_tickers_str"),
        art.get("ticker_count"),
    ))

news_df = spark.createDataFrame(rows, schema=news_schema)

# Cast date/timestamp strings to proper types
news_df = (
    news_df
    .withColumn("published_date", F.to_date("published_date", "yyyy-MM-dd"))
    .withColumn("published_timestamp", F.to_timestamp("published_timestamp", "yyyy-MM-dd HH:mm:ss"))
    .withColumn("ingested_at", F.current_timestamp())
)

print(f"News DataFrame rows: {news_df.count()}")
news_df.printSchema()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write to Delta Lake Bronze

# COMMAND ----------

(news_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.bronze.news_articles")
)

print("Bronze table written: sweetreturns.bronze.news_articles")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Data Quality Checks

# COMMAND ----------

spark.sql("""
    SELECT
        scenario,
        COUNT(*) as article_count,
        COUNT(DISTINCT source) as unique_sources,
        MIN(published_date) as earliest,
        MAX(published_date) as latest,
        ROUND(AVG(tone), 3) as avg_tone,
        SUM(CASE WHEN matched_tickers_str IS NOT NULL THEN 1 ELSE 0 END) as with_tickers
    FROM sweetreturns.bronze.news_articles
    GROUP BY scenario
    ORDER BY scenario
""").show(truncate=False)

# COMMAND ----------

# Top sources
spark.sql("""
    SELECT source, COUNT(*) as article_count
    FROM sweetreturns.bronze.news_articles
    GROUP BY source
    ORDER BY article_count DESC
    LIMIT 15
""").show(truncate=False)

# COMMAND ----------

# Sample articles
spark.sql("""
    SELECT scenario, published_date, title, source, tone, matched_tickers_str
    FROM sweetreturns.bronze.news_articles
    WHERE matched_tickers_str IS NOT NULL
    ORDER BY published_date DESC
    LIMIT 10
""").show(truncate=False)
