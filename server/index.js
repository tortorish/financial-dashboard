import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  getFundByCode,
  getFundIntraday,
  getFunds,
  refreshFundIntraday,
  refreshFunds
} from "./services/fundData.js";
import { getMarketIndices, getMarketKline, refreshMarketIndices } from "./services/marketData.js";
import { runChat } from "./services/chat.js";
import { buildMeta } from "./services/metadata.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");
const DIST_INDEX = path.join(DIST_DIR, "index.html");
const app = express();
const port = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "1mb" }));

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

app.get(
  "/api/funds",
  asyncHandler(async (_req, res) => {
    res.json(toClientPayload(await getFunds()));
  })
);

app.post(
  "/api/refresh",
  asyncHandler(async (_req, res) => {
    res.json(toClientPayload(await refreshFunds()));
  })
);

app.get(
  "/api/funds/intraday",
  asyncHandler(async (_req, res) => {
    res.json(toClientIntraday(await getFundIntraday()));
  })
);

app.post(
  "/api/funds/intraday/refresh",
  asyncHandler(async (_req, res) => {
    res.json(toClientIntraday(await refreshFundIntraday()));
  })
);

app.get(
  "/api/markets/indices",
  asyncHandler(async (_req, res) => {
    res.json(toClientMarkets(await getMarketIndices()));
  })
);

app.post(
  "/api/markets/refresh",
  asyncHandler(async (_req, res) => {
    res.json(toClientMarkets(await refreshMarketIndices()));
  })
);

app.get(
  "/api/markets/kline/:indexId",
  asyncHandler(async (req, res) => {
    const result = await getMarketKline(req.params.indexId, req.query.period);
    res.status(result.statusCode).json(result.data);
  })
);

app.get(
  "/api/funds/:code",
  asyncHandler(async (req, res) => {
    const result = await getFundByCode(req.params.code, { refresh: req.query.refresh === "1" });
    const payload = result.data
      ? {
          fund: toClientFund(result.data),
          meta: toClientMeta(result.meta, [])
        }
      : toClientPayload(result);
    res.status(result.data ? 200 : 404).json(payload);
  })
);

app.post(
  "/api/funds/:code/refresh",
  asyncHandler(async (req, res) => {
    const result = await getFundByCode(req.params.code, { refresh: true });
    const payload = result.data
      ? {
          fund: toClientFund(result.data),
          meta: toClientMeta(result.meta, [])
        }
      : toClientPayload(result);
    res.status(result.data ? 200 : 404).json(payload);
  })
);

app.post(
  "/api/chat",
  asyncHandler(async (req, res) => {
    const fundResult = await getFunds();
    const result = await runChat({
      message: req.body?.question || req.body?.message,
      history: req.body?.history,
      funds: fundResult.data?.funds || [],
      dashboardContext: req.body?.context
    });
    const statusCode = statusCodeFor(result.meta.status);
    const message = result.data?.message || "聊天接口没有返回内容。";

    res.status(statusCode).json({
      answer: message,
      message,
      data: result.data,
      meta: {
        ...result.meta,
        freshness: {
          ...result.meta.freshness,
          fundCacheUpdatedAt: fundResult.meta.freshness.cacheUpdatedAt,
          fundFetchedAt: fundResult.meta.freshness.fetchedAt
        }
      }
    });
  })
);

if (fs.existsSync(DIST_INDEX)) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(DIST_INDEX);
  });
}

app.use((_req, res) => {
  res.status(404).json({
    data: null,
    meta: buildMeta({
      status: "not_found",
      caveats: ["No matching API route was found."]
    })
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    data: null,
    meta: buildMeta({
      status: "error",
      caveats: [error.message || "Unexpected server error."]
    })
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`AI fund backend listening on http://127.0.0.1:${port}`);
});

function statusCodeFor(status) {
  if (status === "configuration_required") {
    return 503;
  }
  if (status === "invalid_request") {
    return 400;
  }
  if (status === "upstream_error") {
    return 502;
  }
  return 200;
}

function toClientPayload(result) {
  const rawFunds = result.data?.funds || [];
  return {
    funds: rawFunds.map(toClientFund),
    groups: result.data?.groups || {},
    meta: toClientMeta(result.meta, result.data?.errors || [])
  };
}

function toClientMarkets(result) {
  const diagnostics = (result.errors || []).map((item) => `${item.id || "market"}: ${item.message}`);
  const warnings = diagnostics.filter(isOptionalMarketWarning);
  const errors = diagnostics.filter((item) => !isOptionalMarketWarning(item));

  return {
    indices: result.indices || [],
    meta: {
      cacheStatus:
        result.cacheStatus === "fresh"
          ? "fresh"
          : result.cacheStatus === "partial"
            ? "partial"
            : result.cacheStatus === "stale"
              ? "stale"
              : "empty",
      refreshedAt: result.cacheUpdatedAt || result.fetchedAt || null,
      sourceLabel: Array.isArray(result.source)
        ? result.source.map((item) => item.label || item.type).join(" / ")
        : "Yahoo Finance / Tencent ifzq / optional NeoData",
      caveat:
        "市场指数来自 Yahoo Finance、腾讯自选股及可选 NeoData；不同市场交易时区不同，行情与K线可能存在延迟。",
      errors,
      warnings
    }
  };
}

function toClientIntraday(result) {
  const errors = result.data?.errors || [];
  return {
    items: (result.data?.items || []).map((item) => ({
      code: item.code,
      name: item.name,
      ownership: item.ownership,
      estimateNav: item.estimateNav ?? null,
      estimateChangePct: item.estimateChangePct ?? null,
      estimateTime: item.estimateTime ?? null,
      lastNav: item.lastNav ?? null,
      lastNavDate: item.lastNavDate ?? null,
      status: item.status || "no_data",
      source: item.source || "fundgz.1234567.com.cn",
      sourceUrl: item.sourceUrl || "",
      refreshedAt: item.refreshedAt || null,
      error: item.error || null,
      refreshError: item.refreshError || null
    })),
    meta: {
      cacheStatus:
        result.meta?.status === "ok"
          ? "fresh"
          : result.meta?.status === "partial"
            ? "partial"
            : result.meta?.status === "stale"
              ? "stale"
              : "empty",
      refreshedAt: result.meta?.freshness?.cacheUpdatedAt || result.meta?.freshness?.fetchedAt || null,
      sourceLabel: "Tiantian Fund intraday estimated NAV",
      caveat:
        "盘中数据来自天天基金净值估算，不是最终日净值，也不是可直接成交的实时价格；最终以基金公司收盘后披露净值为准。",
      errors: errors.map((item) => `${item.code}: ${item.message}`)
    }
  };
}

function toClientMeta(meta, errors) {
  const status = meta?.status || "ok";
  return {
    cacheStatus: status === "ok" ? "fresh" : status === "partial" ? "partial" : "stale",
    refreshedAt: meta?.freshness?.cacheUpdatedAt || meta?.freshness?.fetchedAt || null,
    sourceLabel: meta?.source?.provider || "Eastmoney / Tiantian Fund public endpoints",
    caveat:
      "公开基金数据来自东方财富/天天基金；净值和阶段涨幅较新，前十大持仓为定期披露口径，不代表实时仓位。",
    errors: (errors || []).map((item) => `${item.code}: ${item.message}`)
  };
}

function toClientFund(fund) {
  const ownership = fund.category === "watchlist" ? "watch" : "owned";
  const category = mapChainCategory(fund);
  const topHoldings = fund.topHoldings?.items || [];

  return {
    code: fund.code,
    name: fund.name,
    ownership,
    category,
    categoryNote: buildCategoryNote(category, fund),
    type: fund.fundType,
    tags: fund.tags || [],
    nav: fund.nav?.value ?? null,
    navDate: fund.nav?.date ?? null,
    returns: {
      oneMonth: fund.returns?.oneMonth ?? null,
      threeMonths: fund.returns?.threeMonths ?? null,
      sixMonths: fund.returns?.sixMonths ?? null,
      oneYear: fund.returns?.oneYear ?? null,
      twoYears: fund.returns?.twoYears ?? null,
      sinceAvailable: fund.returns?.sinceAvailable ?? null
    },
    returnSource: fund.returnSource || {},
    allocation: {
      stock: fund.assetAllocation?.stock ?? null,
      cash: fund.assetAllocation?.cash ?? null,
      asOf: fund.assetAllocation?.reportDate ?? fund.source?.allocationReportDate ?? null
    },
    manager: {
      name: fund.manager?.name ?? null,
      workTime: fund.manager?.workTime ?? null
    },
    topHoldings: topHoldings.map((holding) => ({
      rank: holding.rank,
      stockCode: holding.stockCode,
      stockName: holding.stockName,
      weight: holding.percentOfNav,
      valueWan: holding.marketValueTenThousand
        ? String(holding.marketValueTenThousand)
        : undefined
    })),
    top10Weight: fund.topHoldings?.concentration ?? null,
    source: {
      baseUrl: fund.source?.urls?.profile || "",
      holdingsUrl: fund.source?.urls?.holdings || "",
      refreshedAt: fund.source?.fetchedAt || null,
      holdingsAsOf: fund.source?.holdingsReportDate || null
    },
    dataStatus: fund.dataStatus || "fresh",
    refreshError: fund.refreshError || null,
    caveats: [
      "持仓数据来自基金定期披露，通常滞后于真实仓位。",
      fund.dataStatus === "stale" ? `本基金本次刷新失败，暂用旧缓存：${fund.refreshError || "原因未知"}` : "",
      ownership === "watch" ? "这是观察池基金，不是当前已买基金。" : "这是用户当前配置的已买基金。"
    ].filter(Boolean)
  };
}

function mapChainCategory(fund) {
  const byCode = {
    "006503": "CPO/光通信/PCB/AI服务器链",
    "018815": "存储芯片",
    "025209": "存储芯片",
    "005844": "半导体设备/半导体链",
    "021511": "半导体设备/半导体链",
    "016665": "全球AI硬件",
    "016237": "数字经济/分散科技",
    "020722": "CPO/光通信/PCB/AI服务器链",
    "159039": "机器人/具身硬件",
    "516520": "智能驾驶/智能车",
    "159720": "智能驾驶/智能车",
    "002168": "智能驾驶/智能车",
    "001790": "智能驾驶/智能车",
    "005729": "AI算力/人工智能",
    "005962": "AI算力/人工智能",
    "000793": "高端制造/Physical AI观察",
    "002345": "高端制造/Physical AI观察"
  };

  return byCode[fund.code] || fund.theme || "未分类";
}

function buildCategoryNote(category, fund) {
  const topNames = (fund.topHoldings?.items || [])
    .slice(0, 3)
    .map((item) => item.stockName)
    .filter(Boolean)
    .join("、");
  const suffix = topNames ? `代表重仓：${topNames}。` : "";
  return `${category}。分类基于基金标签和前十大持仓，不只看基金名称。${suffix}`;
}

function isOptionalMarketWarning(message) {
  return String(message).includes("NeoData unavailable");
}
