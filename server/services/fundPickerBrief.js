import { getHoldingPerformance, refreshHoldingPerformance } from "./holdingPerformance.js";

export async function getFundPickerBrief({ refresh = false } = {}) {
  const performance = refresh
    ? await refreshHoldingPerformance()
    : await getHoldingPerformance();
  return buildBrief(performance);
}

function buildBrief(performance) {
  const stocks = performance.stocks || [];
  const segments = buildSegments(stocks);
  const actionableSegments = segments.filter((segment) => segment.stage !== "交叉/待分类");
  const medianOneMonth = median(
    actionableSegments.map((item) => item.avg.oneMonth).filter(isNumber)
  );
  const dataCheck = buildDataCheck(performance, segments);
  const riskFlags = buildRiskFlags(dataCheck, segments);
  const decisionCards = buildDecisionCards(segments, medianOneMonth, dataCheck);
  const fundMatches = buildFundMatches(decisionCards);
  const sectorFindings = segments
    .sort((left, right) => stageRank(left.stage) - stageRank(right.stage) || (right.sampleWeightTotal ?? 0) - (left.sampleWeightTotal ?? 0))
    .map((segment) => ({
      ...segment,
      status: segmentStatus(segment, medianOneMonth, dataCheck)
    }));
  const summary = buildSummary(dataCheck, decisionCards, riskFlags);

  return {
    dataCheck,
    summary,
    decisionCards,
    sectorFindings,
    fundMatches,
    riskFlags,
    auditTrail: [
      "Data Check Agent: checked source coverage, cache time, missing quotes, and fallback source usage.",
      "Sector Scout Agent: grouped disclosed top holdings into semiconductor stages and filtered cross-category items.",
      "Fund Match Agent: mapped sector samples back to funds appearing in disclosed holdings.",
      "Risk Governor Agent: blocked direct buy signals for hot, small-sample, weak-trend, missing-data, and cross-category sectors.",
      "Briefing Agent: compressed deterministic rules into a small decision deck; no trade order or amount is generated."
    ],
    meta: {
      refreshedAt: performance.meta?.cacheUpdatedAt || performance.meta?.fetchedAt || null,
      sourceLabel: performance.meta?.sourceLabel || "",
      sourceBreakdown: performance.meta?.sourceBreakdown || [],
      caveat:
        "本页基于已披露前十大持仓和公开股票日K线生成规则摘要，不代表全市场基金筛选，也不是投资建议。"
    }
  };
}

function buildDataCheck(performance, segments) {
  const coverage = performance.meta?.coverage || { total: 0, ok: 0, missing: 0 };
  const ratio = coverage.total ? coverage.ok / coverage.total : 0;
  const status = ratio >= 0.9 ? "usable" : ratio >= 0.8 ? "degraded" : "blocked";
  const sourceBreakdown = performance.meta?.sourceBreakdown || [];
  const fallbackCount = sourceBreakdown
    .filter((item) => String(item.source).includes("Tencent"))
    .reduce((sum, item) => sum + Number(item.count || 0), 0);
  const blockedSegments = segments.filter(
    (segment) => segment.stage === "交叉/待分类" || !hasSufficientSegmentCoverage(segment)
  ).length;

  return {
    status,
    statusLabel:
      status === "usable" ? "可用" : status === "degraded" ? "降级可用" : "不建议决策",
    allowDecision: status !== "blocked",
    coverage,
    coverageRatio: round(ratio * 100, 1),
    sourceBreakdown,
    fallbackCount,
    cacheTime: performance.meta?.cacheUpdatedAt || performance.meta?.fetchedAt || null,
    blockedSegments,
    message:
      status === "usable"
        ? "数据覆盖较完整，可以生成研究线索。"
        : status === "degraded"
          ? "数据可用但有缺失或降级来源，只生成保守线索。"
          : "数据覆盖不足，不生成选基判断。"
  };
}

function buildRiskFlags(dataCheck, segments) {
  const flags = [];
  if (dataCheck.status !== "usable") {
    flags.push({
      level: dataCheck.status === "blocked" ? "high" : "medium",
      title: dataCheck.statusLabel,
      text: dataCheck.message
    });
  }
  if (dataCheck.fallbackCount) {
    flags.push({
      level: "medium",
      title: "行情源降级",
      text: `本次有 ${dataCheck.fallbackCount} 只股票使用腾讯 K 线 fallback，需要在页面显示实际来源。`
    });
  }
  const crossCount = segments.filter((segment) => segment.stage === "交叉/待分类").length;
  if (crossCount) {
    flags.push({
      level: "low",
      title: "交叉/待分类",
      text: `${crossCount} 个板块不进入选基判断，只保留为观察线索。`
    });
  }
  flags.push({
    level: "medium",
    title: "持仓披露滞后",
    text: "前十大持仓是季报口径，不代表基金实时仓位。"
  });
  return flags;
}

function buildDecisionCards(segments, medianOneMonth, dataCheck) {
  const eligible = dataCheck.allowDecision
    ? segments.filter(
        (segment) =>
          segment.stage !== "交叉/待分类" &&
          hasSufficientSegmentCoverage(segment)
      )
    : [];
  const hot = eligible
    .filter((segment) => isHot(segment))
    .sort((left, right) => (right.avg.oneMonth ?? -999) - (left.avg.oneMonth ?? -999))
    .slice(0, 3);
  const lowHeat = eligible
    .filter((segment) => isLowHeat(segment, medianOneMonth))
    .sort((left, right) => (left.avg.oneMonth ?? 999) - (right.avg.oneMonth ?? 999))
    .slice(0, 3);
  const observe = eligible
    .filter((segment) => !isHot(segment) && !isLowHeat(segment, medianOneMonth))
    .sort((left, right) => (right.sampleWeightTotal ?? 0) - (left.sampleWeightTotal ?? 0))
    .slice(0, 3);

  return [
    buildDecisionCard({
      type: "hold",
      title: "暂缓追高",
      conclusion: !dataCheck.allowDecision
        ? "Data Check 未通过，不生成本卡判断。"
        : hot.length
        ? "这些子赛道短期热度较高，先看回撤和仓位上限。"
        : "当前样本里没有新增明显追高对象。",
      segments: hot,
      emptyText: dataCheck.allowDecision ? "暂无短期极热子赛道。" : "数据不足，不生成判断。"
    }),
    buildDecisionCard({
      type: "review",
      title: "低热度待复核",
      conclusion: !dataCheck.allowDecision
        ? "Data Check 未通过，不生成本卡判断。"
        : lowHeat.length
        ? "这些子赛道相对没那么热，只能进入复核清单。"
        : "没有符合低热度且趋势未明显走坏的样本。",
      segments: lowHeat,
      emptyText: dataCheck.allowDecision ? "暂无合格待复核线索。" : "数据不足，不生成判断。"
    }),
    buildDecisionCard({
      type: "watch",
      title: "继续观察",
      conclusion: !dataCheck.allowDecision
        ? "Data Check 未通过，不生成本卡判断。"
        : observe.length
        ? "这些子赛道处于中间状态，适合做组合暴露对照。"
        : "当前没有足够中性样本。",
      segments: observe,
      emptyText: dataCheck.allowDecision ? "暂无中性观察样本。" : "数据不足，不生成判断。"
    })
  ];
}

function buildDecisionCard({ type, title, conclusion, segments, emptyText }) {
  const funds = aggregateFunds(segments);
  return {
    type,
    title,
    conclusion,
    reason: segments.length
      ? segments.map((segment) => `${segment.category} 1月 ${formatPercent(segment.avg.oneMonth)} / 3月 ${formatPercent(segment.avg.threeMonths)}`).join("；")
      : emptyText,
    sectors: segments.map((segment) => ({
      category: segment.category,
      stage: segment.stage,
      oneMonth: segment.avg.oneMonth,
      threeMonths: segment.avg.threeMonths,
      sampleCount: segment.coverage.total,
      coverageOk: segment.coverage.ok
    })),
    relatedFunds: funds.slice(0, 4),
    nextQuestion:
      type === "hold"
        ? "这些基金是否已经过热，是否应该暂停新增？"
        : type === "review"
          ? "这些低热度线索对应基金的费率、规模、经理和回撤是否合格？"
          : "这些中性板块和我现有持仓是否重复过高？",
    guardrail:
      "只生成研究线索；不生成下单金额，不连接券商，不替代个人风险预算。"
  };
}

function buildFundMatches(cards) {
  const byFund = new Map();
  for (const card of cards) {
    for (const fund of card.relatedFunds || []) {
      const existing = byFund.get(fund.code) || { ...fund, cards: [] };
      existing.cards.push(card.title);
      existing.weight = round((existing.weight || 0) + (fund.weight || 0), 2);
      byFund.set(fund.code, existing);
    }
  }
  return [...byFund.values()].sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0));
}

function buildSummary(dataCheck, cards, riskFlags) {
  if (!dataCheck.allowDecision) {
    return "数据不足，今天不生成选基判断；先刷新行情或等待公开接口恢复。";
  }
  const review = cards.find((card) => card.type === "review");
  const hold = cards.find((card) => card.type === "hold");
  const reviewText = review?.sectors?.length ? `可复核 ${review.sectors.length} 个低热度线索` : "暂无低热度线索";
  const holdText = hold?.sectors?.length ? `${hold.sectors.length} 个子赛道暂缓追高` : "暂无明显追高对象";
  return `${dataCheck.statusLabel}：${holdText}，${reviewText}。所有结论仅为研究线索，需再看基金规模、费率、经理、回撤和个人仓位。`;
}

function buildSegments(stocks) {
  const grouped = stocks.reduce((acc, stock) => {
    const key = stock.chainCategory || "其它/待分类";
    acc[key] = [...(acc[key] || []), stock];
    return acc;
  }, {});

  return Object.entries(grouped).map(([category, items]) => {
    const stage = stageForCategory(category);
    const coverage = {
      total: items.length,
      ok: items.filter((item) => item.dataStatus === "ok").length
    };
    return {
      category,
      stage,
      description: categoryDescription(category),
      avg: {
        oneMonth: averageReturn(items, "oneMonth"),
        threeMonths: averageReturn(items, "threeMonths"),
        oneYear: averageReturn(items, "oneYear")
      },
      coverage,
      sampleWeightTotal: round(items.reduce((sum, stock) => sum + (stock.totalWeight || 0), 0), 2),
      relatedFunds: aggregateFunds([{ stocks: items }]),
      sampleStocks: items
        .filter((stock) => stock.dataStatus === "ok")
        .sort((left, right) => (right.totalWeight ?? 0) - (left.totalWeight ?? 0))
        .slice(0, 5)
        .map((stock) => ({
          code: stock.stockCode,
          name: stock.stockName,
          market: stock.market,
          source: stock.source,
          oneMonth: stock.returns.oneMonth,
          threeMonths: stock.returns.threeMonths,
          totalWeight: stock.totalWeight
        }))
    };
  });
}

function aggregateFunds(segments) {
  const byFund = new Map();
  for (const segment of segments) {
    for (const fund of segment.relatedFunds || []) {
      const existing = byFund.get(fund.code) || { code: fund.code, name: fund.name, weight: 0 };
      existing.weight = round((existing.weight || 0) + (fund.weight || 0), 2);
      byFund.set(fund.code, existing);
    }
    for (const stock of segment.stocks || []) {
      for (const fund of stock.funds || []) {
        const existing = byFund.get(fund.code) || { code: fund.code, name: fund.name, weight: 0 };
        existing.weight = round((existing.weight || 0) + (fund.weight || 0), 2);
        byFund.set(fund.code, existing);
      }
    }
  }
  return [...byFund.values()].sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0));
}

function segmentStatus(segment, medianOneMonth, dataCheck) {
  if (!dataCheck.allowDecision) return "blocked";
  if (segment.stage === "交叉/待分类") return "excluded";
  if (segment.coverage.total < 2) return "small_sample";
  if (!hasSufficientSegmentCoverage(segment)) return "data_insufficient";
  if (isHot(segment)) return "hot";
  if (isLowHeat(segment, medianOneMonth)) return "review";
  if ((segment.avg.oneMonth ?? 0) < 0 && (segment.avg.threeMonths ?? 0) < 0) return "weak_trend";
  return "watch";
}

function isHot(segment) {
  return (segment.avg.oneMonth ?? 0) >= 30 || (segment.avg.threeMonths ?? 0) >= 80;
}

function hasSufficientSegmentCoverage(segment) {
  if (!segment.coverage.total) return false;
  return segment.coverage.ok >= 2 && segment.coverage.ok / segment.coverage.total >= 0.8;
}

function isLowHeat(segment, medianOneMonth) {
  if (medianOneMonth === null || segment.avg.oneMonth === null) return false;
  return segment.coverage.total >= 2 && segment.avg.oneMonth < medianOneMonth && (segment.avg.threeMonths ?? -999) >= 0;
}

function stageForCategory(category) {
  if (/其它|待分类|电力设备|高端制造/.test(category)) return "交叉/待分类";
  if (/CPO|光通信|PCB|终端|服务器链|电子制造|光学/.test(category)) return "下游";
  if (/存储|AI芯片|芯片设计|晶圆制造|算力芯片|存储接口|SoC|IP/.test(category)) return "中游";
  if (/设备|材料|玻纤/.test(category)) return "上游";
  if (/平台|互联网|广告/.test(category)) return "应用/平台";
  return "交叉/待分类";
}

function stageRank(stage) {
  return ["上游", "中游", "下游", "应用/平台", "交叉/待分类"].indexOf(stage);
}

function categoryDescription(category) {
  if (category.includes("其它") || category.includes("待分类")) return "暂未归入明确产业链位置，不用于直接选基判断";
  if (category.includes("电力设备") || category.includes("高端制造")) return "横跨制造、能源和AI硬件配套，暂作为交叉观察项";
  if (category.includes("CPO") || category.includes("光通信")) return "AI数据中心内部高速传输所需的光模块、激光器和通信设备";
  if (category.includes("PCB")) return "AI服务器里的高速电路板和配套硬件";
  if (category.includes("存储")) return "保存AI数据和模型中间结果的芯片，价格周期性强";
  if (category.includes("设备")) return "卖给晶圆厂的制造、清洗、检测等机器和零部件";
  if (category.includes("材料")) return "晶圆制造和封装测试会消耗的关键材料";
  if (category.includes("晶圆制造")) return "把芯片设计图变成真实硅片的代工制造环节";
  if (category.includes("AI芯片") || category.includes("算力")) return "训练和推理模型需要的GPU、ASIC或配套芯片";
  if (category.includes("终端") || category.includes("电子制造")) return "AI手机、电脑、服务器等终端制造链";
  if (category.includes("平台")) return "互联网平台或云生态公司，不是纯半导体制造";
  return "暂按持仓名称和代码映射，后续可细分到上游/中游/下游";
}

function averageReturn(stocks, key) {
  const values = stocks.map((stock) => stock.returns?.[key]).filter(isNumber);
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : round((sorted[mid - 1] + sorted[mid]) / 2, 2);
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatPercent(value) {
  if (!isNumber(value)) return "暂无";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
