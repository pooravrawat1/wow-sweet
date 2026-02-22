Architecture Overview
=====================

System Components
-----------------

Wolf of Wall Sweet is a full-stack application with three main layers:

1. **Databricks Pipeline** — PySpark medallion architecture (bronze/silver/gold)
2. **Vercel Serverless API** — Python handlers at ``/api/*``
3. **React Frontend** — Three.js 3D city with Zustand state management

Data Flow
---------

.. code-block:: text

   Kaggle CSV (602K rows, 491 tickers)
        │
        ▼
   ┌─────────────┐
   │   BRONZE     │  Raw stock prices + sector mapping
   │   (Delta)    │  databricks/bronze_ingestion.py
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │   SILVER     │  50+ technical indicators (RSI, MACD, BB, z-scores)
   │   (Delta)    │  databricks/silver_features.py
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │    GOLD      │  Golden ticket scoring (5 tiers + Platinum)
   │   (Delta)    │  databricks/gold_tickets.py
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │ API Endpoints│  /api/stocks, /api/health, /api/simulation
   │  (Vercel)    │  api/stocks.py, api/health.py, etc.
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │  FRONTEND    │  React + Three.js 3D candy city
   │  (Browser)   │  src/pages/GoldenCityPage.tsx
   └─────────────┘

Golden Ticket System
--------------------

5 tiers based on market signals:

1. **Dip** (Sour Candy Drop) — deep drawdown (>80th percentile)
2. **Shock** (Jawbreaker) — drawdown + volume spike + high volatility
3. **Asymmetry** (Fortune Cookie) — positive skew + limited downside
4. **Dislocation** (Taffy Pull) — SPY underperformance + mean reversion signal
5. **Convexity** (Golden Gummy Bear) — all conditions in favorable vol regime
6. **Platinum** (Wonka Bar) — rarest: score >= 4, top 2% rarity, extreme skew

Frontend Data Fallback
----------------------

Three-tier fallback for resilience:

1. **Databricks Live** — Real-time data via SQL Warehouse (preferred)
2. **Static JSON** — Pre-exported ``frontend_payload.json``
3. **Synthetic** — Deterministic mock data generator (always works)
