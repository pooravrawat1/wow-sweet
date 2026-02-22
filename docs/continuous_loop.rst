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
   /api/advance (Vercel Serverless — pure SQL)            │
   │  Reads next date from silver.daily_features          │
   │  Computes gold tickets via SQL Warehouse             │
   │  Appends to golden_tickets table                     │
   │  No compute cluster required                         │
   │                                                      │
   ▼                                                      │
   /api/stocks (Vercel Serverless)                        │
   │  Serves latest snapshot from golden_tickets          │
   │  60s CDN cache                                       │
   │                                                      │
   ▼                                                      │
   FRONTEND (React, polls every 60s)                      │
   │  Detects new snapshot_date → refreshes city          │
   │  Agents trade all stocks                             │
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

3. **Manual Trigger** — Call ``GET /api/advance`` directly via curl or browser.

How Advance Works
-----------------

The ``/api/advance`` endpoint uses **pure SQL** via the Databricks SQL Warehouse.
No compute cluster is needed.

1. **Find next date**: Queries ``MAX(date)`` from ``golden_tickets`` and finds
   the next available date in ``silver.daily_features``.

2. **Compute gold tickets**: Runs a single ``INSERT INTO ... SELECT`` statement
   with CTEs that compute tickets from silver features:

   - **Dip Ticket**: ``drawdown_percentile > 0.80``
   - **Shock Ticket**: drawdown + volume + volatility thresholds
   - **Asymmetry Ticket**: forward return profile
   - **Dislocation Ticket**: momentum reversal signal
   - **Convexity Ticket**: all conditions align

3. **Verify**: Confirms rows were inserted for the target date.

4. **Wrap-around**: When all silver dates are consumed, clears ``golden_tickets``
   and restarts from the 253rd date (enough lookback for valid features).

Simulation Feedback
-------------------

The loop creates a reinforcement signal:

- **Crowd sentiment** flows back to Databricks via ``simulation_results``
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
| ``sweetreturns.silver.daily_features``    | Technical indicators per ticker/date      |
+-------------------------------------------+-------------------------------------------+
| ``sweetreturns.gold.golden_tickets``      | Final scored stocks served to frontend    |
+-------------------------------------------+-------------------------------------------+
| ``sweetreturns.gold.simulation_results``  | Frontend simulation feedback (trades +    |
|                                           | crowd metrics) used by next cycle         |
+-------------------------------------------+-------------------------------------------+

Dataset Wrapping
----------------

When all dates in the dataset (1970-2017) are consumed,
``/api/advance`` wraps around:

1. Detects no more dates after current ``MAX(date)``
2. Clears ``golden_tickets`` (``DELETE FROM``)
3. Restarts from the 253rd date (ensures enough lookback)
4. The cycle continues indefinitely
