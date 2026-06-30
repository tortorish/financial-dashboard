import * as React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import {
  Activity,
  Bot,
  BrainCircuit,
  CandlestickChart,
  Database,
  LineChart,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  X
} from 'lucide-react';
import './styles.css';

type FundHolding = {
  rank: number;
  stockCode: string;
  stockName: string;
  weight: number | null;
  valueWan?: string;
};

type FundRecord = {
  code: string;
  name: string;
  ownership: 'owned' | 'watch';
  category: string;
  categoryNote: string;
  type?: string;
  tags: string[];
  nav?: number | null;
  navDate?: string | null;
  returns: {
    oneMonth?: number | null;
    threeMonths?: number | null;
    sixMonths?: number | null;
    oneYear?: number | null;
    twoYears?: number | null;
    sinceAvailable?: number | null;
  };
  returnSource?: Record<string, string | null>;
  allocation: {
    stock?: number | null;
    cash?: number | null;
    asOf?: string | null;
  };
  manager?: {
    name?: string;
    workTime?: string;
  };
  topHoldings: FundHolding[];
  top10Weight?: number | null;
  source: {
    baseUrl: string;
    holdingsUrl: string;
    refreshedAt?: string;
    holdingsAsOf?: string | null;
  };
  caveats: string[];
  dataStatus?: 'fresh' | 'stale';
  refreshError?: string | null;
};

type FundsResponse = {
  funds: FundRecord[];
  meta: {
    cacheStatus: 'fresh' | 'stale' | 'partial' | 'empty';
    refreshedAt?: string;
    sourceLabel: string;
    caveat: string;
    errors?: string[];
  };
};

type FundDetailResponse = {
  fund: FundRecord;
  meta: FundsResponse['meta'];
};

type FundIntradayRecord = {
  code: string;
  name: string | null;
  ownership: 'owned' | 'watch';
  estimateNav?: number | null;
  estimateChangePct?: number | null;
  estimateTime?: string | null;
  lastNav?: number | null;
  lastNavDate?: string | null;
  status: 'ok' | 'stale' | 'no_data' | 'error';
  source?: string;
  sourceUrl?: string;
  refreshedAt?: string | null;
  error?: string | null;
  refreshError?: string | null;
};

type FundIntradayResponse = {
  items: FundIntradayRecord[];
  meta: {
    cacheStatus: 'fresh' | 'stale' | 'partial' | 'empty';
    refreshedAt?: string | null;
    sourceLabel: string;
    caveat: string;
    errors?: string[];
  };
};

type MarketIndex = {
  id: string;
  name: string;
  symbol: string;
  category: string;
  price?: number | string | null;
  changePct?: number | null;
  change20d?: number | null;
  ytd?: number | null;
  updateTime?: string | null;
  status: 'ok' | 'error' | 'no_data' | 'unavailable' | 'stale';
  source?: string;
  error?: string | null;
};

type MarketsResponse = {
  indices: MarketIndex[];
  meta: {
    cacheStatus: 'fresh' | 'stale' | 'partial' | 'empty';
    refreshedAt?: string;
    sourceLabel: string;
    caveat: string;
    errors?: string[];
    warnings?: string[];
  };
};

type HoldingReturnKey = 'oneDay' | 'oneMonth' | 'twoMonths' | 'threeMonths' | 'sixMonths' | 'oneYear';

type HoldingPerformanceStock = {
  stockCode: string;
  stockName: string;
  totalWeight: number | null;
  fundCount: number;
  funds: Array<{
    code: string;
    name: string;
    weight: number | null;
    holdingsAsOf?: string | null;
  }>;
  holdingsAsOf?: string | null;
  market: string;
  quoteSymbol: string;
  chainCategory: string;
  latestPrice: number | null;
  latestDate: string | null;
  returns: Record<HoldingReturnKey, number | null>;
  dataStatus: 'ok' | 'no_data' | 'unsupported_code' | 'fetch_failed';
  source: string;
  error?: string | null;
  fetchedAt?: string | null;
};

type HoldingPerformanceResponse = {
  stocks: HoldingPerformanceStock[];
  groups: Record<string, { count: number; totalWeight: number | null; ok: number }>;
  meta: {
    cacheStatus: 'fresh' | 'stale' | 'partial' | 'empty';
    refreshedAt?: string | null;
    sourceLabel: string;
    caveat: string;
    coverage: { total: number; ok: number; missing: number };
    sourceBreakdown?: Array<{ source: string; count: number }>;
    servedFromCache?: boolean;
    servedAt?: string | null;
  };
};

type PickerSegment = {
  category: string;
  stage: '上游' | '中游' | '下游' | '应用/平台' | '交叉/待分类';
  description: string;
  stocks: HoldingPerformanceStock[];
  totalWeight: number | null;
  avg: Record<'oneMonth' | 'threeMonths' | 'oneYear', number | null>;
  coverage: { total: number; ok: number };
  funds: Array<{ code: string; weight: number | null }>;
};

type KlineRecord = {
  date: string;
  open: number | string;
  close: number | string;
  high: number | string;
  low: number | string;
  volume?: number | string;
};

type KlineResponse = {
  indexId: string;
  name: string;
  symbol: string;
  period: string;
  records: KlineRecord[];
  source: string;
  status: 'ok' | 'error' | 'no_data' | 'unavailable' | 'stale';
  error?: string | null;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const quickQuestions = [
  '市场和我的基金是否同向？',
  '近1月哪只基金涨幅最高？',
  '半导体仓位该怎么评估风险？',
  '机器人/世界模型应放观察仓吗？'
];

const categoryOrder = [
  '全部',
  'CPO/光通信/PCB/AI服务器链',
  '存储芯片',
  '半导体设备/半导体链',
  '全球AI硬件',
  '数字经济/分散科技',
  '机器人/具身硬件',
  '智能驾驶/智能车',
  'AI算力/人工智能',
  '高端制造/Physical AI观察'
];

const marketCategoryLabels: Record<string, string> = {
  us_broad: '美股大盘',
  us_chip: '美股半导体',
  cn_tech: '中国科技',
  cn_chip: '中国芯片',
  hk_tech: '港股科技'
};

const periodLabels: Record<string, string> = {
  '3m': '3个月',
  '6m': '6个月',
  '1y': '1年',
  '3y': '3年'
};

const holdingReturnLabels: Record<HoldingReturnKey, string> = {
  oneDay: '股票1日',
  oneMonth: '股票1月',
  twoMonths: '股票2月',
  threeMonths: '股票3月',
  sixMonths: '股票半年',
  oneYear: '股票1年'
};

const proxyMap: Record<string, string[]> = {
  'CPO/光通信/PCB/AI服务器链': ['soxx', 'smh', 'csi_semi', 'cschip'],
  '存储芯片': ['soxx', 'smh', 'csi_semi', 'cssc', 'cschip'],
  '半导体设备/半导体链': ['soxx', 'smh', 'csi_semi', 'cssc', 'cschip'],
  '全球AI硬件': ['ixic', 'inx', 'soxx', 'smh'],
  '数字经济/分散科技': ['ixic', 'kc50', 'cyb', 'cntech'],
  '机器人/具身硬件': ['ixic', 'kc50', 'cyb'],
  '智能驾驶/智能车': ['ixic', 'kc50', 'cyb', 'hstech'],
  'AI算力/人工智能': ['ixic', 'soxx', 'smh', 'cntech'],
  '高端制造/Physical AI观察': ['ixic', 'kc50', 'cyb']
};

function formatPercent(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return '暂无';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatNumber(value?: number | string | null, digits = 2) {
  if (value === undefined || value === null || value === '') return '暂无';
  const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString('zh-CN', { maximumFractionDigits: digits });
}

function toneClass(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'muted';
  if (value >= 20) return 'hot';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'muted';
}

function buildContext(
  funds: FundRecord[],
  markets: MarketIndex[],
  meta: FundsResponse['meta'],
  marketMeta?: MarketsResponse['meta'],
  intraday?: FundIntradayResponse | null
) {
  const owned = funds.filter((fund) => fund.ownership === 'owned');
  const watch = funds.filter((fund) => fund.ownership === 'watch');
  const top = [...owned].sort((a, b) => (b.returns.oneMonth ?? -999) - (a.returns.oneMonth ?? -999))[0];
  const marketLeaders = [...markets]
    .filter((item) => item.status === 'ok')
    .sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999))
    .slice(0, 5);
  const categories = owned.reduce<Record<string, number>>((acc, fund) => {
    acc[fund.category] = (acc[fund.category] ?? 0) + 1;
    return acc;
  }, {});
  const intradayLeaders = [...(intraday?.items ?? [])]
    .filter((item) => item.ownership === 'owned' && ['ok', 'stale'].includes(item.status))
    .sort((a, b) => (b.estimateChangePct ?? -999) - (a.estimateChangePct ?? -999))
    .slice(0, 5);

  return {
    fundCacheAt: meta.refreshedAt,
    marketCacheAt: marketMeta?.refreshedAt,
    intradayCacheAt: intraday?.meta.refreshedAt,
    caveat: meta.caveat,
    intradayCaveat: intraday?.meta.caveat,
    ownedFunds: owned.map((fund) => ({
      code: fund.code,
      name: fund.name,
      category: fund.category,
      oneMonth: fund.returns.oneMonth,
      threeMonths: fund.returns.threeMonths,
      sixMonths: fund.returns.sixMonths,
      oneYear: fund.returns.oneYear,
      twoYears: fund.returns.twoYears,
      top10Weight: fund.top10Weight,
      topHoldings: fund.topHoldings.slice(0, 5).map((holding) => `${holding.stockName}${holding.weight ?? ''}%`)
    })),
    marketIndices: marketLeaders.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      changePct: item.changePct,
      change20d: item.change20d,
      source: item.source
    })),
    watchFunds: watch.map((fund) => ({
      code: fund.code,
      name: fund.name,
      category: fund.category,
      oneMonth: fund.returns.oneMonth,
      threeMonths: fund.returns.threeMonths,
      oneYear: fund.returns.oneYear,
      twoYears: fund.returns.twoYears
    })),
    marketCoverage: marketCoverageSummary(markets),
    intradayEstimates: intradayLeaders.map((item) => ({
      code: item.code,
      name: item.name,
      estimateChangePct: item.estimateChangePct,
      estimateNav: item.estimateNav,
      estimateTime: item.estimateTime,
      status: item.status
    })),
    categoryCounts: categories,
    oneMonthLeader: top ? `${top.code} ${top.name} ${formatPercent(top.returns.oneMonth)}` : '暂无'
  };
}

function marketCoverageSummary(markets: MarketIndex[]) {
  const total = markets.length;
  const ok = markets.filter((item) => item.status === 'ok').length;
  const stale = markets.filter((item) => item.status === 'stale').length;
  return {
    ok,
    stale,
    total,
    missing: Math.max(0, total - ok - stale),
    status: total && ok === total ? 'complete' : total && ok + stale > 0 ? 'partial' : 'unavailable'
  };
}

function proxyCoverage(markets: MarketIndex[], categories: string[]) {
  const ids = [...new Set(categories.flatMap((item) => proxyMap[item] ?? []))];
  const proxies = ids.map((id) => markets.find((item) => item.id === id)).filter(Boolean) as MarketIndex[];
  const usable = proxies.filter((item) => item.status === 'ok');
  const stale = proxies.filter((item) => item.status === 'stale');
  const weak = usable.filter((item) => (item.changePct ?? 0) < 0);
  return {
    ids,
    proxies,
    usable,
    stale,
    weak,
    coverageText: stale.length ? `${usable.length}/${ids.length || 0} 实时 + ${stale.length} 旧` : `${usable.length}/${ids.length || 0}`,
    isPartial: ids.length === 0 || usable.length < ids.length
  };
}

function canOpenMarketKline(item: MarketIndex) {
  return item.status === 'ok' || (item.status === 'stale' && item.price !== null && item.price !== undefined);
}

function App() {
  const [fundData, setFundData] = React.useState<FundsResponse | null>(null);
  const [marketData, setMarketData] = React.useState<MarketsResponse | null>(null);
  const [intradayData, setIntradayData] = React.useState<FundIntradayResponse | null>(null);
  const [holdingData, setHoldingData] = React.useState<HoldingPerformanceResponse | null>(null);
  const [holdingLoading, setHoldingLoading] = React.useState(false);
  const [holdingError, setHoldingError] = React.useState<string | null>(null);
  const [activeView, setActiveView] = React.useState<'dashboard' | 'holdings' | 'picker'>('dashboard');
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState('全部');
  const [sortKey, setSortKey] = React.useState<'oneMonth' | 'threeMonths' | 'sixMonths' | 'oneYear' | 'top10Weight'>('oneMonth');
  const [selectedCode, setSelectedCode] = React.useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = React.useState<MarketIndex | null>(null);
  const [selectedWatchCode, setSelectedWatchCode] = React.useState<string | null>(null);
  const [watchDetail, setWatchDetail] = React.useState<FundRecord | null>(null);
  const [watchLoading, setWatchLoading] = React.useState(false);
  const [watchError, setWatchError] = React.useState<string | null>(null);
  const [chatInput, setChatInput] = React.useState('');
  const [chatError, setChatError] = React.useState<string | null>(null);
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '我会同时参考市场指数和当前基金缓存。涉及买卖时，我只给风险框架和观察点，不直接下单。'
    }
  ]);
  const [chatLoading, setChatLoading] = React.useState(false);

  React.useEffect(() => {
    loadDashboard(false);
  }, []);

  React.useEffect(() => {
    if ((activeView === 'holdings' || activeView === 'picker') && !holdingData && !holdingLoading) {
      loadHoldingsPerformance(false);
    }
  }, [activeView, holdingData, holdingLoading]);

  async function loadDashboard(forceRefresh: boolean) {
    setError(null);
    setRefreshing(forceRefresh);
    setLoading(!forceRefresh);
    try {
      const [fundPayload, marketPayload, intradayPayload] = await Promise.all([
        requestJson<FundsResponse>(forceRefresh ? '/api/refresh' : '/api/funds', forceRefresh ? 'POST' : 'GET'),
        requestJson<MarketsResponse>(forceRefresh ? '/api/markets/refresh' : '/api/markets/indices', forceRefresh ? 'POST' : 'GET'),
        requestJson<FundIntradayResponse>(
          forceRefresh ? '/api/funds/intraday/refresh' : '/api/funds/intraday',
          forceRefresh ? 'POST' : 'GET'
        )
      ]);
      setFundData(fundPayload);
      setMarketData(marketPayload);
      setIntradayData(intradayPayload);
      const owned = fundPayload.funds.filter((fund) => fund.ownership === 'owned');
      const watch = fundPayload.funds.filter((fund) => fund.ownership === 'watch');
      setSelectedCode((current) => current ?? owned[0]?.code ?? fundPayload.funds[0]?.code ?? null);
      setSelectedWatchCode((current) => current ?? watch[0]?.code ?? null);
      setWatchDetail((current) => current ?? watch[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function sendChat(question = chatInput.trim()) {
    if (!question || !fundData) return;
    setChatError(null);
    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: question }];
    setChatMessages(nextMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: buildContext(fundData.funds, marketData?.indices ?? [], fundData.meta, marketData?.meta, intradayData)
        })
      });
      const payload = await response.json();
      const content = payload.answer || payload.message || '后端没有返回可读回答。';
      if (!response.ok || payload.meta?.status === 'configuration_required' || payload.meta?.status === 'upstream_error') {
        setChatError(content);
        setChatMessages([...nextMessages, { role: 'assistant', content: `AI协作暂不可用：${content}` }]);
        return;
      }
      setChatMessages([...nextMessages, { role: 'assistant', content }]);
    } catch (err) {
      setChatMessages([
        ...nextMessages,
        { role: 'assistant', content: `聊天接口暂不可用：${err instanceof Error ? err.message : '未知错误'}` }
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function loadWatchFund(code: string, refresh = true) {
    setSelectedWatchCode(code);
    setWatchError(null);
    setWatchLoading(true);
    try {
      const endpoint = refresh ? `/api/funds/${code}/refresh` : `/api/funds/${code}`;
      const payload = await requestJson<FundDetailResponse>(endpoint, refresh ? 'POST' : 'GET');
      setWatchDetail(payload.fund);
      setFundData((current) => {
        if (!current) return current;
        const exists = current.funds.some((fund) => fund.code === payload.fund.code);
        return {
          ...current,
          funds: exists
            ? current.funds.map((fund) => (fund.code === payload.fund.code ? payload.fund : fund))
            : [...current.funds, payload.fund]
        };
      });
    } catch (err) {
      setWatchError(err instanceof Error ? err.message : '观察基金刷新失败');
    } finally {
      setWatchLoading(false);
    }
  }

  async function loadHoldingsPerformance(forceRefresh: boolean) {
    setHoldingError(null);
    setHoldingLoading(true);
    try {
      const payload = await requestJson<HoldingPerformanceResponse>(
        forceRefresh ? '/api/holdings/performance/refresh' : '/api/holdings/performance',
        forceRefresh ? 'POST' : 'GET'
      );
      setHoldingData(payload);
    } catch (err) {
      setHoldingError(err instanceof Error ? err.message : '重仓股涨跌加载失败');
    } finally {
      setHoldingLoading(false);
    }
  }

  const funds = fundData?.funds ?? [];
  const markets = marketData?.indices ?? [];
  const ownedFunds = funds.filter((fund) => fund.ownership === 'owned');
  const filteredFunds = ownedFunds
    .filter((fund) => category === '全部' || fund.category === category)
    .sort((a, b) => {
      const left = sortKey === 'top10Weight' ? a.top10Weight : a.returns[sortKey];
      const right = sortKey === 'top10Weight' ? b.top10Weight : b.returns[sortKey];
      return (right ?? -999) - (left ?? -999);
    });
  const selected = funds.find((fund) => fund.code === selectedCode) ?? filteredFunds[0] ?? ownedFunds[0];
  const topOneMonth = [...ownedFunds].sort((a, b) => (b.returns.oneMonth ?? -999) - (a.returns.oneMonth ?? -999))[0];
  const topMarket = [...markets].filter((item) => item.status === 'ok').sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999))[0];
  const highConcentration = ownedFunds.filter((fund) => (fund.top10Weight ?? 0) >= 80);
  const hotFunds = ownedFunds.filter((fund) => (fund.returns.oneMonth ?? 0) >= 30);
  const marketCoverage = marketCoverageSummary(markets);
  const availableCategories = categoryOrder.filter((item) => item === '全部' || ownedFunds.some((fund) => fund.category === item));

  if (loading) {
    return (
      <main className="app-shell loading-shell">
        <Database className="spin-slow" />
        <p>正在读取市场和基金公开数据缓存...</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">AI金融协作看板 V2</p>
          <h1>
            {activeView === 'dashboard'
              ? '市场温度、基金持仓和 AI 归因在同一屏'
              : activeView === 'holdings'
                ? '基金重仓股涨跌与半导体产业链'
                : '选基板块：半导体上中下游观察'}
          </h1>
        </div>
        <div className="top-actions">
          <div className="view-tabs" aria-label="切换看板视图">
            <button className={activeView === 'dashboard' ? 'active' : ''} onClick={() => setActiveView('dashboard')}>
              投资看板
            </button>
            <button className={activeView === 'holdings' ? 'active' : ''} onClick={() => setActiveView('holdings')}>
              重仓股涨跌
            </button>
            <button className={activeView === 'picker' ? 'active' : ''} onClick={() => setActiveView('picker')}>
              选基板块
            </button>
          </div>
          {activeView === 'dashboard' ? (
            <button className="primary-button" onClick={() => loadDashboard(true)} disabled={refreshing}>
              <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
              {refreshing ? '刷新中' : '刷新市场与基金'}
            </button>
          ) : (
            <button className="primary-button" onClick={() => loadHoldingsPerformance(true)} disabled={holdingLoading}>
              <RefreshCw size={18} className={holdingLoading ? 'spin' : ''} />
              {holdingLoading ? '刷新中' : activeView === 'picker' ? '刷新选基样本' : '刷新重仓股'}
            </button>
          )}
        </div>
      </section>

      {error && <div className="alert error">数据加载失败：{error}</div>}
      <StatusAlerts fundMeta={fundData?.meta} marketMeta={marketData?.meta} />

      {activeView === 'holdings' ? (
        <HoldingsPerformancePage data={holdingData} loading={holdingLoading} error={holdingError} />
      ) : activeView === 'picker' ? (
        <FundPickerPage data={holdingData} loading={holdingLoading} error={holdingError} />
      ) : (
        <>

      <section className="kpi-grid">
        <MetricCard
          icon={<Activity />}
          label="市场数据覆盖"
          value={`${marketCoverage.ok}/${marketCoverage.total || 12}`}
          note={topMarket ? `旧缓存 ${marketCoverage.stale} 个；可用项中较强：${topMarket.name} ${formatPercent(topMarket.changePct)}` : '等待市场数据'}
        />
        <MetricCard icon={<Sparkles />} label="近1月基金涨幅最高" value={topOneMonth ? `${topOneMonth.code}` : '暂无'} note={topOneMonth ? `${topOneMonth.name} ${formatPercent(topOneMonth.returns.oneMonth)}` : '等待刷新'} />
        <MetricCard icon={<ShieldAlert />} label="高集中度基金" value={`${highConcentration.length} 只`} note="前十大持仓 ≥ 80%" />
        <MetricCard icon={<BrainCircuit />} label="短期过热提醒" value={`${hotFunds.length} 只`} note="近1月涨幅 ≥ 30%" />
      </section>

      <IntradayPanel intraday={intradayData} funds={funds} />

      <section className="workspace-grid">
        <MarketPanel markets={markets} onOpenKline={setSelectedMarket} />
        <FundRankingPanel
          funds={filteredFunds}
          selectedCode={selected?.code}
          category={category}
          sortKey={sortKey}
          availableCategories={availableCategories}
          topOneMonth={topOneMonth}
          onCategory={setCategory}
          onSortKey={setSortKey}
          onSelect={setSelectedCode}
        />
        <FundDetail fund={selected} />
      </section>

      <section className="lower-grid">
        <RiskPanel funds={ownedFunds} markets={markets} />
        <FuturePanel
          watchFunds={funds.filter((fund) => fund.ownership === 'watch')}
          selectedCode={selectedWatchCode}
          detail={watchDetail}
          loading={watchLoading}
          error={watchError}
          onSelect={loadWatchFund}
        />
        <ChatPanel
          messages={chatMessages}
          input={chatInput}
          loading={chatLoading}
          onInput={setChatInput}
          onSubmit={() => sendChat()}
          onQuickQuestion={sendChat}
          error={chatError}
        />
      </section>

      {selectedMarket && <KlineModal market={selectedMarket} onClose={() => setSelectedMarket(null)} />}
        </>
      )}
    </main>
  );
}

async function requestJson<T>(endpoint: string, method: 'GET' | 'POST') {
  const response = await fetch(endpoint, { method });
  if (!response.ok) throw new Error(`${endpoint} 返回 ${response.status}`);
  return (await response.json()) as T;
}

function HoldingsPerformancePage({
  data,
  loading,
  error
}: {
  data: HoldingPerformanceResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const [sortKey, setSortKey] = React.useState<HoldingReturnKey | 'totalWeight'>('totalWeight');
  const stocks = data?.stocks ?? [];
  const okStocks = stocks.filter((item) => item.dataStatus === 'ok');
  const largestExposure = [...stocks].sort((a, b) => (b.totalWeight ?? -999) - (a.totalWeight ?? -999))[0];
  const strongestDay = [...okStocks].sort((a, b) => (b.returns.oneDay ?? -999) - (a.returns.oneDay ?? -999))[0];
  const repeated = stocks.filter((item) => item.fundCount > 1);
  const grouped = groupHoldingStocks(stocks, sortKey);
  const categories = Object.entries(grouped).sort(
    ([leftKey, leftStocks], [rightKey, rightStocks]) =>
      groupWeight(rightStocks) - groupWeight(leftStocks) || leftKey.localeCompare(rightKey, 'zh-CN')
  );

  return (
    <section className="holdings-page">
      <div className="holding-source-alert">
        <Database size={16} />
        <span>
          {data
            ? `数据来源：${data.meta.sourceLabel}；缓存时间 ${data.meta.refreshedAt || '暂无'}。${data.meta.caveat}`
            : '等待读取已买基金的前十大持仓和公开股票日K线。'}
        </span>
      </div>
      {error && <div className="alert error">重仓股涨跌加载失败：{error}</div>}
      {loading && <div className="chart-placeholder">正在抓取重仓股公开日 K 线...</div>}
      {!loading && data && (
        <>
          <section className="kpi-grid holding-kpis">
            <MetricCard
              icon={<CandlestickChart />}
              label="重仓股覆盖"
              value={`${data.meta.coverage.ok}/${data.meta.coverage.total}`}
              note={data.meta.coverage.missing ? `${data.meta.coverage.missing} 只暂未映射到行情接口` : '公开行情已覆盖'}
            />
            <MetricCard
              icon={<Activity />}
              label="披露权重最高股票"
              value={largestExposure ? largestExposure.stockCode : '暂无'}
              note={largestExposure ? `${largestExposure.stockName} 合计 ${formatPercent(largestExposure.totalWeight)}；口径 ${largestExposure.holdingsAsOf || '季报披露'}` : '等待持仓数据'}
            />
            <MetricCard
              icon={<ShieldAlert />}
              label="重复出现在多只基金"
              value={`${repeated.length} 只`}
              note="重复越多，组合实际暴露越集中"
            />
            <MetricCard
              icon={<Database />}
              label="缓存状态"
              value={data.meta.servedFromCache ? '缓存' : '新抓取'}
              note={data.meta.servedAt || data.meta.refreshedAt || '暂无时间'}
            />
          </section>

          <div className="holdings-toolbar">
            <div>
              <h2>按产业链分类查看重仓股</h2>
              <p>
                权重为基金披露持仓中同一股票的合计占净值比例，不等于你的真实持仓金额；股票涨跌也不等于基金净值涨跌，不能用权重简单合成基金收益。
                {strongestDay ? ` 披露持仓里日K涨幅较高的股票是 ${strongestDay.stockName} ${formatPercent(strongestDay.returns.oneDay)}，仅作行情线索。` : ''}
              </p>
            </div>
            <label className="select-label">
              排序
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as typeof sortKey)}>
                <option value="oneDay">股票1日</option>
                <option value="oneMonth">股票1个月</option>
                <option value="twoMonths">股票2个月</option>
                <option value="threeMonths">股票3个月</option>
                <option value="sixMonths">半年</option>
                <option value="oneYear">股票1年</option>
                <option value="totalWeight">合计权重</option>
              </select>
            </label>
          </div>

          <div className="holding-groups">
            {categories.map(([category, items]) => (
              <article className="holding-group" key={category}>
                <header>
                  <div>
                    <h3>{category}</h3>
                    <p>
                      {categoryDescription(category)}；{items.length} 只股票；行情覆盖 {items.filter((item) => item.dataStatus === 'ok').length}/{items.length}
                    </p>
                  </div>
                  <span className="coverage-pill">合计权重 {formatPercent(groupWeight(items))}</span>
                </header>
                <div className="holding-performance-table">
                  <div className="holding-performance-row head">
                    <span>股票</span>
                    <span>来源基金</span>
                    <span>最新价</span>
                    {Object.entries(holdingReturnLabels).map(([key, label]) => (
                      <span key={key}>{label}</span>
                    ))}
                  </div>
                  {items.map((stock) => (
                    <div className="holding-performance-row" key={`${stock.stockCode}-${stock.stockName}`}>
                      <span className="stock-cell">
                        <b>{stock.stockName}</b>
                        <small>
                          {stock.stockCode} · {stock.market} · 行情 {stock.latestDate || '暂无日期'} · 披露 {stock.holdingsAsOf || '暂无日期'}
                        </small>
                        <small>{stock.source}</small>
                        {stock.dataStatus !== 'ok' && <em>{statusText(stock)}</em>}
                      </span>
                      <span className="holding-fund-list" data-label="来源基金">
                        <b>合计 {formatPercent(stock.totalWeight)}</b>
                        <small>{fundSourceText(stock)}</small>
                        <small>持仓披露口径：{stock.holdingsAsOf || '基金定期报告'}</small>
                      </span>
                      <span data-label="最新价">{formatNumber(stock.latestPrice)}</span>
                      {Object.keys(holdingReturnLabels).map((key) => (
                        <span
                          key={key}
                          data-label={holdingReturnLabels[key as HoldingReturnKey]}
                          className={`${toneClass(stock.returns[key as HoldingReturnKey])} ${isPriorityHoldingReturn(key as HoldingReturnKey) ? 'priority-return' : 'secondary-return'}`}
                        >
                          {formatPercent(stock.returns[key as HoldingReturnKey])}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function FundPickerPage({
  data,
  loading,
  error
}: {
  data: HoldingPerformanceResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const stocks = data?.stocks ?? [];
  const segments = buildPickerSegments(stocks);
  const segmentMedianOneMonth = median(segments.map((item) => item.avg.oneMonth).filter(isNumber));
  const laggards = segments.filter((item) => isRelativeLaggard(item, segmentMedianOneMonth));
  const overheated = segments.filter((item) => (item.avg.oneMonth ?? 0) >= 30 || (item.avg.threeMonths ?? 0) >= 80);
  const stages = ['上游', '中游', '下游', '应用/平台', '交叉/待分类'] as const;

  return (
    <section className="picker-page">
      <div className="holding-source-alert">
        <Database size={16} />
        <span>
          {data
            ? `选基样本来自你已买基金披露的前十大持仓，股票行情源：${formatSourceBreakdown(data)}；缓存时间 ${data.meta.refreshedAt || '暂无'}。这不是全市场半导体股票池，也不是买卖指令。`
            : '等待读取重仓股样本，用来拆解半导体上游、中游、下游板块。'}
        </span>
      </div>
      {error && <div className="alert error">选基样本加载失败：{error}</div>}
      {loading && <div className="chart-placeholder">正在读取半导体产业链样本...</div>}
      {!loading && data && (
        <>
          <section className="kpi-grid holding-kpis">
            <MetricCard icon={<BrainCircuit />} label="产业链板块" value={`${segments.length} 个`} note="按上游/中游/下游重新组织" />
            <MetricCard
              icon={<Activity />}
              label="低热度待复核线索"
              value={`${laggards.length} 个`}
              note="近1月低于样本中位数，需继续复核"
            />
            <MetricCard icon={<ShieldAlert />} label="偏热观察" value={`${overheated.length} 个`} note="短期涨幅高，适合看回撤和分批纪律" />
            <MetricCard
              icon={<Database />}
              label="样本覆盖"
              value={`${data.meta.coverage.ok}/${data.meta.coverage.total}`}
              note="只覆盖公开接口可映射股票"
            />
          </section>

          <section className="picker-method">
            <div>
              <h2>一个更稳的“低热度”选基框架</h2>
              <p>
                低涨幅不是自动便宜。这里先用公开股票样本做板块温度计，再结合趋势确认、基金规模、费率、基金经理、最大回撤、估值和个人仓位预算，帮助你决定哪些主题值得进一步研究。
              </p>
            </div>
            <div className="strategy-grid">
              <StrategyCard title="低热度线索" value="1月低于中位数" text="只进入待复核清单，不代表低估；再看3月趋势、估值和基金质量。" />
              <StrategyCard title="趋势确认" value="3月不塌" text="1月没涨、3月也持续走弱，往往不是低估，而可能是景气度或资金偏好转弱。" />
              <StrategyCard title="防追涨" value="1月>30%警惕" text="短期涨幅过高时，不用急着追；优先等回撤、看仓位上限和风险预算。" />
              <StrategyCard title="数据纪律" value="看披露日期" text="基金前十大持仓是季报口径，不能当成实时仓位，也不能合成基金收益。" />
            </div>
          </section>

          <div className="stage-stack">
            {stages.map((stage) => {
              const items = segments.filter((item) => item.stage === stage);
              if (!items.length) return null;
              return (
                <section className="stage-section" key={stage}>
                  <div className="stage-heading">
                    <div>
                      <h2>{stage}</h2>
                      <p>{stageDescription(stage)}</p>
                    </div>
                    <span>{items.length} 个板块</span>
                  </div>
                  <div className="segment-grid">
                    {items.map((segment) => (
                      <SegmentCard key={segment.category} segment={segment} segmentMedianOneMonth={segmentMedianOneMonth} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function StrategyCard({ title, value, text }: { title: string; value: string; text: string }) {
  return (
    <article className="strategy-card">
      <b>{title}</b>
      <strong>{value}</strong>
      <p>{text}</p>
    </article>
  );
}

function SegmentCard({ segment, segmentMedianOneMonth }: { segment: PickerSegment; segmentMedianOneMonth: number | null }) {
  const status = segmentStatus(segment, segmentMedianOneMonth);
  const fundText = segment.funds.slice(0, 4).map((item) => `${item.code} ${formatPercent(item.weight)}`).join(' / ') || '暂无基金映射';

  return (
    <article className={`segment-card ${status.tone}`}>
      <header>
        <div>
          <h3>{segment.category}</h3>
          <p>{segment.description}</p>
        </div>
        <span>{status.label}</span>
      </header>
      <div className="segment-metrics">
        <div>
          <span>股票1月均值</span>
          <b className={toneClass(segment.avg.oneMonth)}>{formatPercent(segment.avg.oneMonth)}</b>
        </div>
        <div>
          <span>股票3月均值</span>
          <b className={toneClass(segment.avg.threeMonths)}>{formatPercent(segment.avg.threeMonths)}</b>
        </div>
        <div>
          <span>股票1年均值</span>
          <b className={toneClass(segment.avg.oneYear)}>{formatPercent(segment.avg.oneYear)}</b>
        </div>
        <div>
          <span>样本披露权重合计</span>
          <b>{formatPercent(segment.totalWeight)}</b>
        </div>
      </div>
      <div className="segment-note">{status.text}</div>
      <div className="segment-funds">
        <b>关联基金样本</b>
        <span>{fundText}</span>
      </div>
      <div className="segment-stock-list">
        {segment.stocks.slice(0, 5).map((stock) => (
          <div key={`${segment.category}-${stock.stockCode}`}>
            <span>
              <b>{stock.stockName}</b>
              <small>{stock.stockCode} · {stock.market}</small>
            </span>
            <em className={toneClass(stock.returns.oneMonth)}>{formatPercent(stock.returns.oneMonth)}</em>
            <em className={toneClass(stock.returns.threeMonths)}>{formatPercent(stock.returns.threeMonths)}</em>
          </div>
        ))}
      </div>
      <p className="source-note">
        样本 {segment.stocks.length} 只，行情覆盖 {segment.coverage.ok}/{segment.coverage.total}；权重是跨基金前十大披露权重相加，不代表你的组合仓位；均值为可得股票简单平均，不代表基金收益。
      </p>
    </article>
  );
}

function formatSourceBreakdown(data: HoldingPerformanceResponse) {
  const items = data.meta.sourceBreakdown || [];
  if (!items.length) return data.meta.sourceLabel;
  return items.map((item) => `${sourceDisplayName(item.source)} ${item.count}只`).join(' / ');
}

function sourceDisplayName(source: string) {
  if (source.includes('Tencent A-share')) return '腾讯A股前复权K线';
  if (source.includes('Tencent HK')) return '腾讯港股前复权K线';
  if (source.includes('Eastmoney A-share')) return '东方财富A股前复权K线';
  if (source.includes('Eastmoney HK')) return '东方财富港股前复权K线';
  if (source.includes('Yahoo')) return 'Yahoo美股日线';
  if (source === 'unsupported_code') return '暂不支持代码';
  if (source === 'fetch_failed') return '本次抓取失败';
  return source;
}

function groupHoldingStocks(stocks: HoldingPerformanceStock[], sortKey: HoldingReturnKey | 'totalWeight') {
  return stocks.reduce<Record<string, HoldingPerformanceStock[]>>((acc, stock) => {
    const key = stock.chainCategory || '其它/待分类';
    acc[key] = [...(acc[key] ?? []), stock];
    acc[key].sort((left, right) => {
      const leftValue = sortKey === 'totalWeight' ? left.totalWeight : left.returns[sortKey];
      const rightValue = sortKey === 'totalWeight' ? right.totalWeight : right.returns[sortKey];
      return (rightValue ?? -999) - (leftValue ?? -999);
    });
    return acc;
  }, {});
}

function groupWeight(stocks: HoldingPerformanceStock[]) {
  return Number(stocks.reduce((sum, stock) => sum + (stock.totalWeight ?? 0), 0).toFixed(2));
}

function categoryDescription(category: string) {
  if (category.includes('其它') || category.includes('待分类')) return '暂未归入明确产业链位置，不用于直接选基判断';
  if (category.includes('电力设备') || category.includes('高端制造')) return '横跨制造、能源和AI硬件配套，暂作为交叉观察项';
  if (category.includes('CPO') || category.includes('光通信')) return 'AI数据中心内部高速传输所需的光模块、激光器和通信设备';
  if (category.includes('PCB')) return 'AI服务器里的高速电路板和配套硬件';
  if (category.includes('存储')) return '保存AI数据和模型中间结果的芯片，价格周期性强';
  if (category.includes('设备')) return '卖给晶圆厂的制造、清洗、检测等机器和零部件';
  if (category.includes('材料')) return '晶圆制造和封装测试会消耗的关键材料';
  if (category.includes('晶圆制造')) return '把芯片设计图变成真实硅片的代工制造环节';
  if (category.includes('AI芯片') || category.includes('算力')) return '训练和推理模型需要的GPU、ASIC或配套芯片';
  if (category.includes('终端') || category.includes('电子制造')) return 'AI手机、电脑、服务器等终端制造链';
  if (category.includes('平台')) return '互联网平台或云生态公司，不是纯半导体制造';
  return '暂按持仓名称和代码映射，后续可细分到上游/中游/下游';
}

function buildPickerSegments(stocks: HoldingPerformanceStock[]): PickerSegment[] {
  const grouped = stocks.reduce<Record<string, HoldingPerformanceStock[]>>((acc, stock) => {
    const key = stock.chainCategory || '其它/待分类';
    acc[key] = [...(acc[key] ?? []), stock];
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([category, items]) => {
      const funds = aggregateSegmentFunds(items);
      return {
        category,
        stage: stageForCategory(category),
        description: categoryDescription(category),
        stocks: [...items].sort((left, right) => (right.totalWeight ?? 0) - (left.totalWeight ?? 0)),
        totalWeight: groupWeight(items),
        avg: {
          oneMonth: averageReturn(items, 'oneMonth'),
          threeMonths: averageReturn(items, 'threeMonths'),
          oneYear: averageReturn(items, 'oneYear')
        },
        coverage: {
          total: items.length,
          ok: items.filter((item) => item.dataStatus === 'ok').length
        },
        funds
      };
    })
    .sort((left, right) => stageRank(left.stage) - stageRank(right.stage) || (right.totalWeight ?? 0) - (left.totalWeight ?? 0));
}

function stageForCategory(category: string): PickerSegment['stage'] {
  if (/其它|待分类|电力设备|高端制造/.test(category)) return '交叉/待分类';
  if (/CPO|光通信|PCB|终端|服务器链|电子制造|光学/.test(category)) return '下游';
  if (/存储|AI芯片|芯片设计|晶圆制造|算力芯片|存储接口|SoC|IP/.test(category)) return '中游';
  if (/设备|材料|玻纤/.test(category)) return '上游';
  if (/平台|互联网|广告/.test(category)) return '应用/平台';
  return '交叉/待分类';
}

function stageDescription(stage: PickerSegment['stage']) {
  if (stage === '上游') return '更偏“卖铲子”：设备、材料、零部件，受扩产周期和国产替代影响。';
  if (stage === '中游') return '更偏芯片本体：设计、制造、存储、AI算力芯片，弹性大但波动也大。';
  if (stage === '下游') return '更贴近AI服务器和终端应用：光通信、PCB、电子制造，常跟算力建设节奏同步。';
  if (stage === '应用/平台') return '更偏互联网、云和平台生态，不是纯半导体，但会受AI应用景气影响。';
  return '横跨多个产业或暂未分类，不作为直接选基判断，只做线索保存。';
}

function stageRank(stage: PickerSegment['stage']) {
  return ['上游', '中游', '下游', '应用/平台', '交叉/待分类'].indexOf(stage);
}

function averageReturn(stocks: HoldingPerformanceStock[], key: 'oneMonth' | 'threeMonths' | 'oneYear') {
  const values = stocks.map((stock) => stock.returns[key]).filter(isNumber);
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function aggregateSegmentFunds(stocks: HoldingPerformanceStock[]) {
  const byFund = new Map<string, number>();
  for (const stock of stocks) {
    for (const fund of stock.funds) {
      byFund.set(fund.code, Number(((byFund.get(fund.code) ?? 0) + (fund.weight ?? 0)).toFixed(2)));
    }
  }
  return [...byFund.entries()]
    .map(([code, weight]) => ({ code, weight }))
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0));
}

function segmentStatus(segment: PickerSegment, medianOneMonth: number | null) {
  if (segment.stage === '交叉/待分类') {
    return { label: '待分类', tone: 'neutral', text: '这个板块横跨多个产业或分类不明，只保存为观察线索，不进入选基状态判断。' };
  }
  if (segment.coverage.ok < Math.ceil(segment.coverage.total * 0.5)) {
    return { label: '数据不足', tone: 'neutral', text: '公开行情覆盖不足，先不要用这个板块做选基判断。' };
  }
  if (segment.coverage.total === 1) {
    return { label: '小样本', tone: 'neutral', text: '这个板块只有1只样本股，适合做线索，不适合单独代表整个产业环节。' };
  }
  if ((segment.avg.oneMonth ?? 0) >= 30 || (segment.avg.threeMonths ?? 0) >= 80) {
    return { label: '偏热观察', tone: 'warm', text: '短期涨幅较高，更适合观察回撤、估值消化和仓位上限，不适合机械追涨。' };
  }
  if (isRelativeLaggard(segment, medianOneMonth)) {
    return { label: '待复核线索', tone: 'cool', text: '近1月相对没那么热，且3月趋势没有明显走坏；这不是低估判断，需再看基金规模、费率、经理、回撤、估值和个人仓位。' };
  }
  if ((segment.avg.oneMonth ?? 0) < 0 && (segment.avg.threeMonths ?? 0) < 0) {
    return { label: '趋势待确认', tone: 'neutral', text: '短中期同时偏弱，可能不是便宜，而是景气或资金偏好变弱。' };
  }
  return { label: '正常观察', tone: 'neutral', text: '涨跌处在样本中间区域，适合作为组合暴露对照，不急于下判断。' };
}

function isRelativeLaggard(segment: PickerSegment, medianOneMonth: number | null) {
  if (medianOneMonth === null || segment.avg.oneMonth === null) return false;
  return segment.avg.oneMonth < medianOneMonth && (segment.avg.threeMonths ?? -999) >= 0;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPriorityHoldingReturn(key: HoldingReturnKey) {
  return key === 'oneDay' || key === 'threeMonths' || key === 'oneYear';
}

function fundSourceText(stock: HoldingPerformanceStock) {
  return stock.funds
    .slice(0, 3)
    .map((fund) => `${fund.code} ${formatPercent(fund.weight)}`)
    .join(' / ');
}

function statusText(stock: HoldingPerformanceStock) {
  if (stock.dataStatus === 'unsupported_code') return '暂不支持该代码行情';
  if (stock.dataStatus === 'fetch_failed') return stock.error || '行情抓取失败';
  if (stock.dataStatus === 'no_data') return '暂无行情';
  return '';
}

function StatusAlerts({ fundMeta, marketMeta }: { fundMeta?: FundsResponse['meta']; marketMeta?: MarketsResponse['meta'] }) {
  const hardErrors = [...(fundMeta?.errors ?? []), ...(marketMeta?.errors ?? [])];
  const warnings = [...(marketMeta?.warnings ?? [])];

  return (
    <>
      {fundMeta && (
        <div className={`alert ${fundMeta.cacheStatus === 'fresh' ? 'info' : 'warning'}`}>
          <Database size={16} />
          <span>
            基金：{fundMeta.sourceLabel}，缓存时间 {fundMeta.refreshedAt || '暂无'}。{fundMeta.caveat}
            {fundMeta.cacheStatus === 'stale' ? ' 当前为陈旧缓存，请刷新后再判断。' : ''}
          </span>
        </div>
      )}
      {marketMeta && (
        <div className={`alert ${marketMeta.cacheStatus === 'fresh' ? 'info' : 'warning'}`}>
          <CandlestickChart size={16} />
          <span>
            市场：{marketMeta.sourceLabel}，缓存时间 {marketMeta.refreshedAt || '暂无'}。{marketMeta.caveat}
            {marketMeta.cacheStatus === 'stale' ? ' 当前为陈旧缓存，请刷新后再判断。' : ''}
          </span>
        </div>
      )}
      {hardErrors.length > 0 && (
        <div className="alert warning stacked-alert">
          <ShieldAlert size={16} />
          <span>本次数据存在异常：</span>
          <ul>
            {hardErrors.slice(0, 8).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {marketMeta?.cacheStatus === 'partial' && <span>市场数据为部分成功，市场相关结论已按不完整数据降级。</span>}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="alert info stacked-alert">
          <Database size={16} />
          <span>可选市场数据源未配置，不影响基金基础数据：</span>
          <ul>
            {warnings.slice(0, 6).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function MetricCard({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

function MarketPanel({ markets, onOpenKline }: { markets: MarketIndex[]; onOpenKline: (market: MarketIndex) => void }) {
  const grouped = markets.reduce<Record<string, MarketIndex[]>>((acc, item) => {
    acc[item.category] = [...(acc[item.category] ?? []), item];
    return acc;
  }, {});
  return (
    <section className="market-panel">
      <div className="section-header">
        <div>
          <h2>市场温度</h2>
          <p>旧看板指数行情已合并；点击卡片查看 K 线。</p>
        </div>
      </div>
      <div className="market-groups">
        {Object.entries(marketCategoryLabels).map(([key, label]) => {
          const items = grouped[key] ?? [];
          if (!items.length) return null;
          const ok = items.filter((item) => item.status === 'ok').length;
          return (
            <div className="market-group" key={key}>
              <div className="market-group-title">
                <h3>{label}</h3>
                <span>{ok}/{items.length}</span>
              </div>
              <div className="market-card-grid">
                {items.map((item) => (
                  <button
                    className={`market-card ${toneClass(item.changePct)}`}
                    key={item.id}
                    onClick={() => {
                      if (canOpenMarketKline(item)) onOpenKline(item);
                    }}
                    disabled={!canOpenMarketKline(item)}
                  >
                    <span>
                      <b>{item.name}</b>
                      <small>{item.symbol}</small>
                    </span>
                    <strong>{item.status === 'ok' || item.status === 'stale' ? formatNumber(item.price) : item.status === 'unavailable' ? '未配置' : '暂无'}</strong>
                    <em className={toneClass(item.changePct)}>{item.status === 'ok' || item.status === 'stale' ? formatPercent(item.changePct) : item.error || '数据不可用'}</em>
                    <small>{item.source || 'unknown'} · {item.updateTime || '暂无日期'}</small>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function IntradayPanel({ intraday, funds }: { intraday: FundIntradayResponse | null; funds: FundRecord[] }) {
  const items = (intraday?.items ?? [])
    .filter((item) => item.ownership === 'owned')
    .sort((a, b) => (b.estimateChangePct ?? -999) - (a.estimateChangePct ?? -999));
  const byCode = new Map(funds.map((fund) => [fund.code, fund]));
  const available = items.filter((item) => ['ok', 'stale'].includes(item.status) && item.estimateChangePct !== null && item.estimateChangePct !== undefined);
  const leader = available[0];

  return (
    <section className="intraday-panel">
      <div className="section-header">
        <div>
          <h2>交易日盘中估值</h2>
          <p>天天基金净值估算，适合观察日内波动；最终净值以收盘后基金公司披露为准。</p>
        </div>
        <div className="intraday-summary">
          <span>{intraday?.meta.refreshedAt || '暂无缓存'}</span>
          <b>{leader ? `${leader.code} ${formatPercent(leader.estimateChangePct)}` : '暂无估值'}</b>
        </div>
      </div>
      <div className="intraday-grid">
        {items.map((item) => {
          const fund = byCode.get(item.code);
          const isUsable = item.status === 'ok' || item.status === 'stale';
          return (
            <article key={item.code} className={`intraday-card ${isUsable ? toneClass(item.estimateChangePct) : 'muted'}`}>
              <div>
                <b>{item.code}</b>
                <span>{item.name || fund?.name || '暂无名称'}</span>
              </div>
              <strong className={toneClass(item.estimateChangePct)}>
                {isUsable ? formatPercent(item.estimateChangePct) : '暂无估值'}
              </strong>
              <small>估算净值 {isUsable ? formatNumber(item.estimateNav, 4) : '暂无'}</small>
              <small>上一净值 {formatNumber(item.lastNav, 4)} · {item.lastNavDate || '暂无日期'}</small>
              <em>{item.status === 'stale' ? '旧估值' : item.status === 'ok' ? item.estimateTime || '暂无时间' : item.error || '该基金暂无盘中估值'}</em>
              {fund?.category && <span className="mini-tag">{fund.category}</span>}
            </article>
          );
        })}
      </div>
      <p className="source-note">
        口径：{intraday?.meta.sourceLabel || 'Tiantian Fund intraday estimated NAV'}。开放式基金没有像股票那样的实时成交价，这里展示的是估算净值涨跌，可能与最终日净值有偏差。
      </p>
    </section>
  );
}

function FundRankingPanel({
  funds,
  selectedCode,
  category,
  sortKey,
  availableCategories,
  topOneMonth,
  onCategory,
  onSortKey,
  onSelect
}: {
  funds: FundRecord[];
  selectedCode?: string;
  category: string;
  sortKey: 'oneMonth' | 'threeMonths' | 'sixMonths' | 'oneYear' | 'top10Weight';
  availableCategories: string[];
  topOneMonth?: FundRecord;
  onCategory: (value: string) => void;
  onSortKey: (value: 'oneMonth' | 'threeMonths' | 'sixMonths' | 'oneYear' | 'top10Weight') => void;
  onSelect: (value: string) => void;
}) {
  return (
    <section className="main-panel">
      <div className="section-header">
        <div>
          <h2>我的基金</h2>
          <p>按公开净值和季报持仓口径展示，持仓不代表实时仓位。</p>
        </div>
        <label className="select-label">
          排序
          <select value={sortKey} onChange={(event) => onSortKey(event.target.value as typeof sortKey)}>
            <option value="oneMonth">近1月</option>
            <option value="threeMonths">近3月</option>
            <option value="sixMonths">近6月</option>
            <option value="oneYear">近1年</option>
            <option value="top10Weight">前十大集中度</option>
          </select>
        </label>
      </div>
      <div className="category-strip">
        {availableCategories.map((item) => (
          <button key={item} className={item === category ? 'active' : ''} onClick={() => onCategory(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="mini-card">
            <h3>阶段涨幅线索</h3>
            <p>
              {topOneMonth
            ? `${topOneMonth.code} 近1月涨幅最高，但这只是线索：需要同时看它暴露于 ${topOneMonth.category}、前十大集中度 ${formatPercent(topOneMonth.top10Weight)} 和回撤风险，不是因果归因或买卖建议。`
            : '刷新后自动生成。'}
        </p>
      </div>
      <div className="fund-table">
        <div className="fund-row head">
          <span>基金</span>
          <span>分类</span>
          <span>近1月</span>
          <span>近3月</span>
          <span>近1年</span>
          <span>集中度</span>
        </div>
        {funds.map((fund) => (
          <button key={fund.code} className={`fund-row ${selectedCode === fund.code ? 'selected' : ''}`} onClick={() => onSelect(fund.code)}>
            <span>
              <b>{fund.code}</b>
              <small>{fund.name}</small>
            </span>
                <span data-label="分类">{fund.category}</span>
                <span data-label="近1月" className={toneClass(fund.returns.oneMonth)}>{formatPercent(fund.returns.oneMonth)}</span>
                <span data-label="近3月" className={toneClass(fund.returns.threeMonths)}>{formatPercent(fund.returns.threeMonths)}</span>
                <span data-label="近1年" className={toneClass(fund.returns.oneYear)}>{formatPercent(fund.returns.oneYear)}</span>
                <span data-label="集中度">{formatPercent(fund.top10Weight)}</span>
          </button>
        ))}
      </div>
      <ReturnBars funds={funds.slice(0, 6)} />
    </section>
  );
}

function ReturnBars({ funds }: { funds: FundRecord[] }) {
  const maxAbs = Math.max(1, ...funds.map((fund) => Math.abs(fund.returns.oneMonth ?? 0)));
  return (
    <div className="return-bars">
      <div className="bar-header">
        <h3>近1月涨幅对比</h3>
        <span>按当前筛选展示前 6 只</span>
      </div>
      {funds.map((fund) => {
        const value = fund.returns.oneMonth ?? 0;
        const width = `${Math.max(4, (Math.abs(value) / maxAbs) * 100)}%`;
        return (
          <div className="bar-row" key={`${fund.code}-bar`}>
            <span>{fund.code}</span>
            <div className="bar-track">
              <i className={value >= 0 ? 'bar-up' : 'bar-down'} style={{ width }} />
            </div>
            <b className={toneClass(value)}>{formatPercent(value)}</b>
          </div>
        );
      })}
    </div>
  );
}

function FundDetail({ fund }: { fund?: FundRecord }) {
  if (!fund) return null;
  return (
    <aside className="detail-panel">
      <div className="section-header compact">
        <div>
          <h2>{fund.code}</h2>
          <p>{fund.name}</p>
        </div>
        {fund.dataStatus === 'stale' && <span className="status-pill">旧缓存</span>}
      </div>
      <div className="detail-grid">
        <span>最新净值</span>
        <b>{formatNumber(fund.nav, 4)}</b>
        <span>净值日期</span>
        <b>{fund.navDate || '暂无'}</b>
        <span>股票仓位</span>
        <b>{formatPercent(fund.allocation.stock)}</b>
        <span>仓位口径</span>
        <b>{fund.allocation.asOf || '暂无'}</b>
        <span>基金经理</span>
        <b>{fund.manager?.name || '暂无'}</b>
      </div>
      <div className="category-note">{fund.categoryNote}</div>
      <h3>前十大持仓</h3>
      <div className="holding-list">
        {fund.topHoldings.length ? (
          fund.topHoldings.slice(0, 10).map((holding) => (
            <div key={`${fund.code}-${holding.rank}-${holding.stockCode}`} className="holding-row">
              <span>{holding.rank}. {holding.stockName}</span>
              <b>{formatPercent(holding.weight)}</b>
            </div>
          ))
        ) : (
          <p className="muted-text">暂无持仓明细</p>
        )}
      </div>
      <p className="source-note">
        持仓口径：{fund.source.holdingsAsOf || '基金季报'}；股票仓位口径：{fund.allocation.asOf || '定期披露'}。公开披露数据有滞后。
        {fund.refreshError ? ` 本基金最近刷新失败，暂用旧缓存：${fund.refreshError}` : ''}
      </p>
    </aside>
  );
}

function RiskPanel({ funds, markets }: { funds: FundRecord[]; markets: MarketIndex[] }) {
  const repeated = funds.filter((fund) => ['存储芯片', '半导体设备/半导体链', 'CPO/光通信/PCB/AI服务器链'].includes(fund.category));
  const highTop10 = funds.filter((fund) => (fund.top10Weight ?? 0) >= 80);
  const hot = funds.filter((fund) => (fund.returns.oneMonth ?? 0) >= 30);
  const coverage = proxyCoverage(markets, repeated.map((fund) => fund.category));
  return (
    <section className="panel-card">
      <h2><ShieldAlert size={18} /> 风险暴露</h2>
      <div className="risk-list">
        <RiskItem title="AI硬件集中" value={`${repeated.length} 只`} text="多只基金仍围绕半导体、存储、CPO和AI服务器链波动。" />
        <RiskItem title="前十大集中" value={`${highTop10.length} 只`} text="集中度越高，基金净值更可能受少数重仓股影响，需同时看上涨弹性和回撤承受力。" />
        <RiskItem title="近1月过热" value={`${hot.length} 只`} text="短期涨幅高不等于便宜；若评估新增资金，应先看仓位上限、回撤承受力和分批纪律。" />
        <RiskItem
          title="代理指数覆盖"
          value={coverage.coverageText}
          text={coverage.isPartial ? '半导体/AI硬件代理指数不完整，市场相关判断降级为观察线索。' : `可用代理指数中 ${coverage.weak.length} 个短期走弱，需结合基金持仓滞后看。`}
        />
      </div>
    </section>
  );
}

function RiskItem({ title, value, text }: { title: string; value: string; text: string }) {
  return (
    <article className="risk-item">
      <strong>{value}</strong>
      <div>
        <b>{title}</b>
        <p>{text}</p>
      </div>
    </article>
  );
}

function FuturePanel({
  watchFunds,
  selectedCode,
  detail,
  loading,
  error,
  onSelect
}: {
  watchFunds: FundRecord[];
  selectedCode: string | null;
  detail: FundRecord | null;
  loading: boolean;
  error: string | null;
  onSelect: (code: string, refresh?: boolean) => void;
}) {
  return (
    <section className="panel-card future-panel">
      <h2><BrainCircuit size={18} /> 未来展望：Physical AI</h2>
      <p>
        世界模型不是单一基金主题，而是“物理世界数据 + 视觉/传感器 + 3D空间建模 + 仿真 + 机器人/自动驾驶应用”的产业链。
      </p>
      <div className="future-map">
        <span>机器人硬件</span>
        <span>智能驾驶</span>
        <span>AI算力</span>
        <span>空间智能</span>
        <span>全球平台公司</span>
      </div>
      <h3>观察池</h3>
      <div className="watch-list">
        {watchFunds.map((fund) => (
          <button
            key={fund.code}
            className={selectedCode === fund.code ? 'selected' : ''}
            onClick={() => onSelect(fund.code, true)}
            disabled={loading && selectedCode === fund.code}
          >
            <b>{fund.code}</b>
            <span><em>观察/未持有</em>{fund.name}</span>
            <small>{fund.category}</small>
            <strong className={toneClass(fund.returns.oneMonth)}>{formatPercent(fund.returns.oneMonth)}</strong>
          </button>
        ))}
      </div>
      {error && <div className="chat-error">观察基金刷新失败：{error}</div>}
      <WatchFundDetail fund={detail} loading={loading} />
      <p className="source-note">观察池不等于已持有；点击会刷新单只基金的公开数据，避免首页一次性堆满所有详情。</p>
    </section>
  );
}

function WatchFundDetail({ fund, loading }: { fund: FundRecord | null; loading: boolean }) {
  if (!fund) {
    return <div className="watch-detail muted-text">选择一只观察基金后显示详情。</div>;
  }

  const returnMetrics = [
    ['近1月', fund.returns.oneMonth, fund.returnSource?.oneMonth],
    ['近3月', fund.returns.threeMonths, fund.returnSource?.threeMonths],
    ['近1年', fund.returns.oneYear, fund.returnSource?.oneYear],
    ['近2年', fund.returns.twoYears, fund.returnSource?.twoYears],
    ['可得区间', fund.returns.sinceAvailable, fund.returnSource?.sinceAvailable]
  ] as const;

  return (
    <div className="watch-detail">
      <div className="watch-detail-head">
        <div>
          <h3>{fund.code} · {fund.name}</h3>
          <p>{fund.category}</p>
        </div>
        {loading && <span className="status-pill">刷新中</span>}
      </div>
      <div className="watch-return-grid">
        {returnMetrics.map(([label, value, source]) => (
          <div key={label}>
            <span>{label}</span>
            <b className={toneClass(value)}>{formatPercent(value)}</b>
            <small>{source === 'netWorthTrend' ? '净值序列计算' : source === 'profile' ? '公开阶段涨幅' : '历史不足'}</small>
          </div>
        ))}
      </div>
      <div className="detail-grid watch-basic-grid">
        <span>最新净值</span>
        <b>{formatNumber(fund.nav, 4)}</b>
        <span>净值日期</span>
        <b>{fund.navDate || '暂无'}</b>
        <span>股票仓位</span>
        <b>{formatPercent(fund.allocation.stock)}</b>
        <span>基金经理</span>
        <b>{fund.manager?.name || '暂无'}</b>
      </div>
      <h3>前十大持仓</h3>
      <div className="holding-list compact">
        {fund.topHoldings.length ? (
          fund.topHoldings.slice(0, 10).map((holding) => (
            <div key={`${fund.code}-watch-${holding.rank}-${holding.stockCode}`} className="holding-row">
              <span>{holding.rank}. {holding.stockName}</span>
              <b>{formatPercent(holding.weight)}</b>
            </div>
          ))
        ) : (
          <p className="muted-text">暂无持仓明细</p>
        )}
      </div>
      <p className="source-note">
        数据时间：{fund.source.refreshedAt || '暂无'}；持仓口径：{fund.source.holdingsAsOf || '基金季报'}。两年字段若显示暂无，通常是基金成立时间不足或公开接口未提供。
      </p>
    </div>
  );
}

function ChatPanel({
  messages,
  input,
  loading,
  onInput,
  onSubmit,
  onQuickQuestion,
  error
}: {
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onQuickQuestion: (question: string) => void;
  error: string | null;
}) {
  return (
    <section className="panel-card chat-panel">
      <h2><Bot size={18} /> AI协作</h2>
      <div className="quick-list">
        {quickQuestions.map((question) => (
          <button key={question} onClick={() => onQuickQuestion(question)} disabled={loading}>
            {question}
          </button>
        ))}
      </div>
      {error && <div className="chat-error">AI协作未启用或暂不可用：{error}</div>}
      <div className="messages">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
            {message.role === 'assistant' ? (
              <div className="message-markdown">
                <ReactMarkdown
                  components={{
                    a: ({ children, ...props }) => (
                      <a {...props} target="_blank" rel="noreferrer">
                        {children}
                      </a>
                    )
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            ) : (
              message.content
            )}
          </div>
        ))}
        {loading && <div className="message assistant">正在基于市场和基金数据整理...</div>}
      </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input value={input} onChange={(event) => onInput(event.currentTarget.value)} placeholder="问我市场和基金为什么分化、风险在哪..." />
        <button type="submit" disabled={loading || !input.trim()} aria-label="发送">
          <Send size={18} />
        </button>
      </form>
    </section>
  );
}

function KlineModal({ market, onClose }: { market: MarketIndex; onClose: () => void }) {
  const [period, setPeriod] = React.useState('3m');
  const [data, setData] = React.useState<KlineResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await requestJson<KlineResponse>(`/api/markets/kline/${market.id}?period=${period}`, 'GET');
        if (!ignore) setData(payload);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : 'K线加载失败');
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [market.id, period]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="kline-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>{market.name}</h2>
            <p>{market.symbol} · {marketCategoryLabels[market.category] || market.category}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="period-tabs">
          {Object.entries(periodLabels).map(([key, label]) => (
            <button key={key} className={period === key ? 'active' : ''} onClick={() => setPeriod(key)}>
              {label}
            </button>
          ))}
        </div>
        {loading && <div className="chart-placeholder">正在加载 K 线...</div>}
        {error && <div className="chart-placeholder error">K 线加载失败：{error}</div>}
        {!loading && !error && data && <KlineChart data={data} />}
      </section>
    </div>
  );
}

function KlineChart({ data }: { data: KlineResponse }) {
  const records = (data.records || []).filter((item) => Number.isFinite(Number(item.close)));
  if (!['ok', 'stale'].includes(data.status) || !records.length) {
    return <div className="chart-placeholder">暂无 K 线数据。{data.error || ''}</div>;
  }
  const closes = records.map((item) => Number(item.close));
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = Math.max(max - min, 1);
  const points = records.map((item, index) => {
    const x = records.length === 1 ? 0 : (index / (records.length - 1)) * 100;
    const y = 100 - ((Number(item.close) - min) / range) * 86 - 7;
    return `${x},${y}`;
  });
  const first = records[0];
  const last = records[records.length - 1];
  const change = Number(first.close) ? ((Number(last.close) - Number(first.close)) / Number(first.close)) * 100 : 0;
  return (
    <div className="kline-chart">
      <div className="chart-meta">
        <span>来源：{data.source}</span>
        {data.status === 'stale' && <span className="negative">旧缓存：刷新失败，以下走势仅供回看</span>}
        <span>数据点：{records.length}</span>
        <span className={toneClass(change)}>区间涨跌：{formatPercent(change)}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${data.name} ${data.period} close trend`}>
        <polyline points={points.join(' ')} />
      </svg>
      <div className="chart-meta">
        <span>{first.date} · {formatNumber(first.close)}</span>
        <span>{last.date} · {formatNumber(last.close)}</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
