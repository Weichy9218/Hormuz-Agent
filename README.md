# Hormuz Risk Intelligence Interface

围绕 Strait of Hormuz 一个深度 case 的双层 demo：

1. **Forecast 页** — 真实 `galaxy-selfevolve` run 的实时可视化器。Reviewer 点一次按钮，浏览器里看 forecast agent 一步步搜证据、读文章、做判断、落 `record_forecast`，每个事件都能点开看原始 payload。本页的目标、数据流、规划全部见 [`PLANS.md`](PLANS.md)，本仓库其他文档不重述。
2. **背景三页（Overview / News / Market）** — 帮 reviewer 在打开 Forecast 之前先把 Hormuz 事件脉络和市场背景理清楚。它们 **不参与 forecast 概率修订、不消费 galaxy artifact、不与 Forecast 页双向联动**。当前阶段两层是松耦合的；后期可能加入引用关系，但本轮不实现。

唯一产品总纲：[`docs/design.md`](docs/design.md)。本地数据契约：[`docs/data.md`](docs/data.md)。Forecast 页实现细则：[`PLANS.md`](PLANS.md)。

## Positioning

本仓库是 forecast-agent 系统的 **reviewer-facing surface**，与批量评估系统 [`galaxy-selfevolve` / FutureX](../../../Doing-Right-Things/FutureX/papers/galaxy-selfevolve) 互补：

| 系统 | 形态 | 回答的问题 |
| --- | --- | --- |
| FutureX / galaxy-selfevolve | batch + online eval，多任务、多 horizon | Agent 在大样本上预测得多准？skill 是否能自演化？ |
| Hormuz Risk Interface（本仓库） | 单 case、reviewer console | 在一个高维事件上，Agent 跑一次具体长什么样？事件脉络和市场背景是什么？ |

## Product Surface

```text
┌──────────────────────────────────────────────────────────────────────┐
│ 背景层 (独立)                                                          │
│   Overview  当前事件状态 + Hormuz 是什么 + 外部预测参考(Polymarket)   │
│   News      Hormuz 事件发展时间线                                      │
│   Market    跨资产市场数据可视化（FRED 9 series + 事件标注）           │
├──────────────────────────────────────────────────────────────────────┤
│ Forecast 层 (PLANS.md)                                                │
│   Forecast  真实 galaxy-selfevolve run 的实时可视化器                  │
└──────────────────────────────────────────────────────────────────────┘
```

页面职责（**当前阶段** 严格遵守）：

| Page | 核心问题 | 数据来源 | 严禁 |
| --- | --- | --- | --- |
| `Overview` | Hormuz 现在状态如何？外部市场怎么定价这个问题？ | events timeline 最新条目；hormuz_baseline；fred_series 当日 snapshot；polymarket 引用 | 出现 scenario 概率、`judgement_updated`、`pricingPattern`、Forecast agent 任何内部状态 |
| `News` | Hormuz 事件如何发展？官方/媒体说了什么？ | events timeline 全量；advisories.jsonl | 把新闻直接转成 forecast evidence、改 Overview 任何概率 |
| `Market` | 跨资产市场怎么走？关键事件落在曲线哪里？ | fred_series.csv；events timeline 事件标注 | `MarketRead` / `pricingPattern` / "支持哪个 scenario" 这类解读语义 |
| `Forecast` | Agent 这次跑出来做了什么？凭什么落到这个 boxed answer？ | `data/galaxy/runs/<date>/.../main_agent.jsonl`（live tail） | 渲染 Overview/Market/News 的任何 mock forecast state |

## Case Narrative

Hormuz 适合作为深度 case：同时跨越能源供给、航运安全、战争风险、通胀预期、避险资产、美元和风险资产；方向可能冲突（油价上行 vs 风险资产承压 vs USD 避险）；新闻噪声大；公开数据稀少但存在结构性 baseline（IEA/EIA chokepoint）。

背景三页的叙事顺序：

```text
Overview  "现在 Hormuz 是什么状态？" (10 秒摘要 + Polymarket 外部对照)
   ↓
News      "为什么是这个状态？事件如何一步步走到这里？"
   ↓
Market    "市场对这一串事件作出了什么反应？"
```

事实边界：

- IEA/EIA 的 Hormuz chokepoint baseline 是结构性背景，不代表当日 throughput。
- 没有授权 AIS / SAR 前不做实时船舶地图；地图只做静态 context。
- Polymarket 只作为 *外部 prediction market reference*，**不是 ground truth、不直接进入任何 forecast 流程**。
- Events timeline 是 reviewer 视角下整理的事件脉络，每条都必须绑定 source url + retrieved_at，不臆造未发生的事件。

## Implementation Status

`[implemented]` = 代码已落地；`[P0]` / `[P1]` / `[P2]` = 下一步优先级。本表反映 *本次重新定位后* 的状态。

| 模块 | 状态 |
| --- | --- |
| 四页 IA (Overview / News / Market / Forecast) | `[implemented]` |
| Forecast 页：真实 galaxy live viewer | `[implemented]`（详见 PLANS.md rev 5） |
| Forecast 页：节点卡片 tooltip + 边 hover 标签 + critical-path 类型色 | `[implemented]` |
| Forecast 页：Story mode ≤15 节点 + sub-agent 芯片标签 | `[implemented]` |
| Forecast 页：导航后运行任务重连（sessionStorage + mount useEffect） | `[implemented]` |
| Forecast 页：默认模型 GLM5.1（apihy_glm51） | `[implemented]` |
| `data/galaxy/runs/...` artifact 采集 | `[implemented]` |
| FRED 9 series fetch + normalize + generated `market_series.json` | `[implemented]` |
| `hormuz_baseline.json`（≈20 mb/d、bypass、LNG、Asia exposure） | `[implemented]` |
| Advisory snapshots（UKMTO / MARAD / IMO） | `[implemented]` |
| PortWatch / IMO transits snapshots | `[implemented]`（仅作为 caveat 数据，不直接展示成 traffic_flow_down） |
| **Events timeline 数据集**（Hormuz 事件脉络专用） | `[implemented]` |
| **Polymarket 引用问题 registry**（Overview 外部对照） | `[implemented]` |
| Overview / Market 页解耦 forecast revision contract（移除 scenario / pricingPattern / Why not closure） | `[implemented]` |
| `EvidenceClaim` / `judgement_updated` / `scenarioDistribution` 在 Overview/Market/News 的渲染入口 | `[implemented]`；schema 保留供 Forecast 页未来复用 |
| audit:data / audit:evidence / audit:forecast / audit:legacy / audit:replay | `[implemented]` |
| audit:ui | `[P2]` |

## Run

```bash
npm install
npm run dev -- --port 5173
```

默认本地地址：`http://localhost:5173/`。

## Data Refresh

```bash
npm run build:data    # 重新 fetch P0 raw/normalized 数据，重建 generated/
npm run audit         # data / evidence / forecast / replay / legacy 全套检查
npm run build         # 类型检查 + 打包
```

详见 [`docs/data.md`](docs/data.md)。

## Forecast Page Live Run

Forecast 页跑真实 LLM agent，不在 `npm run dev` 默认 flow 里自动触发；reviewer 在浏览器点 **Run galaxy**，本地 vite middleware 会 spawn 真实 `galaxy-selfevolve` 进程。详见 [`PLANS.md`](PLANS.md)。

## Final Principle

> 背景三页让 reviewer 在 30 秒内理解 Hormuz 当前状态和市场背景；Forecast 页让 reviewer 在 5 分钟内看清楚一次真实 agent run 是怎么走完的。两件事现在是平行的，不要互相伪装成对方的输入。
