# Hormuz Risk Intelligence Interface 统一设计文档

Last updated: 2026-05-11

## 1. 产品定位

**Hormuz Risk Intelligence Interface 是一个事件驱动的预测修订界面。**

它不是地缘政治新闻 dashboard，也不是金融交易系统。它的目标是展示一个 forecast agent 如何把新的霍尔木兹相关证据转化为可审计的情景判断、跨资产判断和下一步观察项。

霍尔木兹适合作为 demo case，因为它连接能源供给、航运安全、战争风险、通胀预期、避险资产、美元和风险资产。IEA 官方页支持的产品级基线是：2025 年近 20 mb/d petroleum liquids 经由该海峡，替代出口路线能力约 3.5-5.5 mb/d。若使用 14.95 + 4.93 = 19.87 mb/d 的精确拆分，必须在 `sourceRegistry` 绑定可审计原始表或下载源，不写成未绑定的产品文案。

## 2. 唯一主问题

**当前 Hormuz 风险是否改变了跨资产判断？如果改变，是哪条新证据导致了这次修订？**

所有页面、组件、数据字段都必须服务这个问题。

## 3. 非目标

本项目不做：

- 全网新闻聚合器
- 实时 AIS 商业监控系统
- 交易建议系统
- 军事情报平台
- 通用宏观 dashboard
- LLM 调试日志展示页

只做一件事：**让 reviewer 看懂 Agent 为什么改判。**

## 4. 信息契约

所有 UI 模块只能属于五类之一。

| 类型 | 含义 | 出现位置 |
| --- | --- | --- |
| Fact | 来源给出的事实或数据 | Overview / Market / Forecast |
| Evidence | 对预测有方向性的证据 | Forecast |
| Mechanism | 证据影响判断的中间机制 | Forecast |
| Forecast | 情景概率或 target 判断 | Overview / Forecast |
| Watch | 下一次判断应等待的触发项 | Overview / Forecast |

如果一个模块不能归入这五类，或者不能说明它会改变什么判断，就不进入主界面。

## 5. 页面结构

最终只保留三个顶层页面。

| 页面 | 只回答什么 | 保留内容 | 不允许出现 |
| --- | --- | --- | --- |
| Overview | 当前判断是什么？ | 主结论、scenario distribution、mini map、2-3 个 key status、next watch | 完整新闻表、完整 source 表、长机制解释 |
| Market | 市场是否已经定价？ | 大尺寸归一化图、market read、分组 raw metrics | Agent 日志、航线细节、重复判断摘要 |
| Forecast | Agent 为什么改判？ | event stream、mechanism tags、old -> new delta、checkpoint、next watch | deterministic stepper、静态 scenario 长列表、debug log |

Routes 不再作为顶层页面。地理信息放在 Overview 的 mini map，或 Forecast 右侧的可展开 geo panel。Natural Earth 可作为静态地图底图；如果使用 OSM tiles，必须遵守 OSM tile usage policy，不能把官方 tile servers 当作无限量免费 CDN。

## 6. 页面设计

### 6.0 视觉方向

2026-05-11 的三张参考图将当前 demo 的视觉方向收敛为 **light reviewer console**，而不是深色 case-room。实现时必须保留第 1-5 节的数据和产品边界，但界面视觉应改为：

- 白色或近白背景，低饱和蓝色为唯一主强调色，橙色/红色/绿色只用于 scenario、涨跌和告警语义。
- 顶部固定产品栏：logo、产品名、`Base case: Controlled disruption` badge、三页 tabs、右侧 notification/help/user icon。
- 所有主要模块使用白底卡片、1px 冷灰边框、轻阴影、8px radius；不使用深色大背景、AI gradient、装饰性 glow。
- 页面宽度以 16:9 dashboard 为首要展示目标，适配移动端时卡片纵向堆叠。
- 图标放在浅蓝圆形 icon well 中；按钮和 tabs 使用蓝色 underline 或轻边框，不使用大面积渐变按钮。
- 地图使用浅色静态 context map：淡蓝水域、浅灰/米色陆地、蓝色虚线航线和箭头。地图只提供地理上下文，不作为独立顶层页。
- 参考图中的具体数值和文案不能覆盖本项目数据契约；例如 Market 文案必须跟当前 `marketSeries` 和 `marketRead` 保持一致，不能为了贴图而伪造 VIX 上行或 live Gold。

设计 token：

| Token | 用途 | 建议值 |
| --- | --- | --- |
| `--bg` | 页面背景 | `#f8fafc` |
| `--surface` | 卡片背景 | `#ffffff` |
| `--line` | 卡片边框 | `#dfe7f1` |
| `--text` | 主文字 | `#0f172a` |
| `--muted` | 次级文字 | `#64748b` |
| `--blue` | 主强调 | `#0b66f6` |
| `--amber` | severe / warning | `#ff9f1c` |
| `--red` | closure / negative | `#ef2b2d` |
| `--green` | support / positive | `#16a34a` |

字体保持 system UI / SF Pro / Segoe UI 路线，数字启用 `font-variant-numeric: tabular-nums`。如果后续引入品牌字体，必须保持中英文可读性优先。

### 6.1 Overview

目标：10 秒内让 reviewer 知道当前判断。

保留：

- 当前主情景，例如 `controlled`
- 一句话解释为什么不是 `closure`
- 最小 scenario distribution
- mini map，标出 Hormuz 区域和关键事件点
- 2-3 个 key status，例如 maritime risk、traffic pressure、market pricing
- 下一步观察项
- 当前 checkpoint，一行说明 revision reason 和 checkpoint id。

目标布局：

```text
Current judgement | Scenario probabilities | Why not closure / Next watch
Case boundary mini map spanning two columns | right-side watch cards
Maritime status | Cross-asset read | Source freshness
Current checkpoint full-width
```

删除：

- 全局 forecast target dropdown
- 完整预测链
- 重复的 current judgement summary
- 多段机制解释

### 6.2 Market

目标：回答市场是否已经反映 Hormuz 风险。

保留：

- 一张归一化跨资产大图
- 一句 `marketRead`
- 三组 raw metrics

资产分组：

| 组 | 指标 |
| --- | --- |
| Energy | Brent, WTI |
| Safe haven & FX | Gold, Broad USD, USD/CNY, USD/CNH pending |
| Risk, rates & volatility | VIX, US10Y, S&P 500 |

设计原则：

- `Broad USD` 作为内部 target，比直接把 DXY 当美元总指标更稳，因为 FRED 有可审计 Broad U.S. Dollar Index 序列。
- `USD/CNY` 使用 FRED 可审计序列；`USD/CNH` 在没有稳定 source 前必须保持 pending。
- Gold 可以展示 schema，但如果没有稳定授权数据源，必须标为 pending。LBMA benchmark 数据使用存在 licence 要求，不能默认当作自由可抓取 live data。

目标布局：

```text
Market read card | Signal strength card | As-of card
Normalized cross-asset chart with right legend and range control
Energy metrics | Safe haven & FX metrics | Risk / rates / vol metrics
How to read this full-width note
```

`Signal strength` 不是新的 forecast state，只是 `marketRead.supportsScenario` 和 market evidence 的解释性标签。

### 6.3 Forecast

目标：展示 Agent 如何从旧判断修订到新判断。

阅读顺序固定为：

```text
旧判断 -> 新证据 -> mechanism -> 新判断 -> checkpoint -> 下一次观察
```

Forecast 是唯一展示 Agent 行为的页面。

必须展示：

- `source_read`：读了哪些固定信源，fresh / lagging / missing / pending
- `evidence_added`：新证据是什么，支持还是反驳哪个判断
- `mechanismTags`：证据通过什么机制影响判断
- `judgement_updated`：old -> new scenario probability delta
- `targetDeltas`：资产或风险 target 的方向、置信度、理由
- `checkpoint_written`：本次 revision reason 和 next watch

不能展示：

- 底层 prompt
- chain-of-thought
- 纯 debug log
- 固定 stepper 动画
- 和 Overview 重复的大段当前判断

目标布局：

```text
Current judgement | Largest delta | Market read | Region mini map
Agent reasoning graph placeholder/product graph
Research stream timeline | right-side current scenario / cross-asset / next watch
```

当前阶段可以使用轻量 CSS/React 节点实现只读 `Agent reasoning graph` 占位，不接 React Flow，不展示内部 agent workflow。图中节点只代表产品解释链：

```text
Maritime advisory -> Transit risk up -> Scenario update -> Asset view
```

这不是内部 runtime graph，也不是 debug graph。

## 7. 数据模型

### 7.1 Scenario

```ts
export type ScenarioId =
  | "normal"
  | "controlled"
  | "severe"
  | "closure";
```

### 7.2 Forecast target

不要单独做 `WarTrend` 枚举。战争趋势应作为可预测 target。

```ts
export type ForecastTarget =
  | "brent"
  | "wti"
  | "gold"
  | "broad_usd"
  | "usd_cny"
  | "usd_cnh"
  | "vix"
  | "us10y"
  | "sp500"
  | "regional_escalation_7d"
  | "transit_disruption_7d"
  | "state_on_state_strike_14d"
  | "deescalation_signal_14d";
```

### 7.3 Mechanism tags

```ts
export type MechanismTag =
  | "transit_risk_up"
  | "traffic_flow_down"
  | "insurance_cost_up"
  | "mine_or_swarm_risk_up"
  | "gnss_or_ais_interference"
  | "naval_presence_up"
  | "energy_supply_risk_up"
  | "diplomatic_deescalation"
  | "market_pricing_risk_premium"
  | "market_not_pricing_closure";
```

### 7.4 Target forecast

```ts
export interface TargetForecast {
  target: ForecastTarget;
  horizon: "24h" | "7d" | "14d" | "30d";
  direction: "up" | "down" | "flat" | "uncertain";
  confidence: number;
  deltaLabel: string;
  rationale: string;
  sourceIds: string[];
}
```

### 7.5 Agent event

```ts
export type AgentRunEvent =
  | {
      type: "run_started";
      runId: string;
      title: string;
      summary: string;
      at: string;
    }
  | {
      type: "source_read";
      title: string;
      sourceIds: string[];
      status: "fresh" | "lagging" | "missing" | "pending";
      summary: string;
      at: string;
    }
  | {
      type: "evidence_added";
      title: string;
      evidence: string;
      polarity: "support" | "counter" | "uncertain";
      affects: Array<"scenario" | "target" | "market" | "watchlist">;
      mechanismTags: MechanismTag[];
      sourceIds: string[];
      confidence: "low" | "medium" | "high";
      at: string;
    }
  | {
      type: "judgement_updated";
      title: string;
      previousScenario: Record<ScenarioId, number>;
      currentScenario: Record<ScenarioId, number>;
      scenarioDelta: Partial<Record<ScenarioId, number>>;
      targetDeltas: TargetForecast[];
      reason: string;
      at: string;
    }
  | {
      type: "checkpoint_written";
      title: string;
      runId: string;
      checkpointId: string;
      revisionReason: string;
      summary: string;
      nextWatch: string[];
      at: string;
    }
  | {
      type: "run_completed";
      runId: string;
      title: string;
      summary: string;
      at: string;
    };
```

核心规则：

1. **新闻不会直接改概率。**
2. **只有 `judgement_updated` 能改变预测状态。**
3. **每次 `judgement_updated` 必须解释 evidence -> mechanism -> forecast delta。**

## 8. Source registry

`sourceRegistry.ts` 是事实边界入口。

每个 source 必须包含：

```ts
export interface SourceRegistryItem {
  id: string;
  name: string;
  category: "official" | "market" | "maritime" | "conflict" | "news" | "pending";
  reliability: "high" | "medium" | "low";
  refreshCadence: string;
  caveat: string;
  pending: boolean;
  url?: string;
}
```

推荐 source 分类：

| 类型 | 来源 | 用途 |
| --- | --- | --- |
| Energy baseline | IEA, EIA | Hormuz 结构性重要性 |
| Maritime security | UKMTO, JMIC, MARAD | 航运风险、事件、通告 |
| Market data | FRED | Brent、WTI、USD/CNY、Broad USD、VIX、US10Y、S&P 500 |
| Gold | LBMA / licensed provider / pending | 避险资产 |
| Conflict data | ACLED, UCDP Candidate | 回测、辅助校验 |
| News | Reuters, AP, official statements | candidate evidence |

ACLED 更适合 near-real-time conflict context；UCDP Candidate/月更数据更适合校验和回测，不应替代 operational maritime layer。

## 9. MarketRead 数据结构

```ts
export interface MarketRead {
  title: string;
  summary: string;
  supportsScenario: ScenarioId | "uncertain";
  evidenceIds: string[];
}
```

示例：

```ts
const marketRead: MarketRead = {
  title: "Market is pricing disruption risk, not full closure",
  summary:
    "Oil is pricing a Hormuz risk premium, while VIX, equity, rates, and Broad USD do not yet show a closure-style shock.",
  supportsScenario: "controlled",
  evidenceIds: ["fred-market", "fred-brent", "fred-vix", "fred-sp500"],
};
```

## 10. 前端实现路线

### Phase 1：收缩信息架构

目标：

- 顶层页面从 4 个变 3 个
- Routes 降级为 mini map / geo panel
- Overview 删除重复判断
- Forecast target dropdown 移到 Forecast 页

完成标准：

- Overview 首屏只回答“当前判断是什么”
- Market 只回答“市场是否定价”
- Forecast 只回答“为什么改判”

### Phase 2：事件模型

目标：

- 新增 `AgentRunEvent`
- 新增 `TargetForecast`
- 新增 `MechanismTag`
- 删除旧版 deterministic stepper
- mock 数据也必须按事件模型走

完成标准：

- Forecast 页完全由 `AgentRunEvent[]` 渲染
- 至少展示一次 old -> new probability delta
- 至少展示一个 mechanism tag
- 至少展示一个 checkpoint

### Phase 3：Market 层补齐

目标：

- 加 `marketRead`
- 增加 Gold / Broad USD / USD-CNY / USD-CNH schema
- pending 数据显式 pending
- raw metrics 分组展示

完成标准：

- Market 页有一条明确解释
- Gold 没有授权数据源时不能伪装为 live
- USD/CNH 没有稳定源时不能伪装为 live

### Phase 4：Source registry 和 audit

目标：

- 扩展 `sourceRegistry.ts`
- 扩展 `audit:data`

审计必须检查：

- 所有 market metrics 有 source id
- 所有 `AgentRunEvent` 的 source id 存在
- pending source 没有被渲染为 live evidence
- Gold / AIS / USD-CNH pending 状态正确
- FRED anchor 稳定

### Phase 5：Backend seam

`forecastClient.ts` 只保留一个当前路径：

```ts
export interface AgentRunResult {
  runId: string;
  events: AgentRunEvent[];
  finalScenario: Record<ScenarioId, number>;
  targetForecasts: TargetForecast[];
  checkpoint?: {
    checkpointId: string;
    revisionReason: string;
    nextWatch: string[];
  };
}

export async function runHormuzAgent(input: {
  horizon: "24h" | "7d" | "14d" | "30d";
  targets: ForecastTarget[];
}): Promise<AgentRunResult>;
```

不保留旧版 ask-agent response shape。

## 11. 验收标准

产品验收：

- reviewer 10 秒内能知道当前主判断
- Forecast 页能解释至少一次“为什么改判”
- 每个页面只有一个核心问题
- 没有重复 current judgement summary
- 没有把 pending 数据伪装成实时数据
- 机制层必须可见

工程验收：

- `npm run lint`
- `npm run build`
- `npm run audit:data`
- Playwright 截图覆盖 Overview、Market、Forecast initial、Forecast complete
- `Forecast` 不依赖固定 stepper
- `forecastClient` 不保留旧版兼容路径

## 12. 当前落地状态

已同步的基座：

- `src/types/forecast.ts`：`ScenarioId`、`ForecastTarget`、`TargetForecast` 已按本设计收敛。
- `src/types/agentEvents.ts`：`AgentRunEvent` 使用 source/evidence/mechanism/judgement/checkpoint 事件模型。
- `src/state/forecastStore.ts`：mock run 使用机制标签、target deltas、checkpoint 和 pending source。
- `src/App.tsx`：顶层只保留 Overview / Market / Forecast；Routes 降级为 Overview mini map。
- `src/data/sourceRegistry.ts`：source category、reliability、pending、caveat 已成为事实边界。
- `scripts/audit-data.mjs`：检查 FRED 点位、source id、pending 状态和 event contract。

## 13. 最终设计原则

这个 demo 的主角不是 Hormuz 新闻，也不是市场图表，而是：

**Agent 如何从新证据中提取机制信号，并把旧判断修订为新判断。**

最终产品应该让 reviewer 看到这条链：

```text
source -> evidence -> mechanism -> judgement delta -> target forecast -> checkpoint -> next watch
```

只要这条链清楚，demo 就成立。
