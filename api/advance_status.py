"""Vercel serverless: GET /api/advance_status — check pipeline run status.

Returns the status of recent advance_snapshot runs and overall pipeline health.
"""
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen


def _db_request(host, token, method, path, timeout=10):
    """Make a Databricks REST API request."""
    url = f"{host}/api/{path}"
    req = Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _db_sql(host, token, warehouse_id, sql):
    """Execute SQL via Databricks SQL Statement API."""
    try:
        req = Request(
            f"{host}/api/2.0/sql/statements/",
            data=json.dumps({
                "warehouse_id": warehouse_id,
                "statement": sql,
                "wait_timeout": "5s",
            }).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlopen(req, timeout=8) as resp:
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
        "cluster": {},
        "recent_runs": [],
    }

    # Get current snapshot date from golden_tickets
    if warehouse_id:
        date_rows = _db_sql(host, token, warehouse_id,
            "SELECT MAX(Date) AS d, COUNT(DISTINCT Date) AS total_dates, COUNT(*) AS total_rows FROM sweetreturns.gold.golden_tickets")
        if date_rows:
            result["pipeline"] = {
                "current_date": date_rows[0].get("d", "unknown"),
                "total_dates_processed": date_rows[0].get("total_dates", 0),
                "total_rows": date_rows[0].get("total_rows", 0),
            }

        # Get simulation stats
        sim_rows = _db_sql(host, token, warehouse_id,
            "SELECT COUNT(DISTINCT snapshot_date) AS cycles, COUNT(*) AS records FROM sweetreturns.gold.simulation_results")
        if sim_rows:
            result["pipeline"]["simulation_cycles"] = sim_rows[0].get("cycles", 0)
            result["pipeline"]["simulation_records"] = sim_rows[0].get("records", 0)

    # Get cluster status
    try:
        clusters = _db_request(host, token, "GET", "2.0/clusters/list")
        cluster_list = clusters.get("clusters", [])
        for c in cluster_list:
            if c["state"] == "RUNNING":
                result["cluster"] = {
                    "id": c["cluster_id"],
                    "name": c["cluster_name"],
                    "state": c["state"],
                }
                break
        if not result["cluster"]:
            result["cluster"] = {
                "state": "NONE_RUNNING",
                "available": len(cluster_list),
            }
    except Exception as e:
        result["cluster"] = {"error": str(e)[:100]}

    # Get recent advance runs
    try:
        runs = _db_request(host, token, "GET",
            "2.1/jobs/runs/list?limit=10&expand_tasks=false")
        for run in runs.get("runs", []):
            name = run.get("run_name", "")
            if "sweetreturns" in name:
                state = run.get("state", {})
                import time
                start_ms = run.get("start_time", 0)
                ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(start_ms / 1000)) if start_ms else "?"
                result["recent_runs"].append({
                    "run_id": run.get("run_id"),
                    "name": name,
                    "started": ts,
                    "lifecycle": state.get("life_cycle_state", "?"),
                    "result": state.get("result_state", ""),
                })
    except Exception:
        pass

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
