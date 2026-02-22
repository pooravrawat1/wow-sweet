"""Vercel serverless: GET /api/stocks — live stock payload from Databricks.

Queries golden_tickets for the latest date snapshot. Handles both column naming
conventions (gold_tickets.py canonical names AND legacy names) for robustness.
"""
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen


def _query_databricks(sql: str, params=None) -> list:
    """Execute SQL via Databricks SQL Statement REST API."""
    host = os.environ.get("DATABRICKS_HOST", "").strip().rstrip("/")
    token = os.environ.get("DATABRICKS_TOKEN", "").strip()
    http_path = os.environ.get("DATABRICKS_SQL_WAREHOUSE_PATH", "").strip()
    warehouse_id = http_path.rstrip("/").split("/")[-1] if http_path else ""

    if not (host and token and warehouse_id):
        return []

    if params:
        for p in params:
            sql = sql.replace("%s", f"'{str(p)}'", 1)

    try:
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

        state = body.get("status", {}).get("state")
        if state != "SUCCEEDED":
            return [{"_error": f"query state={state}", "_msg": body.get("status", {}).get("error", {}).get("message", "")[:200]}]

        columns = [c["name"] for c in body.get("manifest", {}).get("schema", {}).get("columns", [])]
        rows = body.get("result", {}).get("data_array", [])
        return [dict(zip(columns, row)) for row in rows]
    except Exception as exc:
        return [{"_error": f"exception: {str(exc)[:200]}"}]


def _f(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


def _b(val):
    """Parse boolean from various DB representations."""
    return val in (True, "true", "True", 1, "1")


def _build_payload() -> dict:
    """Query golden_tickets for latest date snapshot."""
    rows = _query_databricks("SELECT MAX(Date) AS d FROM sweetreturns.gold.golden_tickets")
    if not rows:
        return {"stocks": [], "source": "empty-no-rows"}

    if rows[0].get("_error"):
        return {"stocks": [], "source": "error-max-date", "debug": rows[0]}

    latest_date = rows[0].get("d")
    if not latest_date:
        return {"stocks": [], "source": "empty-no-date", "debug_keys": list(rows[0].keys())}

    # Use SELECT * to handle any column naming convention, then map in Python.
    # The gold table may have canonical names (ticket_1_dip) or legacy names (dip_ticket).
    stock_rows = _query_databricks(
        """
        SELECT *
        FROM sweetreturns.gold.golden_tickets
        WHERE date = %s
        """,
        [latest_date],
    )

    if not stock_rows:
        return {"stocks": [], "source": "empty-no-stock-rows"}

    if stock_rows[0].get("_error"):
        return {"stocks": [], "source": "error-stock-query", "debug": stock_rows[0]}

    def _g(row, *keys, default=None):
        """Get first non-None value from multiple possible column names."""
        for k in keys:
            v = row.get(k)
            if v is not None:
                return v
        return default

    stocks = []
    # Case-insensitive key lookup: Databricks may return Title_Case or lower_case
    def _row_ci(row):
        return {k.lower(): v for k, v in row.items()}

    for raw_row in stock_rows:
        row = _row_ci(raw_row)
        gs = int(_f(_g(row, "golden_score", default=0)))
        fwd60 = _f(_g(row, "fwd_return_60d", default=0))
        dd = _f(_g(row, "drawdown_pct", default=0))
        vol = _f(_g(row, "realized_vol_20d", default=0))
        mcp = _f(_g(row, "market_cap_percentile", "market_cap", default=0.5))

        # Direction bias: use pre-computed from gold table if available (includes simulation feedback)
        buy_pct = _g(row, "buy_pct")
        if buy_pct is not None:
            buy_bias = _f(buy_pct, 0.30)
            call_bias = _f(_g(row, "call_pct"), 0.25)
            put_bias = _f(_g(row, "put_pct"), 0.25)
            short_bias = _f(_g(row, "short_pct"), 0.20)
        else:
            # Fallback: derive from RSI/drawdown
            rsi = _f(_g(row, "rsi_14", default=50))
            buy_bias = 0.35 if rsi > 50 else 0.2
            short_bias = 0.15 if rsi > 50 else 0.3
            call_bias = 0.3 if dd < -0.1 else 0.25
            put_bias = max(1.0 - buy_bias - short_bias - call_bias, 0.05)

        # Store dimensions: use pre-computed if available
        sw = _g(row, "store_width")
        if sw is not None:
            s_width = _f(sw, 1.5)
            s_height = _f(_g(row, "store_height"), 2.0)
            s_depth = _f(_g(row, "store_depth"), 1.0)
            s_glow = _f(_g(row, "store_glow"), 0.0)
        else:
            s_width = round(1.0 + mcp * 2.0, 2)
            s_height = round(1.5 + mcp * 2.5, 2)
            s_depth = round(1.0 + mcp * 1.0, 2)
            s_glow = round(gs / 5.0, 2)

        # Agent density: use pre-computed if available
        ad = _g(row, "agent_density")
        agent_dens = int(_f(ad)) if ad is not None else max(50, int(200 + gs * 100))

        sm = _g(row, "speed_multiplier")
        spd_mult = _f(sm, 1.0) if sm is not None else round(1.0 + gs * 0.3, 2)

        # Forward return distribution: use pre-computed percentiles if available
        fwd_p5 = _g(row, "fwd_60d_p5", "fwd_p5")
        if fwd_p5 is not None:
            frd = {
                "p5": round(_f(fwd_p5), 4),
                "p25": round(_f(_g(row, "fwd_60d_p25", "fwd_p25")), 4),
                "median": round(_f(_g(row, "fwd_60d_median", "fwd_median")), 4),
                "p75": round(_f(_g(row, "fwd_60d_p75", "fwd_p75")), 4),
                "p95": round(_f(_g(row, "fwd_60d_p95", "fwd_p95")), 4),
                "skew": round(_f(_g(row, "fwd_60d_skew", "fwd_skew")), 4),
            }
        else:
            frd = {
                "p5": round(fwd60 - vol * 1.6, 4) if vol else -0.08,
                "p25": round(fwd60 - vol * 0.7, 4) if vol else -0.02,
                "median": round(fwd60, 4),
                "p75": round(fwd60 + vol * 0.7, 4) if vol else 0.05,
                "p95": round(fwd60 + vol * 1.6, 4) if vol else 0.12,
                "skew": round(_f(row.get("fwd_skew")), 4),
            }

        ticker = row.get("ticker")
        if not ticker:
            continue  # skip rows without a ticker

        stocks.append({
            "ticker": ticker,
            "sector": row.get("sector") or "Unknown",
            "close": _f(row.get("close")),
            "daily_return": round(_f(row.get("daily_return")), 6),
            "drawdown_current": round(dd, 4),
            "volume_percentile": round(_f(row.get("volume_percentile")), 4),
            "volatility_percentile": round(_f(row.get("vol_percentile")), 4),
            "market_cap_rank": round(mcp, 4),
            "golden_score": gs,
            "ticket_levels": {
                "dip_ticket": _b(_g(row, "ticket_1_dip", "dip_ticket", default=False)),
                "shock_ticket": _b(_g(row, "ticket_2_shock", "shock_ticket", default=False)),
                "asymmetry_ticket": _b(_g(row, "ticket_3_asymmetry", "asymmetry_ticket", default=False)),
                "dislocation_ticket": _b(_g(row, "ticket_4_dislocation", "dislocation_ticket", default=False)),
                "convexity_ticket": _b(_g(row, "ticket_5_convexity", "convexity_ticket", default=False)),
            },
            "is_platinum": _b(row.get("is_platinum")),
            "rarity_percentile": round(_f(row.get("rarity_percentile"), 0.5), 4),
            "direction_bias": {
                "buy": round(buy_bias, 2),
                "call": round(call_bias, 2),
                "put": round(max(put_bias, 0.05), 2),
                "short": round(short_bias, 2),
            },
            "forward_return_distribution": frd,
            "store_dimensions": {
                "width": round(s_width, 2),
                "height": round(s_height, 2),
                "depth": round(s_depth, 2),
                "glow": round(s_glow, 2),
            },
            "agent_density": agent_dens,
            "speed_multiplier": round(spd_mult, 2),
            "technicals": {
                "rsi_14": round(_f(row.get("rsi_14"), 50), 2),
                "macd_histogram": round(_f(row.get("macd_histogram")), 4),
                "bb_pct_b": round(_f(row.get("bb_pct_b"), 0.5), 4),
                "zscore_20d": round(_f(row.get("zscore_20d")), 4),
                "realized_vol_20d": round(vol, 4),
            },
            "volatility": round(vol, 4),
            "max_drawdown": round(dd, 4),
            "vol_spike": round(_f(row.get("volume_percentile")), 4),
            "skewness": round(_f(row.get("fwd_skew")), 4),
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
        try:
            payload = _build_payload()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            # 60s cache for continuous loop (was 300s)
            self.send_header("Cache-Control", "s-maxage=60, stale-while-revalidate=30")
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode())
        except Exception as e:
            import traceback
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "stocks": [],
                "source": "error",
                "error": str(e)[:200],
                "trace": traceback.format_exc()[-500:],
            }).encode())
