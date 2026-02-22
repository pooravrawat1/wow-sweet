"""Vercel serverless: GET /api/health — connection status check."""
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError


def _check_databricks() -> dict:
    host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
    token = os.environ.get("DATABRICKS_TOKEN", "")
    http_path = os.environ.get("DATABRICKS_SQL_WAREHOUSE_PATH", "")
    warehouse_id = http_path.rstrip("/").split("/")[-1] if http_path else ""

    if not (host and token and warehouse_id):
        return {"configured": False, "connected": False, "status": "not configured"}

    try:
        req = Request(
            f"{host}/api/2.0/sql/statements/",
            data=json.dumps({
                "warehouse_id": warehouse_id,
                "statement": "SELECT 1 AS ok",
                "wait_timeout": "10s",
            }).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read())
            state = body.get("status", {}).get("state", "")
            return {
                "configured": True,
                "connected": state == "SUCCEEDED",
                "status": "connected" if state == "SUCCEEDED" else f"query state: {state}",
            }
    except Exception as e:
        return {"configured": True, "connected": False, "status": f"error: {str(e)[:100]}"}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        db = _check_databricks()
        result = {
            "status": "healthy",
            "service": "sweetreturns-api",
            "databricks": db["connected"],
            "databricks_configured": db["configured"],
            "databricks_status": db["status"],
            "stocks_available": db["connected"],
        }
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
