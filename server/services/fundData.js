import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMeta, SOURCE_URLS } from "./metadata.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const FUNDS_FILE = path.join(DATA_DIR, "funds.json");
const PARSED_CACHE_FILE = path.join(CACHE_DIR, "funds-parsed.json");
const RAW_CACHE_FILE = path.join(CACHE_DIR, "funds-raw.json");

const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function getFunds({ refresh = false } = {}) {
  if (!refresh) {
    const cached = await readParsedCache();
    if (cached) {
      return {
        data: cached.data,
        meta: buildMeta({
          fetchedAt: cached.fetchedAt,
          cacheUpdatedAt: cached.cacheUpdatedAt,
          status: cached.stale ? "stale" : "ok",
          caveats: cached.stale
            ? [
                "This response is served from a stale local cache because no refresh was requested."
              ]
            : []
        })
      };
    }
  }

  return refreshFunds();
}

export async function getFundByCode(code) {
  const normalized = normalizeCode(code);
  const result = await getFunds();
  const fund = result.data.funds.find((item) => item.code === normalized);

  if (!fund) {
    return {
      data: null,
      meta: buildMeta({
        ...result.meta.freshness,
        status: "not_found",
        caveats: [`Fund code ${normalized} is not configured in data/funds.json.`]
      })
    };
  }

  return {
    data: fund,
    meta: result.meta
  };
}

export async function refreshFunds() {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const configuredFunds = await readConfiguredFunds();
  const previousCache = await readParsedCache();
  const fetchedAt = new Date().toISOString();
  const rawFunds = [];
  const parsedFunds = [];
  const errors = [];

  for (const fundConfig of configuredFunds) {
    try {
      const raw = await fetchFundRaw(fundConfig.code);
      rawFunds.push({ code: fundConfig.code, ...raw });
      parsedFunds.push(parseFund(fundConfig, raw, fetchedAt));
    } catch (error) {
      errors.push({
        code: fundConfig.code,
        message: error.message
      });
      const fallback = previousCache?.data?.funds?.find((fund) => fund.code === fundConfig.code);
      if (fallback) {
        parsedFunds.push({
          ...fallback,
          dataStatus: "stale",
          refreshError: error.message
        });
      }
    }
  }

  const cacheUpdatedAt = new Date().toISOString();
  const data = {
    funds: parsedFunds,
    groups: summarizeGroups(parsedFunds),
    errors
  };

  await writeJson(RAW_CACHE_FILE, {
    fetchedAt,
    cacheUpdatedAt,
    funds: rawFunds,
    errors
  });
  await writeJson(PARSED_CACHE_FILE, {
    fetchedAt,
    cacheUpdatedAt,
    data
  });

  return {
    data,
    meta: buildMeta({
      fetchedAt,
      cacheUpdatedAt,
      status: errors.length ? "partial" : "ok",
      caveats: errors.map((item) => `${item.code}: ${item.message}`)
    })
  };
}

export async function readConfiguredFunds() {
  const payload = await fs.readFile(FUNDS_FILE, "utf8");
  const config = JSON.parse(payload);
  return [...(config.owned || []), ...(config.watchlist || [])].map((item) => ({
    ...item,
    code: normalizeCode(item.code)
  }));
}

async function fetchFundRaw(code) {
  const searchUrl = `${SOURCE_URLS.search}?m=9&key=${encodeURIComponent(code)}`;
  const profileUrl = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${formatChinaDate(new Date())}`;
  const holdingsUrl = `${SOURCE_URLS.holdings}?type=jjcc&code=${encodeURIComponent(
    code
  )}&topline=10&year=&month=`;

  const [search, profile, holdings] = await Promise.all([
    fetchText(searchUrl, "search"),
    fetchText(profileUrl, "profile"),
    fetchText(holdingsUrl, "holdings")
  ]);

  return {
    sourceUrls: {
      search: searchUrl,
      profile: profileUrl,
      holdings: holdingsUrl
    },
    search,
    profile,
    holdings
  };
}

async function fetchText(url, label) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 FundDashboard/0.1",
      referer: "https://fund.eastmoney.com/"
    }
  });

  if (!response.ok) {
    throw new Error(`${label} request failed with HTTP ${response.status}`);
  }

  return response.text();
}

function parseFund(config, raw, fetchedAt) {
  const search = parseSearch(raw.search);
  const profile = parseProfile(raw.profile);
  const holdings = parseHoldings(raw.holdings);
  const baseInfo = search?.FundBaseInfo || {};
  const latestAllocation = latestAssetAllocation(profile.assetAllocation);
  const manager = profile.currentManagers[0] || {};

  return {
    code: config.code,
    category: config.category,
    theme: config.theme,
    name: profile.name || baseInfo.SHORTNAME || search?.NAME || null,
    company: baseInfo.JJGS || null,
    fundType: baseInfo.FTYPE || null,
    manager: {
      name: manager.name || baseInfo.JJJL || null,
      workTime: manager.workTime || null,
      fundSize: manager.fundSize || null
    },
    nav: {
      value: toNumber(baseInfo.DWJZ),
      date: baseInfo.FSRQ || null
    },
    returns: {
      oneMonth: toNumber(profile.returns.syl_1y),
      threeMonths: toNumber(profile.returns.syl_3y),
      sixMonths: toNumber(profile.returns.syl_6y),
      oneYear: toNumber(profile.returns.syl_1n)
    },
    assetAllocation: {
      reportDate: latestAllocation.reportDate,
      stock: latestAllocation.stock,
      bond: latestAllocation.bond,
      cash: latestAllocation.cash,
      netAsset: latestAllocation.netAsset
    },
    tags: search?.ZTJJInfo?.map((item) => item.TTYPENAME).filter(Boolean) || [],
    topHoldings: {
      reportDate: holdings.reportDate,
      items: holdings.items,
      concentration: round(
        holdings.items.reduce((sum, item) => sum + (item.percentOfNav || 0), 0),
        2
      )
    },
    source: {
      urls: raw.sourceUrls,
      fetchedAt,
      holdingsReportDate: holdings.reportDate,
      allocationReportDate: latestAllocation.reportDate
    },
    dataStatus: "fresh",
    refreshError: null
  };
}

function parseSearch(text) {
  const normalized = stripBom(text).trim();
  const json = JSON.parse(normalized);
  return json.Datas?.[0] || null;
}

function parseProfile(text) {
  return {
    name: matchStringVar(text, "fS_name"),
    code: matchStringVar(text, "fS_code"),
    returns: {
      syl_1n: matchStringVar(text, "syl_1n"),
      syl_6y: matchStringVar(text, "syl_6y"),
      syl_3y: matchStringVar(text, "syl_3y"),
      syl_1y: matchStringVar(text, "syl_1y")
    },
    assetAllocation: matchJsonVar(text, "Data_assetAllocation") || null,
    currentManagers: matchJsonVar(text, "Data_currentFundManager") || []
  };
}

function parseHoldings(text) {
  const contentMatch = text.match(/content:"([\s\S]*?)",arryear:/);
  const html = contentMatch ? decodeJsString(contentMatch[1]) : "";
  const reportDate = html.match(/截止至：<font[^>]*>([^<]+)<\/font>/)?.[1] || null;
  const rowMatches = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];

  const items = rowMatches
    .map((row) => {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) =>
        cleanHtml(match[1])
      );
      if (cells.length < 9 || !/^\d+$/.test(cells[0])) {
        return null;
      }

      return {
        rank: toNumber(cells[0]),
        stockCode: cells[1],
        stockName: cells[2],
        percentOfNav: toNumber(cells[6]),
        sharesTenThousand: toNumber(cells[7]),
        marketValueTenThousand: toNumber(cells[8])
      };
    })
    .filter(Boolean);

  return { reportDate, items };
}

function latestAssetAllocation(assetAllocation) {
  const empty = {
    reportDate: null,
    stock: null,
    bond: null,
    cash: null,
    netAsset: null
  };

  if (!assetAllocation?.series?.length || !assetAllocation?.categories?.length) {
    return empty;
  }

  const index = assetAllocation.categories.length - 1;
  const byName = Object.fromEntries(
    assetAllocation.series.map((series) => [series.name, series.data?.[index] ?? null])
  );

  return {
    reportDate: assetAllocation.categories[index],
    stock: toNumber(byName["股票占净比"]),
    bond: toNumber(byName["债券占净比"]),
    cash: toNumber(byName["现金占净比"]),
    netAsset: toNumber(byName["净资产"])
  };
}

async function readParsedCache() {
  try {
    const stat = await fs.stat(PARSED_CACHE_FILE);
    const payload = JSON.parse(await fs.readFile(PARSED_CACHE_FILE, "utf8"));
    const ageMs = Date.now() - stat.mtimeMs;
    return {
      ...payload,
      cacheUpdatedAt: payload.cacheUpdatedAt || stat.mtime.toISOString(),
      stale: ageMs > DEFAULT_CACHE_TTL_MS
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function summarizeGroups(funds) {
  return {
    owned: funds.filter((fund) => fund.category === "owned").length,
    watchlist: funds.filter((fund) => fund.category === "watchlist").length,
    total: funds.length
  };
}

function matchStringVar(text, name) {
  const match = text.match(new RegExp(`var\\s+${name}\\s*=\\s*"([^"]*)"\\s*;`));
  return match ? decodeJsString(match[1]) : null;
}

function matchJsonVar(text, name) {
  const match = text.match(new RegExp(`var\\s+${name}\\s*=\\s*([\\s\\S]*?)\\s*;`));
  if (!match) {
    return null;
  }

  return JSON.parse(match[1]);
}

function decodeJsString(value) {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function cleanHtml(value) {
  return decodeEntities(value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeCode(code) {
  return String(code || "").trim().padStart(6, "0");
}

function stripBom(value) {
  return value.replace(/^\uFEFF/, "");
}

function formatChinaDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(date)
    .replaceAll("/", "");
}

async function writeJson(file, payload) {
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
