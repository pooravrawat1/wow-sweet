Continuous Pipeline Loop
========================

The system runs as a self-sustaining feedback loop between Databricks and
the frontend. No manual intervention is needed once deployed.

Loop Architecture
-----------------

.. code-block:: text

   ┌──────────────────────────────────────────────────────┐
   │                                                      │
   ▼                                                      │
   DATABRICKS (advance_snapshot.py)                       │
   │  Process next trading day                            │
   │  bronze → silver features → gold tickets             │
   │  + Read simulation_results from previous cycle       │
   │  + Blend crowd sentiment into direction biases       │
   │                                                      │
   ▼                                                      │
   /api/stocks (Vercel Serverless)                        │
   │  Serves latest snapshot from golden_tickets          │
   │  60s CDN cache                                       │
   │                                                      │
   ▼                                                      │
   FRONTEND (React, polls every 60s)                      │
   │  Detects new snapshot_date → refreshes city          │
   │  24 agents + 4 whale funds trade all 609 stocks      │
   │  Generates trade P&L + crowd metrics per store       │
   │                                                      │
   ▼                                                      │
   /api/simulation (Vercel POST)                          │
   │  Writes trade results to simulation_results table    │
   │  Fire-and-forget (doesn't block UI)                  │
   │                                                      │
   └──────────────────────────────────────────────────────┘

Trigger Mechanisms
------------------

Three redundant trigger mechanisms ensure the pipeline keeps advancing:

1. **Vercel Cron** — ``vercel.json`` schedules ``/api/advance`` every 5 minutes.
   Requires Vercel Pro plan for sub-daily frequency.

2. **Frontend Staleness Detection** — If ``/api/stocks`` returns the same
   ``snapshot_date`` for 3 consecutive polls (3 minutes), the frontend
   auto-calls ``/api/advance`` to request a new day. Re-triggers every
   10 minutes if still stale.

3. **Databricks Jobs** (optional) — The CLI can create a native Databricks
   scheduled job:

   .. code-block:: bash

      python databricks/cli_pipeline.py --step create-job
      python databricks/cli_pipeline.py --step start-loop
      python databricks/cli_pipeline.py --step stop-loop
      python databricks/cli_pipeline.py --step loop-status

Simulation Feedback
-------------------

The loop creates a reinforcement signal:

- **Crowd sentiment** flows back to Databricks via ``simulation_results``
- **Direction biases** are blended: 80% technical analysis + 20% crowd sentiment
- **Agent learning**: agents bias toward historically profitable tickers (30% of decisions)
  and boost historically best actions by 20% weight
- **History endpoint**: ``/api/simulation_history`` provides aggregated performance data

Tables
------

+-------------------------------------------+-------------------------------------------+
| Table                                     | Purpose                                   |
+===========================================+===========================================+
| ``sweetreturns.bronze.raw_stock_data``    | Raw stock prices from Kaggle CSV          |
+-------------------------------------------+-------------------------------------------+
| ``sweetreturns.silver.stock_features``    | 50+ technical indicators per ticker/date  |
+-------------------------------------------+-------------------------------------------+
| ``sweetreturns.gold.golden_tickets``      | Final scored stocks served to frontend    |
+-------------------------------------------+-------------------------------------------+
| ``sweetreturns.gold.simulation_results``  | Frontend simulation feedback (trades +    |
|                                           | crowd metrics) used by next cycle         |
+-------------------------------------------+-------------------------------------------+

Dataset Wrapping
----------------

When all dates in the Kaggle dataset (2012-2017) are consumed,
``advance_snapshot.py`` wraps around:

1. Detects no more dates after current MAX(Date)
2. Clears ``golden_tickets`` (``DELETE FROM``)
3. Restarts from the 253rd date (ensures enough lookback)
4. The cycle continues indefinitely
