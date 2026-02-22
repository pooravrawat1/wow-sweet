#!/usr/bin/env python3
"""
SweetReturns — Databricks CLI Data Quality Monitor
===================================================
Monitors data quality across all medallion layers (Bronze, Silver, Gold)
using the Databricks REST API. Can run as a standalone check or as part
of the pipeline.

Usage:
    python databricks/data_quality_monitor.py                  # Full quality report
    python databricks/data_quality_monitor.py --layer bronze   # Check one layer
    python databricks/data_quality_monitor.py --layer silver
    python databricks/data_quality_monitor.py --layer gold
    python databricks/data_quality_monitor.py --layer payload  # Check local JSON
    python databricks/data_quality_monitor.py --watch          # Continuous monitoring
    python databricks/data_quality_monitor.py --export report  # Export JSON report

Prerequisites:
    - databricks/.env with DATABRICKS_HOST and DATABRICKS_TOKEN
    - Pipeline must have been run at least once (tables must exist)
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
ENV_FILE     = SCRIPT_DIR / ".env"
PAYLOAD_PATH = PROJECT_ROOT / "public" / "frontend_payload.json"
REPORT_DIR   = PROJECT_ROOT / "reports"

# ── Colour helpers ───────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
DIM    = "\033[2m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):   print(f"{GREEN}  ✓ {msg}{RESET}")
def warn(msg): print(f"{YELLOW}  ⚠ {msg}{RESET}")
def err(msg):  print(f"{RED}  ✗ {msg}{RESET}")
def info(msg): print(f"{CYAN}  → {msg}{RESET}")
def dim(msg):  print(f"{DIM}    {msg}{RESET}")
def hdr(msg):  print(f"\n{CYAN}{'─'*60}\n  {msg}\n{'─'*60}{RESET}")


# ── Load .env ────────────────────────────────────────────────────────────────
def load_env():
    """Load .env and return (host, token). Returns (None, None) if not configured."""
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
            if " #" in val:
                val = val[:val.index(" #")].strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
                val = val[1:-1]
            os.environ.setdefault(key, val)

    host  = os.environ.get("DATABRICKS_HOST", "").rstrip("/").split("?")[0].split("#")[0]
    token = os.environ.get("DATABRICKS_TOKEN", "")
    if not host or "<workspace" in host or not token or token.startswith("dapi..."):
        return None, None
    return host, token


# ── Databricks REST client (reuses pattern from cli_pipeline.py) ─────────────
class DatabricksClient:
    def __init__(self, host: str, token: str):
        import requests
        self.base = host
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        })

    def get(self, path, **kwargs):
        r = self.session.get(f"{self.base}/api/{path}", **kwargs)
        r.raise_for_status()
        return r.json()

    def post(self, path, data=None, **kwargs):
        r = self.session.post(f"{self.base}/api/{path}", json=data, **kwargs)
        r.raise_for_status()
        return r.json()

    def execute_sql(self, cluster_id: str, sql: str, timeout: int = 120) -> dict:
        """Run SQL on a cluster via execution context. Returns result dict."""
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

        deadline = time.time() + timeout
        while time.time() < deadline:
            time.sleep(2)
            status = self.get("1.2/commands/status",
                              params={"clusterId": cluster_id,
                                      "contextId": ctx_id,
                                      "commandId": cmd_id})
            if status["status"] in ("Finished", "Error", "Cancelled"):
                break

        self.post("1.2/contexts/destroy", {
            "clusterId": cluster_id, "contextId": ctx_id
        })
        return status

    def find_cluster(self) -> str:
        """Find the sweetreturns cluster (or first available) and return its ID."""
        clusters = self.get("2.0/clusters/list").get("clusters", [])
        sweet = [c for c in clusters if "sweetreturns" in c.get("cluster_name", "").lower()]
        if sweet:
            return sweet[0]["cluster_id"]
        running = [c for c in clusters if c["state"] == "RUNNING"]
        if running:
            return running[0]["cluster_id"]
        if clusters:
            return clusters[0]["cluster_id"]
        return ""

    def sql_to_rows(self, cluster_id: str, sql: str) -> list:
        """Execute SQL and return list of dicts."""
        result = self.execute_sql(cluster_id, sql)
        if result.get("status") != "Finished":
            return []
        data = result.get("results", {}).get("data", [])
        schema = result.get("results", {}).get("schema", [])
        cols = [c.get("name", f"col_{i}") for i, c in enumerate(schema)]
        return [dict(zip(cols, row)) for row in data]

    def sql_scalar(self, cluster_id: str, sql: str):
        """Execute SQL and return a single scalar value."""
        result = self.execute_sql(cluster_id, sql)
        if result.get("status") != "Finished":
            return None
        data = result.get("results", {}).get("data", [])
        if data and data[0]:
            return data[0][0]
        return None


# ── Quality Check Functions ──────────────────────────────────────────────────

def check_bronze(client: DatabricksClient, cluster_id: str) -> dict:
    """Check Bronze layer data quality."""
    hdr("BRONZE LAYER — Raw Data Quality")
    report = {"layer": "bronze", "checks": [], "status": "pass"}

    # Row count
    count = client.sql_scalar(cluster_id, "SELECT COUNT(*) FROM sweetreturns.bronze.raw_stock_data")
    if count is not None:
        count = int(count)
        passed = count > 100000
        report["checks"].append({
            "name": "row_count", "value": count,
            "threshold": ">100K", "passed": passed,
        })
        (ok if passed else err)(f"Row count: {count:,} {'✓' if passed else '(expected >100K)'}")
    else:
        warn("Could not query bronze table — may not exist yet")
        report["status"] = "error"
        return report

    # Distinct tickers
    tickers = client.sql_scalar(cluster_id,
        "SELECT COUNT(DISTINCT ticker) FROM sweetreturns.bronze.raw_stock_data")
    if tickers is not None:
        tickers = int(tickers)
        passed = tickers > 400
        report["checks"].append({
            "name": "distinct_tickers", "value": tickers,
            "threshold": ">400", "passed": passed,
        })
        (ok if passed else warn)(f"Distinct tickers: {tickers}")

    # Null checks
    for col in ["ticker", "date", "close", "volume"]:
        nulls = client.sql_scalar(cluster_id,
            f"SELECT COUNT(*) FROM sweetreturns.bronze.raw_stock_data WHERE {col} IS NULL")
        if nulls is not None:
            nulls = int(nulls)
            passed = nulls == 0
            report["checks"].append({
                "name": f"null_{col}", "value": nulls,
                "threshold": "0", "passed": passed,
            })
            (ok if passed else warn)(f"Null {col}: {nulls:,}")

    # Negative prices
    neg_prices = client.sql_scalar(cluster_id,
        "SELECT COUNT(*) FROM sweetreturns.bronze.raw_stock_data WHERE close < 0")
    if neg_prices is not None:
        neg_prices = int(neg_prices)
        passed = neg_prices == 0
        report["checks"].append({
            "name": "negative_prices", "value": neg_prices,
            "threshold": "0", "passed": passed,
        })
        (ok if passed else warn)(f"Negative prices: {neg_prices:,}")

    # Negative volumes
    neg_vols = client.sql_scalar(cluster_id,
        "SELECT COUNT(*) FROM sweetreturns.bronze.raw_stock_data WHERE volume < 0")
    if neg_vols is not None:
        neg_vols = int(neg_vols)
        passed = neg_vols == 0
        report["checks"].append({
            "name": "negative_volumes", "value": neg_vols,
            "threshold": "0", "passed": passed,
        })
        (ok if passed else warn)(f"Negative volumes: {neg_vols:,}")

    # Date range
    date_range = client.sql_to_rows(cluster_id,
        "SELECT MIN(date) as min_date, MAX(date) as max_date FROM sweetreturns.bronze.raw_stock_data")
    if date_range:
        dim(f"Date range: {date_range[0].get('min_date')} → {date_range[0].get('max_date')}")
        report["checks"].append({
            "name": "date_range",
            "value": f"{date_range[0].get('min_date')} to {date_range[0].get('max_date')}",
            "passed": True,
        })

    # Duplicate check
    dupes = client.sql_scalar(cluster_id, """
        SELECT COUNT(*) FROM (
            SELECT ticker, date, COUNT(*) as cnt
            FROM sweetreturns.bronze.raw_stock_data
            GROUP BY ticker, date
            HAVING cnt > 1
        )
    """)
    if dupes is not None:
        dupes = int(dupes)
        passed = dupes == 0
        report["checks"].append({
            "name": "duplicate_ticker_dates", "value": dupes,
            "threshold": "0", "passed": passed,
        })
        (ok if passed else warn)(f"Duplicate (ticker, date) pairs: {dupes:,}")

    # Sector coverage
    sectors = client.sql_to_rows(cluster_id, """
        SELECT sector, COUNT(DISTINCT ticker) as tickers
        FROM sweetreturns.bronze.raw_stock_data
        WHERE sector IS NOT NULL
        GROUP BY sector
        ORDER BY tickers DESC
    """)
    if sectors:
        dim(f"Sectors represented: {len(sectors)}")
        for s in sectors[:5]:
            dim(f"  {s.get('sector', '?')}: {s.get('tickers', 0)} tickers")
        report["checks"].append({
            "name": "sector_count", "value": len(sectors), "passed": len(sectors) >= 8,
        })

    failed = sum(1 for c in report["checks"] if not c.get("passed", True))
    report["status"] = "fail" if failed > 0 else "pass"
    report["failed_checks"] = failed
    report["total_checks"] = len(report["checks"])
    return report


def check_silver(client: DatabricksClient, cluster_id: str) -> dict:
    """Check Silver layer data quality (technical indicators)."""
    hdr("SILVER LAYER — Feature Quality")
    report = {"layer": "silver", "checks": [], "status": "pass"}

    count = client.sql_scalar(cluster_id,
        "SELECT COUNT(*) FROM sweetreturns.silver.stock_features")
    if count is None:
        warn("Silver table not found — run the silver pipeline step first")
        report["status"] = "error"
        return report

    count = int(count)
    passed = count > 100000
    report["checks"].append({"name": "row_count", "value": count, "threshold": ">100K", "passed": passed})
    (ok if passed else warn)(f"Row count: {count:,}")

    # Check key feature columns for nulls
    feature_cols = ["rsi_14", "macd", "bb_upper", "bb_lower", "sma_20", "sma_50", "volatility_20d"]
    for col in feature_cols:
        try:
            nulls = client.sql_scalar(cluster_id,
                f"SELECT COUNT(*) FROM sweetreturns.silver.stock_features WHERE {col} IS NULL")
            if nulls is not None:
                nulls = int(nulls)
                pct = (nulls / count * 100) if count > 0 else 0
                # Allow up to 10% nulls (early rows won't have enough lookback)
                passed = pct < 10
                report["checks"].append({
                    "name": f"null_{col}", "value": nulls,
                    "pct": round(pct, 1), "passed": passed,
                })
                (ok if passed else warn)(f"Null {col}: {nulls:,} ({pct:.1f}%)")
        except Exception:
            dim(f"Column {col} not found — skipping")

    # RSI range check (should be 0-100)
    rsi_outliers = client.sql_scalar(cluster_id, """
        SELECT COUNT(*) FROM sweetreturns.silver.stock_features
        WHERE rsi_14 IS NOT NULL AND (rsi_14 < 0 OR rsi_14 > 100)
    """)
    if rsi_outliers is not None:
        rsi_outliers = int(rsi_outliers)
        passed = rsi_outliers == 0
        report["checks"].append({"name": "rsi_range", "value": rsi_outliers, "passed": passed})
        (ok if passed else err)(f"RSI out-of-range (0-100): {rsi_outliers:,}")

    # Volatility check (should be non-negative)
    neg_vol = client.sql_scalar(cluster_id, """
        SELECT COUNT(*) FROM sweetreturns.silver.stock_features
        WHERE volatility_20d IS NOT NULL AND volatility_20d < 0
    """)
    if neg_vol is not None:
        neg_vol = int(neg_vol)
        passed = neg_vol == 0
        report["checks"].append({"name": "negative_volatility", "value": neg_vol, "passed": passed})
        (ok if passed else err)(f"Negative volatility: {neg_vol:,}")

    # Feature freshness (most recent date)
    max_date = client.sql_scalar(cluster_id,
        "SELECT MAX(date) FROM sweetreturns.silver.stock_features")
    if max_date:
        dim(f"Latest feature date: {max_date}")
        report["checks"].append({"name": "latest_date", "value": str(max_date), "passed": True})

    failed = sum(1 for c in report["checks"] if not c.get("passed", True))
    report["status"] = "fail" if failed > 0 else "pass"
    report["failed_checks"] = failed
    report["total_checks"] = len(report["checks"])
    return report


def check_gold(client: DatabricksClient, cluster_id: str) -> dict:
    """Check Gold layer data quality (golden tickets + store dimensions)."""
    hdr("GOLD LAYER — Golden Ticket Quality")
    report = {"layer": "gold", "checks": [], "status": "pass"}

    count = client.sql_scalar(cluster_id,
        "SELECT COUNT(*) FROM sweetreturns.gold.golden_tickets")
    if count is None:
        warn("Gold table not found — run the gold pipeline step first")
        report["status"] = "error"
        return report

    count = int(count)
    passed = count > 400
    report["checks"].append({"name": "ticker_count", "value": count, "threshold": ">400", "passed": passed})
    (ok if passed else warn)(f"Tickers with golden scores: {count:,}")

    # Score distribution
    score_dist = client.sql_to_rows(cluster_id, """
        SELECT golden_score, COUNT(*) as cnt
        FROM sweetreturns.gold.golden_tickets
        GROUP BY golden_score
        ORDER BY golden_score
    """)
    if score_dist:
        dim("Golden score distribution:")
        for row in score_dist:
            score = row.get("golden_score", "?")
            cnt = row.get("cnt", 0)
            bar = "█" * min(int(cnt) // 5, 40)
            dim(f"  Score {score}: {cnt:>4}  {bar}")
        report["checks"].append({
            "name": "score_distribution",
            "value": {str(r.get("golden_score", "?")): r.get("cnt", 0) for r in score_dist},
            "passed": True,
        })

    # Platinum count
    platinum = client.sql_scalar(cluster_id,
        "SELECT COUNT(*) FROM sweetreturns.gold.golden_tickets WHERE is_platinum = true")
    if platinum is not None:
        platinum = int(platinum)
        pct = (platinum / count * 100) if count > 0 else 0
        # Platinum should be rare (~2-5%)
        passed = 0 < pct < 10
        report["checks"].append({
            "name": "platinum_pct", "value": platinum,
            "pct": round(pct, 1), "passed": passed,
        })
        (ok if passed else warn)(f"Platinum stocks: {platinum} ({pct:.1f}%)")

    # Null golden scores
    null_scores = client.sql_scalar(cluster_id,
        "SELECT COUNT(*) FROM sweetreturns.gold.golden_tickets WHERE golden_score IS NULL")
    if null_scores is not None:
        null_scores = int(null_scores)
        passed = null_scores == 0
        report["checks"].append({"name": "null_golden_score", "value": null_scores, "passed": passed})
        (ok if passed else err)(f"Null golden scores: {null_scores:,}")

    # Score range check (0-5)
    bad_scores = client.sql_scalar(cluster_id, """
        SELECT COUNT(*) FROM sweetreturns.gold.golden_tickets
        WHERE golden_score < 0 OR golden_score > 5
    """)
    if bad_scores is not None:
        bad_scores = int(bad_scores)
        passed = bad_scores == 0
        report["checks"].append({"name": "score_range", "value": bad_scores, "passed": passed})
        (ok if passed else err)(f"Scores out of range (0-5): {bad_scores:,}")

    # Sector completeness
    sectors = client.sql_to_rows(cluster_id, """
        SELECT sector, COUNT(*) as cnt,
               AVG(golden_score) as avg_score,
               SUM(CASE WHEN is_platinum THEN 1 ELSE 0 END) as platinum
        FROM sweetreturns.gold.golden_tickets
        WHERE sector IS NOT NULL
        GROUP BY sector
        ORDER BY cnt DESC
    """)
    if sectors:
        dim(f"\nSector breakdown ({len(sectors)} sectors):")
        for s in sectors:
            dim(f"  {s.get('sector', '?'):25s}  {s.get('cnt', 0):>4} tickers  "
                f"avg_score={float(s.get('avg_score', 0)):.2f}  "
                f"platinum={s.get('platinum', 0)}")
        report["checks"].append({"name": "sector_count", "value": len(sectors), "passed": len(sectors) >= 8})

    failed = sum(1 for c in report["checks"] if not c.get("passed", True))
    report["status"] = "fail" if failed > 0 else "pass"
    report["failed_checks"] = failed
    report["total_checks"] = len(report["checks"])
    return report


def check_payload() -> dict:
    """Check the local frontend_payload.json quality (no Databricks needed)."""
    hdr("PAYLOAD — frontend_payload.json Quality")
    report = {"layer": "payload", "checks": [], "status": "pass"}

    if not PAYLOAD_PATH.exists():
        err(f"File not found: {PAYLOAD_PATH}")
        err("Run: python scripts/build_payload.py")
        report["status"] = "missing"
        return report

    size_mb = PAYLOAD_PATH.stat().st_size / (1024 * 1024)
    ok(f"File size: {size_mb:.2f} MB")

    with open(PAYLOAD_PATH) as f:
        data = json.load(f)

    stocks = data.get("stocks", [])
    edges = data.get("edges", [])
    meta = data.get("meta", {})
    quality = data.get("data_quality", {})

    # Stock count
    n_stocks = len(stocks)
    passed = n_stocks >= 400
    report["checks"].append({"name": "stock_count", "value": n_stocks, "threshold": ">=400", "passed": passed})
    (ok if passed else warn)(f"Stocks: {n_stocks}")

    # Edge count
    n_edges = len(edges)
    passed = n_edges >= 500
    report["checks"].append({"name": "edge_count", "value": n_edges, "threshold": ">=500", "passed": passed})
    (ok if passed else warn)(f"Correlation edges: {n_edges}")

    # Null tickers
    null_tickers = sum(1 for s in stocks if not s.get("ticker"))
    passed = null_tickers == 0
    report["checks"].append({"name": "null_tickers", "value": null_tickers, "passed": passed})
    (ok if passed else err)(f"Null tickers: {null_tickers}")

    # Null sectors
    null_sectors = sum(1 for s in stocks if not s.get("sector"))
    passed = null_sectors == 0
    report["checks"].append({"name": "null_sectors", "value": null_sectors, "passed": passed})
    (ok if passed else err)(f"Null sectors: {null_sectors}")

    # Zero prices
    zero_prices = sum(1 for s in stocks if s.get("price", 0) <= 0)
    passed = zero_prices == 0
    report["checks"].append({"name": "zero_prices", "value": zero_prices, "passed": passed})
    (ok if passed else warn)(f"Zero/negative prices: {zero_prices}")

    # Golden score range
    bad_scores = sum(1 for s in stocks if s.get("golden_score", 0) < 0 or s.get("golden_score", 0) > 5)
    passed = bad_scores == 0
    report["checks"].append({"name": "score_range", "value": bad_scores, "passed": passed})
    (ok if passed else err)(f"Scores out of range: {bad_scores}")

    # Platinum rarity
    platinum = sum(1 for s in stocks if s.get("is_platinum"))
    pct = (platinum / n_stocks * 100) if n_stocks > 0 else 0
    passed = 0 <= pct < 10
    report["checks"].append({"name": "platinum_pct", "value": platinum, "pct": round(pct, 1), "passed": passed})
    (ok if passed else warn)(f"Platinum stocks: {platinum} ({pct:.1f}%)")

    # Sector distribution
    sectors = {}
    for s in stocks:
        sec = s.get("sector", "Unknown")
        sectors[sec] = sectors.get(sec, 0) + 1
    dim(f"\nSector distribution ({len(sectors)} sectors):")
    for sec, cnt in sorted(sectors.items(), key=lambda x: -x[1]):
        bar = "█" * (cnt // 5)
        dim(f"  {sec:25s}  {cnt:>4}  {bar}")
    report["checks"].append({"name": "sector_count", "value": len(sectors), "passed": len(sectors) >= 8})

    # News coverage
    with_news = sum(1 for s in stocks if s.get("news_count", 0) > 0)
    news_pct = (with_news / n_stocks * 100) if n_stocks > 0 else 0
    avg_news = sum(s.get("news_count", 0) for s in stocks) / n_stocks if n_stocks > 0 else 0
    passed = news_pct > 50
    report["checks"].append({"name": "news_coverage", "value": with_news, "pct": round(news_pct, 1), "passed": passed})
    (ok if passed else warn)(f"News coverage: {with_news}/{n_stocks} ({news_pct:.0f}%), avg {avg_news:.1f}/stock")

    # Edge weight distribution
    if edges:
        weights = [e.get("weight", 0) for e in edges]
        avg_w = sum(weights) / len(weights)
        max_w = max(weights)
        min_w = min(weights)
        dim(f"\nEdge weights: min={min_w:.3f}  avg={avg_w:.3f}  max={max_w:.3f}")
        report["checks"].append({
            "name": "edge_weights",
            "value": {"min": min_w, "avg": round(avg_w, 3), "max": max_w},
            "passed": True,
        })

    # Statistical summary
    if stocks:
        scores = [s.get("golden_score", 0) for s in stocks]
        vols = [s.get("volatility", 0) for s in stocks if s.get("volatility", 0) > 0]
        drawdowns = [s.get("max_drawdown", 0) for s in stocks if s.get("max_drawdown", 0) > 0]
        dim(f"\nStatistical summary:")
        dim(f"  Golden scores: avg={sum(scores)/len(scores):.2f}  max={max(scores)}")
        if vols:
            dim(f"  Volatility:    avg={sum(vols)/len(vols):.4f}  max={max(vols):.4f}")
        if drawdowns:
            dim(f"  Max drawdown:  avg={sum(drawdowns)/len(drawdowns):.4f}  max={max(drawdowns):.4f}")

    # Build quality info (from pipeline)
    if quality:
        dim(f"\nBuild quality metadata:")
        for k, v in quality.items():
            dim(f"  {k}: {v}")

    failed = sum(1 for c in report["checks"] if not c.get("passed", True))
    report["status"] = "fail" if failed > 0 else "pass"
    report["failed_checks"] = failed
    report["total_checks"] = len(report["checks"])
    report["file_size_mb"] = round(size_mb, 2)
    return report


# ── Summary Report ───────────────────────────────────────────────────────────

def print_summary(reports: list):
    """Print a summary across all layer reports."""
    hdr("DATA QUALITY SUMMARY")

    total_checks = 0
    total_failed = 0

    for r in reports:
        layer = r.get("layer", "?").upper()
        status = r.get("status", "unknown")
        checks = r.get("total_checks", 0)
        failed = r.get("failed_checks", 0)
        total_checks += checks
        total_failed += failed

        if status == "pass":
            ok(f"{layer:8s}  {checks} checks  ALL PASSED")
        elif status == "error":
            warn(f"{layer:8s}  TABLE NOT FOUND")
        elif status == "missing":
            err(f"{layer:8s}  FILE NOT FOUND")
        else:
            err(f"{layer:8s}  {checks} checks  {failed} FAILED")

    print()
    if total_failed == 0:
        print(f"  {GREEN}{BOLD}Overall: {total_checks} checks — ALL PASSED{RESET}")
    else:
        print(f"  {RED}{BOLD}Overall: {total_checks} checks — {total_failed} FAILED{RESET}")

    return total_failed == 0


def export_report(reports: list, fmt: str):
    """Export quality report to JSON."""
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = REPORT_DIR / f"quality_report_{timestamp}.json"

    report_data = {
        "timestamp": datetime.now().isoformat(),
        "layers": reports,
        "summary": {
            "total_checks": sum(r.get("total_checks", 0) for r in reports),
            "total_failed": sum(r.get("failed_checks", 0) for r in reports),
            "all_passed": all(r.get("status") == "pass" for r in reports),
        },
    }

    with open(out_path, "w") as f:
        json.dump(report_data, f, indent=2, default=str)

    ok(f"Report exported: {out_path}")
    return out_path


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SweetReturns — Databricks Data Quality Monitor",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--layer", choices=["bronze", "silver", "gold", "payload", "all"],
                        default="all", help="Which layer to check (default: all)")
    parser.add_argument("--watch", action="store_true",
                        help="Continuous monitoring — re-check every 60s")
    parser.add_argument("--export", metavar="FORMAT", choices=["report"],
                        help="Export quality report as JSON")
    parser.add_argument("--payload-only", action="store_true",
                        help="Only check local payload (no Databricks connection needed)")
    args = parser.parse_args()

    print(f"\n{CYAN}╔══════════════════════════════════════════════════╗")
    print(f"║  SweetReturns — Data Quality Monitor             ║")
    print(f"╚══════════════════════════════════════════════════╝{RESET}\n")

    # Payload-only mode — no Databricks needed
    if args.payload_only or args.layer == "payload":
        reports = [check_payload()]
        print_summary(reports)
        if args.export:
            export_report(reports, args.export)
        return

    # Try to connect to Databricks
    host, token = load_env()
    client = None
    cluster_id = ""

    if host and token:
        try:
            client = DatabricksClient(host, token)
            me = client.get("2.0/preview/scim/v2/Me")
            ok(f"Connected to Databricks as: {me.get('userName', '(unknown)')}")
            cluster_id = client.find_cluster()
            if cluster_id:
                ok(f"Using cluster: {cluster_id}")
            else:
                warn("No cluster found — Databricks layer checks will be skipped")
                client = None
        except Exception as e:
            warn(f"Could not connect to Databricks: {e}")
            warn("Running in local-only mode (payload check only)")
            client = None
    else:
        info("No Databricks credentials found — running in local-only mode")
        info("To enable Databricks checks, configure databricks/.env")

    def run_checks():
        reports = []
        layer = args.layer

        if client and cluster_id:
            if layer in ("bronze", "all"):
                reports.append(check_bronze(client, cluster_id))
            if layer in ("silver", "all"):
                reports.append(check_silver(client, cluster_id))
            if layer in ("gold", "all"):
                reports.append(check_gold(client, cluster_id))

        if layer in ("payload", "all"):
            reports.append(check_payload())

        all_passed = print_summary(reports)

        if args.export:
            export_report(reports, args.export)

        return all_passed, reports

    if args.watch:
        print(f"\n  {DIM}Watching mode — Ctrl+C to stop{RESET}\n")
        try:
            while True:
                run_checks()
                print(f"\n  {DIM}Next check in 60s...{RESET}")
                time.sleep(60)
                print(f"\n{'='*60}\n")
        except KeyboardInterrupt:
            print(f"\n  {DIM}Stopped.{RESET}")
    else:
        all_passed, _ = run_checks()
        sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
