# Hormuz Risk Intelligence Interface 统一设计文档

Last updated: 2026-05-11

## 1. 产品定位

**Hormuz Risk Intelligence Interface 是一个事件驱动的预测修订界面。**

它不是地缘政治新闻 dashboard，也不是金融交易系统、AIS 实时监控系统或 LLM 调试台。它的目标是展示 forecast agent 如何把新的 Hormuz 相关证据转化为可审计的情景判断、跨资产判断和下一步观察项。

最强产品差异化：

> 这个界面不是展示霍尔木兹新闻，而是展示 Agent 如何把新证据转成可审计的风险判断修订。

## 2. 唯一主问题

**当前 Hormuz 风险是否改变了跨资产判断？如果改变，是哪条新证据导致了这次修订？**

所有页面、组件、数据字段都必须服务这个问题。

最终 reviewer 应该看懂这一条线：

```text
baseline -> source -> observation -> evidence -> mechanism -> judgement delta -> target forecast -> checkpoint -> next watch
```

## 3. 设计评审结论

GPT 建议的方向总体有道理，应该吸收，但需要收敛。

事实：

- Hormuz 的结构性基线必须更显性，否则用户不知道为什么这个 case 值得看。
- 当前三页结构正确：Overview / Market / Forecast。
- `source -> evidence -> mechanism -> judgement delta -> checkpoint` 是正确的解释链。
- Pending data boundary 是产品可信度的一部分，不是工程细节。

推论：

- 最大缺口不是更多页面，而是更强的 case narrative layer。
- Market 页如果继续说 `supportsScenario`，会被误读为第二个 forecast engine。
- Forecast 默认展开全图会降低可读性，应默认展示最重要 revision path。

采用的修订：

- 全站改成三层叙事：Baseline / Signal / Revision。
- Overview 强化 Hormuz baseline strip 和 Why not closure。
- Market 改为 pricing pattern + data coverage，而不是直接支持某个 scenario。
- Forecast 首屏先给 old -> new revision headline，再给解释图和事件流。
- 数据契约增加 SourceObservation、EvidenceClaim、EvidenceQuality、scenario operational definition。

不采用或暂缓：

- 不把主界面扩成维护后台。
- 不做完整实时 AIS 地图。
- 不把 LLM 作为单独概率更新器；概率更新应受规则/scorecard 约束。
- 不在第一版把所有 audit scripts 都实现成强制 CI；先在文档中定义验收路径。

## 4. Case Narrative

### 4.1 Why Hormuz matters

Hormuz 适合作为 demo case，因为它连接能源供给、航运安全、战争风险、通胀预期、避险资产、美元和风险资产。

产品级 baseline：

| Anchor | Product wording | Source boundary |
| --- | --- | --- |
| Oil flow | 近 20 mb/d petroleum liquids 经由 Hormuz | IEA / EIA 结构性 chokepoint baseline；不是当日 throughput |
| Bypass capacity | 替代出口路线能力约 3.5-5.5 mb/d | IEA public explainer；精确拆分必须绑定可审计原始表 |
| Exposure | Asia-heavy crude/product exposure + LNG relevance | 作为结构性解释，不写成未绑定实时数据 |
| Tail risk | closure 是尾部情景 | 需要 verified flow stop、official avoidance 或 closure-style market shock |

Overview 首屏必须出现 case boundary strip：

```text
Why Hormuz matters
≈20 mb/d oil flows | 3.5-5.5 mb/d bypass capacity | Asia-heavy exposure | LNG relevance
```

### 4.2 三层一线

网站认知结构：

```text
Baseline layer    Hormuz 为什么重要？
Signal layer      现在有什么新证据？
Revision layer    Agent 如何从证据修订判断？
```

最终都落到一条线：

```text
baseline -> source -> evidence -> mechanism -> judgement delta -> target forecast -> checkpoint
```

## 5. 非目标

本项目不做：

- 全网新闻聚合器
- 实时 AIS 商业监控系统
- 交易建议系统
- 军事情报平台
- 通用宏观 dashboard
- LLM 调试日志展示页
- 复杂 GIS 产品

只做一件事：**让 reviewer 看懂 Agent 为什么改判。**

## 6. 信息契约

所有 UI 模块只能属于六类之一。

| 类型 | 含义 | 出现位置 |
| --- | --- | --- |
| Baseline | Hormuz 结构性事实锚点 | Overview |
| Fact | 来源给出的事实或数据 | Overview / Market / Forecast |
| Evidence | 对预测有方向性的证据 | Forecast |
| Mechanism | 证据影响判断的中间机制 | Forecast |
| Forecast | 情景概率或 target 判断 | Overview / Forecast |
| Watch | 下一次判断应等待的触发项 | Overview / Forecast |

如果一个模块不能归入这些类型，或者不能说明它会改变什么判断，就不进入主界面。

## 7. 页面结构

最终只保留三个顶层页面。

| 页面 | 只回答什么 | 保留内容 | 不允许出现 |
| --- | --- | --- | --- |
| Overview | 当前判断是什么？ | 主结论、scenario distribution、baseline strip、mini map、key status、Why not closure、next watch | 完整新闻表、完整 source 表、长机制解释 |
| Market | 市场是否已经定价？ | pricing pattern、data coverage、归一化跨资产图、分组 raw metrics | Agent 日志、航线细节、直接概率修订 |
| Forecast | Agent 为什么改判？ | revision headline、event stream、mechanism tags、old -> new delta、checkpoint、next watch | deterministic stepper、静态 scenario 长列表、debug log |

Routes 不再作为顶层页面。地理信息放在 Overview 的 mini map，或 Forecast 右侧的可展开 geo panel。Natural Earth 可作为静态地图底图；如果使用 OSM tiles，必须遵守 OSM tile usage policy，不能把官方 tile servers 当作无限量免费 CDN。

## 8. Scenario Definitions

四个 scenario 需要 operational，不只是 label。

```ts
export type ScenarioId = "normal" | "controlled" | "severe" | "closure";

export interface ScenarioDefinition {
  id: ScenarioId;
  label: string;
  oneLineMeaning: string;
  triggerConditions: string[];
  exitConditions: string[];
  observableSignals: string[];
  marketSignature: string[];
  maxReasonableProbabilityWithoutTrafficStop?: number;
}
```

建议定义：

| Scenario | Meaning | Trigger | Exit | Market signature |
| --- | --- | --- | --- | --- |
| normal | 通行和市场都接近常态 | advisory 降级、无新增事件、risk premium 回落 | 新通告或市场风险溢价上行 | oil flat/down、VIX flat、USD neutral |
| controlled | maritime/security risk 上行，但没有持续 closure-class traffic stop | fresh advisory、isolated incident、insurance/rerouting signal | N 天无新事件、advisory downgraded、premium fades | oil risk premium without broad closure shock |
| severe | 重复事件或官方限制开始实质影响通行 | verified traffic disruption、avoidance wording、insurance/freight nonlinear jump | flow recovers、official wording de-escalates | oil up + vol/risk-off broadening |
| closure | sustained closure-class traffic stop | verified halt/restriction、official closure/avoidance、multi-source confirmation | traffic restoration and official reopening | oil shock + VIX/equity/USD/rates stress |

示例约束：

- 在没有 verified traffic stop、official avoidance 或 closure-style market shock 前，`closure` 不能成为 base case。
- `controlled` 可以由 advisory、insurance、market risk premium 推高，但必须说明为什么不是 `severe` 或 `closure`。

## 9. 页面设计

### 9.0 视觉方向

视觉目标是 **light reviewer console**，不是深色作战室。

设计原则：

- 白色或近白背景，低饱和蓝色为唯一主强调色。
- 橙色/红色/绿色只用于 scenario、涨跌和告警语义。
- 顶部固定产品栏：logo、产品名、`Base case: Controlled disruption` badge、三页 tabs、右侧 notification/help/user icon。
- 主要模块使用白底卡片、1px 冷灰边框、轻阴影、8px radius。
- 不使用深色大背景、AI gradient、装饰性 glow。
- 图标优先使用 `lucide-react`，因为项目已安装；不要引入新 icon library。
- 页面宽度以 16:9 dashboard 为首要展示目标，移动端卡片纵向堆叠。
- 地图使用浅色静态 context map：淡蓝水域、浅灰/米色陆地、蓝色虚线航线和箭头。
- 数字使用 tabular nums。

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

Typography：

```text
Page title: 28-32px / 700
Section title: 16-18px / 650
Card title: 13-14px / 650
Body: 14px / 450
Caption: 12px / 450
Numbers: tabular-nums
```

字体保持 system UI / SF Pro / Segoe UI 路线，中文可读性优先。如果后续引入品牌字体，必须先验证中英文混排。

### 9.1 Overview

目标：10 秒内让 reviewer 知道当前判断。

必须展示：

- Base case，例如 `controlled`
- Scenario distribution
- Why not closure
- Hormuz baseline strip
- Mini map
- 2-3 个 key signals：maritime risk、traffic pressure、market pricing
- Next watch
- Current checkpoint：revision reason + checkpoint id

推荐布局：

```text
┌────────────────────────────┬────────────────────┬────────────────────┐
│ Current judgement           │ Scenario dist.      │ Why not closure     │
└────────────────────────────┴────────────────────┴────────────────────┘

┌───────────────────────────────────────────────┬──────────────────────┐
│ Hormuz case map + baseline strip               │ Next watch            │
│ ≈20 mb/d | 3.5-5.5 mb/d bypass | Asia exposure │ trigger cards         │
└───────────────────────────────────────────────┴──────────────────────┘

┌────────────────────┬────────────────────┬────────────────────┐
│ Maritime status     │ Market pricing      │ Source freshness    │
└────────────────────┴────────────────────┴────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ Current checkpoint: revision reason + checkpoint id + reused state    │
└──────────────────────────────────────────────────────────────────────┘
```

文案示例：

```text
Base case remains controlled disruption.
New maritime and market risk evidence raised transit_disruption_7d, but traffic and broad market signals do not yet support closure.
```

删除：

- 全局 forecast target dropdown
- 完整预测链
- 重复的 current judgement summary
- 多段机制解释

### 9.2 Market

目标：回答市场是否已经反映 Hormuz 风险。

Market 页展示 raw + normalized + interpretation 三层，但不直接改 scenario judgement。

推荐布局：

```text
┌────────────────────┬────────────────────┬────────────────────┐
│ Market read         │ Pricing pattern     │ Data coverage       │
└────────────────────┴────────────────────┴────────────────────┘

┌───────────────────────────────────────────────┬──────────────────────┐
│ Normalized cross-asset chart                   │ Legend + range        │
│ 7d / 30d / 90d                                  │ source chips          │
└───────────────────────────────────────────────┴──────────────────────┘

┌────────────────────┬────────────────────┬────────────────────┐
│ Energy metrics      │ Safe haven & FX     │ Risk/rates/vol      │
└────────────────────┴────────────────────┴────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ How to read: market signals are evidence, not direct forecast updates │
└──────────────────────────────────────────────────────────────────────┘
```

资产分组：

| 组 | 指标 |
| --- | --- |
| Energy | Brent, WTI |
| Safe haven & FX | Gold pending, Broad USD, USD/CNY, USD/CNH pending |
| Risk, rates & volatility | VIX, US10Y, S&P 500 |

`MarketRead` 应改为：

```ts
export interface MarketRead {
  title: string;
  summary: string;
  pricingPattern:
    | "not_pricing_hormuz"
    | "pricing_controlled_disruption"
    | "pricing_severe_disruption"
    | "pricing_closure_shock"
    | "mixed";
  evidenceIds: string[];
  caveat: string;
}
```

文案规则：

- Raw: Brent +x%、VIX flat/up、Broad USD mild up、S&P 500 flat/down。
- Interpretation: market is pricing disruption risk, not closure shock。
- Forecast effect: none directly; this becomes market evidence only if `judgement_updated` consumes it。

数据边界：

- `Broad USD` 优先使用 FRED `DTWEXBGS`，因为有可审计序列。
- `USD/CNY` 可使用 FRED；`USD/CNH` 没有稳定 source 前保持 pending。
- Gold 可以展示 schema；没有授权或稳定 daily source 前必须 pending。

### 9.3 Forecast

目标：展示 Agent 如何从旧判断修订到新判断。

阅读顺序固定为：

```text
旧判断 -> 新证据 -> mechanism -> 新判断 -> target deltas -> checkpoint -> 下一次观察
```

Forecast 是唯一展示 Agent 行为的页面。

推荐布局：

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Revision headline: old -> new + largest delta + reason               │
└──────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────┬─────────────────────────────────┐
│ Explanation graph                   │ Current state                   │
│ source -> evidence -> mechanism     │ scenario + targets + next watch │
│ -> judgement delta -> checkpoint    │                                 │
└────────────────────────────────────┴─────────────────────────────────┘

┌────────────────────────────────────┬─────────────────────────────────┐
│ Research stream                     │ Evidence/source inspector       │
│ human-readable progress cards       │ selected node details           │
└────────────────────────────────────┴─────────────────────────────────┘
```

必须展示：

- `source_read`：读了哪些固定信源，fresh / lagging / stale / missing / pending
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

Forecast 默认 Story mode，只展示最重要 revision path；Audit mode 再展开全部 evidence/source/checkpoint；Replay mode 按事件时间播放。

## 10. 数据模型

### 10.1 Forecast target

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

### 10.2 Mechanism tags

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

### 10.3 Target forecast

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

### 10.4 Source registry

`sourceRegistry.ts` 是事实边界入口。

```ts
export interface SourceRegistryItem {
  id: string;
  name: string;
  category: "official" | "market" | "maritime" | "conflict" | "news" | "pending";
  reliability: "high" | "medium" | "low";
  refreshCadence: string;
  expectedLatency: string;
  licenseStatus: "open" | "restricted" | "pending" | "unknown";
  caveat: string;
  pending: boolean;
  url?: string;
  parser?: string;
  owner?: string;
}
```

推荐 source 分类：

| 类型 | 来源 | 用途 |
| --- | --- | --- |
| Energy baseline | IEA, EIA | Hormuz 结构性重要性、替代路线能力、flow baseline |
| Maritime official | IMO hub, UKMTO, JMIC, MARAD | advisory、incident、shipping safety |
| Market | FRED, official exchange/rates sources, licensed vendors | Brent/WTI proxy、USD、rates、VIX、equity |
| Conflict context | ACLED, UCDP Candidate/GED | near-real-time context、回测、历史校验 |
| News | Reuters/AP/official statements | candidate evidence，不直接改概率 |

ACLED 更适合 near-real-time conflict context；UCDP Candidate/月更数据更适合校验和回测，不应替代 operational maritime layer。

### 10.5 SourceObservation and EvidenceClaim

```ts
export interface SourceObservation {
  observationId: string;
  sourceId: string;
  observedAt?: string;
  publishedAt?: string;
  retrievedAt: string;
  sourceUrl?: string;
  sourceHash?: string;
  title: string;
  summary: string;
  freshness: "fresh" | "lagging" | "stale" | "missing" | "pending";
  licenseStatus: "open" | "restricted" | "pending" | "unknown";
}

export interface EvidenceQuality {
  sourceReliability: "high" | "medium" | "low";
  freshness: "fresh" | "lagging" | "stale";
  corroboration: "single_source" | "multi_source" | "conflicting";
  directness: "direct" | "proxy" | "context";
}

export interface EvidenceClaim {
  evidenceId: string;
  sourceObservationIds: string[];
  claim: string;
  polarity: "support" | "counter" | "uncertain";
  affects: Array<"scenario" | "target" | "market" | "watchlist">;
  mechanismTags: MechanismTag[];
  confidence: "low" | "medium" | "high";
  quality: EvidenceQuality;
}
```

### 10.6 Agent event

当前 `AgentRunEvent` 已经有 `runId`、`sourceIds`、`evidenceId`、`mechanismTags`。下一版应补齐 event-level audit fields：

```ts
export interface AgentRunEventBase {
  eventId: string;
  runId: string;
  at: string;
  parentEventIds?: string[];
  evidenceIds?: string[];
  sourceObservationIds?: string[];
  retrievedAt?: string;
  sourceUrl?: string;
  sourceHash?: string;
  licenseStatus?: "open" | "restricted" | "pending" | "unknown";
}
```

核心规则：

1. **新闻不会直接改概率。**
2. **只有 `judgement_updated` 能改变预测状态。**
3. **每次 `judgement_updated` 必须解释 evidence -> mechanism -> forecast delta。**
4. **Pending source 不能生成 high-confidence live evidence。**

## 11. 系统构建建议

目标架构：

```text
Source registry
  -> Fetchers / adapters
  -> SourceObservation store
  -> Evidence extraction
  -> Mechanism mapper
  -> Forecast updater
  -> Checkpoint store
  -> AgentRunEvent stream
  -> UI renderer
```

职责边界：

- LLM 可以做 source summarization、claim extraction、mechanism tagging、reason text drafting。
- 概率更新不应完全交给 LLM；应使用 rule/scorecard/calibration constraints。
- Human reviewer 可以 accept / reject / needs corroboration。
- Forecast updater 输出必须包含 delta attribution。

建议接口：

```ts
export interface ForecastUpdateInput {
  previousState: ForecastState;
  evidenceClaims: EvidenceClaim[];
  marketRead: MarketRead;
  scenarioDefinitions: ScenarioDefinition[];
  calibrationConfig: CalibrationConfig;
}

export interface ForecastUpdateOutput {
  currentState: ForecastState;
  deltas: ForecastDelta[];
  revisionReason: string;
  sensitivity: string[];
}
```

## 12. 动态维护

每个 source 都必须有 freshness state：

```text
fresh       within expected cadence
lagging     missed one cadence
stale       missed multiple cadences
missing     fetch failed
pending     not authorized / not implemented
```

页面必须显示：

- as of
- last fetched / retrievedAt
- source status
- license caveat
- coverage gap

每次 run 应保存：

```text
previous checkpoint
source observations
evidence claims
mechanism assessments
judgement update
target deltas
new checkpoint
```

后续内部维护面板可以有：

- Source health
- Fetcher failures
- Parser diff
- Pending sources
- Stale evidence
- Run history
- Checkpoint history
- Manual annotation queue

这些不进入普通 reviewer 主界面。

## 13. Audit And Verification

现有：

```bash
npm run lint
npm run build
npm run audit:data
```

`audit:data` 已检查 FRED 点位、source id、pending 状态和 event contract。

建议扩展：

```text
audit:sources     检查 source registry、URL、license、pending 状态
audit:evidence    检查 evidence 是否有 sourceObservationIds
audit:forecast    检查 judgement_updated 是否解释 evidence -> mechanism -> delta
audit:ui          检查页面是否展示 pending caveat / as-of / source id
visual:regression Playwright 截图回归
```

验收标准：

- reviewer 10 秒内能知道当前主判断。
- Overview 显示 Hormuz baseline strip。
- Market 显示 pricing pattern，不直接改 forecast state。
- Forecast 显示 previous -> current revision headline。
- Forecast graph 默认只展示 highlighted revision path。
- 每个 pending 数据都有 caveat。
- `judgement_updated` 是唯一更新 scenario 或 target forecast 的事件。
- `checkpoint_written` 解释下一轮复用什么。
- 页面不展示 raw debug logs、chain-of-thought 或 internal prompts。

## 14. 当前落地状态

已同步的基座：

- `src/types/forecast.ts`：`ScenarioId`、`ForecastTarget`、`TargetForecast` 已按本设计收敛。
- `src/types/agentEvents.ts`：`AgentRunEvent` 使用 source/evidence/mechanism/judgement/checkpoint 事件模型。
- `src/state/forecastStore.ts`：mock run 使用机制标签、target deltas、checkpoint 和 pending source。
- `src/App.tsx`：顶层只保留 Overview / Market / Forecast；Routes 降级为 Overview mini map。
- `src/data/sourceRegistry.ts`：source category、reliability、pending、caveat 已成为事实边界。
- `scripts/audit-data.mjs`：检查 FRED 点位、source id、pending 状态和 event contract。

下一步应优先同步代码：

1. `MarketRead.supportsScenario` 改成 `pricingPattern`。
2. `SourceRegistryEntry` 加 `expectedLatency` 和 `licenseStatus`。
3. `AgentRunEvent` 加 `eventId`、`evidenceIds`、`sourceObservationIds`。
4. Forecast 首屏改成 revision headline + Story mode graph。
5. Overview 增加 case boundary strip 和 Why not closure。

## 15. 最终设计原则

这个 demo 的主角不是 Hormuz 新闻，也不是市场图表，而是：

**Agent 如何从新证据中提取机制信号，并把旧判断修订为新判断。**

页面最美的状态应该是：

```text
旧判断是什么
新证据是什么
影响了哪个机制
概率怎么变
跨资产 target 怎么变
下一轮看什么
```

只要这条线清楚，Hormuz 这个例子就成立。

## 16. Reference Sources

- [IEA Strait of Hormuz](https://www.iea.org/about/oil-security-and-emergency-response/strait-of-hormuz)
- [EIA Hormuz chokepoint note](https://www.eia.gov/todayinenergy/detail.php?id=65504)
- [FRED DTWEXBGS](https://fred.stlouisfed.org/series/DTWEXBGS)
- [FRED series observations API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html)
- [React Flow terms](https://reactflow.dev/learn/concepts/terms-and-definitions)
- [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility)
- [IMO Middle East / Strait of Hormuz hub](https://www.imo.org/en/mediacentre/hottopics/pages/middle-east-strait-of-hormuz.aspx)
- [MARAD U.S. Maritime Alerts](https://www.maritime.dot.gov/msci-alerts)
- [ACLED Data Export Tool](https://acleddata.com/conflict-data/data-export-tool)
- [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
