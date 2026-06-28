import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const INDICES_FILE = path.join(DATA_DIR, "indices.json");
const INDICES_CACHE_FILE = path.join(CACHE_DIR, "markets-indices.json");
const KLINE_CACHE_FILE = path.join(CACHE_DIR, "markets-kline.json");

const QUOTE_CACHE_TTL_MS = 60 * 1000;
const KLINE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const KLINE_PERIODS = new Set(["3m", "6m", "1y", "3y"]);
const YAHOO_RANGES = { "3m": "3mo", "6m": "6mo", "1y": "1y", "3y": "3y" };
const TENCENT_DAYS = { "3m": 70, "6m": 130, "1y": 260, "3y": 780 };
const SOURCE_LABELS = {
  yahoo: "Yahoo Finance",
  tencent: "Tencent ifzq",
  neodata: "NeoData",
  cache: "Local JSON cache"
};
const DEFAULT_NEODATA_SCRIPT =
  "/Users/skye/.workbuddy/plugins/marketplaces/cb_teams_marketplace/plugins/finance-data/skills/neodata-financial-search/scripts/query.py";
const DEFAULT_NEODATA_DIR =
  "/Users/skye/.workbuddy/plugins/marketplaces/cb_teams_marketplace/plugins/finance-data/skills/neodata-financial-search";

export async function getMarketIndices({ refresh = false } = {}) {
  if (!refresh) {
    const cached = await readCache(INDICES_CACHE_FILE, QUOTE_CACHE_TTL_MS);
    if (cached && !cached.stale) {
      return {
        ...cached.payload,
        cacheStatus: cached.payload.cacheStatus || "fresh",
        servedFromCache: true,
        servedAt: new Date().toISOString()
      };
    }
  }

  return refreshMarketIndices();
}

export async function refreshMarketIndices() {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const configured = await readConfiguredIndices();
  const previousCache = await readCache(INDICES_CACHE_FILE, Number.POSITIVE_INFINITY);
  const fetchedAt = new Date().toISOString();
  const errors = [];
  const indices = [];

  const results = await Promise.all(
    configured.map(async (config) => {
      try {
        const result = await fetchIndexQuote(config);
        return {
          index: toClientIndex(config, result, fetchedAt),
          error: result.error
            ? { id: config.id, source: result.source, message: result.error }
            : null
        };
      } catch (error) {
        const fallback = previousCache?.payload?.indices?.find((item) => item.id === config.id);
        const fallbackIsUsable =
          fallback &&
          fallback.price !== null &&
          fallback.price !== undefined &&
          fallback.updateTime;
        return {
          index: fallbackIsUsable
            ? {
                ...fallback,
                status: "stale",
                error: error.message,
                source: `${sourceType(config.quoteSource)}-cache`
              }
            : toUnavailableIndex(config, error.message),
          error: {
            id: config.id,
            source: sourceType(config.quoteSource),
            message: error.message
          }
        };
      }
    })
  );

  for (const result of results) {
    indices.push(result.index);
    if (result.error) {
      errors.push(result.error);
    }
  }

  const cacheUpdatedAt = new Date().toISOString();
  const payload = {
    indices,
    source: summarizeSources(configured.map((item) => item.quoteSource)),
    fetchedAt,
    cacheUpdatedAt,
    cacheStatus: errors.length ? "partial" : "fresh",
    errors
  };

  await writeJson(INDICES_CACHE_FILE, payload);

  return {
    ...payload,
    servedAt: new Date().toISOString()
  };
}

export async function getMarketKline(indexId, period = "1y") {
  const normalizedPeriod = String(period || "1y").toLowerCase();
  if (!KLINE_PERIODS.has(normalizedPeriod)) {
    return {
      statusCode: 400,
      data: {
        indexId,
        period: normalizedPeriod,
        records: [],
        source: "none",
        status: "invalid_period",
        error: "period must be one of 3m, 6m, 1y, 3y"
      }
    };
  }

  const configured = await readConfiguredIndices();
  const config = configured.find((item) => item.id === indexId);
  if (!config) {
    return {
      statusCode: 404,
      data: {
        indexId,
        period: normalizedPeriod,
        records: [],
        source: "none",
        status: "not_found",
        error: `Unknown market index: ${indexId}`
      }
    };
  }

  const cached = await readKlineCache(indexId, normalizedPeriod);
  if (cached && !cached.stale) {
    return {
      statusCode: 200,
      data: {
        ...cached.payload,
        cacheStatus: "fresh",
        servedAt: new Date().toISOString()
      }
    };
  }

  const fetchedAt = new Date().toISOString();
  try {
    const result = await fetchKline(config, normalizedPeriod);
    const cacheUpdatedAt = new Date().toISOString();
    const payload = {
      indexId: config.id,
      name: config.name,
      symbol: config.symbol,
      category: config.category,
      period: normalizedPeriod,
      records: result.records,
      source: result.source,
      fetchedAt,
      cacheUpdatedAt,
      cacheStatus: "fresh",
      status: result.status,
      error: result.error,
      errors: result.error ? [{ id: config.id, source: result.source, message: result.error }] : []
    };

    await writeKlineCache(indexId, normalizedPeriod, payload);
    return {
      statusCode: 200,
      data: {
        ...payload,
        servedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    if (cached) {
      return {
        statusCode: 200,
        data: {
          ...cached.payload,
          cacheStatus: "stale",
          status: "stale",
          error: error.message,
          errors: [{ id: config.id, source: sourceType(config.klineSource), message: error.message }],
          servedAt: new Date().toISOString()
        }
      };
    }

    const payload = {
      indexId: config.id,
      name: config.name,
      symbol: config.symbol,
      category: config.category,
      period: normalizedPeriod,
      records: [],
      source: sourceType(config.klineSource),
      fetchedAt,
      cacheUpdatedAt: null,
      cacheStatus: "miss",
      status: isNeoDataUnavailable(error) ? "unavailable" : "error",
      error: error.message,
      errors: [{ id: config.id, source: sourceType(config.klineSource), message: error.message }],
      servedAt: new Date().toISOString()
    };
    return { statusCode: 200, data: payload };
  }
}

async function fetchIndexQuote(config) {
  const source = config.quoteSource || config.klineSource;
  if (!source) {
    throw new Error("No quote source configured");
  }

  if (source.type === "yahoo") {
    const records = await fetchYahooRecords(source.symbol, "1y");
    return quoteFromRecords(records, "yahoo");
  }

  if (source.type === "tencent") {
    const records = await fetchTencentRecords(source.code, "1y");
    return quoteFromRecords(records, "tencent");
  }

  if (source.type === "neodata") {
    return fetchNeoDataQuote(source.query);
  }

  throw new Error(`Unknown quote source: ${source.type}`);
}

async function fetchKline(config, period) {
  const source = config.klineSource;
  if (!source) {
    throw new Error("No K-line source configured");
  }

  if (source.type === "yahoo") {
    const records = await fetchYahooRecords(source.symbol, period);
    return withRecords(records, "yahoo");
  }

  if (source.type === "tencent") {
    const records = await fetchTencentRecords(source.code, period);
    return withRecords(records, "tencent");
  }

  if (source.type === "neodata") {
    const records = await fetchNeoDataHistory(source.query);
    return withRecords(records, "neodata");
  }

  throw new Error(`Unknown K-line source: ${source.type}`);
}

async function fetchYahooRecords(symbol, period) {
  const range = YAHOO_RANGES[period] || "1y";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${range}&interval=1d`;
  const data = await fetchJson(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 FinancialDashboard/0.1"
    }
  });
  const chart = data.chart || {};
  if (chart.error) {
    throw new Error(`Yahoo Finance error: ${JSON.stringify(chart.error)}`);
  }

  const result = chart.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const records = timestamps
    .map((timestamp, index) =>
      normalizeRecord({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        open: quote.open?.[index],
        close: quote.close?.[index],
        high: quote.high?.[index],
        low: quote.low?.[index],
        volume: quote.volume?.[index]
      })
    )
    .filter((record) => record.close !== null);

  if (!records.length) {
    throw new Error("Yahoo Finance returned no daily records");
  }

  return records;
}

async function fetchTencentRecords(code, period) {
  const days = TENCENT_DAYS[period] || TENCENT_DAYS["1y"];
  const endDate = formatDate(new Date());
  const startDate = formatDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(
    `${code},day,${startDate},${endDate},${days},qfq`
  )}`;
  const data = await fetchJson(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 FinancialDashboard/0.1",
      referer: "https://gu.qq.com/"
    }
  });
  const apiData = data.data || {};
  const stockData = Object.values(apiData).find((item) => item && Array.isArray(item.day));
  const rows = stockData?.day || [];
  const records = rows
    .map((row) =>
      normalizeRecord({
        date: row[0],
        open: row[1],
        close: row[2],
        high: row[3],
        low: row[4],
        volume: row[5]
      })
    )
    .filter((record) => record.close !== null);

  if (!records.length) {
    throw new Error("Tencent ifzq returned no daily records");
  }

  return records;
}

async function fetchNeoDataQuote(query) {
  const data = await queryNeoData(query);
  const recalls = data.data?.apiData?.apiRecall || [];
  const recall = recalls.find(
    (item) =>
      String(item.type || "").includes("行情") ||
      String(item.desc || "").includes("行情") ||
      String(item.content || "").includes("最新价格")
  );
  if (!recall?.content) {
    throw new Error("NeoData returned no quote content");
  }

  const parsed = parseNeoDataQuote(recall.content);
  return {
    source: "neodata",
    status: "ok",
    price: parsed.price,
    changePct: parsed.changePct,
    change20d: parsed.change20d,
    ytd: parsed.ytd,
    updateTime: parsed.updateTime,
    error: null
  };
}

async function fetchNeoDataHistory(query) {
  const data = await queryNeoData(query);
  const recalls = data.data?.apiData?.apiRecall || [];
  const recall = recalls.find(
    (item) =>
      String(item.type || "").includes("历史") ||
      String(item.type || "").includes("走势") ||
      String(item.desc || "").includes("历史") ||
      String(item.desc || "").includes("走势")
  );
  if (!recall?.content) {
    throw new Error("NeoData returned no historical content");
  }

  const records = parseNeoDataHistory(recall.content);
  if (!records.length) {
    throw new Error("NeoData historical content did not contain daily records");
  }
  return records;
}

async function queryNeoData(query) {
  const script = process.env.NEODATA_QUERY_SCRIPT || DEFAULT_NEODATA_SCRIPT;
  const cwd = process.env.NEODATA_DIR || DEFAULT_NEODATA_DIR;
  if (!fsSync.existsSync(script)) {
    throw new Error("NeoData unavailable: query script is not installed");
  }

  const args = [script, "--query", query, "--data-type", "api"];
  const token = await getNeoDataToken(cwd);
  if (token) {
    args.push("--token", token);
  }

  const { stdout, stderr } = await execFileAsync(process.env.PYTHON || "python3", args, {
    cwd,
    timeout: 30_000,
    env: withoutProxyEnv(process.env),
    maxBuffer: 2 * 1024 * 1024
  });

  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) {
    throw new Error(`NeoData returned no JSON${stderr ? `: ${cleanNeoDataStderr(stderr)}` : ""}`);
  }

  const data = JSON.parse(stdout.slice(jsonStart));
  if (data.error) {
    throw new Error(`NeoData error: ${data.error}`);
  }
  if (data.code && data.code !== "200") {
    throw new Error(`NeoData API code ${data.code}`);
  }
  return data;
}

async function getNeoDataToken(cwd) {
  if (process.env.NEODATA_TOKEN) {
    return process.env.NEODATA_TOKEN;
  }

  const tokenFile = path.join(DATA_DIR, "token.json");
  const skillTokenFile = path.join(cwd, "skills", ".neodata_token");
  for (const file of [tokenFile, skillTokenFile]) {
    try {
      const payload = JSON.parse(await fs.readFile(file, "utf8"));
      if (payload.token) {
        return payload.token;
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        continue;
      }
    }
  }

  return "";
}

function quoteFromRecords(records, source) {
  const last = records.at(-1);
  const previous = records.at(-2);
  const first20d = records.length > 20 ? records.at(-21) : null;
  const ytdBase = records.find((record) => record.date >= `${new Date().getFullYear()}-01-01`) || records[0];

  return {
    source,
    status: "ok",
    price: last.close,
    changePct: percentChange(last.close, previous?.close),
    change20d: percentChange(last.close, first20d?.close),
    ytd: percentChange(last.close, ytdBase?.close),
    updateTime: last.date,
    error: null
  };
}

function withRecords(records, source) {
  return {
    records,
    source,
    status: records.length ? "ok" : "no_data",
    error: records.length ? null : `${SOURCE_LABELS[source] || source} returned no daily records`
  };
}

function toClientIndex(config, result, fetchedAt) {
  return {
    id: config.id,
    name: config.name,
    symbol: config.symbol,
    category: config.category,
    price: result.price ?? null,
    changePct: result.changePct ?? null,
    change20d: result.change20d ?? null,
    ytd: result.ytd ?? null,
    updateTime: result.updateTime || fetchedAt,
    status: result.status || "ok",
    source: result.source || sourceType(config.quoteSource),
    error: result.error || null
  };
}

function toUnavailableIndex(config, message) {
  return {
    id: config.id,
    name: config.name,
    symbol: config.symbol,
    category: config.category,
    price: null,
    changePct: null,
    change20d: null,
    ytd: null,
    updateTime: null,
    status: isNeoDataUnavailable({ message }) ? "unavailable" : "error",
    source: sourceType(config.quoteSource),
    error: message
  };
}

function parseNeoDataQuote(content) {
  return {
    price: parseLooseNumber(extract(content, /最新价格:([^;]+)/)),
    changePct: parseLooseNumber(extract(content, /当日涨跌幅:([^;]+)/)),
    change20d: parseLooseNumber(extract(content, /20日涨跌幅:([^;]+)/)),
    ytd: parseLooseNumber(extract(content, /年初至今涨跌幅:\s*([^;]+)/)),
    updateTime: extract(content, /数据更新时间:([^;]+)/)
  };
}

function parseNeoDataHistory(content) {
  const records = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.includes("日期") && !line.includes("---"))
    .map((line) => line.split("|").map((part) => part.trim()).filter(Boolean))
    .filter((parts) => parts.length >= 3 && /^\d{4}-\d{2}-\d{2}/.test(parts[0]))
    .filter((parts) => !parts.some((part) => part.includes("省略") || part.includes("未开盘")))
    .map((parts) =>
      normalizeRecord({
        date: parts[0],
        open: parts[1],
        close: parts[2],
        volume: parts[4],
        high: parts[6],
        low: parts[7]
      })
    )
    .filter((record) => record.close !== null);

  return [...records].reverse();
}

function normalizeRecord(record) {
  return {
    date: String(record.date || "").slice(0, 10),
    open: parseLooseNumber(record.open),
    close: parseLooseNumber(record.close),
    high: parseLooseNumber(record.high),
    low: parseLooseNumber(record.low),
    volume: parseLooseNumber(record.volume)
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function readConfiguredIndices() {
  const payload = JSON.parse(await fs.readFile(INDICES_FILE, "utf8"));
  if (!Array.isArray(payload)) {
    throw new Error("data/indices.json must contain an array");
  }
  return payload;
}

async function readCache(file, ttlMs) {
  try {
    const stat = await fs.stat(file);
    const payload = JSON.parse(await fs.readFile(file, "utf8"));
    return {
      payload: {
        ...payload,
        cacheUpdatedAt: payload.cacheUpdatedAt || stat.mtime.toISOString()
      },
      stale: Date.now() - stat.mtimeMs > ttlMs
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readKlineCache(indexId, period) {
  const cache = await readCache(KLINE_CACHE_FILE, Number.POSITIVE_INFINITY);
  const payload = cache?.payload?.data?.[indexId]?.[period];
  if (!payload) {
    return null;
  }

  const updatedAt = Date.parse(payload.cacheUpdatedAt || cache.payload.cacheUpdatedAt || 0);
  return {
    payload,
    stale: Number.isFinite(updatedAt) ? Date.now() - updatedAt > KLINE_CACHE_TTL_MS : true
  };
}

async function writeKlineCache(indexId, period, payload) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const current = (await readCache(KLINE_CACHE_FILE, Number.POSITIVE_INFINITY))?.payload || {};
  const next = {
    source: "per-record",
    fetchedAt: payload.fetchedAt,
    cacheUpdatedAt: payload.cacheUpdatedAt,
    errors: payload.errors || [],
    data: current.data || {}
  };
  next.data[indexId] = {
    ...(next.data[indexId] || {}),
    [period]: payload
  };
  await writeJson(KLINE_CACHE_FILE, next);
}

async function writeJson(file, payload) {
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function summarizeSources(sources) {
  return [...new Set(sources.map(sourceType).filter(Boolean))].map((type) => ({
    type,
    label: SOURCE_LABELS[type] || type
  }));
}

function sourceType(source) {
  return source?.type || "unknown";
}

function extract(content, pattern) {
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function parseLooseNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const normalized = String(value)
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/点/g, "")
    .replace(/股/g, "")
    .replace(/手/g, "")
    .trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? round(number, 4) : null;
}

function percentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return round(((current - previous) / previous) * 100, 4);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function withoutProxyEnv(env) {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => !["http_proxy", "https_proxy", "all_proxy", "no_proxy"].includes(key.toLowerCase()))
      .concat([["PYTHONWARNINGS", "ignore"]])
  );
}

function cleanNeoDataStderr(stderr) {
  return stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/warning|warns|chardet|charset_normalizer/i.test(line))
    .join("\n");
}

function isNeoDataUnavailable(error) {
  return String(error?.message || error).includes("NeoData unavailable");
}
