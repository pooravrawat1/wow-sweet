# Databricks notebook source
# MAGIC %md
# MAGIC # Bronze Layer: Reddit WallStreetBets Ingestion (PRAW)
# MAGIC Fetches WallStreetBets posts from the GME squeeze period (Jan-Feb 2021) using PRAW.
# MAGIC Captures post titles, scores, comment counts, and ticker mentions.
# MAGIC
# MAGIC Writes to `sweetreturns.bronze.reddit_wsb` Delta table.
# MAGIC
# MAGIC ## Prerequisites
# MAGIC - Install PRAW: `%pip install praw`
# MAGIC - Set Databricks secrets for Reddit API credentials:
# MAGIC   ```
# MAGIC   databricks secrets put --scope sweetreturns --key reddit_client_id
# MAGIC   databricks secrets put --scope sweetreturns --key reddit_client_secret
# MAGIC   databricks secrets put --scope sweetreturns --key reddit_user_agent
# MAGIC   ```

# COMMAND ----------

# MAGIC %pip install praw

# COMMAND ----------

import praw
import re
import time
from datetime import datetime, timezone
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType,
    LongType, DoubleType, TimestampType, BooleanType
)

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Reddit API Configuration
# MAGIC Credentials are stored in Databricks secrets scope `sweetreturns`.

# COMMAND ----------

# Load Reddit API credentials from Databricks secrets
try:
    REDDIT_CLIENT_ID = dbutils.secrets.get(scope="sweetreturns", key="reddit_client_id")
    REDDIT_CLIENT_SECRET = dbutils.secrets.get(scope="sweetreturns", key="reddit_client_secret")
    REDDIT_USER_AGENT = dbutils.secrets.get(scope="sweetreturns", key="reddit_user_agent")
except Exception as e:
    print(f"[WARN] Could not load secrets: {e}")
    print("Using placeholder credentials. Set secrets before running in production.")
    REDDIT_CLIENT_ID = "YOUR_CLIENT_ID"
    REDDIT_CLIENT_SECRET = "YOUR_CLIENT_SECRET"
    REDDIT_USER_AGENT = "sweetreturns:v1.0 (by /u/your_username)"

# Initialize PRAW with read-only access
reddit = praw.Reddit(
    client_id=REDDIT_CLIENT_ID,
    client_secret=REDDIT_CLIENT_SECRET,
    user_agent=REDDIT_USER_AGENT,
)

print(f"Reddit API initialized (read-only: {reddit.read_only})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ticker Detection Regex
# MAGIC Identify stock ticker symbols from post titles and body text.

# COMMAND ----------

# Common WSB tickers during the squeeze period
WSB_TICKERS = {
    "GME", "AMC", "BB", "NOK", "BBBY", "PLTR", "TSLA", "AAPL", "MSFT",
    "NVDA", "AMD", "SPY", "QQQ", "AMZN", "GOOGL", "META", "NFLX",
    "SLV", "SPCE", "WISH", "CLOV", "SOFI", "LCID", "RIVN", "DKNG",
    "CRSR", "RKT", "UWMC", "SNDL", "TLRY", "APHA", "EXPR", "KOSS",
    "NAKD", "TR", "WKHS", "RIDE", "GOEV", "NIO", "XPEV", "LI",
}

# Regex to find ticker-like patterns ($TICKER or standalone 2-5 char uppercase)
TICKER_PATTERN = re.compile(r'\$([A-Z]{2,5})\b|\b([A-Z]{2,5})\b')

# Common English words to exclude from ticker matching
EXCLUDE_WORDS = {
    "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER",
    "WAS", "ONE", "OUR", "OUT", "HAS", "HIS", "HOW", "ITS", "MAY", "NEW",
    "NOW", "OLD", "SEE", "WAY", "WHO", "DID", "GET", "HIM", "LET", "SAY",
    "SHE", "TOO", "USE", "DAD", "MOM", "BIG", "END", "FAR", "FEW", "GOT",
    "HAD", "MAN", "RAN", "RED", "RUN", "SET", "TOP", "TRY", "WON", "YET",
    "BUY", "PUT", "CALL", "HOLD", "YOLO", "MOON", "HODL", "GAIN", "LOSS",
    "EDIT", "JUST", "LIKE", "THIS", "THAT", "WILL", "WITH", "HAVE", "FROM",
    "BEEN", "THEY", "SOME", "THEM", "THAN", "WHAT", "WHEN", "MAKE", "EACH",
    "MORE", "VERY", "MUCH", "LONG", "OVER", "SUCH", "TAKE", "INTO",
    "YEAR", "BACK", "ALSO", "NEXT", "LAST", "ONLY", "EVEN", "MOST",
    "KEEP", "WANT", "GIVE", "MANY", "WELL", "STILL", "SHOULD", "COULD",
    "WOULD", "THEIR", "ABOUT", "AFTER", "THINK", "SHARE", "STOCK",
    "MARKET", "MONEY", "SHORT", "PRICE", "TODAY", "GOING", "HEDGE",
    "TRADE", "NEVER", "EVERY", "FIRST", "THESE", "OTHER", "THOSE",
    "BEING", "WHERE", "THERE", "WHICH", "GREAT", "RIGHT", "STILL",
    "BASED", "SINCE", "WHILE", "UNTIL", "ABOVE", "BELOW",
    "USA", "SEC", "NYSE", "CEO", "CFO", "IPO", "ETF", "OTC",
    "GDP", "FED", "IMO", "TIL", "PSA", "LMAO", "STFU", "GTFO",
}


def extract_tickers(text):
    """Extract probable stock ticker symbols from text."""
    if not text:
        return []
    matches = TICKER_PATTERN.findall(text)
    tickers = set()
    for dollar_match, word_match in matches:
        symbol = dollar_match or word_match
        if symbol in WSB_TICKERS and symbol not in EXCLUDE_WORDS:
            tickers.add(symbol)
    return sorted(list(tickers))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch WallStreetBets Posts
# MAGIC Use PRAW to search for top posts in r/wallstreetbets during the GME squeeze period.
# MAGIC PRAW's search endpoint returns posts matching keyword queries.

# COMMAND ----------

# Search parameters for the GME squeeze period
SUBREDDIT_NAME = "wallstreetbets"
SEARCH_QUERIES = [
    "GME",
    "GameStop",
    "short squeeze",
    "diamond hands",
    "to the moon",
    "hedge fund",
    "Robinhood",
    "hold the line",
    "YOLO",
    "tendies",
    "AMC",
    "gain porn",
    "loss porn",
    "retard",
    "ape",
]

MAX_POSTS_PER_QUERY = 100
TARGET_START = datetime(2021, 1, 15, tzinfo=timezone.utc)
TARGET_END = datetime(2021, 2, 15, tzinfo=timezone.utc)

# COMMAND ----------

subreddit = reddit.subreddit(SUBREDDIT_NAME)

all_posts = []
seen_ids = set()

for query in SEARCH_QUERIES:
    print(f"Searching r/{SUBREDDIT_NAME} for: '{query}'...")
    try:
        search_results = subreddit.search(
            query=query,
            sort="top",
            time_filter="all",
            limit=MAX_POSTS_PER_QUERY,
        )

        query_count = 0
        for submission in search_results:
            # Filter to target date range
            post_dt = datetime.fromtimestamp(submission.created_utc, tz=timezone.utc)
            if post_dt < TARGET_START or post_dt > TARGET_END:
                continue

            if submission.id in seen_ids:
                continue
            seen_ids.add(submission.id)

            # Extract post data
            title = submission.title or ""
            body = submission.selftext or ""
            tickers = extract_tickers(title + " " + body)

            post_data = {
                "post_id": submission.id,
                "title": title[:1000],  # Truncate very long titles
                "body_preview": body[:500],  # First 500 chars of body
                "author": str(submission.author) if submission.author else "[deleted]",
                "score": submission.score,
                "upvote_ratio": submission.upvote_ratio,
                "num_comments": submission.num_comments,
                "created_utc": submission.created_utc,
                "created_date": post_dt.strftime("%Y-%m-%d"),
                "created_timestamp": post_dt.strftime("%Y-%m-%d %H:%M:%S"),
                "url": submission.url,
                "permalink": f"https://reddit.com{submission.permalink}",
                "is_self": submission.is_self,
                "link_flair_text": submission.link_flair_text or "",
                "matched_tickers": ",".join(tickers) if tickers else None,
                "ticker_count": len(tickers),
                "query": query,
            }

            all_posts.append(post_data)
            query_count += 1

        print(f"  -> {query_count} posts in target date range")

    except Exception as e:
        print(f"  [WARN] Error searching for '{query}': {e}")

    # Rate limiting: respect Reddit's API limits
    time.sleep(2.0)

print(f"\nTotal unique posts collected: {len(all_posts)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Convert to Spark DataFrame

# COMMAND ----------

wsb_schema = StructType([
    StructField("post_id", StringType(), True),
    StructField("title", StringType(), True),
    StructField("body_preview", StringType(), True),
    StructField("author", StringType(), True),
    StructField("score", IntegerType(), True),
    StructField("upvote_ratio", DoubleType(), True),
    StructField("num_comments", IntegerType(), True),
    StructField("created_utc", DoubleType(), True),
    StructField("created_date", StringType(), True),
    StructField("created_timestamp", StringType(), True),
    StructField("url", StringType(), True),
    StructField("permalink", StringType(), True),
    StructField("is_self", BooleanType(), True),
    StructField("link_flair_text", StringType(), True),
    StructField("matched_tickers", StringType(), True),
    StructField("ticker_count", IntegerType(), True),
    StructField("query", StringType(), True),
])

rows = []
for post in all_posts:
    rows.append((
        post["post_id"],
        post["title"],
        post["body_preview"],
        post["author"],
        post["score"],
        post["upvote_ratio"],
        post["num_comments"],
        post["created_utc"],
        post["created_date"],
        post["created_timestamp"],
        post["url"],
        post["permalink"],
        post["is_self"],
        post["link_flair_text"],
        post["matched_tickers"],
        post["ticker_count"],
        post["query"],
    ))

wsb_df = spark.createDataFrame(rows, schema=wsb_schema)

# Cast date/timestamp strings to proper types
wsb_df = (
    wsb_df
    .withColumn("created_date", F.to_date("created_date", "yyyy-MM-dd"))
    .withColumn("created_timestamp", F.to_timestamp("created_timestamp", "yyyy-MM-dd HH:mm:ss"))
    .withColumn("ingested_at", F.current_timestamp())
)

print(f"WSB DataFrame rows: {wsb_df.count()}")
wsb_df.printSchema()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write to Delta Lake Bronze

# COMMAND ----------

(wsb_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.bronze.reddit_wsb")
)

print("Bronze table written: sweetreturns.bronze.reddit_wsb")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Data Quality Checks

# COMMAND ----------

spark.sql("""
    SELECT
        COUNT(*) as total_posts,
        COUNT(DISTINCT post_id) as unique_posts,
        COUNT(DISTINCT author) as unique_authors,
        MIN(created_date) as earliest_post,
        MAX(created_date) as latest_post,
        ROUND(AVG(score), 1) as avg_score,
        ROUND(AVG(num_comments), 1) as avg_comments,
        SUM(CASE WHEN matched_tickers IS NOT NULL THEN 1 ELSE 0 END) as posts_with_tickers
    FROM sweetreturns.bronze.reddit_wsb
""").show(truncate=False)

# COMMAND ----------

# Daily post volume
spark.sql("""
    SELECT
        created_date,
        COUNT(*) as post_count,
        SUM(score) as total_score,
        SUM(num_comments) as total_comments
    FROM sweetreturns.bronze.reddit_wsb
    GROUP BY created_date
    ORDER BY created_date
""").show(50, truncate=False)

# COMMAND ----------

# Top posts by score
spark.sql("""
    SELECT post_id, created_date, score, num_comments, matched_tickers,
           SUBSTRING(title, 1, 80) as title_preview
    FROM sweetreturns.bronze.reddit_wsb
    ORDER BY score DESC
    LIMIT 20
""").show(truncate=False)

# COMMAND ----------

# Ticker mention frequency
spark.sql("""
    SELECT ticker, COUNT(*) as mention_count
    FROM (
        SELECT EXPLODE(SPLIT(matched_tickers, ',')) as ticker
        FROM sweetreturns.bronze.reddit_wsb
        WHERE matched_tickers IS NOT NULL
    )
    GROUP BY ticker
    ORDER BY mention_count DESC
    LIMIT 20
""").show(truncate=False)
