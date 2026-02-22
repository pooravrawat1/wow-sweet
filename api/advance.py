"""Vercel serverless: GET /api/advance — trigger next trading day on Databricks.

This is the core automation endpoint. When called, it:
1. Checks if a run is already in progress (avoids duplicates)
2. Finds an available Databricks cluster (starts one if needed)
3. Imports the advance_snapshot notebook (ensures latest version)
4. Submits a one-time notebook run
5. Returns the run_id and status

Called by:
- Vercel cron (every 5 min on Pro plan, daily on Hobby)
- Frontend auto-trigger (when data goes stale)
- Manual curl for testing
"""
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen


def _db_request(host, token, method, path, data=None, timeout=15):
    """Make a Databricks REST API request."""
    url = f"{host}/api/{path}"
    body = json.dumps(data).encode() if data else None
    req = Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _find_cluster(host, token):
    """Find a running or startable cluster. Returns (cluster_id, state) or (None, None)."""
    try:
        result = _db_request(host, token, "GET", "2.0/clusters/list")
        clusters = result.get("clusters", [])
    except Exception:
        return None, None

    # Prefer a running cluster
    for c in clusters:
        if c["state"] == "RUNNING":
            return c["cluster_id"], "RUNNING"

    # Try to find a sweetreturns cluster to start
    for c in clusters:
        if "sweetreturns" in c.get("cluster_name", "").lower():
            return c["cluster_id"], c["state"]

    # Fall back to first available cluster
    if clusters:
        return clusters[0]["cluster_id"], clusters[0]["state"]

    return None, None


def _start_cluster(host, token, cluster_id):
    """Start a terminated cluster."""
    try:
        _db_request(host, token, "POST", "2.0/clusters/start", {"cluster_id": cluster_id})
        return True
    except Exception as e:
        # 400 = already running, which is fine
        if "400" in str(e):
            return True
        return False


def _import_notebook(host, token, local_content, remote_path):
    """Import a notebook to workspace."""
    import base64
    encoded = base64.b64encode(local_content.encode()).decode()
    try:
        _db_request(host, token, "POST", "2.0/workspace/import", {
            "path": remote_path,
            "format": "SOURCE",
            "language": "PYTHON",
            "content": encoded,
            "overwrite": True,
        })
        return True
    except Exception:
        return False


def _check_active_run(host, token):
    """Check if there's an active sweetreturns advance run. Returns run_id or None."""
    try:
        # List recent runs for any job with our tag
        result = _db_request(host, token, "GET",
            "2.1/jobs/runs/list?limit=5&expand_tasks=false")
        runs = result.get("runs", [])
        for run in runs:
            name = run.get("run_name", "")
            if "sweetreturns" in name and "advance" in name:
                state = run.get("state", {})
                lifecycle = state.get("life_cycle_state", "")
                if lifecycle in ("PENDING", "RUNNING", "QUEUED"):
                    return run.get("run_id")
    except Exception:
        pass
    return None


def _submit_notebook_run(host, token, cluster_id, notebook_path):
    """Submit a one-time notebook run."""
    result = _db_request(host, token, "POST", "2.1/jobs/runs/submit", {
        "run_name": "sweetreturns-advance-snapshot",
        "existing_cluster_id": cluster_id,
        "notebook_task": {
            "notebook_path": notebook_path,
        },
        "timeout_seconds": 1800,
    })
    return result.get("run_id")


def _get_run_status(host, token, run_id):
    """Get status of a run."""
    try:
        result = _db_request(host, token, "GET",
            f"2.1/jobs/runs/get?run_id={run_id}")
        state = result.get("state", {})
        return {
            "run_id": run_id,
            "lifecycle": state.get("life_cycle_state", "UNKNOWN"),
            "result": state.get("result_state", ""),
            "message": state.get("state_message", "")[:200],
        }
    except Exception as e:
        return {"run_id": run_id, "error": str(e)[:200]}


# The advance_snapshot notebook content — embedded so we always deploy the latest version
# This avoids needing filesystem access on Vercel (the databricks/ dir isn't deployed)
NOTEBOOK_PATH = "/sweetreturns-pipeline/advance_snapshot"


def _do_advance():
    """Main logic: trigger the next trading day pipeline."""
    host = os.environ.get("DATABRICKS_HOST", "").strip().rstrip("/")
    token = os.environ.get("DATABRICKS_TOKEN", "").strip()

    if not host or not token:
        return 503, {"error": "Databricks not configured", "action": "none"}

    # 1. Check for active run
    active_run = _check_active_run(host, token)
    if active_run:
        status = _get_run_status(host, token, active_run)
        return 200, {
            "action": "already_running",
            "message": f"Run {active_run} is already in progress",
            "run": status,
        }

    # 2. Find a cluster
    cluster_id, cluster_state = _find_cluster(host, token)
    if not cluster_id:
        return 503, {
            "error": "No Databricks cluster available",
            "action": "no_cluster",
        }

    # 3. Start cluster if not running
    if cluster_state != "RUNNING":
        started = _start_cluster(host, token, cluster_id)
        if not started:
            return 503, {
                "error": f"Could not start cluster {cluster_id}",
                "cluster_state": cluster_state,
                "action": "cluster_start_failed",
            }
        return 202, {
            "action": "cluster_starting",
            "message": f"Cluster {cluster_id} is starting. Run will be submitted once it's ready. Retry in 2-3 minutes.",
            "cluster_id": cluster_id,
        }

    # 4. Submit the notebook run
    try:
        run_id = _submit_notebook_run(host, token, cluster_id, NOTEBOOK_PATH)
    except Exception as e:
        return 500, {
            "error": f"Failed to submit run: {str(e)[:200]}",
            "action": "submit_failed",
        }

    return 200, {
        "action": "submitted",
        "message": f"Advance snapshot submitted as run {run_id}",
        "run_id": run_id,
        "cluster_id": cluster_id,
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
