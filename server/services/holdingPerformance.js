import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFunds } from "./fundData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");
const CACHE_DIR = path.join(ROOT_DIR, "data", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "holdings-performance.json");
const CACHE_TTL_MS = 5 * 60 * 1000;

const PERIODS = {
  oneDay: 1,
  oneMonth: 30,
  twoMonths: 61,
  threeMonths: 91,
  sixMonths: 182,
  oneYear: 365
};

export async function getHoldingPerformance({ refresh = false } = {}) {
  if (!refresh) {
    const cached = await readCache();
    if (cached && !cached.stale) {
      return {
        ...cached.payload,
        servedFromCache: true,
        servedAt: new Date().toISOString()
      };
    }
  }

  return refreshHoldingPerformance();
}

export async function refreshHoldingPerformance() {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const fundResult = await getFunds();
  const funds = fundResult.data?.funds || [];
  const ownedFunds = funds.filter((fund) => fund.category === "owned");
  const exposures = extractExposures(ownedFunds);
  const uniqueStocks = aggregateStocks(exposures);
  const fetchedAt = new Date().toISOString();

  const stockRows = await mapLimit(uniqueStocks, 8, async (stock) => {
    try {
      const source = resolveQuoteSource(stock.stockCode);
      if (!source) {
        return unavailableStock(stock, fetchedAt, "unsupported_code");
      }
        const records = await fetchDailyRecords(source);
        const returns = calculateReturns(records);
        const latest = records[records.length - 1];
        return {
          ...stock,
          market: source.market,
          quoteSymbol: source.symbol,
          chainCategory: classifyHolding(stock),
          latestPrice: latest?.close ?? null,
          latestDate: latest?.date ?? null,
          returns,
          dataStatus: records.length ? "ok" : "no_data",
          source: records.source || source.source,
          error: null,
          fetchedAt
        };
    } catch (error) {
      return {
        ...unavailableStock(stock, fetchedAt, "fetch_failed"),
        error: error.message
      };
    }
  });

  const sourceBreakdown = summarizeSources(stockRows);
  const payload = {
    stocks: stockRows.sort((left, right) => (right.totalWeight ?? 0) - (left.totalWeight ?? 0)),
    groups: summarizeGroups(stockRows),
    meta: {
      fetchedAt,
      cacheUpdatedAt: new Date().toISOString(),
      sourceLabel: buildSourceLabel(sourceBreakdown),
      caveat:
        "股票涨跌幅基于公开日K线计算；A股/港股优先使用东方财富前复权日K线，失败时降级到腾讯前复权日K线，美股优先使用Yahoo Finance调整收盘价。基金持仓来自定期披露，通常滞后于真实仓位。",
      sourceBreakdown,
      coverage: {
        total: stockRows.length,
        ok: stockRows.filter((item) => item.dataStatus === "ok").length,
        missing: stockRows.filter((item) => item.dataStatus !== "ok").length
      }
    }
  };

  await writeJson(CACHE_FILE, payload);
  return {
    ...payload,
    servedFromCache: false,
    servedAt: new Date().toISOString()
  };
}

function extractExposures(funds) {
  return funds.flatMap((fund) =>
    (fund.topHoldings?.items || []).map((holding) => ({
      fundCode: fund.code,
      fundName: fund.name,
      fundCategory: fund.theme,
      stockCode: normalizeStockCode(holding.stockCode),
      stockName: holding.stockName,
      weight: holding.percentOfNav ?? null,
      holdingsAsOf: fund.topHoldings?.reportDate ?? fund.source?.holdingsReportDate ?? null
    }))
  );
}

function aggregateStocks(exposures) {
  const byKey = new Map();
  for (const exposure of exposures) {
    const key = `${exposure.stockCode}:${exposure.stockName}`;
    const existing = byKey.get(key) || {
      stockCode: exposure.stockCode,
      stockName: exposure.stockName,
      totalWeight: 0,
      fundCount: 0,
      funds: [],
      holdingsAsOf: exposure.holdingsAsOf
    };
    existing.totalWeight += exposure.weight || 0;
    existing.fundCount += 1;
    existing.funds.push({
      code: exposure.fundCode,
      name: exposure.fundName,
      weight: exposure.weight,
      holdingsAsOf: exposure.holdingsAsOf
    });
    existing.holdingsAsOf = latestTextDate(existing.holdingsAsOf, exposure.holdingsAsOf);
    byKey.set(key, existing);
  }

  return [...byKey.values()].map((item) => ({
    ...item,
    totalWeight: round(item.totalWeight, 2),
    funds: item.funds.sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
  }));
}

function resolveQuoteSource(code) {
  if (/^\d{6}$/.test(code)) {
    const market = code.startsWith("6") ? 1 : 0;
    return {
      source: "Eastmoney A-share daily K-line",
      market: market === 1 ? "A股-上海" : "A股-深圳",
      symbol: `${market}.${code}`,
      url: eastmoneyKlineUrl(`${market}.${code}`),
      fallbacks: [
        {
          source: "Tencent A-share qfq daily K-line",
          url: tencentKlineUrl(`${market === 1 ? "sh" : "sz"}${code}`, "cn")
        }
      ]
    };
  }

  if (/^\d{5}$/.test(code)) {
    return {
      source: "Eastmoney HK daily K-line",
      market: "港股",
      symbol: `116.${code}`,
      url: eastmoneyKlineUrl(`116.${code}`),
      fallbacks: [
        {
          source: "Tencent HK qfq daily K-line",
          url: tencentKlineUrl(`hk${code}`, "hk")
        }
      ]
    };
  }

  if (/^[A-Z][A-Z.-]{0,8}$/.test(code)) {
    return {
      source: "Yahoo Finance daily chart",
      market: "美股",
      symbol: code,
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}?range=2y&interval=1d`
    };
  }

  return null;
}

async function fetchDailyRecords(source) {
  const candidates = [{ source: source.source, url: source.url }, ...(source.fallbacks || [])];
  const errors = [];
  for (const candidate of candidates) {
    try {
      const records = candidate.source.startsWith("Eastmoney")
        ? await fetchEastmoneyRecords(candidate.url)
        : candidate.source.startsWith("Tencent")
          ? await fetchTencentRecords(candidate.url)
          : await fetchYahooRecords(candidate.url);
      records.source = candidate.source;
      return records;
    } catch (error) {
      errors.push(`${candidate.source}: ${error.message}`);
    }
  }
  throw new Error(errors.join("；"));
}

async function fetchEastmoneyRecords(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 FundDashboard/0.1",
      referer: "https://quote.eastmoney.com/"
    }
  });
  if (!response.ok) {
    throw new Error(`Eastmoney K-line HTTP ${response.status}`);
  }
  const payload = await response.json();
  const klines = payload.data?.klines || [];
  const records = klines
    .map((row) => {
      const parts = String(row).split(",");
      return {
        date: parts[0],
        open: toNumber(parts[1]),
        close: toNumber(parts[2]),
        high: toNumber(parts[3]),
        low: toNumber(parts[4]),
        volume: toNumber(parts[5])
      };
    })
    .filter((item) => item.close !== null);
  if (!records.length) {
    throw new Error("Eastmoney returned no daily records");
  }
  return records;
}

async function fetchYahooRecords(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 FundDashboard/0.1"
    }
  });
  if (!response.ok) {
    throw new Error(`Yahoo Finance HTTP ${response.status}`);
  }
  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const adjClose = result?.indicators?.adjclose?.[0]?.adjclose || [];
  const records = timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: toNumber(quote.open?.[index]),
      close: toNumber(adjClose[index]) ?? toNumber(quote.close?.[index]),
      high: toNumber(quote.high?.[index]),
      low: toNumber(quote.low?.[index]),
      volume: toNumber(quote.volume?.[index])
    }))
    .filter((item) => item.close !== null);
  if (!records.length) {
    throw new Error("Yahoo Finance returned no daily records");
  }
  return records;
}

async function fetchTencentRecords(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 FundDashboard/0.1",
      referer: "https://gu.qq.com/"
    }
  });
  if (!response.ok) {
    throw new Error(`Tencent K-line HTTP ${response.status}`);
  }
  const payload = await response.json();
  const first = Object.values(payload.data || {})[0];
  const rows = first?.qfqday || first?.day || [];
  const records = rows
    .map((row) => ({
      date: row[0],
      open: toNumber(row[1]),
      close: toNumber(row[2]),
      high: toNumber(row[3]),
      low: toNumber(row[4]),
      volume: toNumber(row[5])
    }))
    .filter((item) => item.close !== null);
  if (!records.length) {
    throw new Error("Tencent returned no daily records");
  }
  return records;
}

function calculateReturns(records) {
  const latest = records[records.length - 1];
  return Object.fromEntries(
    Object.entries(PERIODS).map(([key, days]) => [key, returnSince(records, latest, days)])
  );
}

function returnSince(records, latest, days) {
  if (!latest?.close) return null;
  const target = Date.parse(latest.date) - days * 24 * 60 * 60 * 1000;
  const start = [...records].reverse().find((item) => Date.parse(item.date) <= target);
  if (!start?.close) return null;
  return round(((latest.close - start.close) / start.close) * 100, 2);
}

function classifyHolding(stock) {
  const code = stock.stockCode;
  const name = stock.stockName || "";
  const direct = {
    "301308": "存储芯片",
    "001309": "存储芯片",
    "688525": "存储芯片",
    "603986": "存储芯片",
    "300475": "存储芯片",
    "300223": "存储芯片/控制芯片",
    "688766": "存储芯片",
    "688123": "存储芯片",
    "300042": "存储芯片",
    "688409": "半导体设备/零部件",
    "688120": "半导体设备/零部件",
    "688012": "半导体设备/零部件",
    "002371": "半导体设备/零部件",
    "688072": "半导体设备/零部件",
    "688361": "半导体设备/检测",
    "688037": "半导体设备/零部件",
    "300567": "半导体设备/检测",
    "688652": "半导体设备/零部件",
    "688082": "半导体设备/零部件",
    "300666": "半导体材料",
    "688019": "半导体材料",
    "688041": "AI芯片/算力芯片",
    "688256": "AI芯片/算力芯片",
    "688008": "AI芯片/存储接口",
    "688521": "芯片设计/IP",
    "688099": "芯片设计/SoC",
    "688981": "晶圆制造/代工",
    TSM: "晶圆制造/代工",
    TSEM: "晶圆制造/代工",
    NVDA: "全球AI算力芯片",
    AVGO: "全球AI芯片/网络",
    LITE: "光通信/激光器",
    COHR: "光通信/材料器件",
    "300308": "CPO/光通信",
    "300502": "CPO/光通信",
    "688498": "CPO/光通信",
    "688195": "光学/光通信",
    "600522": "光通信/线缆",
    "600498": "光通信/设备",
    "600345": "光通信/设备",
    "06869": "光通信/线缆",
    "600487": "光通信/线缆",
    "301200": "PCB/服务器链",
    "301377": "PCB/服务器链",
    "688183": "PCB/服务器链",
    "002463": "PCB/服务器链",
    "300476": "PCB/服务器链",
    "603296": "AI终端/电子制造",
    "002475": "AI终端/电子制造",
    "002600": "AI终端/电子制造",
    "09988": "平台/互联网",
    "00700": "平台/互联网",
    "01860": "平台/广告技术",
    "601208": "材料/高端制造",
    "002028": "电力设备/高端制造",
    "000070": "光通信/设备",
    JP3684400009: "玻纤/电子材料"
  };
  if (direct[code]) return direct[code];
  if (/存储|兆易|江波龙|佰维|德明利|普冉|聚辰|朗科/.test(name)) return "存储芯片";
  if (/北方华创|中微|华海清科|拓荆|精测|设备|检测|盛美/.test(name)) return "半导体设备/零部件";
  if (/中际|新易盛|光|通信|源杰|腾景/.test(name)) return "CPO/光通信";
  if (/沪电|胜宏|生益|PCB|电子/.test(name)) return "PCB/服务器链";
  if (/英伟达|博通|海光|寒武纪/.test(name)) return "AI芯片/算力芯片";
  return "其它/待分类";
}

function summarizeGroups(stocks) {
  return stocks.reduce((acc, stock) => {
    const key = stock.chainCategory || "其它/待分类";
    acc[key] = acc[key] || { count: 0, totalWeight: 0, ok: 0 };
    acc[key].count += 1;
    acc[key].totalWeight = round(acc[key].totalWeight + (stock.totalWeight || 0), 2);
    if (stock.dataStatus === "ok") acc[key].ok += 1;
    return acc;
  }, {});
}

function summarizeSources(stocks) {
  const bySource = {};
  for (const stock of stocks) {
    const key = stock.dataStatus === "ok" ? stock.source || "unknown" : stock.dataStatus;
    bySource[key] = (bySource[key] || 0) + 1;
  }
  return Object.entries(bySource)
    .map(([source, count]) => ({ source, count }))
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source));
}

function buildSourceLabel(sourceBreakdown) {
  const sourceText = sourceBreakdown
    .map((item) => `${item.source} ${item.count}只`)
    .join(" / ");
  return `${sourceText}; Eastmoney is primary for A/H, Tencent is fallback, Yahoo is used for US`;
}

function unavailableStock(stock, fetchedAt, status) {
  return {
    ...stock,
    market: "未知",
    quoteSymbol: stock.stockCode,
    chainCategory: classifyHolding(stock),
    latestPrice: null,
    latestDate: null,
    returns: {
      oneDay: null,
      oneMonth: null,
      twoMonths: null,
      threeMonths: null,
      sixMonths: null,
      oneYear: null
    },
    dataStatus: status,
    source: "none",
    error: status === "unsupported_code" ? "该证券代码暂无法映射到公开行情接口" : null,
    fetchedAt
  };
}

function eastmoneyKlineUrl(secid) {
  return `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(
    secid
  )}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=20250101&end=20500101`;
}

function tencentKlineUrl(symbol, market) {
  const endpoint = market === "hk" ? "hkfqkline" : "fqkline";
  return `https://web.ifzq.gtimg.cn/appstock/app/${endpoint}/get?param=${encodeURIComponent(
    `${symbol},day,,,520,qfq`
  )}`;
}

async function readCache() {
  try {
    const stat = await fs.stat(CACHE_FILE);
    const payload = JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
    return {
      payload,
      stale: Date.now() - stat.mtimeMs > CACHE_TTL_MS
    };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function latestTextDate(left, right) {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(right) > Date.parse(left) ? right : left;
}

function normalizeStockCode(code) {
  return String(code || "").trim().toUpperCase();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function writeJson(file, payload) {
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
