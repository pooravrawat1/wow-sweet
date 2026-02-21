# Databricks notebook source
# MAGIC %md
# MAGIC # ML: Correlation Graph & Shock Propagation
# MAGIC Computes a Pearson correlation matrix from daily returns across all tickers,
# MAGIC builds a NetworkX graph with edges above a configurable threshold, and implements
# MAGIC a `propagate_shock()` function for BFS-based shock propagation through the
# MAGIC correlation network.
# MAGIC
# MAGIC - Computes network centrality features (degree, betweenness, eigenvector, PageRank)
# MAGIC - Detects communities using Louvain algorithm
# MAGIC - Saves the graph to DBFS as pickle and JSON
# MAGIC - Saves node features to `sweetreturns.gold.network_features`
# MAGIC
# MAGIC ## Prerequisites
# MAGIC - `%pip install networkx python-louvain`

# COMMAND ----------

# MAGIC %pip install networkx python-louvain

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, IntegerType
import pandas as pd
import numpy as np
import networkx as nx
from community import community_louvain
import json
import pickle

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

CORRELATION_THRESHOLD = 0.5    # Minimum absolute correlation to create an edge
NEGATIVE_EDGE_THRESHOLD = -0.3  # Also track strong negative correlations
MIN_OBSERVATIONS = 60          # Minimum overlapping trading days for valid correlation
SHOCK_DEFAULT_MAGNITUDE = -0.10  # Default shock: -10% drop
SHOCK_DECAY_FACTOR = 0.6       # Each hop, shock magnitude decays by this factor
SHOCK_MAX_HOPS = 5             # Maximum BFS depth for shock propagation

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Daily Returns Data

# COMMAND ----------

# Read silver daily features for daily returns
silver_df = spark.table("sweetreturns.silver.daily_features")

returns_df = (
    silver_df
    .filter(F.col("daily_return").isNotNull())
    .select("ticker", "Date", "daily_return", "sector")
)

# Get distinct tickers and their sectors
ticker_sectors = (
    returns_df
    .select("ticker", "sector")
    .distinct()
    .collect()
)
ticker_sector_map = {row["ticker"]: row["sector"] for row in ticker_sectors}

print(f"Tickers with return data: {len(ticker_sector_map)}")
print(f"Total return observations: {returns_df.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pivot to Wide Format & Compute Correlation Matrix

# COMMAND ----------

# Pivot: rows = dates, columns = tickers, values = daily returns
pivot_df = (
    returns_df
    .groupBy("Date")
    .pivot("ticker")
    .agg(F.first("daily_return"))
    .orderBy("Date")
)

# Convert to pandas for correlation computation
returns_wide = pivot_df.toPandas().set_index("Date")
print(f"Returns matrix shape: {returns_wide.shape}")

# Drop tickers with too few observations
valid_tickers = returns_wide.columns[returns_wide.notna().sum() >= MIN_OBSERVATIONS]
returns_wide = returns_wide[valid_tickers]
print(f"Tickers after min-observation filter ({MIN_OBSERVATIONS}d): {len(valid_tickers)}")

# Compute Pearson correlation matrix
corr_matrix = returns_wide.corr(method="pearson")
print(f"Correlation matrix shape: {corr_matrix.shape}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build NetworkX Graph
# MAGIC Nodes represent tickers, edges represent correlations above threshold.

# COMMAND ----------

G = nx.Graph()

# Add all tickers as nodes with sector attribute
for ticker in corr_matrix.columns:
    G.add_node(
        ticker,
        sector=ticker_sector_map.get(ticker, "Unknown"),
    )

# Add edges for correlations above threshold
edge_count = 0
negative_edge_count = 0
tickers_list = list(corr_matrix.columns)

for i in range(len(tickers_list)):
    for j in range(i + 1, len(tickers_list)):
        corr_val = corr_matrix.iloc[i, j]
        if np.isnan(corr_val):
            continue

        # Positive correlation edges
        if corr_val >= CORRELATION_THRESHOLD:
            G.add_edge(
                tickers_list[i], tickers_list[j],
                weight=float(corr_val),
                edge_type="positive",
            )
            edge_count += 1

        # Negative correlation edges (tracked separately)
        elif corr_val <= NEGATIVE_EDGE_THRESHOLD:
            G.add_edge(
                tickers_list[i], tickers_list[j],
                weight=float(corr_val),
                edge_type="negative",
            )
            negative_edge_count += 1

print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
print(f"  Positive edges (corr >= {CORRELATION_THRESHOLD}): {edge_count}")
print(f"  Negative edges (corr <= {NEGATIVE_EDGE_THRESHOLD}): {negative_edge_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Network Centrality Features
# MAGIC These features quantify each stock's importance in the correlation network.

# COMMAND ----------

# Subgraph with only positive edges for centrality
G_positive = G.copy()
negative_edges = [(u, v) for u, v, d in G_positive.edges(data=True) if d.get("edge_type") == "negative"]
G_positive.remove_edges_from(negative_edges)

# Degree centrality: fraction of nodes each node is connected to
degree_centrality = nx.degree_centrality(G_positive)

# Betweenness centrality: how often a node lies on shortest paths
betweenness_centrality = nx.betweenness_centrality(G_positive, weight="weight")

# Eigenvector centrality: connected to other highly-connected nodes
try:
    eigenvector_centrality = nx.eigenvector_centrality_numpy(G_positive, weight="weight")
except Exception:
    eigenvector_centrality = {n: 0.0 for n in G_positive.nodes()}

# PageRank: Google-style importance
pagerank = nx.pagerank(G_positive, weight="weight")

print("Centrality features computed.")
print(f"  Top 5 by degree: {sorted(degree_centrality, key=degree_centrality.get, reverse=True)[:5]}")
print(f"  Top 5 by PageRank: {sorted(pagerank, key=pagerank.get, reverse=True)[:5]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Community Detection (Louvain)
# MAGIC Identify clusters of highly correlated stocks.

# COMMAND ----------

# Louvain community detection on positive-edge subgraph
communities = community_louvain.best_partition(G_positive, weight="weight", resolution=1.0)

# Count communities
community_counts = {}
for node, comm_id in communities.items():
    community_counts[comm_id] = community_counts.get(comm_id, 0) + 1

print(f"Detected {len(community_counts)} communities:")
for comm_id, count in sorted(community_counts.items(), key=lambda x: -x[1]):
    # Show sector composition of each community
    comm_tickers = [t for t, c in communities.items() if c == comm_id]
    sector_dist = {}
    for t in comm_tickers:
        s = ticker_sector_map.get(t, "Unknown")
        sector_dist[s] = sector_dist.get(s, 0) + 1
    top_sector = max(sector_dist, key=sector_dist.get)
    print(f"  Community {comm_id}: {count} stocks (dominant: {top_sector} [{sector_dist[top_sector]}])")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Shock Propagation Function
# MAGIC BFS-based shock propagation through the correlation network.
# MAGIC When a stock drops, correlated stocks are impacted proportionally to edge weight.

# COMMAND ----------

def propagate_shock(graph, source_ticker, initial_magnitude=-0.10,
                    decay_factor=0.6, max_hops=5, min_impact=0.001):
    """
    Propagate a price shock through the correlation network using BFS.

    When a stock experiences a significant drop, correlated stocks are
    expected to move in the same direction proportionally to their
    correlation strength.

    Parameters:
        graph (nx.Graph): Correlation network graph.
        source_ticker (str): The ticker where the shock originates.
        initial_magnitude (float): The initial shock magnitude (e.g., -0.10 for -10%).
        decay_factor (float): Multiplicative decay per hop (0 to 1).
        max_hops (int): Maximum BFS depth.
        min_impact (float): Minimum absolute impact to continue propagation.

    Returns:
        dict: Mapping of ticker -> expected impact magnitude.
              Positive correlation + negative shock = negative impact.
              Negative correlation + negative shock = positive impact (hedge).
    """
    if source_ticker not in graph:
        return {source_ticker: initial_magnitude}

    impacts = {source_ticker: initial_magnitude}
    visited = {source_ticker}
    frontier = [(source_ticker, initial_magnitude, 0)]  # (ticker, magnitude, hop_depth)

    while frontier:
        next_frontier = []
        for current_ticker, current_magnitude, hop in frontier:
            if hop >= max_hops:
                continue

            for neighbor in graph.neighbors(current_ticker):
                if neighbor in visited:
                    continue

                edge_data = graph.edges[current_ticker, neighbor]
                correlation = edge_data.get("weight", 0.0)
                edge_type = edge_data.get("edge_type", "positive")

                # Compute transmitted impact
                # Positive correlation: shock transmits in same direction
                # Negative correlation: shock transmits in opposite direction
                transmitted_impact = current_magnitude * abs(correlation) * decay_factor

                if edge_type == "negative" or correlation < 0:
                    transmitted_impact = -transmitted_impact  # Inverse for negative correlation

                # Only propagate if impact is significant
                if abs(transmitted_impact) < min_impact:
                    continue

                visited.add(neighbor)
                impacts[neighbor] = transmitted_impact
                next_frontier.append((neighbor, transmitted_impact, hop + 1))

        frontier = next_frontier

    return impacts


def simulate_scenario_shock(graph, shocked_tickers, magnitudes):
    """
    Simulate a multi-ticker shock scenario (e.g., sector-wide selloff).

    Parameters:
        graph (nx.Graph): Correlation network.
        shocked_tickers (list[str]): List of source tickers.
        magnitudes (list[float]): Corresponding shock magnitudes.

    Returns:
        dict: Combined impact per ticker (max absolute impact wins).
    """
    combined_impacts = {}

    for ticker, magnitude in zip(shocked_tickers, magnitudes):
        impacts = propagate_shock(
            graph, ticker,
            initial_magnitude=magnitude,
            decay_factor=SHOCK_DECAY_FACTOR,
            max_hops=SHOCK_MAX_HOPS,
        )
        for t, impact in impacts.items():
            if t not in combined_impacts:
                combined_impacts[t] = impact
            else:
                # Take the larger absolute impact
                if abs(impact) > abs(combined_impacts[t]):
                    combined_impacts[t] = impact

    return combined_impacts

# COMMAND ----------

# MAGIC %md
# MAGIC ## Test Shock Propagation
# MAGIC Simulate a -15% shock to NVDA and observe propagation.

# COMMAND ----------

# Example: NVDA drops 15%
nvda_impacts = propagate_shock(
    G, "NVDA",
    initial_magnitude=-0.15,
    decay_factor=SHOCK_DECAY_FACTOR,
    max_hops=SHOCK_MAX_HOPS,
)

print(f"NVDA -15% shock propagation ({len(nvda_impacts)} stocks affected):")
sorted_impacts = sorted(nvda_impacts.items(), key=lambda x: x[1])
for ticker, impact in sorted_impacts[:15]:
    sector = ticker_sector_map.get(ticker, "?")
    print(f"  {ticker:6s} ({sector:25s}): {impact:+.4f} ({impact*100:+.2f}%)")

print(f"\n  ... and {len(sorted_impacts) - 15} more stocks affected")

# COMMAND ----------

# Example: Multi-ticker scenario (tech selloff)
tech_selloff = simulate_scenario_shock(
    G,
    shocked_tickers=["AAPL", "MSFT", "NVDA", "GOOGL", "META"],
    magnitudes=[-0.08, -0.07, -0.12, -0.06, -0.09],
)

print(f"\nTech sector selloff simulation ({len(tech_selloff)} stocks affected):")
sorted_tech = sorted(tech_selloff.items(), key=lambda x: x[1])
for ticker, impact in sorted_tech[:20]:
    sector = ticker_sector_map.get(ticker, "?")
    print(f"  {ticker:6s} ({sector:25s}): {impact:+.4f}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Save Node Features to Gold Table

# COMMAND ----------

# Build node feature rows
node_features = []
for ticker in G.nodes():
    node_features.append((
        ticker,
        ticker_sector_map.get(ticker, "Unknown"),
        float(degree_centrality.get(ticker, 0.0)),
        float(betweenness_centrality.get(ticker, 0.0)),
        float(eigenvector_centrality.get(ticker, 0.0)),
        float(pagerank.get(ticker, 0.0)),
        int(communities.get(ticker, -1)),
        int(community_counts.get(communities.get(ticker, -1), 0)),
        int(G.degree(ticker)),
    ))

node_schema = StructType([
    StructField("ticker", StringType(), True),
    StructField("sector", StringType(), True),
    StructField("degree_centrality", DoubleType(), True),
    StructField("betweenness_centrality", DoubleType(), True),
    StructField("eigenvector_centrality", DoubleType(), True),
    StructField("pagerank", DoubleType(), True),
    StructField("community_id", IntegerType(), True),
    StructField("community_size", IntegerType(), True),
    StructField("edge_count", IntegerType(), True),
])

node_df = spark.createDataFrame(node_features, schema=node_schema)

(node_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.gold.network_features")
)

print("Gold table written: sweetreturns.gold.network_features")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Save Graph to DBFS
# MAGIC Save as both pickle (for Python reuse) and JSON (for frontend visualization).

# COMMAND ----------

# Save as pickle
graph_pickle = pickle.dumps(G)
dbfs_pickle_path = "/FileStore/sweetreturns/correlation_graph.pkl"
dbutils.fs.put(dbfs_pickle_path, graph_pickle.decode("latin-1"), overwrite=True)
print(f"Graph pickle saved to dbfs:{dbfs_pickle_path}")

# Save as JSON for frontend
graph_json = {
    "threshold": CORRELATION_THRESHOLD,
    "nodes": [
        {
            "id": ticker,
            "sector": ticker_sector_map.get(ticker, "Unknown"),
            "degree_centrality": round(degree_centrality.get(ticker, 0.0), 4),
            "pagerank": round(pagerank.get(ticker, 0.0), 6),
            "community_id": communities.get(ticker, -1),
        }
        for ticker in G.nodes()
    ],
    "edges": [
        {
            "source": u,
            "target": v,
            "weight": round(d["weight"], 4),
            "edge_type": d.get("edge_type", "positive"),
        }
        for u, v, d in G.edges(data=True)
    ],
    "communities": {
        str(k): v for k, v in community_counts.items()
    },
}

graph_json_str = json.dumps(graph_json, indent=2)
dbfs_json_path = "/FileStore/sweetreturns/correlation_network.json"
dbutils.fs.put(dbfs_json_path, graph_json_str, overwrite=True)
print(f"Graph JSON saved to dbfs:{dbfs_json_path} ({len(graph_json_str):,} bytes)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Quality Validation

# COMMAND ----------

spark.sql("""
    SELECT
        COUNT(*) as total_nodes,
        ROUND(AVG(degree_centrality), 4) as avg_degree_centrality,
        ROUND(AVG(pagerank), 6) as avg_pagerank,
        COUNT(DISTINCT community_id) as num_communities,
        ROUND(AVG(edge_count), 1) as avg_edges_per_node,
        MAX(edge_count) as max_edges
    FROM sweetreturns.gold.network_features
""").show(truncate=False)

# COMMAND ----------

# Top nodes by centrality
spark.sql("""
    SELECT ticker, sector, edge_count,
           ROUND(degree_centrality, 4) as degree,
           ROUND(betweenness_centrality, 4) as betweenness,
           ROUND(pagerank, 6) as pagerank,
           community_id
    FROM sweetreturns.gold.network_features
    ORDER BY pagerank DESC
    LIMIT 20
""").show(truncate=False)

# COMMAND ----------

# Community composition by sector
spark.sql("""
    SELECT community_id, sector, COUNT(*) as count
    FROM sweetreturns.gold.network_features
    GROUP BY community_id, sector
    ORDER BY community_id, count DESC
""").show(50, truncate=False)
