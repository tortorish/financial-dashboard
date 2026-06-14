#!/usr/bin/env python3
"""
Financial Dashboard Backend
- Serves static frontend
- Provides /api/indices endpoint that queries neodata in real-time
- Provides /api/kline/<index_id>?period=3m endpoint for historical chart data
- All data comes from real APIs, no fabricated data
- Auto-handles token refresh and proxy cleanup
"""

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Optional

from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kline_fetcher

for key in list(os.environ.keys()):
    if key.lower() in ('http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'):
        del os.environ[key]

app = Flask(__name__, static_folder='static')
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
NEODATA_DIR = Path("/Users/skye/.workbuddy/plugins/marketplaces/cb_teams_marketplace/plugins/finance-data/skills/neodata-financial-search")
QUERY_SCRIPT = NEODATA_DIR / "scripts" / "query.py"
TOKEN_FILE = BASE_DIR / "token.json"
KLINE_CACHE_FILE = BASE_DIR / "kline_cache.json"

quote_cache = {"timestamp": None, "data": []}
quote_lock = Lock()

INDICES = [
    {"id": "ixic", "name": "纳斯达克综合指数", "symbol": ".IXIC.US", "category": "us_broad", "query": "纳斯达克综合指数 行情"},
    {"id": "inx", "name": "标普500", "symbol": ".INX.US", "category": "us_broad", "query": "标普500指数 行情"},
    {"id": "soxx", "name": "费城半导体ETF (SOXX)", "symbol": "SOXX.US", "category": "us_chip", "query": "SOXX半导体ETF 行情"},
    {"id": "smh", "name": "半导体ETF (SMH)", "symbol": "SMH.US", "category": "us_chip", "query": "SMH半导体ETF 行情"},
    {"id": "kc50", "name": "科创50", "symbol": "000688.SH", "category": "cn_tech", "query": "科创50指数000688 行情"},
    {"id": "cyb", "name": "创业板指", "symbol": "399006.SZ", "category": "cn_tech", "query": "创业板指 行情"},
    {"id": "cninternet", "name": "中国互联网", "symbol": "H11136.CS", "category": "cn_tech", "query": "中国互联网H11136 行情"},
    {"id": "cntech", "name": "中证科技", "symbol": "931186.CS", "category": "cn_tech", "query": "中证科技931186 行情"},
    {"id": "csi_semi", "name": "半导体(中证)", "symbol": "H30184.CS", "category": "cn_chip", "query": "半导体指数 行情"},
    {"id": "cssc", "name": "中华半导体芯片", "symbol": "990001.CS", "category": "cn_chip", "query": "中华半导体芯片990001 行情"},
    {"id": "cschip", "name": "国证芯片", "symbol": "980017.SZ", "category": "cn_chip", "query": "国证芯片980017 行情"},
    {"id": "hstech", "name": "恒生科技", "symbol": "HSTECH.HK", "category": "hk_tech", "query": "恒生科技指数HSTECH 行情"},
]

KLINE_PERIODS = {"3m": "近3个月", "6m": "近6个月", "1y": "近1年", "3y": "近3年"}
INDEX_BY_ID = {i["id"]: i for i in INDICES}


def _get_token() -> str:
    if TOKEN_FILE.exists():
        try:
            data = json.loads(TOKEN_FILE.read_text())
            token = data.get("token", "").strip()
            saved = data.get("saved_at", 0)
            if token and (time.time() - saved < 30 * 86400):
                return token
        except Exception:
            pass
    skill_token_file = NEODATA_DIR / "skills" / ".neodata_token"
    if skill_token_file.exists():
        try:
            data = json.loads(skill_token_file.read_text())
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
            return {"error": "No JSON in response"}
        return json.loads(stdout[json_start:])
    except subprocess.TimeoutExpired:
        return {"error": "Query timeout"}
    except json.JSONDecodeError as e:
        return {"error": f"Invalid JSON: {e}"}
    except Exception as e:
        return {"error": str(e)}


def parse_quote(content: str) -> dict:
    def extract(pattern, text, default=None):
        m = re.search(pattern, text)
        return m.group(1).strip() if m else default
    name = extract(r'^(.+?)\(', content, "Unknown")
    symbol = extract(r'代码:([^)]+)', content)
    price = extract(r'最新价格:([^;]+)', content)
    prev_close = extract(r'昨日收盘价格:([^;]+)', content)
    open_price = extract(r'今日开盘价格:([^;]+)', content)
    high = extract(r'最高点:([^;]+)', content)
    low = extract(r'最低点:([^;]+)', content)
    change_pct = extract(r'当日涨跌幅:([^;]+)', content)
    amplitude = extract(r'当天振幅:([^;]+)', content)
    volume = extract(r'成交数量\(股\):([^;]+)', content) or extract(r'成交数量\(手\):([^;]+)', content)
    turnover = extract(r'成交金额\([^)]+\):([^;]+)', content)
    avg_price = extract(r'均价:([^;]+)', content)
    ytd = extract(r'年初至今涨跌幅:\s*([^;]+)', content)
    change_5d = extract(r'5日涨跌幅:([^;]+)', content)
    change_20d = extract(r'20日涨跌幅:([^;]+)', content)
    update_time = extract(r'数据更新时间:([^;]+)', content)
    pe = extract(r'市盈率\(TTM\):([^;]+)', content) or extract(r'市盈率ttm:([^;]+)', content)
    pb = extract(r'市净率:([^;]+)', content)
    turnover_rate = extract(r'换手率:([^;]+)', content)
    return {
        "name": name, "symbol": symbol, "price": price,
        "prevClose": prev_close, "open": open_price, "high": high, "low": low,
        "changePct": change_pct, "amplitude": amplitude,
        "volume": volume, "turnover": turnover, "avgPrice": avg_price,
        "ytd": ytd, "change5d": change_5d, "change20d": change_20d,
        "updateTime": update_time, "pe": pe, "pb": pb, "turnoverRate": turnover_rate,
        "raw": content[:200],
    }


def fetch_index_data(idx: dict) -> dict:
    data = query_neodata(idx["query"])
    if "error" in data:
        return {**idx, "status": "error", "error": data["error"]}
    if data.get("code") != "200":
        return {**idx, "status": "error", "error": f"API code {data.get('code')}"}
    api_data = data.get("data", {}).get("apiData", {})
    recalls = api_data.get("apiRecall", [])
    for recall in recalls:
        if "行情" in recall.get("type", "") or "行情" in recall.get("desc", ""):
            content = recall.get("content", "")
            if content:
                parsed = parse_quote(content)
                return {**idx, "status": "ok", **parsed}
    return {**idx, "status": "no_data", "error": "No quote data found"}


def _load_kline_cache() -> dict:
    if KLINE_CACHE_FILE.exists():
        try:
            return json.loads(KLINE_CACHE_FILE.read_text())
        except Exception:
            pass
    return {}


def _save_kline_cache(cache: dict) -> None:
    KLINE_CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2))


def _get_cached_kline(index_id: str, period: str) -> Optional[dict]:
    cache = _load_kline_cache()
    data = cache.get("data", {})
    idx_cache = data.get(index_id, {})
    period_cache = idx_cache.get(period)
    if period_cache:
        return period_cache
    return None


def _set_cached_kline(index_id: str, period: str, result: dict) -> None:
    cache = _load_kline_cache()
    if "data" not in cache:
        cache["data"] = {}
    if index_id not in cache["data"]:
        cache["data"][index_id] = {}
    cache["data"][index_id][period] = result
    cache["timestamp"] = datetime.now().isoformat()
    _save_kline_cache(cache)


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/indices")
def get_indices():
    with quote_lock:
        if quote_cache["timestamp"] and quote_cache["data"]:
            age = (datetime.now() - quote_cache["timestamp"]).total_seconds()
            if age < 60:
                return jsonify({
                    "timestamp": quote_cache["timestamp"].isoformat(),
                    "source": "neodata-financial-search (Tencent FiT) [cached]",
                    "indices": quote_cache["data"],
                })
        results = []
        for idx in INDICES:
            results.append(fetch_index_data(idx))
        quote_cache["timestamp"] = datetime.now()
        quote_cache["data"] = results
    return jsonify({
        "timestamp": datetime.now().isoformat(),
        "source": "neodata-financial-search (Tencent FiT)",
        "indices": results,
    })


@app.route("/api/refresh", methods=["POST"])
def refresh_indices():
    with quote_lock:
        quote_cache["timestamp"] = None
        quote_cache["data"] = []
    return get_indices()


@app.route("/api/kline/<index_id>")
def get_kline(index_id):
    """Get K-line data for a single index and period."""
    period = request.args.get("period", "1y")
    force = request.args.get("refresh", "false").lower() == "true"

    if index_id not in INDEX_BY_ID:
        return jsonify({"error": "Unknown index"}), 404
    if period not in KLINE_PERIODS:
        return jsonify({"error": "Unknown period"}), 400

    # Check cache
    if not force:
        cached = _get_cached_kline(index_id, period)
        if cached:
            return jsonify({"source": "cache", "indexId": index_id, "period": period, **cached})

    # Fetch from source
    res = kline_fetcher.fetch_kline(index_id, period)
    idx = INDEX_BY_ID[index_id]
    result = {
        "name": idx["name"],
        "symbol": idx["symbol"],
        "period": period,
        "periodDesc": KLINE_PERIODS[period],
        "records": res["records"],
        "status": res["status"],
        "error": res["error"],
        "recordCount": len(res["records"]),
        "source": kline_fetcher.KLINE_SOURCES.get(index_id, {}).get("source", "unknown"),
    }
    _set_cached_kline(index_id, period, result)
    return jsonify({"source": "api", "indexId": index_id, "period": period, **result})


@app.route("/api/health")
def health():
    token = _get_token()
    return jsonify({
        "status": "ok",
        "token_present": bool(token),
        "timestamp": datetime.now().isoformat(),
    })


if __name__ == "__main__":
    print(f"[Dashboard] Starting on http://localhost:5050")
    print(f"[Dashboard] Token file: {TOKEN_FILE} (exists={TOKEN_FILE.exists()})")
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
