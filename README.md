# 金融数据看板 (Financial Dashboard)

一个美观、实时的金融数据看板，追踪中美科技与半导体指数行情，支持 K 线图趋势分析。

---

## 功能特性

- **实时行情追踪**：12 个核心指数，覆盖美股大盘、美股半导体、中国科技、中国芯片、港股科技五大板块
- **一键刷新**：点击「刷新行情」按钮，实时从数据源获取最新报价
- **K 线图趋势分析**：点击任意指数卡片，查看 3个月 / 6个月 / 1年 / 3年 K 线走势
- **多数据源聚合**：
  - **NeoData**（腾讯 FiT 代理 API）—— 实时行情
  - **Yahoo Finance** —— 美股指数 K 线
  - **腾讯自选股** —— 中国/港股指数 K 线
- **数据真实性保障**：所有数据均来自真实 API 接口，无杜撰数据
- **本地缓存**：K 线数据本地持久化缓存，秒开不重复请求
- **Token 自动管理**：独立 token 文件，30 天有效期，无需每次获取
- **代理自动清理**：启动时自动清除过期代理环境变量，避免请求失败

---

## 覆盖指数

| 分类 | 指数 | 代码 |
|------|------|------|
| **美股大盘** | 纳斯达克综合指数 | .IXIC.US |
| | 标普 500 | .INX.US |
| **美股半导体** | 费城半导体 ETF (SOXX) | SOXX.US |
| | 半导体 ETF (SMH) | SMH.US |
| **中国科技** | 科创 50 | 000688.SH |
| | 创业板指 | 399006.SZ |
| | 中国互联网 | H11136.CS |
| | 中证科技 | 931186.CS |
| **中国芯片** | 半导体（中证）| H30184.CS |
| | 中华半导体芯片 | 990001.CS |
| | 国证芯片 | 980017.SZ |
| **港股科技** | 恒生科技指数 | HSTECH.HK |

---

## 快速开始

### 环境要求

- Python 3.9+
- macOS / Linux / Windows

### 安装依赖

```bash
pip install -r requirements.txt
```

### 启动服务

```bash
# 方式一：直接启动
python3 app.py

# 方式二：使用启动脚本
./start.sh
```

服务启动后，打开浏览器访问：**http://localhost:5050**

---

## API 文档

### 获取行情数据

```
GET /api/indices
```

返回所有指数的实时行情，60 秒内缓存。

### 强制刷新行情

```
POST /api/refresh
```

清除缓存，重新从数据源获取全部行情。

### 获取 K 线数据

```
GET /api/kline/<index_id>?period=<period>&refresh=<true|false>
```

**路径参数**：
- `index_id`：指数 ID（如 `ixic`、`kc50`、`soxx` 等）

**查询参数**：
- `period`：周期，可选 `3m` / `6m` / `1y` / `3y`，默认 `1y`
- `refresh`：是否强制刷新，默认 `false`

**示例**：
```bash
curl "http://localhost:5050/api/kline/ixic?period=1y"
```

### 健康检查

```
GET /api/health
```

返回服务状态及 token 有效性。

---

## 项目结构

```
financial-dashboard/
├── app.py                  # Flask 后端服务主入口
├── kline_fetcher.py        # K 线数据获取器（Yahoo / 腾讯 / NeoData）
├── static/
│   └── index.html          # 前端看板页面（ECharts K 线图）
├── requirements.txt        # Python 依赖
├── start.sh                # 一键启动脚本
├── token.json              # NeoData 鉴权 token（自动管理）
├── kline_cache.json        # K 线本地缓存（运行时生成）
└── README.md               # 本文档
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3 + Flask + Flask-CORS |
| 前端 | 纯 HTML/CSS/JS + ECharts 5 |
| 数据源 | NeoData（腾讯 FiT）、Yahoo Finance、腾讯自选股 |
| 数据格式 | JSON REST API |

---

## 常见问题

### Q: 重启电脑后需要做什么？

只需要重新启动服务：
```bash
cd financial-dashboard
python3 app.py
```

token 已持久化到 `token.json`，无需重复获取。

### Q: 为什么有些指数 K 线数据点较少？

部分中国指数（如国证芯片、中华半导体芯片）只能通过 NeoData 获取历史数据，其返回的是稀疏的月度/季度数据摘要。美股和科创50/创业板指/恒生科技通过 Yahoo Finance / 腾讯自选股 API 获取完整的日 K 线数据。

### Q: 如何更新 token？

token 有效期 30 天，过期后 `token.json` 会被自动判定为失效。此时需要重新通过 `connect_cloud_service` 工具获取新 token 并写入 `token.json`。

---

## License

MIT
