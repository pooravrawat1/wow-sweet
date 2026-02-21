# Databricks notebook source
# MAGIC %md
# MAGIC # Export Layer: Build frontend_payload.json
# MAGIC Reads the gold golden_tickets table, takes the latest date snapshot,
# MAGIC builds the full frontend_payload.json with city position assignment,
# MAGIC correlation edges, and sector metadata.
# MAGIC
# MAGIC Writes to DBFS and optionally to a mounted storage account.
# MAGIC
# MAGIC Output follows the API schema:
# MAGIC ```json
# MAGIC {
# MAGIC   "generated_at": "...",
# MAGIC   "regime": "...",
# MAGIC   "stock_count": 500,
# MAGIC   "stocks": [...],
# MAGIC   "correlation_edges": [...],
# MAGIC   "sectors": [...]
# MAGIC }
# MAGIC ```

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
import json
from datetime import datetime
import math

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Read Gold Table & Get Latest Snapshot

# COMMAND ----------

gold_df = spark.table("sweetreturns.gold.golden_tickets")

# Get the latest available date
latest_date = gold_df.agg(F.max("Date")).collect()[0][0]
print(f"Latest date in gold table: {latest_date}")

# Filter to latest date snapshot
snapshot_df = gold_df.filter(F.col("Date") == latest_date)
print(f"Stocks on latest date: {snapshot_df.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Determine Volatility Regime
# MAGIC Use the modal (most common) vol_regime across all stocks on the latest date.

# COMMAND ----------

regime_row = (
    snapshot_df.groupBy("vol_regime")
    .count()
    .orderBy(F.desc("count"))
    .first()
)
current_regime = regime_row["vol_regime"] if regime_row else "unknown"
print(f"Current market regime: {current_regime}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## City Position Assignment (Grid Layout by Sector)
# MAGIC
# MAGIC Each sector gets a block in a 3x4 grid. Within each sector, stocks are placed
# MAGIC in a sub-grid sorted by market_cap_percentile (largest first).
# MAGIC
# MAGIC ```python
# MAGIC SECTOR_POSITIONS = {
# MAGIC     "Technology":             (0, 0),  # "Pixel Candy Arcade"
# MAGIC     "Healthcare":             (1, 0),  # "Medicine Drop Apothecary"
# MAGIC     "Financials":             (2, 0),  # "Chocolate Coin District"
# MAGIC     "Consumer Discretionary": (0, 1),  # "Candy Bar Boulevard"
# MAGIC     "Communication Services": (1, 1),  # "Bubblegum Broadcasting"
# MAGIC     "Industrials":            (2, 1),  # "Gumball Factory Row"
# MAGIC     "Consumer Staples":       (0, 2),  # "Sugar & Spice Market"
# MAGIC     "Energy":                 (1, 2),  # "Rock Candy Refinery"
# MAGIC     "Utilities":              (2, 2),  # "Licorice Power Grid"
# MAGIC     "Real Estate":            (0, 3),  # "Gingerbread Heights"
# MAGIC     "Materials":              (1, 3),  # "Caramel Quarry"
# MAGIC }
# MAGIC SECTOR_SIZE = 50   # world units per sector block
# MAGIC STORE_SPACING = 2.5
# MAGIC ```

# COMMAND ----------

SECTOR_POSITIONS = {
    "Technology":             (0, 0),
    "Healthcare":             (1, 0),
    "Financials":             (2, 0),
    "Consumer Discretionary": (0, 1),
    "Communication Services": (1, 1),
    "Industrials":            (2, 1),
    "Consumer Staples":       (0, 2),
    "Energy":                 (1, 2),
    "Utilities":              (2, 2),
    "Real Estate":            (0, 3),
    "Materials":              (1, 3),
}

SECTOR_NAMES = {
    "Technology":             "Pixel Candy Arcade",
    "Healthcare":             "Medicine Drop Apothecary",
    "Financials":             "Chocolate Coin District",
    "Consumer Discretionary": "Candy Bar Boulevard",
    "Communication Services": "Bubblegum Broadcasting",
    "Industrials":            "Gumball Factory Row",
    "Consumer Staples":       "Sugar & Spice Market",
    "Energy":                 "Rock Candy Refinery",
    "Utilities":              "Licorice Power Grid",
    "Real Estate":            "Gingerbread Heights",
    "Materials":              "Caramel Quarry",
}

SECTOR_SIZE = 50.0
STORE_SPACING = 2.5

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Stock Records with City Positions

# COMMAND ----------

# Collect snapshot to driver for JSON construction
stocks_rows = (
    snapshot_df
    .orderBy("sector", F.desc("market_cap_percentile"))
    .collect()
)

print(f"Building payload for {len(stocks_rows)} stocks")

# COMMAND ----------

# Assign grid positions within each sector
sector_counters = {}  # track index within each sector
stocks_payload = []

for row in stocks_rows:
    ticker = row["ticker"]
    sector = row["sector"] or "Unknown"

    # Get sector grid position
    sector_col, sector_row = SECTOR_POSITIONS.get(sector, (2, 3))  # fallback position
    sector_origin_x = sector_col * SECTOR_SIZE
    sector_origin_z = sector_row * SECTOR_SIZE

    # Track index within sector for sub-grid placement
    if sector not in sector_counters:
        sector_counters[sector] = 0
    idx = sector_counters[sector]
    sector_counters[sector] += 1

    # Compute number of columns in sector sub-grid
    # (we will fix this after collecting all stocks per sector)
    # For now, store idx and compute position later
    stocks_payload.append({
        "ticker": ticker,
        "sector": sector,
        "sector_idx": idx,
        "sector_origin_x": sector_origin_x,
        "sector_origin_z": sector_origin_z,
        # Price & returns
        "close": float(row["Close"]) if row["Close"] is not None else 0.0,
        "daily_return": round(float(row["daily_return"]), 6) if row["daily_return"] is not None else 0.0,
        "drawdown_current": round(float(row["drawdown_pct"]), 4) if row["drawdown_pct"] is not None else 0.0,
        "volume_percentile": round(float(row["volume_percentile"]), 4) if row["volume_percentile"] is not None else 0.0,
        "volatility_percentile": round(float(row["vol_percentile"]), 4) if row["vol_percentile"] is not None else 0.0,
        # Market cap proxy
        "market_cap_rank": round(float(row["market_cap_percentile"]), 4) if row["market_cap_percentile"] is not None else 0.5,
        # Golden tickets
        "golden_score": int(row["golden_score"]) if row["golden_score"] is not None else 0,
        "ticket_levels": {
            "dip_ticket": bool(row["ticket_1_dip"]),
            "shock_ticket": bool(row["ticket_2_shock"]),
            "asymmetry_ticket": bool(row["ticket_3_asymmetry"]),
            "dislocation_ticket": bool(row["ticket_4_dislocation"]),
            "convexity_ticket": bool(row["ticket_5_convexity"]),
        },
        "is_platinum": bool(row["is_platinum"]),
        "rarity_percentile": round(float(row["rarity_percentile"]), 4) if row["rarity_percentile"] is not None else 0.0,
        # Direction bias
        "direction_bias": {
            "buy": round(float(row["buy_pct"]), 2) if row["buy_pct"] is not None else 0.25,
            "call": round(float(row["call_pct"]), 2) if row["call_pct"] is not None else 0.25,
            "put": round(float(row["put_pct"]), 2) if row["put_pct"] is not None else 0.25,
            "short": round(float(row["short_pct"]), 2) if row["short_pct"] is not None else 0.25,
        },
        # Forward return distribution
        "forward_return_distribution": {
            "p5": round(float(row["fwd_60d_p5"]), 4) if row["fwd_60d_p5"] is not None else 0.0,
            "p25": round(float(row["fwd_60d_p25"]), 4) if row["fwd_60d_p25"] is not None else 0.0,
            "median": round(float(row["fwd_60d_median"]), 4) if row["fwd_60d_median"] is not None else 0.0,
            "p75": round(float(row["fwd_60d_p75"]), 4) if row["fwd_60d_p75"] is not None else 0.0,
            "p95": round(float(row["fwd_60d_p95"]), 4) if row["fwd_60d_p95"] is not None else 0.0,
            "skew": round(float(row["fwd_60d_skew"]), 4) if row["fwd_60d_skew"] is not None else 0.0,
        },
        # Store dimensions
        "store_dimensions": {
            "width": round(float(row["store_width"]), 2) if row["store_width"] is not None else 1.5,
            "height": round(float(row["store_height"]), 2) if row["store_height"] is not None else 2.0,
            "depth": round(float(row["store_depth"]), 2) if row["store_depth"] is not None else 1.2,
            "glow": round(float(row["store_glow"]), 2) if row["store_glow"] is not None else 0.0,
        },
        # Agent simulation
        "agent_density": int(row["agent_density"]) if row["agent_density"] is not None else 200,
        "speed_multiplier": round(float(row["speed_multiplier"]), 2) if row["speed_multiplier"] is not None else 1.0,
        # Technical indicators for UI
        "technicals": {
            "rsi_14": round(float(row["rsi_14"]), 2) if row["rsi_14"] is not None else 50.0,
            "macd_histogram": round(float(row["macd_histogram"]), 4) if row["macd_histogram"] is not None else 0.0,
            "bb_pct_b": round(float(row["bb_pct_b"]), 4) if row["bb_pct_b"] is not None else 0.5,
            "zscore_20d": round(float(row["zscore_20d"]), 4) if row["zscore_20d"] is not None else 0.0,
            "realized_vol_20d": round(float(row["realized_vol_20d"]), 4) if row["realized_vol_20d"] is not None else 0.0,
        },
    })

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute City Grid Positions
# MAGIC Within each sector, sort stocks by market cap (descending) and place in a sub-grid.

# COMMAND ----------

# Count stocks per sector to determine sub-grid dimensions
sector_stock_counts = {}
for stock in stocks_payload:
    s = stock["sector"]
    sector_stock_counts[s] = sector_stock_counts.get(s, 0) + 1

# Assign (x, z) world positions
for stock in stocks_payload:
    sector = stock["sector"]
    idx = stock["sector_idx"]
    n_stocks = sector_stock_counts.get(sector, 1)

    # Sub-grid: cols = ceil(sqrt(n_stocks))
    cols = max(1, math.ceil(math.sqrt(n_stocks)))
    row_in_sector = idx // cols
    col_in_sector = idx % cols

    # World position
    stock["city_position"] = {
        "x": round(stock["sector_origin_x"] + col_in_sector * STORE_SPACING, 2),
        "y": 0.0,
        "z": round(stock["sector_origin_z"] + row_in_sector * STORE_SPACING, 2),
    }

    # Clean up temp fields
    del stock["sector_idx"]
    del stock["sector_origin_x"]
    del stock["sector_origin_z"]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Correlation Edges (Top Pairs)
# MAGIC Compute pairwise Pearson correlations on daily returns across the full history.
# MAGIC Keep only edges above threshold (0.5) to manage frontend performance.

# COMMAND ----------

# Pivot daily returns to wide format for correlation computation
returns_df = (
    gold_df.filter(F.col("daily_return").isNotNull())
    .select("ticker", "Date", "daily_return")
)

# For efficiency, compute correlations on a sampled set of tickers or limit pairs
# Use Spark's built-in corr function on pivoted data
# First, get the distinct tickers with data on the latest date
active_tickers = [s["ticker"] for s in stocks_payload]

# Pivot: each column is a ticker, rows are dates, values are daily returns
pivot_df = (
    returns_df
    .filter(F.col("ticker").isin(active_tickers))
    .groupBy("Date")
    .pivot("ticker")
    .agg(F.first("daily_return"))
    .orderBy("Date")
)

# Collect to pandas for correlation matrix computation (more practical for 500x500)
import pandas as pd
import numpy as np

returns_pdf = pivot_df.toPandas().set_index("Date")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Correlation Matrix & Extract Top Edges

# COMMAND ----------

CORRELATION_THRESHOLD = 0.5
MAX_EDGES = 2000  # cap for frontend performance

# Compute Pearson correlation matrix
corr_matrix = returns_pdf.corr(method="pearson")

# Extract edges above threshold
edges = []
tickers_list = list(corr_matrix.columns)

for i in range(len(tickers_list)):
    for j in range(i + 1, len(tickers_list)):
        corr_val = corr_matrix.iloc[i, j]
        if not np.isnan(corr_val) and abs(corr_val) >= CORRELATION_THRESHOLD:
            edges.append({
                "source": tickers_list[i],
                "target": tickers_list[j],
                "weight": round(float(corr_val), 4),
            })

# Sort by absolute weight descending, keep top MAX_EDGES
edges.sort(key=lambda e: abs(e["weight"]), reverse=True)
edges = edges[:MAX_EDGES]

print(f"Correlation edges above {CORRELATION_THRESHOLD}: {len(edges)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Sector Metadata

# COMMAND ----------

sectors_payload = []

for sector_name, (grid_col, grid_row) in SECTOR_POSITIONS.items():
    candy_name = SECTOR_NAMES.get(sector_name, sector_name)
    stock_count = sector_stock_counts.get(sector_name, 0)

    # Sector-level aggregates
    sector_stocks = [s for s in stocks_payload if s["sector"] == sector_name]
    avg_golden = sum(s["golden_score"] for s in sector_stocks) / max(len(sector_stocks), 1)
    platinum_count = sum(1 for s in sector_stocks if s["is_platinum"])
    total_agents = sum(s["agent_density"] for s in sector_stocks)

    sectors_payload.append({
        "name": sector_name,
        "candy_district": candy_name,
        "grid_position": {"col": grid_col, "row": grid_row},
        "origin": {
            "x": grid_col * SECTOR_SIZE,
            "z": grid_row * SECTOR_SIZE,
        },
        "stock_count": stock_count,
        "avg_golden_score": round(avg_golden, 2),
        "platinum_count": platinum_count,
        "total_agents": total_agents,
    })

# COMMAND ----------

# MAGIC %md
# MAGIC ## Assemble Final Payload

# COMMAND ----------

payload = {
    "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "snapshot_date": str(latest_date),
    "regime": current_regime,
    "stock_count": len(stocks_payload),
    "total_agents": sum(s["agent_density"] for s in stocks_payload),
    "platinum_count": sum(1 for s in stocks_payload if s["is_platinum"]),
    "golden_score_distribution": {
        str(score): sum(1 for s in stocks_payload if s["golden_score"] == score)
        for score in range(6)
    },
    "stocks": stocks_payload,
    "correlation_edges": edges,
    "sectors": sectors_payload,
    "config": {
        "sector_size": SECTOR_SIZE,
        "store_spacing": STORE_SPACING,
        "correlation_threshold": CORRELATION_THRESHOLD,
        "grid_layout": "3x4",
    },
}

print(f"Payload assembled:")
print(f"  Stocks: {payload['stock_count']}")
print(f"  Correlation edges: {len(payload['correlation_edges'])}")
print(f"  Sectors: {len(payload['sectors'])}")
print(f"  Total agents: {payload['total_agents']}")
print(f"  Platinum stores: {payload['platinum_count']}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write to DBFS

# COMMAND ----------

payload_json = json.dumps(payload, indent=2)

# Write to DBFS
dbfs_path = "/FileStore/sweetreturns/frontend_payload.json"
dbutils.fs.put(dbfs_path, payload_json, overwrite=True)
print(f"Written to dbfs:{dbfs_path}")
print(f"Payload size: {len(payload_json):,} bytes")

# Also write a minified version for production
payload_min = json.dumps(payload, separators=(",", ":"))
dbfs_path_min = "/FileStore/sweetreturns/frontend_payload.min.json"
dbutils.fs.put(dbfs_path_min, payload_min, overwrite=True)
print(f"Minified written to dbfs:{dbfs_path_min}")
print(f"Minified size: {len(payload_min):,} bytes")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Optional: Write to Mounted Storage (Azure Blob / S3)
# MAGIC Uncomment the following if you have a mount configured.

# COMMAND ----------

# # Azure Blob Storage mount example:
# MOUNT_PATH = "/mnt/sweetreturns-export"
#
# # Check if mount exists
# try:
#     dbutils.fs.ls(MOUNT_PATH)
#     mount_exists = True
# except:
#     mount_exists = False
#     print(f"Mount {MOUNT_PATH} not found. Skipping external write.")
#
# if mount_exists:
#     export_path = f"{MOUNT_PATH}/frontend_payload.json"
#     dbutils.fs.put(export_path, payload_json, overwrite=True)
#     print(f"Written to mounted storage: {export_path}")
#
#     export_path_min = f"{MOUNT_PATH}/frontend_payload.min.json"
#     dbutils.fs.put(export_path_min, payload_min, overwrite=True)
#     print(f"Minified written to mounted storage: {export_path_min}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Correlation Matrix as Separate File (for Graph Playground)

# COMMAND ----------

# Build the graph endpoint payload separately
graph_payload = {
    "threshold": CORRELATION_THRESHOLD,
    "regime": current_regime,
    "nodes": [
        {
            "id": s["ticker"],
            "sector": s["sector"],
            "golden_score": s["golden_score"],
        }
        for s in stocks_payload
    ],
    "edges": edges,
}

graph_json = json.dumps(graph_payload, indent=2)
dbfs_graph_path = "/FileStore/sweetreturns/correlation_graph.json"
dbutils.fs.put(dbfs_graph_path, graph_json, overwrite=True)
print(f"Graph payload written to dbfs:{dbfs_graph_path}")
print(f"Graph payload size: {len(graph_json):,} bytes ({len(edges)} edges)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Validation: Sample Output

# COMMAND ----------

# Show a few sample stocks from the payload
print("=== Sample Stocks ===")
for stock in stocks_payload[:5]:
    print(json.dumps({
        "ticker": stock["ticker"],
        "sector": stock["sector"],
        "golden_score": stock["golden_score"],
        "is_platinum": stock["is_platinum"],
        "rarity_percentile": stock["rarity_percentile"],
        "direction_bias": stock["direction_bias"],
        "city_position": stock["city_position"],
        "agent_density": stock["agent_density"],
    }, indent=2))
    print("---")

# COMMAND ----------

# Summary statistics
print("=== Golden Score Distribution ===")
for score, count in sorted(payload["golden_score_distribution"].items()):
    bar = "#" * (count // 5)
    print(f"  Score {score}: {count:>5} stocks {bar}")

print(f"\n=== Sector Summary ===")
for sector in payload["sectors"]:
    print(f"  {sector['candy_district']:30s} | {sector['stock_count']:>3} stocks | "
          f"avg_score={sector['avg_golden_score']:.2f} | "
          f"platinum={sector['platinum_count']} | "
          f"agents={sector['total_agents']:,}")

print(f"\n=== Correlation Network ===")
print(f"  Total edges (|corr| >= {CORRELATION_THRESHOLD}): {len(edges)}")
if edges:
    print(f"  Strongest: {edges[0]['source']}-{edges[0]['target']} ({edges[0]['weight']:.4f})")
    print(f"  Weakest kept: {edges[-1]['source']}-{edges[-1]['target']} ({edges[-1]['weight']:.4f})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Download URLs
# MAGIC After running this notebook, download the JSON files from:
# MAGIC ```
# MAGIC https://<databricks-host>/files/sweetreturns/frontend_payload.json
# MAGIC https://<databricks-host>/files/sweetreturns/frontend_payload.min.json
# MAGIC https://<databricks-host>/files/sweetreturns/correlation_graph.json
# MAGIC ```
# MAGIC Or use the Databricks CLI:
# MAGIC ```bash
# MAGIC databricks fs cp dbfs:/FileStore/sweetreturns/frontend_payload.json ./public/frontend_payload.json
# MAGIC databricks fs cp dbfs:/FileStore/sweetreturns/correlation_graph.json ./public/correlation_graph.json
# MAGIC ```
