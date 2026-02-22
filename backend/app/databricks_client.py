"""
SweetReturns — Databricks Client
=================================
Connects to a Databricks cluster via the SQL Connector to query
gold-layer Delta tables (FinBERT sentiment, HMM regimes, correlation
network, agent archetypes, precomputed scenario flows).

Falls back to keyword heuristics only when Databricks is unreachable.
"""

import os
import re
import logging
from typing import Optional

logger = logging.getLogger("sweetreturns.databricks")


class DatabricksClient:
    def __init__(self):
        # Accept both env var names (DATABRICKS_HOST from CLI pipeline, DATABRICKS_WORKSPACE_URL legacy)
        self.host = os.getenv(
            "DATABRICKS_HOST",
            os.getenv("DATABRICKS_WORKSPACE_URL", ""),
        ).rstrip("/")
        self.token = os.getenv("DATABRICKS_TOKEN", "")
        self.http_path = os.getenv("DATABRICKS_SQL_WAREHOUSE_PATH", "")
        self._connection = None
        self._connected = False

        # Cache for data that doesn't change often
        self._regime_cache: dict = {}
        self._archetype_cache: list = []
        self._network_cache: dict = {}

        if self.host and self.token:
            logger.info(f"Databricks configured: {self.host}")
        else:
            logger.warning(
                "Databricks credentials not set — running with local fallbacks. "
                "Set DATABRICKS_HOST and DATABRICKS_TOKEN in your .env"
            )

    # ── Connection Management ─────────────────────────────────────────────

    def _get_connection(self):
        """Lazy-connect to Databricks SQL. Returns connection or None."""
        if self._connection is not None:
            return self._connection

        if not self.host or not self.token:
            return None

        try:
            from databricks import sql as databricks_sql

            hostname = self.host.replace("https://", "").replace("http://", "")
            self._connection = databricks_sql.connect(
                server_hostname=hostname,
                http_path=self.http_path,
                access_token=self.token,
            )
            self._connected = True
            logger.info("Connected to Databricks SQL")
            return self._connection
        except ImportError:
            logger.warning(
                "databricks-sql-connector not installed. "
                "Install with: pip install databricks-sql-connector"
            )
            return None
        except Exception as e:
            logger.warning(f"Could not connect to Databricks: {e}")
            return None

    def _query(self, sql: str, params=None) -> list:
        """Execute SQL and return list of dicts. Returns [] on failure."""
        conn = self._get_connection()
        if conn is None:
            return []

        try:
            cursor = conn.cursor()
            if params:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql)
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            cursor.close()
            return [dict(zip(columns, row)) for row in rows]
        except Exception as e:
            logger.warning(f"Databricks query failed: {e}")
            # Reset connection on failure so next call retries
            self._connection = None
            self._connected = False
            return []

    def _query_scalar(self, sql: str, params=None):
        """Execute SQL and return single value. Returns None on failure."""
        rows = self._query(sql, params)
        if rows and rows[0]:
            first_val = list(rows[0].values())[0]
            return first_val
        return None

    @property
    def is_connected(self) -> bool:
        """Check if Databricks is configured and reachable."""
        if self._connected:
            return True
        # Try connecting
        return self._get_connection() is not None

    # ── Sentiment Analysis ────────────────────────────────────────────────

    async def analyze_sentiment(self, text: str) -> dict:
        """
        Analyze text sentiment. Tries:
        1. Databricks FinBERT model serving endpoint
        2. Query pre-computed FinBERT scores from gold.news_sentiment
        3. Keyword fallback
        """
        # Try FinBERT model serving endpoint
        if self.host and self.token:
            result = self._call_finbert_endpoint(text)
            if result:
                return result

        # Fallback: keyword-based sentiment
        return self._fallback_sentiment(text)

    def _call_finbert_endpoint(self, text: str) -> Optional[dict]:
        """Call FinBERT model serving endpoint on Databricks."""
        import requests as req

        endpoint = f"{self.host}/serving-endpoints/finbert-sentiment/invocations"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        try:
            response = req.post(
                endpoint,
                json={"inputs": [text[:512]]},
                headers=headers,
                timeout=10,
            )
            if response.status_code == 200:
                result = response.json()
                pred = result["predictions"][0]
                return {"score": pred["score"], "label": pred["label"]}
        except Exception as e:
            logger.debug(f"FinBERT endpoint unavailable: {e}")
        return None

    async def get_ticker_sentiment(self, ticker: str) -> Optional[dict]:
        """Get latest FinBERT sentiment for a ticker from gold.daily_sentiment."""
        rows = self._query(
            """
            SELECT sentiment_mean, sentiment_std, positive_ratio,
                   positive_count, negative_count, neutral_count,
                   sentiment_momentum_3d
            FROM sweetreturns.gold.daily_sentiment
            WHERE ticker = %s
            ORDER BY published_date DESC
            LIMIT 1
            """,
            [ticker],
        )
        if rows:
            row = rows[0]
            score = row.get("sentiment_mean", 0.0)
            return {
                "score": score,
                "label": "positive" if score > 0.1 else ("negative" if score < -0.1 else "neutral"),
                "positive_ratio": row.get("positive_ratio", 0.5),
                "momentum_3d": row.get("sentiment_momentum_3d", 0.0),
                "source": "finbert",
            }
        return None

    # ── Market Regime ─────────────────────────────────────────────────────

    async def get_current_regime(self) -> dict:
        """Get the latest HMM-detected market regime from gold.market_regimes."""
        if self._regime_cache:
            return self._regime_cache

        rows = self._query(
            """
            SELECT regime_label, regime_id, spy_close, spy_daily_return,
                   spy_realized_vol_20d, agent_base_urgency, buy_bias
            FROM sweetreturns.gold.market_regimes
            ORDER BY Date DESC
            LIMIT 1
            """
        )
        if rows:
            row = rows[0]
            self._regime_cache = {
                "regime": row.get("regime_label", "Neutral"),
                "regime_id": row.get("regime_id", 1),
                "spy_close": row.get("spy_close", 0),
                "spy_return": row.get("spy_daily_return", 0),
                "volatility": row.get("spy_realized_vol_20d", 0),
                "agent_urgency": row.get("agent_base_urgency", 1.0),
                "buy_bias": row.get("buy_bias", 0.4),
                "source": "hmm",
            }
            return self._regime_cache

        return {
            "regime": "Neutral",
            "regime_id": 1,
            "agent_urgency": 1.0,
            "buy_bias": 0.4,
            "source": "default",
        }

    # ── Correlation Network ───────────────────────────────────────────────

    async def get_network_features(self, ticker: str) -> Optional[dict]:
        """Get correlation network features for a ticker from gold.network_features."""
        rows = self._query(
            """
            SELECT degree_centrality, betweenness_centrality,
                   eigenvector_centrality, pagerank,
                   community_id, community_size, edge_count
            FROM sweetreturns.gold.network_features
            WHERE ticker = %s
            LIMIT 1
            """,
            [ticker],
        )
        if rows:
            return rows[0]
        return None

    # ── Agent Archetypes ──────────────────────────────────────────────────

    async def get_agent_archetypes(self) -> list:
        """Load all 100 agent archetypes from gold.agent_archetypes."""
        if self._archetype_cache:
            return self._archetype_cache

        rows = self._query(
            """
            SELECT archetype_id, base_type, variant, display_name,
                   capital, risk_tolerance, greed, fear,
                   news_sensitivity, contrarian_factor,
                   buy_prob, call_prob, put_prob, short_prob,
                   holding_period, aggression, walk_speed
            FROM sweetreturns.gold.agent_archetypes
            ORDER BY archetype_id
            """
        )
        if rows:
            self._archetype_cache = rows
            return rows
        return []

    # ── Precomputed Agent Flows ───────────────────────────────────────────

    async def get_agent_flows(self, scenario: str, timestamp: int) -> list:
        """
        Query precomputed agent flows from gold.precomputed_agent_flows.
        Falls back to mock data only if Databricks is unreachable.
        """
        rows = self._query(
            """
            SELECT archetype_id, target_ticker, action,
                   urgency AS confidence, 1 AS swarm_size
            FROM sweetreturns.gold.precomputed_agent_flows
            WHERE scenario_name = %s AND trade_date = (
                SELECT DISTINCT trade_date
                FROM sweetreturns.gold.precomputed_agent_flows
                WHERE scenario_name = %s
                ORDER BY trade_date
                LIMIT 1 OFFSET %s
            )
            ORDER BY urgency DESC
            LIMIT 100
            """,
            [scenario, scenario, timestamp],
        )
        if rows:
            return rows

        # Try aggregated flows table
        agg_rows = self._query(
            """
            SELECT target_ticker, total_agents AS swarm_size,
                   avg_urgency AS confidence,
                   CASE WHEN bullish_ratio > 0.5 THEN 'buy' ELSE 'sell' END AS action,
                   0 AS archetype_id
            FROM sweetreturns.gold.precomputed_flow_aggregations
            WHERE scenario_name = %s
            ORDER BY total_agents DESC
            LIMIT 50
            """,
            [scenario],
        )
        if agg_rows:
            return agg_rows

        # Databricks unreachable — mock flows
        return self._mock_agent_flows(scenario, timestamp)

    # ── Data Quality (from Databricks tables) ─────────────────────────────

    async def get_data_quality(self) -> dict:
        """Query data quality metrics directly from Databricks Delta tables."""
        quality = {"source": "databricks", "layers": {}}

        # Bronze layer
        bronze_count = self._query_scalar(
            "SELECT COUNT(*) FROM sweetreturns.bronze.raw_stock_data"
        )
        bronze_tickers = self._query_scalar(
            "SELECT COUNT(DISTINCT ticker) FROM sweetreturns.bronze.raw_stock_data"
        )
        if bronze_count is not None:
            quality["layers"]["bronze"] = {
                "row_count": int(bronze_count),
                "distinct_tickers": int(bronze_tickers or 0),
                "status": "ok",
            }

        # Silver layer
        silver_count = self._query_scalar(
            "SELECT COUNT(*) FROM sweetreturns.silver.stock_features"
        )
        if silver_count is not None:
            null_rsi = self._query_scalar(
                "SELECT COUNT(*) FROM sweetreturns.silver.stock_features WHERE rsi_14 IS NULL"
            )
            quality["layers"]["silver"] = {
                "row_count": int(silver_count),
                "null_rsi": int(null_rsi or 0),
                "status": "ok",
            }

        # Gold layer
        gold_count = self._query_scalar(
            "SELECT COUNT(*) FROM sweetreturns.gold.golden_tickets"
        )
        if gold_count is not None:
            platinum = self._query_scalar(
                "SELECT COUNT(*) FROM sweetreturns.gold.golden_tickets WHERE is_platinum = true"
            )
            quality["layers"]["gold"] = {
                "ticker_count": int(gold_count),
                "platinum_count": int(platinum or 0),
                "status": "ok",
            }

        # Sentiment
        sentiment_count = self._query_scalar(
            "SELECT COUNT(*) FROM sweetreturns.gold.news_sentiment"
        )
        if sentiment_count is not None:
            quality["layers"]["sentiment"] = {
                "scored_articles": int(sentiment_count),
                "status": "ok",
            }

        # Regimes
        regime_count = self._query_scalar(
            "SELECT COUNT(*) FROM sweetreturns.gold.market_regimes"
        )
        if regime_count is not None:
            quality["layers"]["regimes"] = {
                "regime_days": int(regime_count),
                "status": "ok",
            }

        # Agent flows
        flow_count = self._query_scalar(
            "SELECT COUNT(*) FROM sweetreturns.gold.precomputed_agent_flows"
        )
        if flow_count is not None:
            quality["layers"]["agent_flows"] = {
                "precomputed_decisions": int(flow_count),
                "status": "ok",
            }

        if not quality["layers"]:
            quality["source"] = "unavailable"
            quality["message"] = "Could not reach Databricks tables"

        return quality

    # ── Affected Stocks ───────────────────────────────────────────────────

    async def get_affected_stocks(self, text: str) -> list:
        """Extract ticker mentions from text, validate against known tickers."""
        tickers = re.findall(r"\b([A-Z]{2,5})\b", text)
        stop_words = {
            "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL",
            "CAN", "HER", "WAS", "ONE", "OUR", "OUT", "HAS", "HIS",
            "HOW", "ITS", "MAY", "NEW", "NOW", "OLD", "SEE", "WAY",
            "WHO", "DID", "GET", "LET", "SAY", "SHE", "TOO", "USE",
        }
        candidates = [t for t in tickers if t not in stop_words]

        # Validate against Databricks if connected
        if candidates and self.is_connected:
            placeholders = ",".join(["%s"] * len(candidates))
            rows = self._query(
                f"SELECT DISTINCT ticker FROM sweetreturns.bronze.raw_stock_data "
                f"WHERE ticker IN ({placeholders})",
                candidates,
            )
            if rows:
                valid = {r["ticker"] for r in rows}
                return [t for t in candidates if t in valid]

        return candidates

    # ── Agent Reaction (uses regime + sentiment from Databricks) ──────────

    async def compute_agent_reaction(
        self, sentiment: dict, affected_tickers: list
    ) -> dict:
        """
        Compute agent reactions using market regime from HMM model.
        Regime modulates urgency and agent count.
        """
        regime = await self.get_current_regime()
        regime_label = regime.get("regime", "Neutral")
        regime_urgency = regime.get("agent_urgency", 1.0)

        reactions = []
        label = sentiment.get("label", "neutral").lower()
        score = abs(sentiment.get("score", 0.0))
        base_count = max(2000, int(score * 10000))

        # Regime modulates reaction intensity
        if regime_label == "Bear":
            # Bear market: more panic, larger swarms for sells
            urgency_mult = 1.3
            sell_boost = 1.5
            buy_boost = 0.6
        elif regime_label == "Bull":
            # Bull market: more FOMO, larger swarms for buys
            urgency_mult = 0.9
            sell_boost = 0.7
            buy_boost = 1.4
        else:
            urgency_mult = 1.0
            sell_boost = 1.0
            buy_boost = 1.0

        for ticker in affected_tickers:
            # Enrich with FinBERT sentiment if available
            ticker_sentiment = await self.get_ticker_sentiment(ticker)
            if ticker_sentiment and ticker_sentiment.get("source") == "finbert":
                # Blend Gemini/keyword sentiment with FinBERT historical sentiment
                finbert_score = ticker_sentiment.get("score", 0)
                blended_score = score * 0.6 + abs(finbert_score) * 0.4
                momentum = ticker_sentiment.get("momentum_3d", 0)
            else:
                blended_score = score
                momentum = 0

            if label in ("negative", "bearish"):
                agent_count = int(base_count * sell_boost)
                urgency = min((0.5 + blended_score * 0.5) * urgency_mult, 0.99)
                action = "panic_sell"
                # If momentum was positive before bad news, even more panic
                if momentum > 0.1:
                    urgency = min(urgency + 0.1, 0.99)
                    agent_count = int(agent_count * 1.2)
            elif label in ("positive", "bullish"):
                agent_count = int(base_count * buy_boost)
                urgency = min((0.4 + blended_score * 0.5) * urgency_mult, 0.95)
                action = "rush_buy"
            else:
                agent_count = 2000
                urgency = 0.3
                action = "hold"

            reactions.append({
                "ticker": ticker,
                "action": action,
                "agent_count": agent_count,
                "urgency": round(urgency, 3),
                "regime": regime_label,
            })

        return {"reactions": reactions, "regime": regime_label}

    # ── Keyword Fallback ──────────────────────────────────────────────────

    def _fallback_sentiment(self, text: str) -> dict:
        """Simple keyword-based sentiment when Databricks/FinBERT is unavailable."""
        text_lower = text.lower()
        negative_words = [
            "crash", "bankruptcy", "explodes", "fraud", "scandal",
            "layoffs", "recall", "lawsuit", "plunge", "collapse",
            "fire", "death", "hack", "breach", "fail",
        ]
        positive_words = [
            "soars", "record", "breakthrough", "profit", "growth",
            "innovation", "partnership", "acquisition", "surge", "boom",
            "beats", "upgrade", "bullish", "rally", "expansion",
        ]
        neg_count = sum(1 for w in negative_words if w in text_lower)
        pos_count = sum(1 for w in positive_words if w in text_lower)

        if neg_count > pos_count:
            score = -0.5 - (neg_count * 0.1)
            return {"score": max(score, -1.0), "label": "negative"}
        elif pos_count > neg_count:
            score = 0.5 + (pos_count * 0.1)
            return {"score": min(score, 1.0), "label": "positive"}
        else:
            return {"score": 0.0, "label": "neutral"}

    # ── Mock Flows (local dev only) ───────────────────────────────────────

    def _mock_agent_flows(self, scenario: str, timestamp: int) -> list:
        """Mock flows for local development without Databricks."""
        import random

        tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM"]
        actions = ["buy", "sell", "call", "put", "short"]
        return [
            {
                "archetype_id": i,
                "target_ticker": random.choice(tickers),
                "action": random.choice(actions),
                "confidence": round(random.uniform(0.3, 0.95), 3),
                "swarm_size": random.randint(1000, 8000),
            }
            for i in range(20)
        ]
