Databricks Pipeline
====================

The data pipeline follows the medallion architecture (bronze → silver → gold)
running on Databricks with PySpark and Delta Lake.

CLI Runner
----------

All pipeline steps are managed by ``databricks/cli_pipeline.py``:

.. code-block:: bash

   # Run full pipeline
   python databricks/cli_pipeline.py --step all

   # Run individual steps
   python databricks/cli_pipeline.py --step bronze
   python databricks/cli_pipeline.py --step silver
   python databricks/cli_pipeline.py --step gold

   # Check connectivity
   python databricks/cli_pipeline.py --check-only

Bronze Layer
------------

**Script:** ``databricks/bronze_ingestion.py``

Ingests raw stock data from Kaggle CSV into Delta Lake:

- 602,000 rows covering 491 tickers over 5 years
- Columns: Date, Open, High, Low, Close, Adj Close, Volume, Company
- Adds sector mapping via predefined ticker-to-sector lookup
- Output: ``sweetreturns.bronze.raw_stock_data``

Silver Layer
------------

**Script:** ``databricks/silver_features.py``

Computes 50+ technical indicators per ticker per date:

- **Returns:** daily_return, log_return, rolling returns (5d, 20d, 60d)
- **Drawdown:** drawdown_pct, drawdown_percentile, expanding_max_close
- **Volatility:** realized_vol_20d, realized_vol_60d, vol_percentile
- **RSI:** 14-period Relative Strength Index
- **MACD:** macd_line, macd_signal, macd_histogram
- **Bollinger Bands:** bb_upper, bb_lower, bb_pct_b
- **Z-scores:** zscore_20d
- **Forward returns:** 5d, 20d, 60d with skew and percentile distribution
- **Mean reversion:** rolling return autocorrelation over 60d window
- **SPY relative:** relative_return_vs_spy, relative_return_percentile
- **Vol regime:** favorable vs elevated based on SPY vol 80th percentile

Output: ``sweetreturns.silver.stock_features``

Gold Layer
----------

**Script:** ``databricks/gold_tickets.py``

Evaluates golden ticket criteria and computes store parameters:

- 5 ticket types (see Architecture Overview)
- ``golden_score``: sum of active tickets (0-5)
- ``rarity_percentile``: cross-sectional rank within each date
- ``is_platinum``: extreme rarity detection
- Direction bias: buy_pct, call_pct, put_pct, short_pct
- Store dimensions: width, height, depth, glow (based on market cap)
- Agent density and speed multiplier (based on golden score)

Output: ``sweetreturns.gold.golden_tickets``

Incremental Processing
-----------------------

**Script:** ``databricks/advance_snapshot.py``

Processes one trading day at a time (used by the continuous loop):

1. Reads ``MAX(Date)`` from ``golden_tickets``
2. Finds the next available date in ``bronze.raw_stock_data``
3. Computes all silver features using lookback window
4. Evaluates gold ticket criteria
5. Reads simulation feedback from ``simulation_results`` table
6. Blends crowd sentiment into direction biases (80% base + 20% crowd)
7. Appends to ``golden_tickets`` with ``mergeSchema=true``
8. Wraps around to start when dataset is fully consumed
