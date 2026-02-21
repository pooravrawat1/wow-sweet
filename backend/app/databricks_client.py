import os
import re
import requests


class DatabricksClient:
    def __init__(self):
        self.workspace_url = os.getenv("DATABRICKS_WORKSPACE_URL", "")
        self.token = os.getenv("DATABRICKS_TOKEN", "")
        self.finbert_endpoint = (
            f"{self.workspace_url}/serving-endpoints/finbert-sentiment/invocations"
            if self.workspace_url
            else ""
        )

    async def analyze_sentiment(self, text: str) -> dict:
        """Call FinBERT model serving endpoint"""
        if not self.finbert_endpoint or not self.token:
            # Fallback: simple keyword-based sentiment
            return self._fallback_sentiment(text)

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        payload = {"inputs": [text]}

        try:
            response = requests.post(
                self.finbert_endpoint, json=payload, headers=headers, timeout=10
            )
            result = response.json()
            return {
                "score": result["predictions"][0]["score"],
                "label": result["predictions"][0]["label"],
            }
        except Exception:
            return self._fallback_sentiment(text)

    def _fallback_sentiment(self, text: str) -> dict:
        """Simple keyword-based sentiment when FinBERT is unavailable"""
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

    async def get_affected_stocks(self, text: str) -> list:
        """Extract ticker mentions from text"""
        # Match uppercase 2-5 letter words that look like tickers
        tickers = re.findall(r"\b([A-Z]{2,5})\b", text)
        # Filter out common English words that aren't tickers
        stop_words = {
            "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL",
            "CAN", "HER", "WAS", "ONE", "OUR", "OUT", "HAS", "HIS",
            "HOW", "ITS", "MAY", "NEW", "NOW", "OLD", "SEE", "WAY",
            "WHO", "DID", "GET", "LET", "SAY", "SHE", "TOO", "USE",
        }
        return [t for t in tickers if t not in stop_words]

    async def compute_agent_reaction(
        self, sentiment: dict, affected_tickers: list
    ) -> dict:
        """Compute how agents react to this news"""
        reactions = []
        for ticker in affected_tickers:
            if sentiment["label"] == "negative":
                reactions.append(
                    {
                        "ticker": ticker,
                        "action": "panic_sell",
                        "agent_count": 10000,
                        "urgency": 0.95,
                    }
                )
            elif sentiment["label"] == "positive":
                reactions.append(
                    {
                        "ticker": ticker,
                        "action": "rush_buy",
                        "agent_count": 8000,
                        "urgency": 0.85,
                    }
                )
            else:
                reactions.append(
                    {
                        "ticker": ticker,
                        "action": "hold",
                        "agent_count": 2000,
                        "urgency": 0.3,
                    }
                )

        return {"reactions": reactions}

    async def get_agent_flows(self, scenario: str, timestamp: int) -> list:
        """Query pre-computed agent flows from Databricks Delta Lake"""
        if not self.workspace_url or not self.token:
            # Return mock flows for local dev
            return self._mock_agent_flows(scenario, timestamp)

        try:
            # Query via Databricks SQL Connector
            from databricks import sql as databricks_sql

            with databricks_sql.connect(
                server_hostname=self.workspace_url.replace("https://", ""),
                http_path=os.getenv("DATABRICKS_SQL_WAREHOUSE_PATH", ""),
                access_token=self.token,
            ) as connection:
                cursor = connection.cursor()
                cursor.execute(
                    """
                    SELECT archetype_id, target_ticker, action, confidence, swarm_size
                    FROM sweetreturns.gold.precomputed_agent_flows
                    WHERE scenario = %s AND date_index = %s
                    ORDER BY confidence DESC
                    LIMIT 100
                    """,
                    [scenario, timestamp],
                )
                rows = cursor.fetchall()
                return [
                    {
                        "archetype_id": row[0],
                        "target_ticker": row[1],
                        "action": row[2],
                        "confidence": row[3],
                        "swarm_size": row[4],
                    }
                    for row in rows
                ]
        except Exception:
            return self._mock_agent_flows(scenario, timestamp)

    def _mock_agent_flows(self, scenario: str, timestamp: int) -> list:
        """Mock flows for local development without Databricks"""
        import random

        tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM"]
        actions = ["buy", "sell", "call", "put", "short"]

        flows = []
        for i in range(20):
            flows.append(
                {
                    "archetype_id": i,
                    "target_ticker": random.choice(tickers),
                    "action": random.choice(actions),
                    "confidence": random.uniform(0.3, 0.95),
                    "swarm_size": random.randint(1000, 8000),
                }
            )
        return flows
