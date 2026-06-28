# AI基金投资协作看板

本地网页应用，用公开基金数据做每日查看、产业链分类、风险暴露和 AI 协作。V1 不连接同花顺账户，不读取真实持仓金额，不自动交易。

## 运行

```bash
npm install
cp .env.example .env
npm run refresh
npm run dev
```

打开 Vite 输出的地址，默认是 `http://127.0.0.1:5173`。后端默认运行在 `http://127.0.0.1:8787`。

AI 协作默认按 MiniMax OpenAI-compatible 接口配置：

```bash
OPENAI_BASE_URL=https://api.minimaxi.com/v1
OPENAI_MODEL=MiniMax-M3
```

Token Plan 的订阅 Key 与按量计费 API Key 是两套独立凭证。把 `.env` 里的 `OPENAI_API_KEY` 填好即可启用；没有 key 或 key 被平台拒绝时，聊天面板会提示配置/上游错误，不会导致页面崩溃。

## 数据口径

- 基金基础信息、净值、阶段涨幅、资产配置、基金经理、前十大持仓来自东方财富/天天基金公开接口。
- 交易日盘中波动使用天天基金 `fundgz.1234567.com.cn` 的净值估算；它不是最终日净值，也不是可直接成交的实时价格，最终以基金公司收盘后披露净值为准。
- 净值和阶段涨幅相对较新；前十大持仓、股票仓位是基金定期披露口径，通常滞后于真实仓位。
- `data/cache/` 是本地缓存；接口失败时页面会显示缓存状态，不把缓存伪装成实时数据。
- AI 协作面板会把 MiniMax 返回的 Markdown 渲染为标题、列表、代码块和链接；浏览器端不保存 API key。

## API

- `GET /api/funds`：基金基础数据、阶段涨幅、分类和持仓。
- `POST /api/refresh`：手动刷新基金基础数据。
- `GET /api/funds/intraday`：读取基金盘中净值估算缓存。
- `POST /api/funds/intraday/refresh`：刷新基金盘中净值估算。
- `GET /api/markets/indices`：市场指数与行业代理指数。
- `POST /api/chat`：把当前看板上下文传给本地后端，由 MiniMax 生成分析。

## 已买基金

`021511`、`018815`、`016237`、`020722`、`025209`、`016665`、`006503`、`005844`

## 分类边界

已买基金和观察池分开展示。机器人、智能驾驶、世界模型相关基金仅作为未来观察池，不等于已持有，也不构成主仓建议。
