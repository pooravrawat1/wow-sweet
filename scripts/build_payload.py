#!/usr/bin/env python3
"""
Build frontend_payload.json from the real CSV dataset.
Processes stock_prices.csv, company_metadata.csv, financial_news.csv,
and macro_indicators.csv into a compact JSON for the React frontend.
"""

import csv
import json
import math
import sys
import os
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "2001-2017 dataset" / "Datasets"
OUT_PATH = Path(__file__).resolve().parents[1] / "public" / "frontend_payload.json"

# --- Config ---
TOP_N_STOCKS = 500  # number of stocks to include
MIN_HISTORY_DAYS = 200  # minimum trading days required

# Map dataset sector names → frontend SECTORS names
SECTOR_MAP = {
    "Technology": "Technology",
    "Healthcare": "Healthcare",
    "Financial Services": "Financials",
    "Financials": "Financials",
    "Consumer Cyclical": "Consumer Discretionary",
    "Consumer Discretionary": "Consumer Discretionary",
    "Communication Services": "Communication Services",
    "Industrials": "Industrials",
    "Consumer Defensive": "Consumer Staples",
    "Consumer Staples": "Consumer Staples",
    "Energy": "Energy",
    "Utilities": "Utilities",
    "Real Estate": "Real Estate",
    "Basic Materials": "Materials",
    "Materials": "Materials",
}

VALID_SECTORS = {
    "Technology", "Healthcare", "Financials", "Consumer Discretionary",
    "Communication Services", "Industrials", "Consumer Staples",
    "Energy", "Utilities", "Real Estate", "Materials",
}


def load_metadata():
    """Load company_metadata.csv into a ticker->info dict."""
    meta = {}
    with open(DATA_DIR / "company_metadata.csv", "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ticker = row["ticker"].strip()
            meta[ticker] = {
                "name": row.get("name", ticker).strip(),
                "sector": row.get("sector", "Unknown").strip(),
                "industry": row.get("industry", "").strip(),
                "market_cap": float(row["market_cap"]) if row.get("market_cap") and row["market_cap"] != "" else 0,
                "country": row.get("country", "").strip(),
            }
    return meta


def load_stock_prices():
    """Load stock_prices.csv, group by ticker, compute features."""
    print("Loading stock prices (this may take a moment)...")
    ticker_prices = defaultdict(list)
    with open(DATA_DIR / "stock_prices.csv", "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                ticker_prices[row["ticker"]].append({
                    "date": row["date"],
                    "close": float(row["close"]),
                    "volume": int(float(row["volume"])),
                })
            except (ValueError, KeyError):
                continue

    # Sort each ticker by date
    for ticker in ticker_prices:
        ticker_prices[ticker].sort(key=lambda x: x["date"])

    return ticker_prices


def compute_features(prices):
    """Compute golden ticket features from price history."""
    if len(prices) < 50:
        return None

    closes = [p["close"] for p in prices]
    volumes = [p["volume"] for p in prices]
    n = len(closes)

    # Recent returns
    last = closes[-1]
    prev_20 = closes[-21] if n > 20 else closes[0]
    ret_20d = (last - prev_20) / prev_20 if prev_20 != 0 else 0

    # Volatility (20-day)
    if n >= 20:
        rets = [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(max(1, n - 20), n) if closes[i - 1] != 0]
        vol = math.sqrt(sum(r ** 2 for r in rets) / len(rets)) if rets else 0
    else:
        vol = 0

    # Max drawdown (last 60 days)
    window = closes[-60:] if n >= 60 else closes
    peak = window[0]
    max_dd = 0
    for c in window:
        if c > peak:
            peak = c
        dd = (peak - c) / peak if peak != 0 else 0
        if dd > max_dd:
            max_dd = dd

    # Volume spike (last day vs 20-day avg)
    if n >= 20 and volumes[-1] > 0:
        avg_vol = sum(volumes[-21:-1]) / 20 if sum(volumes[-21:-1]) > 0 else 1
        vol_spike = volumes[-1] / avg_vol
    else:
        vol_spike = 1.0

    # Simple skewness of returns
    if n >= 30:
        rets = [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(max(1, n - 60), n) if closes[i - 1] != 0]
        if len(rets) > 2:
            mean_r = sum(rets) / len(rets)
            std_r = math.sqrt(sum((r - mean_r) ** 2 for r in rets) / len(rets)) or 1e-10
            skew = sum((r - mean_r) ** 3 for r in rets) / (len(rets) * std_r ** 3)
        else:
            skew = 0
    else:
        skew = 0

    # Golden ticket scoring
    score = 0
    # Tier 1: Dip (drawdown > 15%)
    if max_dd > 0.15:
        score += 1
    # Tier 2: Shock (drawdown + volume spike)
    if max_dd > 0.10 and vol_spike > 2.0:
        score += 1
    # Tier 3: Asymmetry (positive skew)
    if skew > 0.5:
        score += 1
    # Tier 4: Mean reversion candidate
    if ret_20d < -0.10 and vol < 0.05:
        score += 1
    # Tier 5: Convexity
    if score >= 3 and skew > 0.8:
        score += 1

    is_platinum = score >= 4

    return {
        "price": round(last, 2),
        "ret_20d": round(ret_20d, 4),
        "volatility": round(vol, 4),
        "max_drawdown": round(max_dd, 4),
        "vol_spike": round(vol_spike, 2),
        "skewness": round(skew, 3),
        "golden_score": score,
        "is_platinum": is_platinum,
        "history_len": n,
    }


def compute_correlations(ticker_returns, tickers, threshold=0.5, max_edges=2000):
    """Compute top correlation edges between tickers."""
    print("Computing correlations...")
    # Use last 120 days of returns
    edges = []
    ticker_list = list(tickers)
    n = len(ticker_list)

    for i in range(n):
        for j in range(i + 1, n):
            a_rets = ticker_returns.get(ticker_list[i], [])
            b_rets = ticker_returns.get(ticker_list[j], [])
            if len(a_rets) < 60 or len(b_rets) < 60:
                continue

            # Align to same length (last N days)
            min_len = min(len(a_rets), len(b_rets), 120)
            a = a_rets[-min_len:]
            b = b_rets[-min_len:]

            # Pearson correlation
            ma = sum(a) / len(a)
            mb = sum(b) / len(b)
            cov = sum((a[k] - ma) * (b[k] - mb) for k in range(min_len))
            va = sum((a[k] - ma) ** 2 for k in range(min_len))
            vb = sum((b[k] - mb) ** 2 for k in range(min_len))
            denom = math.sqrt(va * vb)
            corr = cov / denom if denom > 0 else 0

            if abs(corr) >= threshold:
                edges.append({
                    "source": ticker_list[i],
                    "target": ticker_list[j],
                    "weight": round(abs(corr), 3),
                })

    # Sort by weight desc, take top N
    edges.sort(key=lambda e: e["weight"], reverse=True)
    return edges[:max_edges]


def count_news_per_ticker():
    """Count news articles per ticker."""
    print("Counting news per ticker...")
    counts = defaultdict(int)
    with open(DATA_DIR / "financial_news.csv", "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ticker = row.get("ticker", "").strip()
            if ticker:
                counts[ticker] += 1
    return counts


def main():
    print(f"Dataset dir: {DATA_DIR}")
    print(f"Output: {OUT_PATH}")

    # 1. Load metadata
    meta = load_metadata()
    print(f"Loaded {len(meta)} companies from metadata")

    # 2. Load stock prices
    ticker_prices = load_stock_prices()
    print(f"Loaded prices for {len(ticker_prices)} tickers")

    # 3. Count news
    news_counts = count_news_per_ticker()
    print(f"News articles span {len(news_counts)} tickers")

    # 4. Compute features for all tickers
    print("Computing features...")
    stock_features = {}
    ticker_returns = {}
    for ticker, prices in ticker_prices.items():
        if len(prices) < MIN_HISTORY_DAYS:
            continue
        features = compute_features(prices)
        if features:
            stock_features[ticker] = features
            # Store daily returns for correlation
            closes = [p["close"] for p in prices]
            rets = [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(1, len(closes)) if closes[i - 1] != 0]
            ticker_returns[ticker] = rets

    print(f"Computed features for {len(stock_features)} tickers")

    # 5. Rank and select top N by market cap (or by data richness)
    candidates = []
    for ticker, feats in stock_features.items():
        m = meta.get(ticker, {})
        mcap = m.get("market_cap", 0)
        raw_sector = m.get("sector", "Unknown")
        sector = SECTOR_MAP.get(raw_sector, raw_sector)
        if sector not in VALID_SECTORS:
            continue
        candidates.append((ticker, mcap, feats["history_len"]))

    # Sort by market cap desc, take top N
    candidates.sort(key=lambda x: x[1], reverse=True)
    selected_tickers = [c[0] for c in candidates[:TOP_N_STOCKS]]
    print(f"Selected top {len(selected_tickers)} stocks by market cap")

    # 6. Compute correlations for selected tickers
    edges = compute_correlations(ticker_returns, set(selected_tickers), threshold=0.5, max_edges=2000)
    print(f"Computed {len(edges)} correlation edges")

    # 7. Build payload
    # Data quality tracking
    quality = {
        "total_tickers_raw": len(ticker_prices),
        "tickers_with_features": len(stock_features),
        "tickers_with_metadata": sum(1 for t in selected_tickers if t in meta),
        "tickers_with_news": sum(1 for t in selected_tickers if news_counts.get(t, 0) > 0),
        "avg_history_days": 0,
        "null_sectors": 0,
        "null_prices": 0,
        "negative_volumes": 0,
    }

    stocks_payload = []
    total_history = 0
    for ticker in selected_tickers:
        m = meta.get(ticker, {})
        f = stock_features[ticker]
        raw_sector = m.get("sector", "Unknown")
        sector = SECTOR_MAP.get(raw_sector, raw_sector)
        if sector not in VALID_SECTORS:
            quality["null_sectors"] += 1
            sector = "Technology"  # fallback
        if f["price"] <= 0:
            quality["null_prices"] += 1
        total_history += f["history_len"]

        stocks_payload.append({
            "ticker": ticker,
            "company": m.get("name", ticker),
            "sector": sector,
            "industry": m.get("industry", ""),
            "price": f["price"],
            "golden_score": f["golden_score"],
            "is_platinum": f["is_platinum"],
            "volatility": f["volatility"],
            "ret_20d": f["ret_20d"],
            "max_drawdown": f["max_drawdown"],
            "vol_spike": f["vol_spike"],
            "skewness": f["skewness"],
            "news_count": news_counts.get(ticker, 0),
        })

    quality["avg_history_days"] = round(total_history / len(selected_tickers)) if selected_tickers else 0

    payload = {
        "stocks": stocks_payload,
        "edges": edges,
        "meta": {
            "total_tickers": len(stock_features),
            "selected": len(selected_tickers),
            "edge_count": len(edges),
            "data_source": "2001-2017 dataset (Kaggle)",
        },
        "data_quality": quality,
    }

    # 8. Write output
    os.makedirs(OUT_PATH.parent, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(payload, f, separators=(",", ":"))

    size_mb = os.path.getsize(OUT_PATH) / (1024 * 1024)
    print(f"\nWritten {OUT_PATH} ({size_mb:.1f} MB)")
    print(f"  {len(stocks_payload)} stocks, {len(edges)} edges")
    platinum = sum(1 for s in stocks_payload if s["is_platinum"])
    print(f"  {platinum} platinum stocks")

    # Data quality report
    print("\n--- DATA QUALITY REPORT ---")
    print(f"  Raw tickers loaded:       {quality['total_tickers_raw']}")
    print(f"  Tickers w/ features:      {quality['tickers_with_features']}")
    print(f"  Selected tickers:         {len(selected_tickers)}")
    print(f"  With metadata:            {quality['tickers_with_metadata']}")
    print(f"  With news coverage:       {quality['tickers_with_news']}")
    print(f"  Avg history (days):       {quality['avg_history_days']}")
    print(f"  Null/unmapped sectors:    {quality['null_sectors']}")
    print(f"  Zero/negative prices:     {quality['null_prices']}")
    coverage = quality['tickers_with_news'] / len(selected_tickers) * 100 if selected_tickers else 0
    print(f"  News coverage:            {coverage:.0f}%")
    print("Done!")


if __name__ == "__main__":
    main()
