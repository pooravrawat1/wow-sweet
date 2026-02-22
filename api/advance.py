"""Vercel serverless: GET /api/advance — advance to next trading day.

Uses pure SQL via the Databricks SQL Warehouse (no compute cluster needed).
Reads pre-computed features from silver.daily_features, computes gold tickets,
and appends one day to the golden_tickets table.

Called by:
- Vercel cron (every 5 min on Pro plan)
- Frontend auto-trigger (when data goes stale)
- Manual curl for testing
"""
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen


def _exec_sql(host, token, warehouse_id, sql, wait_timeout="30s", http_timeout=45):
    """Execute SQL via Databricks SQL Statement API."""
    try:
        req = Request(
            f"{host}/api/2.0/sql/statements/",
            data=json.dumps({
                "warehouse_id": warehouse_id,
                "statement": sql,
                "wait_timeout": wait_timeout,
            }).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlopen(req, timeout=http_timeout) as resp:
            body = json.loads(resp.read())

        state = body.get("status", {}).get("state")
        if state == "SUCCEEDED":
            columns = [c["name"] for c in body.get("manifest", {}).get("schema", {}).get("columns", [])]
            rows = body.get("result", {}).get("data_array", [])
            return True, [dict(zip(columns, row)) for row in rows]
        else:
            err = body.get("status", {}).get("error", {}).get("message", f"state={state}")
            return False, {"error": err[:300], "state": state}
    except Exception as e:
        return False, {"error": str(e)[:300]}


def _get_config():
    """Get Databricks connection config from env vars."""
    host = os.environ.get("DATABRICKS_HOST", "").strip().rstrip("/")
    token = os.environ.get("DATABRICKS_TOKEN", "").strip()
    http_path = os.environ.get("DATABRICKS_SQL_WAREHOUSE_PATH", "").strip()
    warehouse_id = http_path.rstrip("/").split("/")[-1] if http_path else ""
    return host, token, warehouse_id


_sim_table_ensured = False


def _ensure_sim_table(host, token, warehouse_id):
    """Create simulation_results table if it doesn't exist (needed for LEFT JOIN)."""
    global _sim_table_ensured
    if _sim_table_ensured:
        return
    _exec_sql(host, token, warehouse_id, """
        CREATE TABLE IF NOT EXISTS sweetreturns.gold.simulation_results (
            snapshot_date DATE, ticker STRING, agent_name STRING,
            action STRING, profit DOUBLE, whale_fund STRING,
            whale_weight DOUBLE, buy_crowd INT, call_crowd INT,
            put_crowd INT, short_crowd INT, submitted_at TIMESTAMP
        ) USING DELTA PARTITIONED BY (snapshot_date)
    """, wait_timeout="10s", http_timeout=15)
    _sim_table_ensured = True


def _build_advance_sql(target_date):
    """Build INSERT INTO golden_tickets SQL for one trading day.

    Matches the ACTUAL gold table schema:
      ticker, date, close, sector, industry, company_name, market_cap,
      daily_return, drawdown_pct, drawdown_percentile,
      realized_vol_20d, vol_percentile, volume_percentile,
      bb_pct_b, zscore_20d, momentum_5d, momentum_20d,
      fwd_return_5d, fwd_return_20d, fwd_return_60d,
      dip_ticket, shock_ticket, asymmetry_ticket,
      dislocation_ticket, convexity_ticket,
      golden_score, is_platinum
    """
    return f"""
INSERT INTO sweetreturns.gold.golden_tickets (
    ticker, date, close, sector, industry, company_name, market_cap,
    daily_return, drawdown_pct, drawdown_percentile,
    realized_vol_20d, vol_percentile, volume_percentile,
    bb_pct_b, zscore_20d, momentum_5d, momentum_20d,
    fwd_return_5d, fwd_return_20d, fwd_return_60d,
    dip_ticket, shock_ticket, asymmetry_ticket,
    dislocation_ticket, convexity_ticket,
    golden_score, is_platinum
)
WITH
  -- Silver features for the target date (pre-computed by silver pipeline)
  target AS (
    SELECT * FROM sweetreturns.silver.daily_features
    WHERE date = '{target_date}'
  ),

  -- Compute golden tickets from available features
  with_tickets AS (
    SELECT *,
      -- Ticket I: Dip (Sour Candy Drop) — deep drawdown
      CASE WHEN drawdown_percentile > 0.80 THEN 1 ELSE 0 END AS dip_ticket,
      -- Ticket II: Shock (Jawbreaker) — drawdown + volume + volatility
      CASE WHEN drawdown_percentile > 0.85
           AND volume_percentile > 0.90
           AND vol_percentile > 0.85
        THEN 1 ELSE 0 END AS shock_ticket,
      -- Ticket III: Asymmetry (Fortune Cookie) — requires forward skew (not in silver)
      -- Approximate: strong forward return with limited downside
      CASE WHEN drawdown_percentile > 0.85
           AND fwd_return_60d IS NOT NULL
           AND fwd_return_60d > 0.05
           AND fwd_return_5d IS NOT NULL
           AND fwd_return_5d > -0.03
        THEN 1 ELSE 0 END AS asymmetry_ticket,
      -- Ticket IV: Dislocation (Taffy Pull) — momentum reversal signal
      -- Approximate: deep drawdown + negative short-term momentum (stretched rubber band)
      CASE WHEN drawdown_percentile > 0.80
           AND momentum_20d < -0.05
           AND momentum_5d > momentum_20d
        THEN 1 ELSE 0 END AS dislocation_ticket,
      -- Ticket V: Convexity (Golden Gummy Bear) — all stars align
      CASE WHEN drawdown_percentile > 0.90
           AND volume_percentile > 0.90
           AND vol_percentile > 0.85
           AND momentum_20d < -0.08
           AND fwd_return_60d IS NOT NULL
           AND fwd_return_60d > 0.10
        THEN 1 ELSE 0 END AS convexity_ticket
    FROM target
  ),

  -- Golden score = sum of tickets
  with_score AS (
    SELECT *,
      dip_ticket + shock_ticket + asymmetry_ticket +
      dislocation_ticket + convexity_ticket AS golden_score
    FROM with_tickets
  )

SELECT
  ticker, date, close, sector, industry, company_name, market_cap,
  daily_return, drawdown_pct, drawdown_percentile,
  realized_vol_20d, vol_percentile, volume_percentile,
  bb_pct_b, zscore_20d, momentum_5d, momentum_20d,
  fwd_return_5d, fwd_return_20d, fwd_return_60d,
  dip_ticket, shock_ticket, asymmetry_ticket,
  dislocation_ticket, convexity_ticket,
  golden_score,
  CASE WHEN golden_score >= 4 THEN true ELSE false END AS is_platinum
FROM with_score
"""


def _do_advance():
    """Main logic: advance to the next trading day using pure SQL."""
    host, token, warehouse_id = _get_config()

    if not (host and token and warehouse_id):
        return 503, {"error": "Databricks not configured", "action": "none"}

    # Ensure simulation_results table exists
    _ensure_sim_table(host, token, warehouse_id)

    # Step 1: Find the next date to process
    ok, result = _exec_sql(host, token, warehouse_id, """
        SELECT
            (SELECT COALESCE(MAX(date), '1900-01-01')
             FROM sweetreturns.gold.golden_tickets) AS current_max,
            (SELECT MIN(date)
             FROM sweetreturns.silver.daily_features
             WHERE date > (SELECT COALESCE(MAX(date), '1900-01-01')
                           FROM sweetreturns.gold.golden_tickets)
            ) AS next_date,
            (SELECT COUNT(DISTINCT date)
             FROM sweetreturns.silver.daily_features) AS total_silver_dates,
            (SELECT COUNT(DISTINCT date)
             FROM sweetreturns.gold.golden_tickets) AS total_gold_dates
    """, wait_timeout="8s", http_timeout=10)

    if not ok:
        return 500, {"error": f"Failed to query dates: {result}", "action": "query_failed"}

    if not result or not isinstance(result, list):
        return 500, {"error": "Unexpected query result", "action": "query_failed"}

    row = result[0]
    current_max = row.get("current_max", "1900-01-01")
    next_date = row.get("next_date")
    total_silver = int(row.get("total_silver_dates", 0))
    total_gold = int(row.get("total_gold_dates", 0))

    # Handle dataset exhaustion: all silver dates consumed → wrap around
    if not next_date:
        # Find the first usable date (skip ~252 for lookback validity)
        ok2, earliest = _exec_sql(host, token, warehouse_id, """
            SELECT date FROM (
                SELECT date, ROW_NUMBER() OVER (ORDER BY date) AS rn
                FROM (SELECT DISTINCT date FROM sweetreturns.silver.daily_features)
            ) sub WHERE rn = 253
        """, wait_timeout="8s", http_timeout=10)

        if not ok2 or not isinstance(earliest, list) or not earliest or not earliest[0].get("date"):
            return 200, {
                "action": "dataset_exhausted",
                "message": f"All {total_silver} silver dates consumed. No wrap target found.",
                "current_date": current_max,
            }

        wrap_date = earliest[0]["date"]

        # Clear golden_tickets to restart from the beginning
        ok3, _ = _exec_sql(host, token, warehouse_id,
            "DELETE FROM sweetreturns.gold.golden_tickets WHERE 1=1",
            wait_timeout="15s", http_timeout=20)

        if not ok3:
            return 500, {"error": "Failed to clear golden_tickets for wrap-around",
                         "action": "wrap_failed"}

        next_date = wrap_date
        current_max = "1900-01-01"
        total_gold = 0

    # Step 2: Execute the gold ticket computation and insert
    insert_sql = _build_advance_sql(next_date)

    ok, result = _exec_sql(host, token, warehouse_id, insert_sql,
                           wait_timeout="50s", http_timeout=55)

    if not ok:
        return 500, {
            "error": f"Advance SQL failed: {result.get('error', 'unknown')[:200]}",
            "action": "insert_failed",
            "target_date": str(next_date),
        }

    # Step 3: Verify the insert
    ok, verify = _exec_sql(host, token, warehouse_id, f"""
        SELECT COUNT(*) AS rows_inserted
        FROM sweetreturns.gold.golden_tickets
        WHERE date = '{next_date}'
    """, wait_timeout="5s", http_timeout=8)

    rows_inserted = 0
    if ok and isinstance(verify, list) and verify:
        rows_inserted = int(verify[0].get("rows_inserted", 0))

    return 200, {
        "action": "advanced",
        "message": f"Advanced to {next_date} ({rows_inserted} stocks)",
        "target_date": str(next_date),
        "previous_date": str(current_max),
        "rows_inserted": rows_inserted,
        "total_gold_dates": total_gold + 1,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Optional auth: check CRON_SECRET for automated triggers
        cron_secret = os.environ.get("CRON_SECRET", "")
        auth_header = self.headers.get("Authorization", "")

        # If CRON_SECRET is set, require it (unless it's a Vercel cron call)
        vercel_cron = self.headers.get("x-vercel-cron", "")
        if cron_secret and not vercel_cron:
            if auth_header != f"Bearer {cron_secret}":
                self._respond(401, {"error": "Unauthorized"})
                return

        code, payload = _do_advance()
        self._respond(code, payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization")
        self.end_headers()

    def _respond(self, code, payload):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())
