API Endpoints
=============

All endpoints are Vercel serverless functions in the ``api/`` directory.
They use the Databricks SQL Statement REST API to query Delta Lake tables.

GET /api/health
---------------

Returns backend health and Databricks connectivity status.

**Response:**

.. code-block:: json

   {
     "status": "healthy",
     "databricks": true,
     "databricks_configured": true,
     "databricks_status": "connected",
     "stocks_available": true
   }

GET /api/stocks
---------------

Returns the latest snapshot of stock data from ``golden_tickets``.
Handles both legacy and canonical column naming conventions via
case-insensitive mapping.

**Response:**

.. code-block:: json

   {
     "stocks": [...],
     "correlation_edges": [],
     "snapshot_date": "2017-11-10",
     "stock_count": 609,
     "source": "databricks"
   }

Each stock includes:

- ``ticker``, ``sector``, ``close``, ``daily_return``
- ``golden_score`` (0-5), ``ticket_levels`` (5 booleans), ``is_platinum``
- ``direction_bias``: { buy, call, put, short } (probabilities summing to ~1)
- ``store_dimensions``: { width, height, depth, glow }
- ``forward_return_distribution``: { p5, p25, median, p75, p95, skew }
- ``technicals``: { rsi_14, macd_histogram, bb_pct_b, zscore_20d, realized_vol_20d }

**Cache:** 60 seconds (``s-maxage=60``)

POST /api/simulation
--------------------

Writes simulation results (agent trades + crowd metrics) back to Databricks.
Auto-creates the ``simulation_results`` table on first use.

**Request:**

.. code-block:: json

   {
     "snapshot_date": "2017-11-10",
     "trades": [
       {"ticker": "AAPL", "agent_name": "CandyTrader", "action": "BUY", "profit": 250.50}
     ],
     "crowd_metrics": [
       {"ticker": "AAPL", "buy": 5, "call": 3, "put": 2, "short": 1}
     ]
   }

**Response:**

.. code-block:: json

   {
     "status": "ok",
     "rows_inserted": 5,
     "trades_received": 1,
     "crowd_received": 1,
     "snapshot_date": "2017-11-10"
   }

**Limits:** 100 trades + 600 crowd metrics per submission, 500KB payload max.

GET /api/simulation_history
---------------------------

Returns aggregated simulation performance data for agent learning.

**Response includes:**

- ``crowd_sentiment``: per-ticker per-date crowd counts (last 5 snapshots)
- ``agent_leaderboard``: top 30 agents by total profit
- ``ticker_performance``: top 100 tickers by avg profit with best_action
- ``cycles``: { count, first_date, last_date, total_records }

**Cache:** 120 seconds

GET /api/advance
----------------

Triggers the advance_snapshot pipeline on Databricks to process the next
trading day. Called by Vercel cron and the frontend staleness detector.

**Response (submitted):**

.. code-block:: json

   {
     "action": "submitted",
     "message": "Advance snapshot submitted as run 12345",
     "run_id": 12345,
     "cluster_id": "0123-456789-abc"
   }

**Response (already running):**

.. code-block:: json

   {
     "action": "already_running",
     "message": "Run 12345 is already in progress",
     "run": {"run_id": 12345, "lifecycle": "RUNNING"}
   }

GET /api/advance_status
-----------------------

Returns pipeline status: current snapshot date, cluster state, recent runs.

.. code-block:: json

   {
     "status": "ok",
     "pipeline": {
       "current_date": "2017-11-10",
       "total_dates_processed": 1,
       "total_rows": 609,
       "simulation_cycles": 12,
       "simulation_records": 582
     },
     "cluster": {"id": "...", "name": "sweetreturns", "state": "RUNNING"},
     "recent_runs": [...]
   }
