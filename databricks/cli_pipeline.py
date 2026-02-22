#!/usr/bin/env python3
"""
SweetReturns — Databricks CLI Pipeline Runner
=============================================
Checks all prerequisites, downloads the Kaggle dataset, uploads it to DBFS,
creates the schema, and runs the full medallion pipeline on your Databricks workspace.

Usage:
    python databricks/cli_pipeline.py [--step STEP] [--check-only]

Steps:
    1  check       Verify prerequisites (CLI, credentials, cluster)
    2  download    Download Kaggle dataset to local cache
    3  upload      Upload CSV to DBFS
    4  schema      Create sweetreturns DB + bronze/silver/gold schemas
    5  bronze      Run bronze_ingestion.py on the cluster
    6  silver      Run silver_features.py on the cluster
    7  gold        Run gold_tickets.py on the cluster
    8  export      Run export_json.py + download frontend_payload.json
    9  quality     Run data quality checks across all layers
    all            Run all steps in order (default)

Prerequisites:
    pip install requests python-dotenv kagglehub tqdm
"""

import argparse
import json
import os
import sys
import time
import subprocess
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
ENV_FILE     = SCRIPT_DIR / ".env"
OUTPUT_JSON  = PROJECT_ROOT / "public" / "frontend_payload.json"
OUTPUT_MIN   = PROJECT_ROOT / "public" / "frontend_payload.min.json"

DBFS_DIR   = "dbfs:/FileStore/sweetreturns"
DBFS_CSV   = f"{DBFS_DIR}/stock_details_5_years.csv"

# Unity Catalog Volume (free-trial workspaces disable DBFS — we fall back to this)
UC_CATALOG = "main"
UC_SCHEMA  = "default"
UC_VOLUME  = "sweetreturns"
UC_VOL_DIR = f"/Volumes/{UC_CATALOG}/{UC_SCHEMA}/{UC_VOLUME}"
UC_CSV     = f"{UC_VOL_DIR}/stock_details_5_years.csv"
# Spark read path for UC volumes
UC_SPARK_CSV = UC_CSV

NOTEBOOK_SCRIPTS = {
    "bronze": SCRIPT_DIR / "bronze_ingestion.py",
    "silver": SCRIPT_DIR / "silver_features.py",
    "gold"  : SCRIPT_DIR / "gold_tickets.py",
    "export": SCRIPT_DIR / "export_json.py",
}

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
RESET  = "\033[0m"

def ok(msg):  print(f"{GREEN}  ✓ {msg}{RESET}")
def warn(msg): print(f"{YELLOW}  ⚠ {msg}{RESET}")
def err(msg):  print(f"{RED}  ✗ {msg}{RESET}")
def info(msg): print(f"{CYAN}  → {msg}{RESET}")
def hdr(msg):  print(f"\n{CYAN}{'─'*60}\n  {msg}\n{'─'*60}{RESET}")


# ── Dependency installer ──────────────────────────────────────────────────────
def ensure_deps():
    """Auto-install missing Python packages."""
    required = {"requests": "requests", "dotenv": "python-dotenv",
                "kagglehub": "kagglehub", "tqdm": "tqdm"}
    missing = []
    for mod, pkg in required.items():
        try:
            __import__(mod)
        except ImportError:
            missing.append(pkg)
    if missing:
        info(f"Installing missing packages: {' '.join(missing)}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", *missing, "-q"])
        ok("Packages installed")


# ── Load .env ─────────────────────────────────────────────────────────────────
def load_env():
    """Load .env file and return (host, token)."""
    env_vars = {}

    if ENV_FILE.exists():
        # Manual parser — handles BOM, CRLF, quoted values, inline comments
        raw = ENV_FILE.read_bytes()
        # Strip UTF-8 BOM if present
        if raw.startswith(b"\xef\xbb\xbf"):
            raw = raw[3:]
        for line in raw.decode("utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip()
            # Strip inline comments
            if " #" in val:
                val = val[:val.index(" #")].strip()
            # Strip surrounding quotes
            if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
                val = val[1:-1]
            env_vars[key] = val

        # Also try dotenv for its override semantics
        try:
            from dotenv import load_dotenv
            load_dotenv(ENV_FILE, override=True)
        except Exception:
            pass

        # Apply manually parsed values (wins over dotenv if dotenv failed)
        for k, v in env_vars.items():
            if v:
                os.environ[k] = v

        ok(f"Loaded credentials from {ENV_FILE.name}")
    else:
        warn(".env not found — falling back to environment variables")

    host  = os.environ.get("DATABRICKS_HOST", "").rstrip("/").split("?")[0].split("#")[0]
    token = os.environ.get("DATABRICKS_TOKEN", "")

    if not host or "<workspace" in host:
        err("DATABRICKS_HOST is not set.")
        print("  Create databricks/.env from .env.example and fill in your workspace URL.")
        print(f"  (looked in: {ENV_FILE})")
        # Debug: show what was parsed
        if env_vars:
            print(f"  Parsed keys from .env: {list(env_vars.keys())}")
        sys.exit(1)
    if not token or token.startswith("dapi..."):
        err("DATABRICKS_TOKEN is not set.")
        print("  Go to: Databricks → User Settings → Developer → Access Tokens → Generate")
        sys.exit(1)

    return host, token


def _try_load_env():
    """Load .env and return (host, token). Returns (None, None) if not configured (no sys.exit)."""
    if ENV_FILE.exists():
        raw = ENV_FILE.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf"):
            raw = raw[3:]
        for line in raw.decode("utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
                val = val[1:-1]
            os.environ.setdefault(key, val)

    host  = os.environ.get("DATABRICKS_HOST", "").rstrip("/").split("?")[0].split("#")[0]
    token = os.environ.get("DATABRICKS_TOKEN", "")
    if not host or "<workspace" in host or not token or token.startswith("dapi..."):
        return None, None
    return host, token


# ── Databricks REST client ────────────────────────────────────────────────────
class DatabricksClient:
    def __init__(self, host: str, token: str):
        import requests
        self.base = host
        self.headers = {"Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"}
        self.session = requests.Session()
        self.session.headers.update(self.headers)

    def get(self, path, **kwargs):
        r = self.session.get(f"{self.base}/api/{path}", **kwargs)
        r.raise_for_status()
        return r.json()

    def post(self, path, data=None, **kwargs):
        r = self.session.post(f"{self.base}/api/{path}", json=data, **kwargs)
        r.raise_for_status()
        return r.json()

    # ── Cluster helpers ──────────────────────────────────────────────────────
    def list_clusters(self):
        return self.get("2.0/clusters/list").get("clusters", [])

    def get_cluster(self, cluster_id):
        return self.get("2.0/clusters/get", params={"cluster_id": cluster_id})

    def start_cluster(self, cluster_id):
        return self.post("2.0/clusters/start", {"cluster_id": cluster_id})

    def wait_cluster_ready(self, cluster_id, timeout=300):
        """Poll until cluster is RUNNING (or timeout)."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            state = self.get_cluster(cluster_id)["state"]
            if state == "RUNNING":
                return True
            if state in ("TERMINATED", "ERROR", "UNKNOWN"):
                return False
            info(f"Cluster state: {state} … waiting")
            time.sleep(15)
        return False

    # ── DBFS helpers ─────────────────────────────────────────────────────────
    def dbfs_ls(self, path):
        try:
            return self.get("2.0/dbfs/list", params={"path": path}).get("files", [])
        except Exception:
            return []

    def dbfs_mkdirs(self, path):
        self.post("2.0/dbfs/mkdirs", {"path": path})

    def dbfs_upload(self, local_path: Path, remote_path: str):
        """Upload a file to DBFS in 1 MB chunks using the block API."""
        import requests
        CHUNK = 1 * 1024 * 1024   # 1 MB
        file_size = local_path.stat().st_size

        # Open a handle
        resp = self.post("2.0/dbfs/create", {"path": remote_path, "overwrite": True})
        handle = resp["handle"]

        uploaded = 0
        with open(local_path, "rb") as f:
            import base64
            while True:
                chunk = f.read(CHUNK)
                if not chunk:
                    break
                encoded = base64.b64encode(chunk).decode()
                self.post("2.0/dbfs/add-block", {"handle": handle, "data": encoded})
                uploaded += len(chunk)
                pct = uploaded / file_size * 100
                print(f"\r  Uploading … {pct:.1f}%  ({uploaded // 1024 // 1024} MB / {file_size // 1024 // 1024} MB)", end="", flush=True)

        self.post("2.0/dbfs/close", {"handle": handle})
        print()  # newline after progress

    def dbfs_read_text(self, path) -> str:
        """Read a small text file from DBFS."""
        import base64
        data = self.get("2.0/dbfs/read", params={"path": path, "length": 10 * 1024 * 1024})
        return base64.b64decode(data["data"]).decode("utf-8", errors="replace")

    # ── Unity Catalog Volumes (Files API) ─────────────────────────────────────
    def uc_create_volume(self, catalog: str, schema: str, volume: str):
        """Create a UC managed volume if it doesn't exist."""
        for api_ver in ("2.1", "2.0"):
            try:
                self.post(f"{api_ver}/unity-catalog/volumes", {
                    "catalog_name": catalog,
                    "schema_name": schema,
                    "name": volume,
                    "volume_type": "MANAGED",
                })
                return  # success
            except Exception as e:
                code = str(e)
                if "already exists" in code.lower() or "409" in code:
                    return  # already exists — fine
                if "404" in code and api_ver == "2.1":
                    continue  # try 2.0
                if "403" in code or "permission" in code.lower():
                    warn("No permission to create volume via API — please create it manually:")
                    print(f"  Databricks UI → Catalog → main → default → Create Volume")
                    print(f"  Name: {volume}  Type: Managed")
                    print(f"  Then re-run this command.")
                    sys.exit(1)
                # 404 on both versions = UC not available, fall through to manual guidance
                if api_ver == "2.0":
                    warn("Unity Catalog Volumes API not available on this workspace tier.")
                    warn("Create the volume manually in the Databricks UI:")
                    print(f"  Catalog Explorer → main → default → Create Volume")
                    print(f"  Name: {volume}  Type: Managed")
                    print(f"  Then re-run: python databricks/cli_pipeline.py --step upload")
                    sys.exit(1)

    def uc_upload(self, local_path: Path, volume_path: str):
        """Upload a file to a UC Volume using the Files API (streaming, no base64)."""
        import requests as req_lib
        file_size = local_path.stat().st_size
        url = f"{self.base}/api/2.0/fs/files{volume_path}"
        headers = {"Authorization": f"Bearer {self.session.headers['Authorization'].split(' ')[1]}"}

        with open(local_path, "rb") as f:
            class ProgressReader:
                def __init__(self, fh, size):
                    self.fh = fh
                    self.size = size
                    self.uploaded = 0
                def read(self, n=-1):
                    chunk = self.fh.read(n)
                    self.uploaded += len(chunk)
                    pct = self.uploaded / self.size * 100
                    mb_done = self.uploaded // 1024 // 1024
                    mb_total = self.size // 1024 // 1024
                    print(f"\r  Uploading … {pct:.1f}%  ({mb_done} MB / {mb_total} MB)", end="", flush=True)
                    return chunk
            reader = ProgressReader(f, file_size)
            r = req_lib.put(url, data=reader, headers=headers, timeout=600)
        print()
        r.raise_for_status()

    def uc_ls(self, volume_path: str):
        """List files in a UC Volume directory."""
        try:
            r = self.session.get(f"{self.base}/api/2.0/fs/directories{volume_path}", timeout=15)
            if r.status_code == 404:
                return []
            r.raise_for_status()
            return r.json().get("contents", [])
        except Exception:
            return []

    def uc_read_text(self, volume_path: str) -> str:
        """Download a text file from a UC Volume."""
        import requests as req_lib
        url = f"{self.base}/api/2.0/fs/files{volume_path}"
        headers = {"Authorization": f"Bearer {self.session.headers['Authorization'].split(' ')[1]}"}
        r = req_lib.get(url, headers=headers, timeout=120)
        r.raise_for_status()
        return r.text

    # ── Workspace (notebooks) ─────────────────────────────────────────────────
    def import_notebook(self, local_path: Path, remote_path: str):
        """Import a .py Databricks notebook into the workspace."""
        import base64
        content = base64.b64encode(local_path.read_bytes()).decode()
        self.post("2.0/workspace/import", {
            "path": remote_path,
            "format": "SOURCE",
            "language": "PYTHON",
            "content": content,
            "overwrite": True,
        })

    # ── Run notebook as job ────────────────────────────────────────────────────
    def run_notebook(self, notebook_path: str, cluster_id: str) -> int:
        """Submit a one-time notebook run and return run_id."""
        resp = self.post("2.1/jobs/runs/submit", {
            "run_name": f"sweetreturns-{Path(notebook_path).name}",
            "existing_cluster_id": cluster_id,
            "notebook_task": {"notebook_path": notebook_path},
        })
        return resp["run_id"]

    def wait_run(self, run_id: int, timeout: int = 1800) -> dict:
        """Poll until run completes. Returns run state dict."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            run = self.get("2.1/jobs/runs/get", params={"run_id": run_id})
            life = run["state"]["life_cycle_state"]
            if life in ("TERMINATED", "SKIPPED", "INTERNAL_ERROR"):
                return run["state"]
            result_state = run["state"].get("result_state", "")
            info(f"  Run {run_id}: {life} {result_state}")
            time.sleep(20)
        return {"life_cycle_state": "TIMED_OUT", "result_state": "TIMEOUT"}

    # ── SQL via context ───────────────────────────────────────────────────────
    def execute_sql(self, cluster_id: str, sql: str):
        """Create an execution context and run a SQL command."""
        ctx = self.post("1.2/contexts/create", {
            "clusterId": cluster_id, "language": "sql"
        })
        ctx_id = ctx["id"]
        cmd = self.post("1.2/commands/execute", {
            "clusterId": cluster_id,
            "contextId": ctx_id,
            "language": "sql",
            "command": sql,
        })
        cmd_id = cmd["id"]
        # poll
        for _ in range(60):
            time.sleep(3)
            status = self.get("1.2/commands/status",
                              params={"clusterId": cluster_id, "contextId": ctx_id, "commandId": cmd_id})
            if status["status"] in ("Finished", "Error", "Cancelled"):
                break
        self.post("1.2/contexts/destroy", {"clusterId": cluster_id, "contextId": ctx_id})
        return status


# ── Step 1: Check prerequisites ───────────────────────────────────────────────
def step_check(client: DatabricksClient) -> str:
    """Verify workspace connectivity and find/start the sweetreturns cluster."""
    hdr("STEP 1 — Check Prerequisites")

    # Test connectivity
    try:
        me = client.get("2.0/preview/scim/v2/Me")
        ok(f"Connected to Databricks workspace as: {me.get('userName', '(unknown)')}")
    except Exception as e:
        err(f"Cannot connect to Databricks: {e}")
        sys.exit(1)

    # Find cluster
    clusters = client.list_clusters()
    sweet = [c for c in clusters if "sweetreturns" in c.get("cluster_name", "").lower()]

    if not sweet:
        warn("No 'sweetreturns' cluster found.")
        print("\n  Available clusters:")
        for c in clusters[:10]:
            print(f"    • {c['cluster_name']}  [{c['cluster_id']}]  state={c['state']}")
        if not clusters:
            err("No clusters exist. Create one in the Databricks UI first:")
            print("    Compute → Create Cluster → name: sweetreturns → Single Node → LTS runtime")
            sys.exit(1)
        # Fall back to first cluster
        chosen = clusters[0]
        warn(f"Using first available cluster: {chosen['cluster_name']}")
    else:
        chosen = sweet[0]
        ok(f"Found cluster: {chosen['cluster_name']}  [{chosen['cluster_id']}]")

    cluster_id = chosen["cluster_id"]
    state = chosen["state"]

    if state == "RUNNING":
        ok("Cluster is already RUNNING")
    elif state in ("TERMINATED", "TERMINATING"):
        info("Starting cluster …")
        client.start_cluster(cluster_id)
        if client.wait_cluster_ready(cluster_id):
            ok("Cluster started successfully")
        else:
            err("Cluster failed to start — check the Databricks UI")
            sys.exit(1)
    else:
        info(f"Cluster state is {state} — waiting for RUNNING …")
        if not client.wait_cluster_ready(cluster_id):
            err("Cluster did not become ready in time")
            sys.exit(1)

    return cluster_id


# ── Step 2: Download Kaggle dataset ───────────────────────────────────────────
def step_download() -> Path:
    """Download the Kaggle dataset using kagglehub and return the CSV path."""
    hdr("STEP 2 — Download Kaggle Dataset")

    # Load Kaggle credentials
    kaggle_user = os.environ.get("KAGGLE_USERNAME", "")
    kaggle_key  = os.environ.get("KAGGLE_KEY", "")

    # If env vars not set, check if kaggle.json exists
    kaggle_json = Path.home() / ".kaggle" / "kaggle.json"
    if kaggle_json.exists() and (not kaggle_user or not kaggle_key):
        with open(kaggle_json) as f:
            creds = json.load(f)
        kaggle_user = creds.get("username", "")
        kaggle_key  = creds.get("key", "")
        ok(f"Loaded Kaggle credentials from {kaggle_json}")

    if not kaggle_user or not kaggle_key:
        err("Kaggle credentials not found.")
        print("\n  Options:")
        print("  1. Add to databricks/.env:  KAGGLE_USERNAME=...  KAGGLE_KEY=...")
        print("  2. Download kaggle.json from https://www.kaggle.com/settings → API")
        print(f"     and save it to: {kaggle_json}")
        sys.exit(1)

    os.environ["KAGGLE_USERNAME"] = kaggle_user
    os.environ["KAGGLE_KEY"]      = kaggle_key

    # Check the default kagglehub cache path first
    default_csv = (Path.home() / ".cache" / "kagglehub" / "datasets"
                   / "iveeaten3223times" / "massive-yahoo-finance-dataset"
                   / "versions" / "2" / "stock_details_5_years.csv")

    # Also check env-override path
    override = os.environ.get("CSV_PATH", "")
    if override and Path(override).exists():
        ok(f"Using CSV_PATH override: {override}")
        return Path(override)

    if default_csv.exists():
        ok(f"Dataset already cached at:\n      {default_csv}")
        return default_csv

    info("Downloading dataset iveeaten3223times/massive-yahoo-finance-dataset …")
    info("(~63 MB — this may take a minute)")
    try:
        import kagglehub
        path = kagglehub.dataset_download("iveeaten3223times/massive-yahoo-finance-dataset")
        ok(f"Downloaded to: {path}")
        csv_path = Path(path) / "stock_details_5_years.csv"
        if not csv_path.exists():
            # Search recursively
            found = list(Path(path).rglob("stock_details_5_years.csv"))
            if found:
                csv_path = found[0]
            else:
                err(f"CSV not found in downloaded path: {path}")
                sys.exit(1)
        ok(f"CSV path: {csv_path}")
        return csv_path
    except Exception as e:
        err(f"kagglehub download failed: {e}")
        print("\n  Manual fallback:")
        print("  1. Go to https://www.kaggle.com/datasets/iveeaten3223times/massive-yahoo-finance-dataset")
        print("  2. Download and unzip the CSV")
        print("  3. Add to databricks/.env:  CSV_PATH=C:\\path\\to\\stock_details_5_years.csv")
        sys.exit(1)


# ── Step 3: Upload CSV (DBFS with auto-fallback to UC Volume) ────────────────
def step_upload(client: DatabricksClient, csv_path: Path) -> str:
    """
    Upload the CSV to the workspace. Returns the Spark-readable path.
    Tries DBFS first; if 403 (Unity Catalog workspace), falls back to UC Volume.
    """
    hdr("STEP 3 — Upload CSV")

    # ── Try DBFS first ───────────────────────────────────────────────────────
    dbfs_ok = False
    try:
        files = client.dbfs_ls(DBFS_DIR)
        existing = [f for f in files if "stock_details_5_years" in f.get("path", "")]
        if existing:
            size_mb = existing[0].get("file_size", 0) // 1024 // 1024
            ok(f"File already on DBFS ({size_mb} MB) — skipping upload")
            return DBFS_CSV
        # Try creating the directory — this will 403 on UC-only workspaces
        client.dbfs_mkdirs(DBFS_DIR.replace("dbfs:", ""))
        dbfs_ok = True
    except Exception as e:
        if "403" in str(e) or "Forbidden" in str(e):
            warn("DBFS API is disabled (Unity Catalog workspace) — using UC Volume instead")
        else:
            warn(f"DBFS unavailable ({e}) — falling back to UC Volume")

    if dbfs_ok:
        info(f"Uploading {csv_path.name} ({csv_path.stat().st_size // 1024 // 1024} MB) to DBFS …")
        client.dbfs_upload(csv_path, DBFS_CSV.replace("dbfs:", ""))
        ok(f"Upload complete → {DBFS_CSV}")
        files = client.dbfs_ls(DBFS_DIR)
        if any("stock_details_5_years" in f.get("path", "") for f in files):
            ok("DBFS verification passed")
        return DBFS_CSV

    # ── Fallback: Unity Catalog Volume ───────────────────────────────────────
    info(f"Creating UC Volume: {UC_CATALOG}.{UC_SCHEMA}.{UC_VOLUME}")
    client.uc_create_volume(UC_CATALOG, UC_SCHEMA, UC_VOLUME)
    ok(f"Volume ready: {UC_VOL_DIR}")

    # Check if already uploaded
    contents = client.uc_ls(UC_VOL_DIR)
    existing = [f for f in contents if "stock_details_5_years" in f.get("path", "")]
    if existing:
        ok(f"File already in UC Volume — skipping upload")
        ok(f"  {UC_CSV}")
        return UC_SPARK_CSV

    info(f"Uploading {csv_path.name} ({csv_path.stat().st_size // 1024 // 1024} MB) to UC Volume …")
    client.uc_upload(csv_path, UC_CSV)
    ok(f"Upload complete → {UC_CSV}")
    return UC_SPARK_CSV


# ── Step 4: Create DB schema ──────────────────────────────────────────────────
def step_schema(client: DatabricksClient, cluster_id: str, csv_spark_path: str = None):
    hdr("STEP 4 — Create Database & Schemas")

    csv_line = f'spark.conf.set("sweetreturns.csv_path", "{csv_spark_path}")' if csv_spark_path else ""
    notebook_path = "/sweetreturns-pipeline/00_setup_schema"
    setup_code = f"""\
# Databricks notebook source
spark.sql("CREATE DATABASE IF NOT EXISTS sweetreturns")
spark.sql("CREATE SCHEMA IF NOT EXISTS sweetreturns.bronze")
spark.sql("CREATE SCHEMA IF NOT EXISTS sweetreturns.silver")
spark.sql("CREATE SCHEMA IF NOT EXISTS sweetreturns.gold")
{csv_line}
print("✓ Schemas created. CSV path: {csv_spark_path or 'default'}")
"""
    # Write a temp notebook file
    tmp = SCRIPT_DIR / "_setup_schema.py"
    tmp.write_text(setup_code)

    try:
        client.import_notebook(tmp, notebook_path)
        ok("Schema notebook imported")
        run_id = client.run_notebook(notebook_path, cluster_id)
        info(f"Schema creation run_id: {run_id}")
        state = client.wait_run(run_id, timeout=120)
        if state.get("result_state") == "SUCCESS":
            ok("Schemas created successfully")
        else:
            warn(f"Schema run finished with state: {state} — may already exist, continuing")
    finally:
        tmp.unlink(missing_ok=True)


# ── Step 5-8: Run pipeline notebooks ─────────────────────────────────────────
def step_run_notebook(client: DatabricksClient, cluster_id: str,
                      step_name: str, local_script: Path,
                      csv_spark_path: str = None):
    hdr(f"STEP — Run {step_name.upper()}")

    remote_path = f"/sweetreturns-pipeline/{step_name}"

    # For bronze: patch the hardcoded DBFS CSV path with the actual upload path
    script_to_import = local_script
    if step_name == "bronze" and csv_spark_path and csv_spark_path != DBFS_CSV:
        patched = local_script.read_text(encoding="utf-8").replace(
            "dbfs:/FileStore/sweetreturns/stock_details_5_years.csv",
            csv_spark_path,
        )
        tmp = SCRIPT_DIR / "_bronze_patched.py"
        tmp.write_text(patched, encoding="utf-8")
        script_to_import = tmp
        info(f"Patched CSV path in bronze notebook → {csv_spark_path}")

    info(f"Importing {local_script.name} → {remote_path}")
    client.import_notebook(script_to_import, remote_path)
    ok("Notebook imported")

    if step_name == "bronze" and csv_spark_path and csv_spark_path != DBFS_CSV:
        try:
            (SCRIPT_DIR / "_bronze_patched.py").unlink(missing_ok=True)
        except Exception:
            pass

    info(f"Submitting run on cluster {cluster_id} …")
    run_id = client.run_notebook(remote_path, cluster_id)
    ok(f"Run submitted — run_id: {run_id}")

    start = time.time()
    state = client.wait_run(run_id, timeout=3600)
    elapsed = int(time.time() - start)
    result = state.get("result_state", "UNKNOWN")

    if result == "SUCCESS":
        ok(f"{step_name} completed in {elapsed}s")
    else:
        err(f"{step_name} failed: {state}")
        msg = state.get("state_message", "")
        if msg:
            print(f"  Message: {msg}")
        print(f"\n  View run in Databricks UI:")
        print(f"  Workflows → Job Runs → run_id {run_id}")
        sys.exit(1)


# ── Step 8b: Download the output JSON ────────────────────────────────────────
def step_download_output(client: DatabricksClient):
    hdr("DOWNLOADING frontend_payload.json")

    content = None

    # Try DBFS first
    dbfs_output = "/FileStore/sweetreturns/frontend_payload.json"
    files = client.dbfs_ls("/FileStore/sweetreturns")
    if any("frontend_payload.json" in f.get("path", "") for f in files):
        info("Reading frontend_payload.json from DBFS …")
        content = client.dbfs_read_text(dbfs_output)

    # Try UC Volume
    if not content:
        uc_output = f"{UC_VOL_DIR}/frontend_payload.json"
        contents = client.uc_ls(UC_VOL_DIR)
        if any("frontend_payload.json" in f.get("path", "") for f in contents):
            info("Reading frontend_payload.json from UC Volume …")
            content = client.uc_read_text(uc_output)

    if not content:
        warn("frontend_payload.json not found in DBFS or UC Volume yet")
        warn("The export notebook may need updating to write to the correct path")
        return

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(content, encoding="utf-8")
    ok(f"Saved to {OUTPUT_JSON}")

    # Also write minified version
    try:
        payload = json.loads(content)
        OUTPUT_MIN.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        ok(f"Minified version saved to {OUTPUT_MIN}")
    except json.JSONDecodeError:
        warn("Could not minify — file may be incomplete")


# ── Quick connectivity check (no full setup) ──────────────────────────────────
def cmd_check_only(client: DatabricksClient):
    hdr("CONNECTIVITY CHECK")
    try:
        me = client.get("2.0/preview/scim/v2/Me")
        ok(f"Workspace reachable — logged in as: {me.get('userName')}")
    except Exception as e:
        err(f"Cannot reach workspace: {e}")
        sys.exit(1)

    clusters = client.list_clusters()
    ok(f"Found {len(clusters)} cluster(s):")
    for c in clusters:
        state = c["state"]
        colour = GREEN if state == "RUNNING" else (YELLOW if state == "PENDING" else RED)
        print(f"    {colour}• {c['cluster_name']}  [{c['cluster_id']}]  {state}{RESET}")

    # Check DBFS
    files = client.dbfs_ls("/FileStore/sweetreturns")
    if files:
        ok(f"DBFS {DBFS_DIR} contains {len(files)} file(s):")
        for f in files:
            print(f"    • {f['path']}  ({f.get('file_size', 0) // 1024} KB)")
    else:
        warn(f"DBFS path {DBFS_DIR} is empty or does not exist (CSV not yet uploaded)")


# ── Step 9: Data Quality ──────────────────────────────────────────────────────
def step_quality(client: DatabricksClient, cluster_id: str):
    """Run the data quality monitor across all layers."""
    hdr("STEP 9 — Data Quality Checks")
    try:
        from data_quality_monitor import check_bronze, check_gold, check_silver, check_payload, print_summary, export_report
    except ImportError:
        # Fallback: import relative to this script's directory
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "data_quality_monitor", SCRIPT_DIR / "data_quality_monitor.py")
        dqm = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(dqm)
        check_bronze = dqm.check_bronze
        check_silver = dqm.check_silver
        check_gold = dqm.check_gold
        check_payload = dqm.check_payload
        print_summary = dqm.print_summary
        export_report = dqm.export_report

    reports = []
    if client and cluster_id:
        reports.append(check_bronze(client, cluster_id))
        reports.append(check_silver(client, cluster_id))
        reports.append(check_gold(client, cluster_id))
    reports.append(check_payload())

    all_passed = print_summary(reports)
    export_report(reports, "report")

    if not all_passed:
        warn("Some quality checks failed — review the report above")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="SweetReturns Databricks pipeline runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--step", choices=["check", "download", "upload", "schema",
                                            "bronze", "silver", "gold", "export",
                                            "quality", "all"],
                        default="all", help="Which step to run (default: all)")
    parser.add_argument("--check-only", action="store_true",
                        help="Just verify connectivity and list clusters/files. No changes.")
    args = parser.parse_args()

    print(f"\n{CYAN}╔══════════════════════════════════════════════════╗")
    print(f"║  SweetReturns — Databricks Pipeline Runner       ║")
    print(f"╚══════════════════════════════════════════════════╝{RESET}\n")

    # Install deps first
    ensure_deps()

    step = args.step

    # Quality step can run without Databricks credentials
    if step == "quality":
        # Try Databricks but don't require it
        host, token = _try_load_env()
        client = None
        cluster_id = ""
        if host and token:
            try:
                client = DatabricksClient(host, token)
                cluster_id = client.find_cluster() if client else ""
            except Exception:
                warn("Could not connect to Databricks — running payload check only")
                client = None
        step_quality(client, cluster_id)
        return

    # Load credentials (required for all other steps)
    host, token = load_env()
    client = DatabricksClient(host, token)

    if args.check_only:
        cmd_check_only(client)
        return

    if step in ("check", "all"):
        cluster_id = step_check(client)
    if step in ("download", "all"):
        csv_path = step_download()
    if step in ("upload", "all"):
        if step == "upload":
            csv_path = step_download()
        csv_spark_path = step_upload(client, csv_path)
    if step in ("schema", "all"):
        if step == "schema":
            cluster_id = step_check(client)
            csv_path = step_download()
            csv_spark_path = step_upload(client, csv_path)
        step_schema(client, cluster_id, csv_spark_path)
    if step in ("bronze", "all"):
        if step == "bronze":
            cluster_id = step_check(client)
            csv_path = step_download()
            csv_spark_path = step_upload(client, csv_path)
        step_run_notebook(client, cluster_id, "bronze", NOTEBOOK_SCRIPTS["bronze"], csv_spark_path)
    if step in ("silver", "all"):
        if step == "silver":
            cluster_id = step_check(client)
        step_run_notebook(client, cluster_id, "silver", NOTEBOOK_SCRIPTS["silver"])
    if step in ("gold", "all"):
        if step == "gold":
            cluster_id = step_check(client)
        step_run_notebook(client, cluster_id, "gold", NOTEBOOK_SCRIPTS["gold"])
    if step in ("export", "all"):
        if step == "export":
            cluster_id = step_check(client)
        step_run_notebook(client, cluster_id, "export", NOTEBOOK_SCRIPTS["export"])
        step_download_output(client)
    if step in ("quality", "all"):
        cid = cluster_id if "cluster_id" in locals() else ""
        if step == "quality" and not cid:
            cid = step_check(client)
        step_quality(client, cid)

    if step == "all":
        hdr("PIPELINE COMPLETE")
        ok("All steps finished successfully!")
        ok(f"Output: {OUTPUT_JSON}")
        print(f"\n  Next: npm run dev   (the React app now reads the real data)")


if __name__ == "__main__":
    main()
