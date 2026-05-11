# Hormuz Risk Intelligence Interface Design

Last updated: 2026-05-11

本文档是当前唯一设计文档。

## 1. 核心目标

Hormuz Risk Intelligence Interface 不是 Hormuz news dashboard，也不是地图/市场信息堆叠页。它要展示的是：

```text
evidence -> mechanism -> judgement_updated -> checkpoint
```

唯一主问题：

> 当前 Hormuz 风险是否改变了跨资产判断？如果改变，是哪条新证据导致了这次修订？

为什么选 Hormuz：

- Hormuz 有清晰传导链：事件 -> 航运/供给 -> 风险溢价/避险 -> 跨资产修订。
- IEA 2025 数据给出约 14.95 mb/d crude + 4.93 mb/d oil products 经过 Hormuz，总计约 19.87 mb/d。
- 替代出口路线可用能力约 3.5-5.5 mb/d，无法完全吸收 chokepoint 冲击。
- EIA 指出 2024 年约 20% global LNG trade 经过 Hormuz。

这些事实只说明 case 重要，不代表每条新闻都应触发概率更新。

## 2. 产品结构

只保留三层输出：

1. `scenario_distribution`
2. `asset_forecasts` 与 escalation probability targets
3. `checkpoint + next_watch`

目标页面只有三页：

| 页面 | 只回答什么 | 保留 |
| --- | --- | --- |
| Overview | 现在的判断是什么？ | 主结论、最小概率条、mini map、2-3 个 key status、next watch |
| Market | 市场是否已定价？ | 归一化大图、market read、三组 raw metrics |
| Forecast | Agent 为什么修订判断？ | event stream、mechanism tags、old -> new delta、checkpoint |

删除/降级：

- `Routes` / `map` 不再是顶层页面，只作为 Overview mini map 或 Forecast geo panel。
- `WarTrend` 不再是枚举状态；升级、通行扰动、国家间打击和缓和信号都作为 forecast targets。
- Market 页不写 checkpoint，只提供 market evidence。

## 3. Forecast 行为

Forecast 是主页面。阅读顺序固定：

```text
旧判断 -> 新证据 -> mechanism -> 新判断 -> checkpoint -> 下一次观察
```

事件规则：

| Event | 作用 | 必须显示 |
| --- | --- | --- |
| `source_read` | 建立 source boundary | source ids、fresh/lagging/missing、usage boundary |
| `evidence_added` | 登记候选证据 | summary、polarity、mechanismTags、affects[] |
| `judgement_updated` | 修改状态 | previous/current scenario、targetDeltas、reason |
| `checkpoint_written` | 保存修订 | checkpointId、revisionReason、nextWatch[] |

硬规则：

- 新闻不会直接改概率。
- `evidence_added` 不能修改 state。
- 只有 `judgement_updated` 能修改 `scenario_distribution` 或 target forecast。
- `checkpoint_written` 必须能成为下一轮 previous state。

## 4. 目标数据契约

情景层：

```ts
type ScenarioId = "normal" | "controlled" | "severe" | "closure";
```

Forecast targets：

```ts
type ForecastTarget =
  | "brent"
  | "wti"
  | "gold"
  | "broad_usd"
  | "usd_cny"
  | "vix"
  | "us10y"
  | "sp500"
  | "regional_escalation_7d"
  | "transit_disruption_7d"
  | "state_on_state_strike_14d"
  | "deescalation_signal_14d";
```

Target forecast：

```ts
interface TargetForecast {
  target: ForecastTarget;
  horizon: "24h" | "7d" | "14d" | "30d";
  direction: "up" | "down" | "flat" | "uncertain";
  confidence: number;
  deltaLabel: string;
  rationale: string;
}
```

Mechanism tags：

```ts
type MechanismTag =
  | "transit_risk_up"
  | "insurance_cost_up"
  | "mine_or_swarm_risk_up"
  | "naval_presence_up"
  | "energy_supply_risk_up"
  | "diplomatic_deescalation"
  | "market_pricing_risk_premium"
  | "market_not_pricing_closure";
```

`affects` 必须是数组：

```ts
type EvidenceAffects = "scenario" | "asset_forecast" | "watchlist";
```

## 5. Source Boundary

| Type | Use | Boundary |
| --- | --- | --- |
| IEA/EIA | Hormuz chokepoint baseline | structural baseline，不直接改 7d forecast |
| UKMTO/JMIC/MARAD | maritime advisory | live operational trigger |
| FRED | Brent、WTI、VIX、Broad USD、US10Y、S&P 500 | market benchmark，有发布滞后 |
| Gold | safe haven channel | pending until source/license is settled |
| AIS/tanker/LNG flow | transit pressure | pending until licensed/stable source exists |
| ACLED | conflict candidate layer | near-real-time candidate，需 cross-check |
| UCDP GED/Candidate | historical/backtest reference | 不替代 live operational layer |
| Natural Earth / public shipping lanes | geo context | 非实时 AIS，不是 nautical chart |

## 6. 当前代码状态

已完成：

- Forecast 页已通过 `runForecast(target)` 消费 `ForecastRunResponse.events`。
- `ResearchStream`、`JudgementDeltaCard`、`CheckpointCard` 已接入。
- `sourceRegistry` 已标注 source boundary。
- `npm run build`、`npm run lint`、`npm run audit:data` 当前通过。

仍需收敛：

- 删除顶层 `map` tab。
- `usd_broad` 改为 `broad_usd`。
- `usdcny` 改为 `usd_cny`。
- 删除 `WarTrendForecastTarget` 概念名。
- `TargetForecast.signal` 改为 `direction`，并补 `deltaLabel`。
- `EvidenceAffects` 删除 `war_trend`，改为 `asset_forecast` / `watchlist` 等直接影响对象。
- 增强 `audit:data`：检查 pending source、mechanismTags、affects、nextWatch。

## 7. 下一步执行顺序

1. 先改 contract：`src/types/forecast.ts`、`src/types/agentEvents.ts`。
2. 再同步 demo state：`src/state/forecastStore.ts`。
3. 再删顶层 map：`src/types.ts`、`src/data.ts`、`src/App.tsx`。
4. 再补 Market read 和 audit checks。
5. 最后做桌面/移动视觉检查。

每步完成后运行：

```bash
npm run build
npm run lint
npm run audit:data
```

## 8. 完成标准

- Overview 首屏 10 秒内读出 base case、why-not-closure、next watch。
- Market 只回答市场是否定价，不重复 Forecast judgement。
- Forecast 至少展示一次 `old -> evidence -> mechanism -> new -> checkpoint`。
- 没有 Routes 顶层页。
- 没有 `WarTrend` 枚举状态。
- pending 数据显式标注，不伪装成 live signal。
- `npm run build`、`npm run lint`、`npm run audit:data` 均通过。
