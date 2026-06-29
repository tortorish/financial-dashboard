const SOURCE_URLS = {
  search: "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx",
  profile: "https://fund.eastmoney.com/pingzhongdata/{code}.js",
  holdings: "https://fundf10.eastmoney.com/FundArchivesDatas.aspx"
};

export function buildMeta({
  sources = SOURCE_URLS,
  fetchedAt = null,
  cacheUpdatedAt = null,
  status = "ok",
  caveats = []
} = {}) {
  return {
    source: {
      provider: "Eastmoney / Tiantian Fund public endpoints",
      urls: sources
    },
    freshness: {
      fetchedAt,
      cacheUpdatedAt,
      servedAt: new Date().toISOString()
    },
    status,
    caveats: [
      "Fund holdings are public disclosure data and can lag the real portfolio, usually by quarterly report timing.",
      "Public endpoints may change shape or temporarily fail; cached data is used when available.",
      ...caveats
    ]
  };
}

export { SOURCE_URLS };
