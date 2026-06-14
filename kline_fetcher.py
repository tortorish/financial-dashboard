#!/usr/bin/env python3
"""
K-line data fetcher for financial dashboard.
Supports multiple free data sources:
- Yahoo Finance (US stocks/indices)
- Tencent ifzq (CN/HK stocks/indices)
- Neodata fallback (sparse historical data)
"""

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests

NEODATA_DIR = Path("/Users/skye/.workbuddy/plugins/marketplaces/cb_teams_marketplace/plugins/finance-data/skills/neodata-financial-search")
QUERY_SCRIPT = NEODATA_DIR / "scripts" / "query.py"

KLINE_SOURCES = {
    "ixic": {"source": "yahoo", "symbol": "^IXIC", "name": "纳斯达克综合指数"},
    "inx": {"source": "yahoo", "symbol": "^GSPC", "name": "标普500"},
    "soxx": {"source": "yahoo", "symbol": "SOXX", "name": "费城半导体ETF"},
    "smh": {"source": "yahoo", "symbol": "SMH", "name": "半导体ETF"},
    "kc50": {"source": "tencent", "code": "sh000688", "name": "科创50"},
    "cyb": {"source": "tencent", "code": "sz399006", "name": "创业板指"},
    "hstech": {"source": "tencent", "code": "hkHSTECH", "name": "恒生科技"},
    "cninternet": {"source": "neodata", "query": "中国互联网H11136 历史走势", "name": "中国互联网"},
    "cntech": {"source": "neodata", "query": "中证科技931186 历史走势", "name": "中证科技"},
    "csi_semi": {"source": "neodata", "query": "半导体指数 历史走势", "name": "半导体(中证)"},
    "cssc": {"source": "neodata", "query": "中华半导体芯片990001 历史走势", "name": "中华半导体芯片"},
    "cschip": {"source": "neodata", "query": "国证芯片980017 历史走势", "name": "国证芯片"},
}

YAHOO_RANGES = {"3m": "3mo", "6m": "6mo", "1y": "1y", "3y": "3y"}
TENCENT_DAYS = {"3m": 70, "6m": 130, "1y": 260, "3y": 780}


def _get_token() -> str:
    token_file = Path("/Users/skye/WorkBuddy/2026-06-13-20-19-00/financial-dashboard/token.json")
    if token_file.exists():
        try:
            data = json.loads(token_file.read_text())
            token = data.get("token", "").strip()
            saved = data.get("saved_at", 0)
            if token and (time.time() - saved < 30 * 86400):
                return token
        except Exception:
            pass
    skill_token = NEODATA_DIR / "skills" / ".neodata_token"
    if skill_token.exists():
        try:
            data = json.loads(skill_token.read_text())
            return data.get("token", "")
        except Exception:
            pass
    return ""


def query_neodata(q: str) -> dict:
    token = _get_token()
    cmd = [sys.executable, str(QUERY_SCRIPT), "--query", q, "--data-type", "api"]
    if token:
        cmd.extend(["--token", token])
    clean_env = {k: v for k, v in os.environ.items() if k.lower() not in ('http_proxy', 'https_proxy', 'all_proxy', 'no_proxy')}
    clean_env["PYTHONWARNINGS"] = "ignore"
    try:
        result = subprocess.run(
            cmd, cwd=str(NEODATA_DIR), capture_output=True, text=True,
            timeout=30, env=clean_env,
        )
        stderr_lines = [l.strip() for l in (result.stderr or "").splitlines() if l.strip()]
        stderr_lines = [l for l in stderr_lines if not any(p in l for p in [
            "RequestsDependencyWarning", "DeprecationWarning", "UserWarning",
            "FutureWarning", "RuntimeWarning", "Warning:", "warnings.warn",
            "chardet", "charset_normalizer",
        ])]
        if result.returncode != 0:
            return {"error": "\n".join(stderr_lines) or f"exit {result.returncode}"}
        stdout = result.stdout or ""
        json_start = stdout.find("{")
        if json_start == -1:
            return {"error": "No JSON"}
        return json.loads(stdout[json_start:])
    except Exception as e:
        return {"error": str(e)}


def fetch_yahoo(symbol: str, period: str) -> dict:
    range_str = YAHOO_RANGES.get(period, "1y")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range_str}&interval=1d"
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        chart = data.get("chart", {})
        if chart.get("error"):
            return {"records": [], "status": "error", "error": str(chart["error"])}
        result = chart.get("result", [{}])[0]
        timestamps = result.get("timestamp", [])
        if not timestamps:
            return {"records": [], "status": "no_data", "error": "No timestamps"}
        quote = result.get("indicators", {}).get("quote", [{}])[0]
        opens = quote.get("open", [])
        closes = quote.get("close", [])
        highs = quote.get("high", [])
        lows = quote.get("low", [])
        volumes = quote.get("volume", [])
        records = []
        for i, ts in enumerate(timestamps):
            if closes[i] is None:
                continue
            dt = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
            records.append({
                "date": dt,
                "open": f"{opens[i]:.2f}" if opens[i] is not None else "",
                "close": f"{closes[i]:.2f}" if closes[i] is not None else "",
                "high": f"{highs[i]:.2f}" if highs[i] is not None else "",
                "low": f"{lows[i]:.2f}" if lows[i] is not None else "",
                "volume": str(int(volumes[i])) if volumes[i] is not None else "",
            })
        return {"records": records, "status": "ok", "error": None}
    except Exception as e:
        return {"records": [], "status": "error", "error": str(e)}


def fetch_tencent(code: str, period: str) -> dict:
    days = TENCENT_DAYS.get(period, 260)
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={code},day,{start_date},{end_date},{days},qfq"
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        api_data = data.get("data", {})
        stock_data = None
        for k, v in api_data.items():
            if isinstance(v, dict) and "day" in v:
                stock_data = v
                break
        if not stock_data:
            return {"records": [], "status": "no_data", "error": "No day data"}
        day_list = stock_data.get("day", [])
        records = []
        for row in day_list:
            if isinstance(row, list) and len(row) >= 6:
                records.append({
                    "date": row[0], "open": str(row[1]), "close": str(row[2]),
                    "high": str(row[3]), "low": str(row[4]), "volume": str(row[5]),
                })
        return {"records": records, "status": "ok", "error": None}
    except Exception as e:
        return {"records": [], "status": "error", "error": str(e)}


def parse_neodata_history(content: str) -> list:
    lines = content.strip().splitlines()
    records = []
    for line in lines:
        line = line.strip()
        if not line.startswith("|") or "日期" in line or "---" in line:
            continue
        parts = [p.strip() for p in line.split("|")]
        parts = [p for p in parts if p]
        if len(parts) < 3:
            continue
        date_str = parts[0]
        if not re.match(r"\d{4}-\d{2}-\d{2}", date_str):
            continue
        if "省略" in parts[1] or "未开盘" in parts[2]:
            continue
        records.append({
            "date": date_str, "open": parts[1] if len(parts) > 1 else "",
            "close": parts[2] if len(parts) > 2 else "",
            "high": parts[6] if len(parts) > 6 else "",
            "low": parts[7] if len(parts) > 7 else "",
            "volume": parts[4] if len(parts) > 4 else "",
        })
    records.reverse()
    return records


def fetch_neodata_history(query: str) -> dict:
    data = query_neodata(query)
    if "error" in data:
        return {"records": [], "status": "error", "error": data["error"]}
    if data.get("code") != "200":
        return {"records": [], "status": "error", "error": f"API code {data.get('code')}"}
    api_data = data.get("data", {}).get("apiData", {})
    recalls = api_data.get("apiRecall", [])
    for recall in recalls:
        rtype = recall.get("type", "")
        if "历史" in rtype or "走势" in rtype:
            content = recall.get("content", "")
            if content:
                records = parse_neodata_history(content)
                if records:
                    return {"records": records, "status": "ok", "error": None}
    return {"records": [], "status": "no_data", "error": "No historical data"}


# In-memory cache for neodata fallback (since all periods share same data)
_neodata_fallback_cache = {}


def fetch_kline(index_id: str, period: str) -> dict:
    cfg = KLINE_SOURCES.get(index_id)
    if not cfg:
        return {"records": [], "status": "no_source", "error": "No data source configured"}

    src = cfg["source"]
    if src == "yahoo":
        return fetch_yahoo(cfg["symbol"], period)
    elif src == "tencent":
        return fetch_tencent(cfg["code"], period)
    elif src == "neodata":
        # Neodata returns same sparse data regardless of period; cache it
        cache_key = index_id
        if cache_key not in _neodata_fallback_cache:
            _neodata_fallback_cache[cache_key] = fetch_neodata_history(cfg["query"])
        return _neodata_fallback_cache[cache_key]
    else:
        return {"records": [], "status": "error", "error": f"Unknown source {src}"}


if __name__ == "__main__":
    for idx_id in ["ixic", "kc50", "hstech"]:
        for period in ["3m", "1y"]:
            res = fetch_kline(idx_id, period)
            print(f"{idx_id}/{period}: {res['status']} records={len(res.get('records', []))}")
