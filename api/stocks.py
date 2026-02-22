"""Vercel serverless: GET /api/stocks — live stock payload from Databricks."""
import json
import os
import time
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen

_errors = []


def _query_databricks(sql: str, params=None) -> list:
    """Execute SQL via Databricks SQL Statement REST API."""
    host = os.environ.get("DATABRICKS_HOST", "").strip().rstrip("/")
    token = os.environ.get("DATABRICKS_TOKEN", "").strip()
    http_path = os.environ.get("DATABRICKS_SQL_WAREHOUSE_PATH", "").strip()
    warehouse_id = http_path.rstrip("/").split("/")[-1] if http_path else ""

    if not (host and token and warehouse_id):
        _errors.append("not configured")
        return []

    if params:
        for p in params:
            sql = sql.replace("%s", f"'{str(p)}'", 1)

    try:
        t0 = time.time()
        req = Request(
            f"{host}/api/2.0/sql/statements/",
            data=json.dumps({
                "warehouse_id": warehouse_id,
                "statement": sql,
                "wait_timeout": "8s",
            }).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        with urlopen(req, timeout=9) as resp:
            body = json.loads(resp.read())

        elapsed = round(time.time() - t0, 2)
        state = body.get("status", {}).get("state", "UNKNOWN")

        if state != "SUCCEEDED":
            err_msg = body.get("status", {}).get("error", {}).get("message", "")
            _errors.append(f"query {state} ({elapsed}s): {err_msg[:100]}")
            return []

        columns = [c["name"] for c in body.get("manifest", {}).get("schema", {}).get("columns", [])]
        rows = body.get("result", {}).get("data_array", [])
        _errors.append(f"ok: {len(rows)} rows in {elapsed}s")
        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        _errors.append(f"exception: {str(e)[:150]}")
        return []


def _f(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


def _build_payload() -> dict:
    """Query golden_tickets for latest date snapshot."""
    rows = _query_databricks("SELECT MAX(Date) AS d FROM sweetreturns.gold.golden_tickets")
    if not rows:
        return {"stocks": [], "source": "empty"}

    latest_date = rows[0].get("d")
    if not latest_date:
        return {"stocks": [], "source": "empty"}

    stock_rows = _query_databricks(
        """
        SELECT ticker, sector, Close, daily_return,
               drawdown_pct, volume_percentile, vol_percentile,
               market_cap_percentile,
               golden_score, ticket_1_dip, ticket_2_shock,
               ticket_3_asymmetry, ticket_4_dislocation, ticket_5_convexity,
               is_platinum, rarity_percentile,
               buy_pct, call_pct, put_pct, short_pct,
               fwd_60d_p5, fwd_60d_p25, fwd_60d_median,
               fwd_60d_p75, fwd_60d_p95, fwd_60d_skew,
               store_width, store_height, store_depth, store_glow,
               agent_density, speed_multiplier,
               rsi_14, macd_histogram, bb_pct_b, zscore_20d, realized_vol_20d,
               vol_regime
        FROM sweetreturns.gold.golden_tickets
        WHERE Date = %s
        ORDER BY sector, market_cap_percentile DESC
        """,
        [latest_date],
    )

    if not stock_rows:
        return {"stocks": [], "source": "empty"}

    stocks = []
    for row in stock_rows:
        stocks.append({
            "ticker": row["ticker"],
            "sector": row.get("sector") or "Unknown",
            "close": _f(row.get("Close")),
            "daily_return": round(_f(row.get("daily_return")), 6),
            "drawdown_current": round(_f(row.get("drawdown_pct")), 4),
            "volume_percentile": round(_f(row.get("volume_percentile")), 4),
            "volatility_percentile": round(_f(row.get("vol_percentile")), 4),
            "market_cap_rank": round(_f(row.get("market_cap_percentile"), 0.5), 4),
            "golden_score": int(_f(row.get("golden_score"))),
            "ticket_levels": {
                "dip_ticket": bool(row.get("ticket_1_dip")),
                "shock_ticket": bool(row.get("ticket_2_shock")),
                "asymmetry_ticket": bool(row.get("ticket_3_asymmetry")),
                "dislocation_ticket": bool(row.get("ticket_4_dislocation")),
                "convexity_ticket": bool(row.get("ticket_5_convexity")),
            },
            "is_platinum": bool(row.get("is_platinum")),
            "rarity_percentile": round(_f(row.get("rarity_percentile")), 4),
            "direction_bias": {
                "buy": round(_f(row.get("buy_pct"), 0.25), 2),
                "call": round(_f(row.get("call_pct"), 0.25), 2),
                "put": round(_f(row.get("put_pct"), 0.25), 2),
                "short": round(_f(row.get("short_pct"), 0.25), 2),
            },
            "forward_return_distribution": {
                "p5": round(_f(row.get("fwd_60d_p5")), 4),
                "p25": round(_f(row.get("fwd_60d_p25")), 4),
                "median": round(_f(row.get("fwd_60d_median")), 4),
                "p75": round(_f(row.get("fwd_60d_p75")), 4),
                "p95": round(_f(row.get("fwd_60d_p95")), 4),
                "skew": round(_f(row.get("fwd_60d_skew")), 4),
            },
            "store_dimensions": {
                "width": round(_f(row.get("store_width"), 1.5), 2),
                "height": round(_f(row.get("store_height"), 2.0), 2),
                "depth": round(_f(row.get("store_depth"), 1.2), 2),
                "glow": round(_f(row.get("store_glow")), 2),
            },
            "agent_density": int(_f(row.get("agent_density"), 200)),
            "speed_multiplier": round(_f(row.get("speed_multiplier"), 1.0), 2),
            "technicals": {
                "rsi_14": round(_f(row.get("rsi_14"), 50.0), 2),
                "macd_histogram": round(_f(row.get("macd_histogram")), 4),
                "bb_pct_b": round(_f(row.get("bb_pct_b"), 0.5), 4),
                "zscore_20d": round(_f(row.get("zscore_20d")), 4),
                "realized_vol_20d": round(_f(row.get("realized_vol_20d")), 4),
            },
            "volatility": round(_f(row.get("realized_vol_20d")), 4),
            "max_drawdown": round(_f(row.get("drawdown_pct")), 4),
            "vol_spike": round(_f(row.get("volume_percentile")), 4),
            "skewness": round(_f(row.get("fwd_60d_skew")), 4),
            "ret_20d": round(_f(row.get("daily_return")), 6),
        })

    return {
        "stocks": stocks,
        "correlation_edges": [],
        "snapshot_date": str(latest_date),
        "stock_count": len(stocks),
        "source": "databricks",
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        _errors.clear()
        try:
            payload = _build_payload()
            payload["debug_queries"] = _errors[:]
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "s-maxage=300, stale-while-revalidate=60")
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "stocks": [],
                "source": "error",
                "error": str(e)[:200],
                "debug_queries": _errors[:],
            }).encode())
