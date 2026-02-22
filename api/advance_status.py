"""Vercel serverless: GET /api/advance_status — pipeline monitoring.

Returns the current state of the continuous pipeline:
- Current snapshot date and total dates processed
- Simulation feedback stats
- Silver/gold table sizes
"""
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen


def _db_sql(host, token, warehouse_id, sql, wait_timeout="8s"):
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
        with urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read())

        if body.get("status", {}).get("state") != "SUCCEEDED":
            return []

        columns = [c["name"] for c in body.get("manifest", {}).get("schema", {}).get("columns", [])]
        rows = body.get("result", {}).get("data_array", [])
        return [dict(zip(columns, row)) for row in rows]
    except Exception:
        return []


def _build_status():
    host = os.environ.get("DATABRICKS_HOST", "").strip().rstrip("/")
    token = os.environ.get("DATABRICKS_TOKEN", "").strip()
    http_path = os.environ.get("DATABRICKS_SQL_WAREHOUSE_PATH", "").strip()
    warehouse_id = http_path.rstrip("/").split("/")[-1] if http_path else ""

    if not host or not token:
        return {"status": "unconfigured", "message": "Databricks not configured"}

    result = {
        "status": "ok",
        "pipeline": {},
        "silver": {},
        "simulation": {},
    }

    if not warehouse_id:
        result["status"] = "no_warehouse"
        return result

    # Gold table stats (current pipeline state)
    gold_rows = _db_sql(host, token, warehouse_id, """
        SELECT MAX(Date) AS current_date,
               MIN(Date) AS start_date,
               COUNT(DISTINCT Date) AS total_dates,
               COUNT(*) AS total_rows
        FROM sweetreturns.gold.golden_tickets
    """)
    if gold_rows:
        result["pipeline"] = {
            "current_date": gold_rows[0].get("current_date", "unknown"),
            "start_date": gold_rows[0].get("start_date", "unknown"),
            "total_dates_processed": gold_rows[0].get("total_dates", 0),
            "total_rows": gold_rows[0].get("total_rows", 0),
        }

    # Silver table stats (available dates for advancement)
    silver_rows = _db_sql(host, token, warehouse_id, """
        SELECT COUNT(DISTINCT Date) AS total_dates,
               MIN(Date) AS start_date,
               MAX(Date) AS end_date
        FROM sweetreturns.silver.daily_features
    """)
    if silver_rows:
        result["silver"] = {
            "total_dates": silver_rows[0].get("total_dates", 0),
            "start_date": silver_rows[0].get("start_date", "unknown"),
            "end_date": silver_rows[0].get("end_date", "unknown"),
        }

    # Remaining dates to process
    try:
        gold_total = int(result["pipeline"].get("total_dates_processed", 0))
        silver_total = int(result["silver"].get("total_dates", 0))
        result["pipeline"]["remaining_dates"] = max(0, silver_total - gold_total)
    except (ValueError, TypeError):
        pass

    # Simulation feedback stats
    sim_rows = _db_sql(host, token, warehouse_id, """
        SELECT COUNT(DISTINCT snapshot_date) AS cycles,
               COUNT(*) AS records,
               MAX(submitted_at) AS last_submission
        FROM sweetreturns.gold.simulation_results
    """)
    if sim_rows:
        result["simulation"] = {
            "cycles": sim_rows[0].get("cycles", 0),
            "records": sim_rows[0].get("records", 0),
            "last_submission": sim_rows[0].get("last_submission"),
        }

    return result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            payload = _build_status()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(json.dumps(payload, indent=2).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)[:200]}).encode())
