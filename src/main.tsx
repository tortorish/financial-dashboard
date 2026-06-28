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
  };
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
      category: fund.category
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
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState('全部');
  const [sortKey, setSortKey] = React.useState<'oneMonth' | 'threeMonths' | 'sixMonths' | 'oneYear' | 'top10Weight'>('oneMonth');
  const [selectedCode, setSelectedCode] = React.useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = React.useState<MarketIndex | null>(null);
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
      setSelectedCode((current) => current ?? owned[0]?.code ?? fundPayload.funds[0]?.code ?? null);
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
          <h1>市场温度、基金持仓和 AI 归因在同一屏</h1>
        </div>
        <button className="primary-button" onClick={() => loadDashboard(true)} disabled={refreshing}>
          <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
          {refreshing ? '刷新中' : '刷新市场与基金'}
        </button>
      </section>

      {error && <div className="alert error">数据加载失败：{error}</div>}
      <StatusAlerts fundMeta={fundData?.meta} marketMeta={marketData?.meta} />

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
        <FuturePanel watchFunds={funds.filter((fund) => fund.ownership === 'watch')} />
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
    </main>
  );
}

async function requestJson<T>(endpoint: string, method: 'GET' | 'POST') {
  const response = await fetch(endpoint, { method });
  if (!response.ok) throw new Error(`${endpoint} 返回 ${response.status}`);
  return (await response.json()) as T;
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

function FuturePanel({ watchFunds }: { watchFunds: FundRecord[] }) {
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
        {watchFunds.slice(0, 6).map((fund) => (
          <div key={fund.code}>
            <b>{fund.code}</b>
            <span><em>观察/未持有</em>{fund.name}</span>
          </div>
        ))}
      </div>
      <p className="source-note">观察池不等于已持有，也不构成主仓建议。</p>
    </section>
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
