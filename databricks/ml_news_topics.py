# Databricks notebook source
# MAGIC %md
# MAGIC # ML: News Topic Modeling (BERTopic)
# MAGIC Uses BERTopic with SentenceTransformer embeddings to cluster news articles
# MAGIC into 20 topics. Assigns topic labels back to individual articles.
# MAGIC
# MAGIC - Uses `all-MiniLM-L6-v2` for fast, high-quality sentence embeddings
# MAGIC - BERTopic combines embeddings, UMAP dimensionality reduction, and HDBSCAN clustering
# MAGIC - Topics are assigned human-readable labels based on top keywords
# MAGIC - Saves results to `sweetreturns.gold.news_topics`
# MAGIC
# MAGIC ## Prerequisites
# MAGIC - `%pip install bertopic sentence-transformers umap-learn hdbscan`

# COMMAND ----------

# MAGIC %pip install bertopic sentence-transformers umap-learn hdbscan

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType, DoubleType, ArrayType
)
import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
from bertopic import BERTopic
from umap import UMAP
from hdbscan import HDBSCAN
from sklearn.feature_extraction.text import CountVectorizer
import json
import warnings
warnings.filterwarnings("ignore")

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

N_TOPICS = 20                          # Target number of topics
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # Fast, good quality embeddings (384-dim)
UMAP_N_NEIGHBORS = 15                 # UMAP neighborhood size
UMAP_N_COMPONENTS = 5                 # UMAP target dimensionality
UMAP_MIN_DIST = 0.0                   # UMAP minimum distance
HDBSCAN_MIN_CLUSTER_SIZE = 15         # Minimum articles per cluster
HDBSCAN_MIN_SAMPLES = 5               # Core point density
RANDOM_STATE = 42

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load News Articles

# COMMAND ----------

news_df = spark.table("sweetreturns.bronze.news_articles")

# Filter to articles with meaningful titles
news_filtered = news_df.filter(
    (F.col("title").isNotNull()) &
    (F.length(F.trim(F.col("title"))) > 15)  # At least 15 chars
).select(
    "title", "url", "source", "published_date", "scenario",
    "matched_tickers_str", "tone",
)

print(f"Articles for topic modeling: {news_filtered.count()}")

# Collect to pandas for BERTopic
news_pd = news_filtered.toPandas()
documents = news_pd["title"].tolist()
print(f"Documents loaded: {len(documents)}")
print(f"Sample: {documents[:3]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Sentence Embeddings
# MAGIC Use SentenceTransformer to encode news titles into dense vector representations.

# COMMAND ----------

# Load the embedding model
print(f"Loading embedding model: {EMBEDDING_MODEL}...")
embedding_model = SentenceTransformer(EMBEDDING_MODEL)

# Encode all documents
print(f"Encoding {len(documents)} documents...")
embeddings = embedding_model.encode(
    documents,
    show_progress_bar=True,
    batch_size=64,
    normalize_embeddings=True,
)
print(f"Embeddings shape: {embeddings.shape}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configure BERTopic Components
# MAGIC Customize UMAP, HDBSCAN, and vectorizer for our financial news domain.

# COMMAND ----------

# UMAP for dimensionality reduction
umap_model = UMAP(
    n_neighbors=UMAP_N_NEIGHBORS,
    n_components=UMAP_N_COMPONENTS,
    min_dist=UMAP_MIN_DIST,
    metric="cosine",
    random_state=RANDOM_STATE,
)

# HDBSCAN for clustering
hdbscan_model = HDBSCAN(
    min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE,
    min_samples=HDBSCAN_MIN_SAMPLES,
    metric="euclidean",
    cluster_selection_method="eom",
    prediction_data=True,
)

# CountVectorizer for topic representation (c-TF-IDF)
vectorizer_model = CountVectorizer(
    stop_words="english",
    ngram_range=(1, 2),
    min_df=2,
    max_df=0.95,
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Train BERTopic Model

# COMMAND ----------

print("Training BERTopic model...")
topic_model = BERTopic(
    embedding_model=embedding_model,
    umap_model=umap_model,
    hdbscan_model=hdbscan_model,
    vectorizer_model=vectorizer_model,
    nr_topics=N_TOPICS,
    top_n_words=10,
    verbose=True,
    calculate_probabilities=True,
)

# Fit the model using pre-computed embeddings
topics, probabilities = topic_model.fit_transform(documents, embeddings=embeddings)

print(f"\nTopics discovered: {len(topic_model.get_topic_info()) - 1}")  # -1 for outlier topic
print(f"Outlier documents (topic -1): {sum(1 for t in topics if t == -1)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Inspect Topics

# COMMAND ----------

# Get topic info
topic_info = topic_model.get_topic_info()
print("Topic overview:")
print(topic_info.to_string())

# Print detailed topic keywords
print("\n\nDetailed topic keywords:")
for topic_id in sorted(set(topics)):
    if topic_id == -1:
        continue
    top_words = topic_model.get_topic(topic_id)
    keywords = ", ".join([word for word, _ in top_words[:8]])
    count = sum(1 for t in topics if t == topic_id)
    print(f"  Topic {topic_id:3d} ({count:4d} docs): {keywords}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Human-Readable Topic Labels
# MAGIC Map each topic's keywords to a descriptive financial label.

# COMMAND ----------

# Automatic topic labeling based on keyword analysis
def generate_topic_label(topic_id, topic_model):
    """Generate a human-readable label for a topic based on its keywords."""
    if topic_id == -1:
        return "Uncategorized"

    top_words = topic_model.get_topic(topic_id)
    if not top_words:
        return f"Topic_{topic_id}"

    keywords = [word.lower() for word, _ in top_words[:10]]
    keyword_str = " ".join(keywords)

    # Financial domain label mapping
    label_rules = [
        (["covid", "pandemic", "virus", "coronavirus", "lockdown"], "COVID-19 Pandemic Impact"),
        (["vaccine", "pfizer", "moderna", "booster"], "Vaccine Development"),
        (["gamestop", "gme", "squeeze", "reddit", "wallstreetbets"], "Meme Stock Squeeze"),
        (["robinhood", "trading halt", "retail"], "Retail Trading Disruption"),
        (["ai", "artificial intelligence", "chatgpt", "openai"], "AI Technology Boom"),
        (["nvidia", "chip", "semiconductor", "gpu"], "Semiconductor/AI Chips"),
        (["fed", "rate", "interest", "federal reserve", "monetary"], "Federal Reserve Policy"),
        (["inflation", "cpi", "consumer price", "prices"], "Inflation Concerns"),
        (["recession", "economy", "gdp", "economic"], "Recession/Economic Outlook"),
        (["oil", "energy", "opec", "crude", "gas"], "Energy/Oil Markets"),
        (["bank", "banking", "financial", "credit"], "Banking/Financial Sector"),
        (["tech", "technology", "apple", "microsoft", "google"], "Big Tech Performance"),
        (["earnings", "revenue", "profit", "quarterly"], "Corporate Earnings"),
        (["market", "stock", "dow", "nasdaq", "rally"], "Broad Market Movement"),
        (["crypto", "bitcoin", "blockchain"], "Cryptocurrency"),
        (["china", "trade war", "tariff", "geopolitical"], "Geopolitical/Trade"),
        (["tesla", "ev", "electric vehicle"], "EV/Tesla"),
        (["housing", "real estate", "mortgage"], "Real Estate/Housing"),
        (["supply chain", "shortage", "logistics"], "Supply Chain"),
        (["short", "hedge fund", "institutional"], "Institutional/Short Selling"),
    ]

    for rule_keywords, label in label_rules:
        for rk in rule_keywords:
            if rk in keyword_str:
                return label

    # Fallback: use top 3 keywords
    return " / ".join(keywords[:3]).title()


# Generate labels for all topics
topic_labels = {}
for topic_id in sorted(set(topics)):
    topic_labels[topic_id] = generate_topic_label(topic_id, topic_model)
    if topic_id != -1:
        print(f"  Topic {topic_id}: {topic_labels[topic_id]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Assign Topics Back to Articles

# COMMAND ----------

# Add topic assignments to the pandas DataFrame
news_pd["topic_id"] = topics
news_pd["topic_probability"] = [float(p.max()) if p is not None and len(p) > 0 else 0.0 for p in probabilities]
news_pd["topic_label"] = news_pd["topic_id"].map(topic_labels)

# Add top keywords for each topic
def get_topic_keywords(topic_id, topic_model, n=5):
    if topic_id == -1:
        return ""
    words = topic_model.get_topic(topic_id)
    if not words:
        return ""
    return ", ".join([w for w, _ in words[:n]])

news_pd["topic_keywords"] = news_pd["topic_id"].apply(
    lambda t: get_topic_keywords(t, topic_model)
)

print(f"Articles with topic assignments: {len(news_pd)}")
print(f"\nTopic distribution:")
print(news_pd["topic_label"].value_counts().head(20))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Analyze Topic-Scenario Relationship

# COMMAND ----------

# Cross-tabulation of topics vs scenarios
cross_tab = pd.crosstab(
    news_pd["topic_label"],
    news_pd["scenario"],
    margins=True,
)
print("Topic vs Scenario distribution:")
print(cross_tab.to_string())

# COMMAND ----------

# MAGIC %md
# MAGIC ## Convert to Spark DataFrame & Write to Gold

# COMMAND ----------

# Build schema for the output table
topic_schema = StructType([
    StructField("title", StringType(), True),
    StructField("url", StringType(), True),
    StructField("source", StringType(), True),
    StructField("published_date", StringType(), True),
    StructField("scenario", StringType(), True),
    StructField("matched_tickers_str", StringType(), True),
    StructField("tone", DoubleType(), True),
    StructField("topic_id", IntegerType(), True),
    StructField("topic_label", StringType(), True),
    StructField("topic_probability", DoubleType(), True),
    StructField("topic_keywords", StringType(), True),
])

# Convert selected columns
topic_rows = []
for _, row in news_pd.iterrows():
    topic_rows.append((
        str(row["title"]) if pd.notna(row["title"]) else None,
        str(row["url"]) if pd.notna(row["url"]) else None,
        str(row["source"]) if pd.notna(row["source"]) else None,
        str(row["published_date"]) if pd.notna(row["published_date"]) else None,
        str(row["scenario"]) if pd.notna(row["scenario"]) else None,
        str(row["matched_tickers_str"]) if pd.notna(row["matched_tickers_str"]) else None,
        float(row["tone"]) if pd.notna(row["tone"]) else None,
        int(row["topic_id"]),
        str(row["topic_label"]),
        float(row["topic_probability"]),
        str(row["topic_keywords"]) if row["topic_keywords"] else None,
    ))

topic_df = spark.createDataFrame(topic_rows, schema=topic_schema)
topic_df = topic_df.withColumn("published_date", F.to_date("published_date", "yyyy-MM-dd"))
topic_df = topic_df.withColumn("modeled_at", F.current_timestamp())

(topic_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.gold.news_topics")
)

print("Gold table written: sweetreturns.gold.news_topics")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Save Topic Model Metadata

# COMMAND ----------

# Save topic metadata as JSON for reference
topic_metadata = {
    "n_topics": len(topic_labels) - 1,  # exclude outlier topic
    "embedding_model": EMBEDDING_MODEL,
    "total_documents": len(documents),
    "outlier_count": sum(1 for t in topics if t == -1),
    "topics": {},
}

for topic_id in sorted(set(topics)):
    if topic_id == -1:
        continue
    top_words = topic_model.get_topic(topic_id)
    topic_metadata["topics"][str(topic_id)] = {
        "label": topic_labels[topic_id],
        "count": sum(1 for t in topics if t == topic_id),
        "top_keywords": [{"word": w, "weight": round(float(s), 4)} for w, s in top_words[:10]],
    }

metadata_json = json.dumps(topic_metadata, indent=2)
dbfs_path = "/FileStore/sweetreturns/news_topic_metadata.json"
dbutils.fs.put(dbfs_path, metadata_json, overwrite=True)
print(f"Topic metadata saved to dbfs:{dbfs_path}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Quality Validation

# COMMAND ----------

spark.sql("""
    SELECT
        topic_id,
        topic_label,
        COUNT(*) as article_count,
        ROUND(AVG(topic_probability), 3) as avg_probability,
        ROUND(AVG(tone), 3) as avg_tone,
        SUM(CASE WHEN matched_tickers_str IS NOT NULL THEN 1 ELSE 0 END) as with_tickers
    FROM sweetreturns.gold.news_topics
    WHERE topic_id >= 0
    GROUP BY topic_id, topic_label
    ORDER BY article_count DESC
""").show(25, truncate=False)

# COMMAND ----------

# Topic by scenario
spark.sql("""
    SELECT scenario, topic_label, COUNT(*) as count
    FROM sweetreturns.gold.news_topics
    WHERE topic_id >= 0
    GROUP BY scenario, topic_label
    ORDER BY scenario, count DESC
""").show(50, truncate=False)

# COMMAND ----------

# Sample articles per topic
spark.sql("""
    SELECT topic_label, ROUND(topic_probability, 3) as prob,
           SUBSTRING(title, 1, 80) as title_preview, scenario
    FROM sweetreturns.gold.news_topics
    WHERE topic_id >= 0
    ORDER BY topic_probability DESC
    LIMIT 20
""").show(truncate=False)
