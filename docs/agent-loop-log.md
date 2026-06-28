# Developer / Critic 协作记录

本记录用于复盘 V2 金融看板的 loop engineering 过程：Developer 负责实现与修复，Critic 只读审查、截图、指出风险。

## Round 1

截图：

- `docs/qa/screenshots/round-1-desktop.png`
- `docs/qa/screenshots/round-1-mobile.png`

Critic 主要意见：

- 市场指数和基金只是并排显示，没有真正融合；中国芯片指数不可用时，风险卡仍给出市场结论，容易误导。
- 市场 `partial` 状态可见但不够明确，用户不知道市场相关判断已经降级。
- K 线弹窗对不可用指数仍可点击，且旧缓存状态没有被前端当作可展示数据。
- 移动端没有明显重叠，但基金表隐藏表头后，百分比指标缺少标签。
- 观察池没有在每行标明“未持有”，AI 上下文也没有传观察池基金。
- “阶段涨幅归因”等话术偏强，应该改成线索和风险框架。

Developer 修复：

- 把 KPI 从“市场强度”改成“市场数据覆盖”，显示可用指数数量，并只把可用项中的较强指数作为线索。
- 增加基金分类到代理指数的映射，风险卡显示代理指数覆盖率；覆盖不完整时降级为“观察线索”。
- 顶部异常提示补充“市场数据部分成功，相关结论已降级”。
- 前端状态枚举加入 `stale`，K 线允许展示 `stale + records` 的旧缓存并提示。
- K 线默认周期改为 `3m`，减少首次点击对长周期实时网络的依赖。
- 移动端基金行改为卡片式指标显示，每个百分比都有 `近1月/近3月/近1年/集中度` 标签。
- 观察池每行加“观察/未持有”徽标，并把 `watchFunds` 加入 AI 上下文。
- “阶段涨幅归因”改成“阶段涨幅线索”，并明确不是因果归因或买卖建议。

验证：

- `npm run build` 通过。
- Round 2 移动端截图检测：`scrollWidth=390`，`clientWidth=390`，横向溢出消失。

## Round 2

截图：

- `docs/qa/screenshots/round-2-desktop.png`
- `docs/qa/screenshots/round-2-mobile.png`

Critic 主要意见：

- KPI 仍显示“市场数据覆盖 12/12”，因为旧缓存 `stale` 被算成了实时可用；这会和“中国芯片 0/3”以及异常提示冲突。
- 风险卡的“代理指数覆盖 5/5”同样把旧缓存算成可用，没有按数据不完整降级。
- K 线 `stale + records` 的展示逻辑已基本合理，但不可用市场卡片仍可点击，属于死入口。
- 移动端基金指标标签、观察池“未持有”标识、AI `watchFunds` 上下文和“阶段涨幅线索”话术已通过。

Developer 修复：

- 市场覆盖率拆成实时可用、旧缓存、不可用三类；KPI 改为显示实时可用数，旧缓存单独写在 note 中。
- 代理指数覆盖不再把 `stale` 算作实时可用；若代理指数不完整，风险卡降级为“观察线索”。
- 后端 stale 来源从反复累加的 `neodata+cache+cache...` 收敛为稳定的 `neodata-cache`。
- 市场卡片点击条件收紧：只有 `ok`，或 `stale` 且有有效价格的卡片才能打开走势；无有效数据的 NeoData 卡片禁用。

验证：

- `npm run build` 通过。
- Round 3 截图检测：12 个市场卡片中 5 个不可用卡片已禁用。
- Round 3 移动端截图检测：`scrollWidth=390`，`clientWidth=390`。

## Round 3 / Final

截图：

- `docs/qa/screenshots/round-3-final.png`
- `docs/qa/screenshots/round-3-mobile.png`

Critic 主要意见：

- KPI 不再显示 `12/12`，不可用卡片也已禁用；但没有有效价格和日期的 NeoData fallback 仍被称为 `stale/旧缓存`，这会把“不可用”包装成“旧缓存”。
- 协作记录缺少单独的 Round 3 final 验收段。

Developer 修复：

- 后端市场 fallback 增加有效性判断：只有旧条目同时有 `price` 和 `updateTime` 时才标记为 `stale`；否则标记为 `unavailable/error`。
- 重新刷新市场缓存，当前结果为 12 个市场项：7 个 `ok`，5 个 `unavailable`，0 个伪旧缓存。
- 补充本 Round 3 final 协作记录。

最终验证：

- `npm run build` 通过。
- 市场 API：`indices=12`，`ok=7`，`unavailable=5`，`errors=5`。
- 基金 API：`funds=17`，`status=fresh`，`errors=0`。
- 不可用市场卡片禁用，移动端无横向溢出。

可接受残余风险：

- NeoData 本机脚本未安装，所以 5 个中国科技/芯片相关指数暂不可用；页面明确显示异常，不把它伪装成实时数据。
- AI 输出仍是解释辅助，不构成交易建议。
