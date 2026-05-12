# Next Check

Last updated: 2026-05-12

## Cold-Cache Review

本次检查先清理了本地 Vite dependency cache 与 Chrome profile 的 HTTP / Code / GPU cache，
再重启 `npm run dev -- --port 5173`，用浏览器从 `http://localhost:5173/` 重新打开页面。

检查视角：把自己当作第一次打开 demo 的 reviewer / user，而不是项目作者。判断标准不是“页面有没有信息”，而是 reviewer 能否在 10 秒内回答：

```text
当前判断是什么？
哪些 evidence 让它改变？
为什么 closure 没有成为主情景？
下一轮要看什么？
```

## What Works

- 页面边界基本正确：仍是 reviewer-facing forecast-agent deep case surface，不是新闻 dashboard、实时 AIS 或交易界面。
- 顶部四页 IA（Overview / Market / News / Forecast）清晰；每页都显式保留 pending source caveat。
- Forecast contract 已经落地到 canonical store / projections：`judgement_updated` 是唯一改 scenario / target forecast 的事件。
- Forecast 页已经有 Story / Audit graph，且 graph 节点来自 `AgentRunEvent[]`，不是手写静态图。
- Market 页已经把 `pricingPattern` 与 “market is evidence input, not forecast updater” 讲清楚，方向是对的。

## Findings

### P0. Overview 首屏没有把 audit chain 压缩成 reviewer 最需要的三件事

事实：
- 首屏能看到 base case、scenario distribution、Why not closure、next watch。
- 但 Scenario card 中部留白较大，`Why not closure` 只露出 counter evidence，没有把 guardrail / missing condition / pending source 合成一个可复核判断。
- `Case room 工作流` 是内部方案映射，对新 reviewer 有帮助，但它出现在 map / baseline / checkpoint 之前，会把首屏后的阅读顺序带偏。

推断：
- reviewer 更想先验证“可控扰动 54% 是否站得住”，不是先理解 PDF 计划如何映射到页面。

决策：
- Overview 改成首屏三栏：revision brief、scenario + guardrail、next watch / checkpoint。
- 把 baseline strip 和 map提前放到工作流说明之前。
- `Case room 工作流` 降级为页面底部解释，不再抢主线。

### P0. Market 的文案与 chart evidence 有语义冲突

事实：
- 顶部说“市场正在定价可控扰动”。
- 但 analysis window 内 Brent、WTI、VIX 都显示回落，S&P 500 上行。
- 这更像 “structural risk premium remains elevated, but near-window stress faded”，而不是单向“正在定价可控扰动”。

推断：
- 如果 reviewer 只看 Market 首屏，会质疑 evidence interpretation 是否 cherry-picking。

决策：
- `canonicalMarketRead.pricingPattern` 改为 `mixed`。
- 文案改为：油价水平仍保留 Hormuz risk premium，但 event-window cross-asset stress 不支持 closure shock。
- Market 卡片显式拆成 `Level risk premium` 与 `Event-window stress`，避免把 full-window 涨幅和 event-window 回落混在一起。

### P0. Forecast 首屏把“运行阶段”放在 graph 前，削弱 Why-did-it-revise

事实：
- Forecast headline 回答 previous -> current。
- 但首屏主体优先展示 `Sense / Interpret / Revise / Persist` 阶段卡，Evidence graph 被压到首屏外。
- 设计文档要求 Forecast 首屏显示 Story mode revision path。

推断：
- 运行阶段是教学性解释，Evidence graph 才是 reviewer 审计链。

决策：
- Forecast 首屏顺序改为：headline -> graph + current state side rail -> evidence shelf / stream。
- `Forecast agent 运行阶段` 降级到 graph 后，或改为紧凑 contract strip。

## P1 / P2 Remaining

1. `audit:ui`：检查 pending caveat、as-of、source id 是否可见。
2. UI Replay mode：script-level `audit:replay` 已有，交互式播放还没有。
3. Market fixture：用 audited data script 生成 versioned one-year fixture，替代手工 sampled points。
4. Screenshot regression：Overview / Market / News / Forecast 至少覆盖 1280 desktop 和窄屏。
5. Forecast inspector：点击 graph node 后应显示 evidence quality、sourceObservationIds、license / pending caveat，而不只是 node label。

## Implementation Target For This Pass

先解决最重要 3 个问题：

1. Overview 信息排序：首屏聚焦 judgement / scenario / guardrail / next watch；workflow 下移。
2. Market 语义修正：把 pricingPattern 改成 `mixed`，拆清 level premium 与 event-window stress。
3. Forecast 顺序修正：Evidence graph 上移到首屏主体，stage 卡降级到 graph 后。

## Verification Required

完成后至少运行：

```bash
npm run lint
npm run build
npm run audit
```

并用浏览器复查：

- Overview 首屏是否能看到 judgement、scenario、Why not closure、next watch / checkpoint。
- Market 首屏是否不再与图表方向互相冲突。
- Forecast 首屏是否能看到 evidence graph，而不是只看到 agent stage cards。
