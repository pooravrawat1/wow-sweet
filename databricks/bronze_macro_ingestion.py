# Databricks notebook source
# MAGIC %md
# MAGIC # Bronze Layer: Macroeconomic Data Ingestion (FRED API)
# MAGIC Fetches key macroeconomic indicators from the Federal Reserve Economic Data (FRED) API:
# MAGIC - **Federal Funds Rate** (DFF)
# MAGIC - **Unemployment Rate** (UNRATE)
# MAGIC - **Consumer Price Index** (CPIAUCSL)
# MAGIC - **VIX Volatility Index** (VIXCLS)
# MAGIC - **10-Year Treasury Yield** (DGS10)
# MAGIC
# MAGIC Writes to `sweetreturns.bronze.macro_indicators` Delta table.
# MAGIC
# MAGIC ## Prerequisites
# MAGIC - Set FRED API key in Databricks secrets:
# MAGIC   ```
# MAGIC   databricks secrets put --scope sweetreturns --key fred_api_key
# MAGIC   ```
# MAGIC - Get a free API key at: https://fred.stlouisfed.org/docs/api/api_key.html

# COMMAND ----------

import requests
import json
import time
from datetime import datetime
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, DateType
)

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

# Load FRED API key from Databricks secrets
try:
    FRED_API_KEY = dbutils.secrets.get(scope="sweetreturns", key="fred_api_key")
except Exception as e:
    print(f"[WARN] Could not load FRED API key from secrets: {e}")
    print("Set the secret or replace with your key before running.")
    FRED_API_KEY = "YOUR_FRED_API_KEY"

FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

# Date range matching the stock dataset (5 years)
OBSERVATION_START = "2018-01-01"
OBSERVATION_END = "2023-12-31"

# FRED series IDs and metadata
MACRO_SERIES = {
    "DFF": {
        "name": "Federal Funds Effective Rate",
        "frequency": "daily",
        "unit": "percent",
        "description": "The interest rate at which depository institutions lend reserve balances to other depository institutions overnight.",
    },
    "UNRATE": {
        "name": "Unemployment Rate",
        "frequency": "monthly",
        "unit": "percent",
        "description": "The percentage of the total labor force that is unemployed but actively seeking employment.",
    },
    "CPIAUCSL": {
        "name": "Consumer Price Index (All Urban Consumers)",
        "frequency": "monthly",
        "unit": "index_1982_84_100",
        "description": "A measure of the average change in prices over time for a basket of consumer goods and services.",
    },
    "VIXCLS": {
        "name": "CBOE Volatility Index (VIX)",
        "frequency": "daily",
        "unit": "index",
        "description": "Market expectation of near-term volatility conveyed by S&P 500 index option prices.",
    },
    "DGS10": {
        "name": "10-Year Treasury Constant Maturity Rate",
        "frequency": "daily",
        "unit": "percent",
        "description": "The yield on U.S. Treasury securities at 10-year constant maturity.",
    },
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## FRED API Fetcher
# MAGIC Fetch observations for each series via the FRED REST API.

# COMMAND ----------

def fetch_fred_series(series_id, api_key, start_date, end_date):
    """
    Fetch time series data from FRED API.

    Parameters:
        series_id (str): FRED series identifier (e.g., 'DFF', 'UNRATE').
        api_key (str): FRED API key.
        start_date (str): Start date (YYYY-MM-DD).
        end_date (str): End date (YYYY-MM-DD).

    Returns:
        list[dict]: List of observation dictionaries with date and value.
    """
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": start_date,
        "observation_end": end_date,
        "sort_order": "asc",
    }

    observations = []
    try:
        response = requests.get(FRED_BASE_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if "observations" in data:
            for obs in data["observations"]:
                date_str = obs.get("date", "")
                value_str = obs.get("value", ".")

                # FRED uses "." for missing values
                if value_str == "." or value_str == "":
                    value = None
                else:
                    try:
                        value = float(value_str)
                    except ValueError:
                        value = None

                observations.append({
                    "date": date_str,
                    "value": value,
                })

    except requests.exceptions.RequestException as e:
        print(f"  [WARN] FRED request failed for {series_id}: {e}")
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  [WARN] FRED response parse error for {series_id}: {e}")

    return observations

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch All Macro Series

# COMMAND ----------

all_macro_rows = []

for series_id, meta in MACRO_SERIES.items():
    print(f"Fetching {series_id} ({meta['name']})...")
    observations = fetch_fred_series(
        series_id=series_id,
        api_key=FRED_API_KEY,
        start_date=OBSERVATION_START,
        end_date=OBSERVATION_END,
    )

    non_null_count = sum(1 for obs in observations if obs["value"] is not None)
    print(f"  -> {len(observations)} observations ({non_null_count} non-null)")

    for obs in observations:
        all_macro_rows.append({
            "series_id": series_id,
            "series_name": meta["name"],
            "frequency": meta["frequency"],
            "unit": meta["unit"],
            "description": meta["description"],
            "observation_date": obs["date"],
            "value": obs["value"],
        })

    # Rate limiting
    time.sleep(1.0)

print(f"\nTotal macro observations: {len(all_macro_rows)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Convert to Spark DataFrame

# COMMAND ----------

macro_schema = StructType([
    StructField("series_id", StringType(), True),
    StructField("series_name", StringType(), True),
    StructField("frequency", StringType(), True),
    StructField("unit", StringType(), True),
    StructField("description", StringType(), True),
    StructField("observation_date", StringType(), True),
    StructField("value", DoubleType(), True),
])

rows = []
for record in all_macro_rows:
    rows.append((
        record["series_id"],
        record["series_name"],
        record["frequency"],
        record["unit"],
        record["description"],
        record["observation_date"],
        record["value"],
    ))

macro_df = spark.createDataFrame(rows, schema=macro_schema)

# Cast date string to proper DateType
macro_df = (
    macro_df
    .withColumn("observation_date", F.to_date("observation_date", "yyyy-MM-dd"))
    .withColumn("ingested_at", F.current_timestamp())
)

print(f"Macro DataFrame rows: {macro_df.count()}")
macro_df.printSchema()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Derived Features
# MAGIC Add rolling changes and z-scores for each macro indicator.

# COMMAND ----------

from pyspark.sql.window import Window

# Window for rolling computations per series
w_series = Window.partitionBy("series_id").orderBy("observation_date")
w_series_20d = Window.partitionBy("series_id").orderBy("observation_date").rowsBetween(-19, 0)
w_series_60d = Window.partitionBy("series_id").orderBy("observation_date").rowsBetween(-59, 0)

macro_df = macro_df.withColumn(
    "prev_value", F.lag("value", 1).over(w_series)
).withColumn(
    "daily_change", F.col("value") - F.col("prev_value")
).withColumn(
    "pct_change",
    F.when(
        (F.col("prev_value").isNotNull()) & (F.col("prev_value") != 0),
        (F.col("value") - F.col("prev_value")) / F.col("prev_value")
    ).otherwise(None)
).withColumn(
    "rolling_mean_20d", F.avg("value").over(w_series_20d)
).withColumn(
    "rolling_std_20d", F.stddev("value").over(w_series_20d)
).withColumn(
    "zscore_20d",
    F.when(
        (F.col("rolling_std_20d").isNotNull()) & (F.col("rolling_std_20d") > 0),
        (F.col("value") - F.col("rolling_mean_20d")) / F.col("rolling_std_20d")
    ).otherwise(0.0)
)

# Drop intermediate columns
macro_df = macro_df.drop("prev_value", "rolling_mean_20d", "rolling_std_20d")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write to Delta Lake Bronze

# COMMAND ----------

(macro_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.bronze.macro_indicators")
)

print("Bronze table written: sweetreturns.bronze.macro_indicators")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Data Quality Checks

# COMMAND ----------

spark.sql("""
    SELECT
        series_id,
        series_name,
        frequency,
        unit,
        COUNT(*) as observation_count,
        SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) as null_values,
        MIN(observation_date) as start_date,
        MAX(observation_date) as end_date,
        ROUND(MIN(value), 4) as min_value,
        ROUND(MAX(value), 4) as max_value,
        ROUND(AVG(value), 4) as avg_value
    FROM sweetreturns.bronze.macro_indicators
    GROUP BY series_id, series_name, frequency, unit
    ORDER BY series_id
""").show(truncate=False)

# COMMAND ----------

# VIX during scenario periods
spark.sql("""
    SELECT observation_date, value as vix_level, daily_change, zscore_20d
    FROM sweetreturns.bronze.macro_indicators
    WHERE series_id = 'VIXCLS'
      AND (
        (observation_date BETWEEN '2020-02-01' AND '2020-03-31')  -- COVID crash
        OR (observation_date BETWEEN '2021-01-15' AND '2021-02-15')  -- GME squeeze
        OR (observation_date BETWEEN '2023-01-01' AND '2023-03-31')  -- AI boom
      )
    ORDER BY observation_date
""").show(50, truncate=False)

# COMMAND ----------

# Federal Funds Rate timeline
spark.sql("""
    SELECT observation_date, value as fed_funds_rate
    FROM sweetreturns.bronze.macro_indicators
    WHERE series_id = 'DFF'
      AND observation_date IN (
        SELECT MAX(observation_date)
        FROM sweetreturns.bronze.macro_indicators
        WHERE series_id = 'DFF'
        GROUP BY YEAR(observation_date), MONTH(observation_date)
      )
    ORDER BY observation_date
""").show(100, truncate=False)
