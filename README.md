# Wolf of Wall Sweet <img src="public/favicon.ico" alt="" width="40" height="40" style="vertical-align:middle;" />

**A Candy-Themed AI Agent Stock Market Simulation with Autonomous Trading Intelligence**

<p align="center">
  <img src="assets/wolf-of-wall-sweet-final.png" alt="Wolf of Wall Sweet" width="600" />
</p>

## Overview

500 publicly traded companies rendered as candy-themed storefronts in a 3D city. Autonomous AI agents — powered by Google Gemini — race between stores, physically collide, and compete for the most profitable trades in real time. Each store's size, color, and glow reflect its stock's performance, sector, and golden ticket status.

## Features

- **3D Candy City** — Walk through a procedurally generated city of 500 candy storefronts (Poisson disk sampling, InstancedMesh rendering)
- **10K+ AI Agents** — Autonomous crowd simulation with spatial hashing, pathfinding, door-fighting, and trade lane assignment (BUY / SHORT / CALL / PUT)
- **Live Trading Simulation** — Time slider drives day-by-day P&L accumulation with a live-updating agent leaderboard
- **First-Person Mode** — WASD + mouse look via pointer lock to walk the streets at eye level
- **Golden Ticket System** — 5-tier signal detection (Dip, Shock, Asymmetry, Dislocation, Convexity) + Platinum (Wonka Bar) rarity tier
- **Correlation Network** — GNN-based stock correlation graph rendered as candy cane connections between stores
- **Future Predictions** — Gemini-powered market predictions injected into the simulation
- **Whale Arena** — Large fund agents (Wonka Fund, Slugworth Fund, etc.) compete on a separate leaderboard
- **Time Travel** — Scrub through historical, present, and predictive future market states
- **Minimap** — Real-time overview of agent positions across the city

## Pages

| Page | Description |
|------|-------------|
| **Golden City** | Main 3D simulation — stores, agents, leaderboard, time slider |
| **Stock Network** | Force-directed graph of stock correlations |
| **Agent Network** | Agent relationship and archetype visualization |
| **Graph Playground** | Interactive GNN exploration |
| **Trade Journal** | Agent trade history and reasoning |
| **Agent Reactions** | Real-time agent sentiment and market reactions |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Three.js (@react-three/fiber) + Vite 7 |
| State | Zustand 5 |
| 3D | Three.js + @react-three/drei + InstancedMesh + custom shaders |
| Animation | GSAP + Framer Motion |
| Graphs | D3 + react-force-graph-3d |
| AI | Google Gemini API (agent decisions + predictions) |
| Data Pipeline | Databricks (PySpark + Delta Lake) |
| Dataset | Kaggle Yahoo Finance 5Y (602K rows, 491 tickers, 11 GICS sectors) |

## Databricks Medallion Pipeline

A full bronze → silver → gold pipeline processes raw stock data into trade-ready features:

```
Bronze (raw CSV)  →  Silver (50+ indicators)  →  Gold (signals + scores)  →  JSON export
```

| Stage | Notebook | Output |
|-------|----------|--------|
| Bronze | `bronze_ingestion.py` | Raw OHLCV + sector mapping to Delta Lake |
| Silver | `silver_features.py` | SMA, Bollinger, volatility, drawdown, momentum, forward returns |
| Gold | `gold_tickets.py` | Golden ticket scoring (5 tiers), store dimensions, platinum detection |
| Gold | `ml_regime_detection.py` | Bull / Bear / Neutral market regime labels |
| Gold | `ml_correlation_graph.py` | GNN correlation network + community detection |
| Gold | `gold_agent_archetypes.py` | 20+ agent personality archetypes with trading parameters |
| Export | `export_json.py` | `frontend_payload.json` for the 3D city |

### 2008 Financial Crash Validation

Two validation notebooks prove zero lookahead bias across the pipeline:

**`validate_medallion.py`** — Bronze → Silver integrity:
- Row drop rate < 1%, zero tickers lost, OHLCV non-null
- GNN metadata (sector, company) preserved, network referential integrity

**`validate_2008_crash.py`** — Zero lookahead bias for 2008 crash demo:
- Forward returns (`fwd_return_5d`, `fwd_return_20d`) verified against raw prices
- SMA-20 confirmed backward-looking only during crash window
- Drawdowns use only past peaks (deepest: -0.998)
- Delta Lake Time Travel: v0 == current for all crash-era data
- Golden ticket scores match silver layer exactly
- Market regime correctly identifies 69% Bear during Sep 2008 – Mar 2009

## Golden Ticket Tiers

| Tier | Name | Signal |
|------|------|--------|
| 1 | Sour Candy Drop (Dip) | Deep drawdown from peak |
| 2 | Jawbreaker (Shock) | Drawdown + volume spike + volatility |
| 3 | Fortune Cookie (Asymmetry) | Positive skew + limited downside |
| 4 | Taffy Pull (Dislocation) | SPY underperformance + mean reversion |
| 5 | Golden Gummy Bear (Convexity) | All conditions in favorable regime |
| P | Wonka Bar (Platinum) | Score >= 4, top 2% rarity, extreme skew |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Production build
npm run build

# Lint
npm run lint
```

### Environment Variables

For Gemini-powered predictions, set:
```
VITE_GEMINI_API_KEY=your-gemini-api-key
```

For Databricks pipeline (optional):
```
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=your-token
DATABRICKS_SQL_WAREHOUSE_PATH=/sql/1.0/warehouses/your-warehouse-id
```

## Project Structure

```
src/
├── components/       # 3D scene components (city, stores, agents, effects)
├── pages/            # Route pages (GoldenCity, StockNetwork, TradeJournal, etc.)
├── services/         # AI services (Gemini, trade tracker, whale arena, WebSocket)
├── store/            # Zustand global state
├── hooks/            # Crowd simulation physics engine
├── data/             # Stock data generator + pipeline loader
└── types/            # TypeScript interfaces

databricks/
├── bronze_*.py       # Data ingestion (stocks, news, Reddit, macro)
├── silver_*.py       # Feature engineering (50+ indicators)
├── gold_*.py         # Signal scoring, archetypes, scenarios
├── ml_*.py           # ML models (FinBERT, GNN, regime detection)
├── validate_*.py     # Pipeline validation notebooks
└── cli_pipeline.py   # CLI runner for full pipeline
```
