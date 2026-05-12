# Hormuz Risk Intelligence Agent — Design

Last updated: 2026-05-12

唯一产品总纲。README 是入口，agent_visualization.md 只规定 Forecast 页可视化细节。本文件覆盖：产品定位、信息架构、页面设计、数据模型、source/data boundary、system architecture、evaluation。

每个 schema 块右上角标注落地状态：`[implemented]` / `[planned-P0|P1|P2]`。

---

## 1. 产品定位

**Hormuz Risk Intelligence Agent 是一个事件驱动的预测修订界面。**

它不是地缘政治新闻 dashboard、金融交易系统、AIS 实时监控系统或 LLM 调试台。目标是展示一个 *forecast agent* 如何把新的 Hormuz 相关证据转化为可审计的情景判断、跨资产判断和下一步观察项。

差异化命题：

> 这个界面不是展示霍尔木兹新闻，而是展示 Agent 如何把新证据转成可审计的风险判断修订。

## 2. 与 Forecast-Agent System 的关系

本仓库不是孤立的前端 demo，而是 forecast-agent system 的 reviewer-facing surface。上位系统参考 `galaxy-selfevolve`（FutureX）：batch + online forecast、task-scoped self-evolve、Brier/log-score 聚合。

| 维度 | galaxy-selfevolve (FutureX) | 本仓库 (Hormuz) |
| --- | --- | --- |
| 单位 | 多任务、多 horizon 的批量 prediction | 单一 case 的连续修订轨迹 |
| 评估视角 | 大样本 calibration、accuracy、skill self-evolve | 单 case 的 reason chain 是否站得住、是否可被审计回放 |
| 主要消费者 | 自动评测 pipeline | 人类 reviewer |
| 共享契约 | `evidence → mechanism → judgement → checkpoint` | 同 |

**为什么需要单 case 深度展示**：批量分数能告诉我们 Agent 平均多准，但不能告诉我们*这一次为什么改判*。Hormuz 这个 case 同时跨越能源/航运/避险/美元/风险资产，方向冲突，新闻噪声大，是检验"机制解释能力"和"revision trace quality"的高信号 case。

## 3. 唯一主问题

**当前 Hormuz 风险是否改变了跨资产判断？如果改变，是哪条新证据导致了这次修订？**

所有页面、组件、字段都必须服务这个问题。最终 reviewer 看懂的一条线：

```text
baseline -> source -> observation -> evidence -> mechanism -> judgement delta -> target forecast -> checkpoint -> next watch
```

原始 PDF 计划中的四模块顺序仍是产品主线：

```text
态势时间线 -> 关键指标面板 -> 机制解释链 -> 情景预测卡片
```

当前 UI 为了让 reviewer 先看结论，入口顺序调整为 `Overview / Market / News / Forecast`；但解释链路仍映射为 `News timeline -> Market key indicators -> Forecast mechanism graph -> Overview scenario cards`。这避免把 `controlled 54%` 这类单一概率放成无上下文主视觉，同时保留 case-room 的完整推理路径。

## 4. Case Narrative

### 4.1 Why Hormuz matters

产品级 baseline anchors（Overview 首屏必须可见）：

| Anchor | Product wording | Source boundary |
| --- | --- | --- |
| Oil flow | 近 20 mb/d petroleum liquids 经由 Hormuz | IEA / EIA 结构性 chokepoint baseline；不是当日 throughput |
| Bypass capacity | 替代出口路线能力约 3.5–5.5 mb/d | IEA public explainer；精确拆分必须绑定可审计原始表 |
| Exposure | Asia-heavy crude / product exposure + LNG relevance | 结构性解释，不写成未绑定实时数据 |
| Tail risk | closure 是尾部情景 | 需要 verified flow stop、official avoidance 或 closure-style market shock |

Overview baseline strip 文案模板：

```text
Why Hormuz matters
≈20 mb/d oil flows | 3.5-5.5 mb/d bypass capacity | Asia-heavy exposure | LNG relevance
```

### 4.2 三层叙事

```text
Baseline layer    Hormuz 为什么重要？
Signal layer      现在有什么新证据？
Revision layer    Agent 如何从证据修订判断？
```

## 5. 非目标

不做：全网新闻聚合器；实时 AIS 商业监控；交易建议；军事情报平台；通用宏观 dashboard；LLM 调试日志展示页；复杂 GIS。

只做一件事：**让 reviewer 看懂 Agent 为什么改判，以及历史上这次改判是否站得住。**

## 6. 信息契约

所有 UI 模块必须能归入下面六类之一，否则不进入主界面。

| 类型 | 含义 | 出现位置 |
| --- | --- | --- |
| Baseline | Hormuz 结构性事实锚点 | Overview |
| Fact | 来源给出的事实或数据 | Overview / Market / News / Forecast |
| Evidence | 对预测有方向性的证据 | News / Forecast |
| Mechanism | 证据影响判断的中间机制 | Forecast |
| Forecast | 情景概率或 target 判断 | Overview / Forecast |
| Watch | 下一次判断应等待的触发项 | Overview / Forecast |

## 7. 页面结构

顶层页面保持聚焦：Overview 先给判断，Market 解释市场定价，News 解释事件脉络如何进入 evidence pipeline，Forecast 展示 agent 为什么改判。

| 页面 | 只回答什么 | 保留内容 | 不允许 |
| --- | --- | --- | --- |
| Overview | 当前判断是什么？ | 主结论、scenario distribution、baseline strip、mini map、key status、Why not closure、next watch | 完整新闻表、完整 source 表、长机制解释 |
| Market | 市场是否已经定价？ | pricing pattern、data coverage、关键市场曲线、event-window move、分组 raw metrics | Agent 日志、航线细节、直接概率修订 |
| News | 事件脉络如何进入预测系统？ | timeline、source boundary、candidate evidence handoff | 全网新闻聚合、未经核验的 live 结论、直接概率修订 |
| Forecast | Agent 为什么改判？ | revision headline、event stream、mechanism tags、old → new delta、checkpoint、next watch | deterministic stepper、静态 scenario 长列表、debug log |

Routes 不再作为顶层页面。地理信息放在 Overview 的 mini map，或 Forecast 右侧的可展开 geo panel。Natural Earth 可作为静态底图；使用 OSM tiles 必须遵守 OSM tile usage policy。

## 8. Scenario Definitions `[planned-P0]`

四个 scenario 必须 operational，不只是 label。

```ts
export type ScenarioId = "normal" | "controlled" | "severe" | "closure";

export interface ScenarioDefinition {
  id: ScenarioId;
  label: string;
  oneLineMeaning: string;
  triggerConditions: string[];   // 推高此 scenario 的条件
  exitConditions: string[];      // 退出此 scenario 的条件
  observableSignals: string[];   // 可观测信号
  marketSignature: string[];     // 该 scenario 应在哪些资产留下指纹
  maxReasonableProbabilityWithoutTrafficStop?: number; // 上限（无 traffic stop 证据时）
}
```

建议定义：

| Scenario | Meaning | Trigger | Exit | Market signature | Max prob w/o traffic stop |
| --- | --- | --- | --- | --- | --- |
| normal | 通行和市场都接近常态 | advisory 降级、无新增事件、risk premium 回落 | 新通告或市场风险溢价上行 | oil flat/down、VIX flat、USD neutral | — |
| controlled | maritime/security risk 上行，但无持续 closure-class traffic stop | fresh advisory、isolated incident、insurance/rerouting signal | N 天无新事件、advisory downgraded、premium fades | oil risk premium without broad closure shock | — |
| severe | 重复事件或官方限制开始实质影响通行 | verified traffic disruption、avoidance wording、insurance/freight 非线性 jump | flow recovers、official wording de-escalates | oil up + vol / risk-off broadening | ≤ 0.30 |
| closure | sustained closure-class traffic stop | verified halt/restriction、official closure/avoidance、multi-source confirmation | traffic restoration + official reopening | oil shock + VIX / equity / USD / rates stress | ≤ 0.15 |

约束示例：

- 在没有 verified traffic stop、official avoidance 或 closure-style market shock 前，`closure` 不能成为 base case。
- `controlled` 可以由 advisory、insurance、market risk premium 推高，但必须解释为什么不是 `severe` 或 `closure`（**Why not closure** 段落）。

## 9. 页面设计

### 9.0 视觉方向

视觉目标是 **light reviewer console**，不是深色作战室。

- 白色或近白背景，低饱和蓝色为唯一主强调色。
- 橙/红/绿仅用于 scenario、涨跌和告警语义。
- 顶部固定产品栏：logo、产品名、`Base case: Controlled disruption` badge、四页 tabs、右侧 notification / help / user。
- 模块为白底卡片、1px 冷灰边框、轻阴影、8px radius。
- 不使用深色大背景、AI gradient、装饰性 glow。
- 图标优先使用 `lucide-react`（已安装），不引入新 icon library。
- 16:9 dashboard 为首要展示，移动端纵向堆叠。
- 地图使用浅色静态 context map：淡蓝水域、浅灰/米色陆地、蓝色虚线航线和箭头。
- 数字 tabular nums。

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
Page title:    28-32px / 700
Section title: 16-18px / 650
Card title:    13-14px / 650
Body:          14px / 450
Caption:       12px / 450
Numbers:       tabular-nums
```

字体保持 system UI / SF Pro / Segoe UI；中文可读性优先。引入品牌字体前必须验证中英文混排。

### 9.1 Overview

10 秒内让 reviewer 知道当前判断。

必须展示：
- Base case（如 `controlled`）
- Scenario distribution
- **Why not closure** 解释卡
- Hormuz baseline strip `[P0]`
- Mini map
- 2-3 个 key signals：maritime risk、traffic pressure、market pricing
- Next watch
- Current checkpoint：revision reason + checkpoint id

2026-05-12 cold-cache reviewer pass 的排序决策：

- 首屏必须压缩成 `revision brief / scenario state / why-not-closure + next watch`，让 reviewer 先判断当前 update 是否站得住。
- `Why not closure` 不能只列反证；必须同时显示 missing condition、pending source caveat、guardrail 或 counter evidence。
- Hormuz baseline strip 与 map 属于判断锚点，应排在内部 workflow 说明之前。
- `Case room 工作流` 只是解释 PDF 计划如何映射到当前四页，不能早于 baseline、map、checkpoint。

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
New maritime and market risk evidence raised transit_disruption_7d, but
traffic and broad market signals do not yet support closure.
```

删除：全局 forecast target dropdown；完整预测链；重复的 current judgement summary；多段机制解释。

### 9.2 Market

回答：市场是否已经反映 Hormuz 风险。

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
| Safe haven & FX | Gold `[pending]`, Broad USD, USD/CNY, USD/CNH `[pending]` |
| Risk, rates & volatility | VIX, US10Y, S&P 500 |

`MarketRead` schema `[planned-P0]`：

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
  evidenceIds: string[];  // 该 read 能映射到的 EvidenceClaim
  caveat: string;
}
```

**注意**：替换 `supportsScenario` 是 P0 改名；理由是 `supportsScenario` 在语义上暗示 Market 在直接投票给 scenario，违反"Market 只能作为 evidence 输入"的硬规则。`pricingPattern` 描述市场自己的定价状态，不直接绑定 scenario。

文案规则：
- Raw 必须区分 level move 与 event-window move。例如：Brent 相对 3 月仍有 elevated level，但 2026-04-07 之后 cross-asset stress 可能回落。
- Interpretation：若 oil level premium 与 VIX / USD / SPX event-window stress 冲突，`pricingPattern` 应为 `mixed`，文案写成 "risk premium remains, closure shock is not priced"。
- Forecast effect：none directly；仅当 `judgement_updated` 消费它时才生效。

数据边界：
- `Broad USD` 优先使用 FRED `DTWEXBGS`，有可审计序列。
- `USD/CNY` 可用 FRED；`USD/CNH` 无稳定 source 前 pending。
- Gold 可展示 schema；无授权/稳定 daily source 前必须 pending。

### 9.3 Forecast

阅读顺序固定：

```text
旧判断 -> 新证据 -> mechanism -> 新判断 -> target deltas -> checkpoint -> 下一次观察
```

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Revision headline: old -> new + largest delta + reason               │
└──────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────┬─────────────────────────────────┐
│ Explanation graph (Story mode)      │ Current state                   │
│ source -> evidence -> mechanism     │ scenario + targets + next watch │
│ -> judgement delta -> checkpoint    │                                 │
└────────────────────────────────────┴─────────────────────────────────┘

┌────────────────────────────────────┬─────────────────────────────────┐
│ Research stream                     │ Evidence/source inspector       │
│ human-readable progress cards       │ selected node details           │
└────────────────────────────────────┴─────────────────────────────────┘
```

必须展示：`source_read`（fresh/lagging/stale/missing/pending）、`evidence_added`（含 polarity）、`mechanismTags`、`judgement_updated`（old→new + 概率 delta）、`targetDeltas`、`checkpoint_written`（revision reason + next watch）。

不展示：底层 prompt；chain-of-thought；纯 debug log；固定 stepper 动画；和 Overview 重复的大段当前判断。

三种模式（默认 Story mode）：详见 `agent_visualization.md`。

2026-05-12 cold-cache reviewer pass 的布局决策：

- Forecast 首屏主体必须优先显示 Story-mode Evidence graph；`Sense / Interpret / Revise / Persist` 是 contract strip，不应放在 graph 之前。
- 运行阶段卡可以保留，但它服务教学和系统边界，不是 "Why did the agent revise?" 的主要答案。
- `Current state` 侧栏应与 graph 同屏出现，帮助 reviewer 一边看链路一边核对 scenario / target / checkpoint。

## 10. 数据模型

### 10.1 Forecast target `[implemented]`

```ts
export type ForecastTarget =
  | "brent" | "wti" | "gold"
  | "broad_usd" | "usd_cny" | "usd_cnh"
  | "vix" | "us10y" | "sp500"
  | "regional_escalation_7d"
  | "transit_disruption_7d"
  | "state_on_state_strike_14d"
  | "deescalation_signal_14d";
```

不单独定义 `WarTrend` 枚举；战争趋势作为可预测 target。

### 10.2 Mechanism tags `[implemented]`

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

### 10.3 Target forecast `[implemented]`

```ts
export interface TargetForecast {
  target: ForecastTarget;
  horizon: "24h" | "7d" | "14d" | "30d";
  direction: "up" | "down" | "flat" | "uncertain";
  confidence: number;     // 0-1
  deltaLabel: string;
  rationale: string;
  sourceIds: string[];
}
```

### 10.4 Source registry `[implemented, partial]`

```ts
export interface SourceRegistryItem {
  id: string;
  name: string;
  category: "official" | "market" | "maritime" | "conflict" | "news" | "pending";
  reliability: "high" | "medium" | "low";
  refreshCadence: string;
  expectedLatency: string;      // [planned-P1]
  licenseStatus: "open" | "restricted" | "pending" | "unknown"; // [planned-P1]
  caveat: string;
  pending: boolean;
  url?: string;
  parser?: string;
  owner?: string;
}
```

推荐分类：

| 类型 | 来源 | 用途 |
| --- | --- | --- |
| Energy baseline | IEA, EIA | Hormuz 结构性重要性、替代路线能力、flow baseline |
| Maritime official | IMO hub, UKMTO, JMIC, MARAD | advisory、incident、shipping safety |
| Market | FRED, official exchange/rates, licensed vendors | Brent/WTI proxy、USD、rates、VIX、equity |
| Conflict context | ACLED, UCDP Candidate/GED | near-real-time context、回测、历史校验 |
| News | Reuters/AP/official statements | candidate evidence，不直接改概率 |

ACLED 适合 near-real-time conflict context；UCDP Candidate / 月更数据适合校验和回测，不替代 operational maritime layer。

### 10.5 SourceObservation 与 EvidenceClaim `[planned-P1]`

```ts
export interface SourceObservation {
  observationId: string;
  sourceId: string;
  observedAt?: string;
  publishedAt?: string;
  retrievedAt: string;
  sourceUrl?: string;
  sourceHash?: string;          // 抓取内容 hash，用于回放与去重
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

### 10.6 Agent event `[implemented, schema-expansion planned-P1]`

当前 `AgentRunEvent` 已有 `runId`、`sourceIds`、`evidenceId`、`mechanismTags`。下一版（P1）必须补齐 event-level audit fields：

```ts
export interface AgentRunEventBase {
  eventId: string;                      // 稳定唯一 id（用于 graph node 与 replay 锚点）
  runId: string;
  at: string;
  parentEventIds?: string[];            // 显式 DAG 边
  evidenceIds?: string[];
  sourceObservationIds?: string[];
  retrievedAt?: string;
  sourceUrl?: string;
  sourceHash?: string;
  licenseStatus?: "open" | "restricted" | "pending" | "unknown";
}
```

`parentEventIds` 为什么显式存：`judgement_updated` 同时引用 evidence、mechanism、previous judgement、market read，多源父节点用隐式推导会丢失边，replay 与 revision trace quality 都需要确定性 DAG。

核心规则：

1. 新闻不会直接改概率。
2. 只有 `judgement_updated` 能改变 forecast state。
3. 每次 `judgement_updated` 必须解释 evidence → mechanism → forecast delta。
4. Pending source 不能生成 high-confidence live evidence。

### 10.7 Checkpoint `[implemented, schema-expansion planned-P1]`

```ts
export interface ForecastCheckpoint {
  checkpointId: string;
  runId: string;
  writtenAt: string;
  revisionReason: string;
  previousScenario: Record<ScenarioId, number>;
  currentScenario: Record<ScenarioId, number>;
  reusedState: {                         // [planned-P1]
    activeEvidenceIds: string[];
    staleEvidenceIds: string[];
    pendingSourceIds: string[];
  };
  deltaAttribution: Array<{              // [planned-P1]
    target: "scenario" | ForecastTarget;
    contributingEvidenceIds: string[];
    contributingMechanismTags: MechanismTag[];
    direction: "up" | "down" | "flat";
  }>;
  nextWatch: string[];
}
```

## 11. System Architecture

```text
Source registry
  -> Fetchers / adapters
  -> SourceObservation store              (append-only, sourceHash 索引)
  -> Evidence extraction (LLM + rule)
  -> Mechanism mapper                     (rule / scorecard)
  -> Forecast updater                     (rule + calibration-constrained LLM)
  -> Checkpoint store                     (append-only)
  -> AgentRunEvent stream                 (UI 数据源)
  -> UI renderer
```

职责边界：

- **LLM 可以做**：source summarization、claim extraction、mechanism tagging、reason text drafting。
- **LLM 不应单独做**：概率更新。概率更新必须受 rule / scorecard / calibration constraints 约束，且产出 delta attribution。
- **Human reviewer**：accept / reject / needs corroboration。
- **Forecast updater 输出**：必须包含 delta attribution，否则 `judgement_updated` 视为非法。

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
  sensitivity: string[];            // 哪些 evidence 一旦 retract / counter，会推翻本次 update
}
```

## 12. Source Freshness & Maintenance

```text
fresh       within expected cadence
lagging     missed one cadence
stale       missed multiple cadences
missing     fetch failed
pending     not authorized / not implemented
```

页面必须显示：as of；last fetched / retrievedAt；source status；license caveat；coverage gap。

每次 run 必须保存：previous checkpoint；source observations；evidence claims；mechanism assessments；judgement update；target deltas；new checkpoint。

内部维护面板（不进入 reviewer 主界面）：source health、fetcher failures、parser diff、pending sources、stale evidence、run history、checkpoint history、manual annotation queue。

## 13. Evaluation

Evaluation 不只是"预测准不准"，包含三层。下面这套指标是把 *batch eval*（FutureX style）和 *trace audit*（本系统独有）结合的最小集合。

### 13.1 Forecast accuracy（与 FutureX / galaxy-selfevolve 共享）

对每个被解析的 `ForecastTarget` × `horizon`：

| 指标 | 定义 | 计算前提 |
| --- | --- | --- |
| **Brier score** | binary / categorical target 的平方损失均值 | target 已 resolved |
| **Log score** | 对真实结果的对数概率 | target 已 resolved，概率非 0/1 |
| **Directional accuracy** | up/down/flat 与真实方向一致率 | resolved + 阈值定义清晰 |
| **Calibration** | predicted-prob 分桶 vs 实际频率 | 多 case 聚合，本仓库单 case 仅展示个例 |

`closure`、`severe`、`transit_disruption_7d` 是高价值评估 target。本仓库单 case 不能产出 calibration 曲线，但必须输出 *单点 prediction record*（probability、timestamp、resolved outcome、evidence ids），让 batch 系统聚合。

### 13.2 Revision trace quality（本系统特有，FutureX 没有的能力）

只有当 schema 完整时才能算。每次 `judgement_updated` 评分：

| 指标 | 定义 | 红线 |
| --- | --- | --- |
| **Attribution completeness** | judgement_updated 是否引用 ≥1 evidence + ≥1 mechanism | 缺一即 fail |
| **Evidence groundedness** | 每个 evidence 是否绑定 ≥1 sourceObservationId 且 source 非 pending | pending → low-confidence |
| **Mechanism coverage** | 修订方向是否能由 mechanismTags 解释（rule check） | 方向与 mechanism 矛盾 → fail |
| **Counter-evidence handling** | 若存在 counter evidence，是否在 reason 或 sensitivity 中显式提及 | 忽略 counter → flag |
| **Revision stability** | 同一 unresolved question 多次 checkpoint 间的 probability 抖动是否被 evidence 解释 | 大幅修订无新证据 → flag |
| **Replay determinism** | 给定 (previousState, evidenceClaims, marketRead, calibrationConfig)，currentState 是否可复现 | 不可复现 → fail |

### 13.3 Historical replay & online validation

- **Historical replay** `[planned-P2]`：固定 `retrievedAt` 截断，喂入历史 `SourceObservation`，复跑 forecast pipeline，比较产出的 checkpoint 链是否与生产链一致（或解释差异）。`sourceHash` 只有在存在真实内容 digest 时才作为 replay 锚点；否则不填。
- **Online validation** `[planned-P2]`：unresolved question（如 `transit_disruption_7d`）在 horizon 到达后用真实数据解析，写回 Brier / log / directional。
- **Drift watch**：同一 case 上同一 question 跨 checkpoint 的 probability 轨迹必须保存。突变（>X pp 单步）若没有对应 high-quality evidence，标记为 *suspicious revision*。

### 13.4 Audit scripts

现有：`npm run lint`、`npm run build`、`npm run audit`。

建议扩展：

```text
audit:data        source registry、FRED 展示点位、pending 数据边界
audit:evidence    evidence 是否有 sourceObservationIds，质量字段完整
audit:forecast    judgement_updated 是否引用 evidence + mechanism，方向一致
audit:replay      同一 canonical inputs 多次复跑是否产出一致 replay-sensitive outputs
audit:legacy      防止旧版字段、旧 pipeline、obsolete schema 回流
audit:ui          页面是否展示 pending caveat / as-of / source id
visual:regression Playwright 截图回归
```

### 13.5 验收标准

- reviewer 10 秒内能知道当前主判断。
- Overview 显示 Hormuz baseline strip。
- Market 显示 pricing pattern，不直接改 forecast state。
- Forecast 显示 previous → current revision headline。
- Forecast graph 默认只展示 highlighted revision path。
- 每个 pending 数据都有 caveat。
- `judgement_updated` 是唯一更新 scenario 或 target forecast 的事件。
- `checkpoint_written` 解释下一轮复用什么。
- 页面不展示 raw debug logs、chain-of-thought 或 internal prompts。
- 每次 `judgement_updated` 能通过 §13.2 红线检查。

## 14. 当前落地状态

| 模块 | 状态 |
| --- | --- |
| `src/types/forecast.ts`（ScenarioId、ForecastTarget、TargetForecast） | `[implemented]` |
| `src/types/agentEvents.ts`（AgentRunEvent + MechanismTag） | `[implemented]` |
| `src/state/forecastStore.ts`（mock run with mechanism / target deltas / checkpoint / pending source） | `[implemented]` |
| `src/App.tsx`（顶层四页 Overview / Market / News / Forecast；Routes 降级为 mini map） | `[implemented]` |
| `src/data/sourceRegistry.ts`（category / reliability / pending / caveat） | `[implemented]` |
| `scripts/audit-data.mjs` | `[implemented]` |
| `scripts/audit-evidence.mjs` | `[implemented]` |
| `scripts/audit-forecast.mjs` | `[implemented]` |
| `scripts/audit-replay.mjs` | `[implemented]` |
| `scripts/audit-legacy.mjs` | `[implemented]` |

下一步代码同步（按 P0 → P1 优先级）：

1. Forecast Replay-mode UI：按 `AgentRunEvent[]` 播放状态变化。`[P1]`
2. `audit:ui`：检查 pending caveat、as-of、source id 是否可见。`[P1]`
3. 将 sampled FRED 点位替换为 audited one-year fixture。`[P1]`
4. 接入 galaxy-selfevolve 输出 artifact 作为 read-only fixture。`[P2]`
5. Historical replay + online validation pipeline。`[P2]`

## 15. 最终设计原则

> Agent 如何从新证据中提取机制信号，把旧判断修订为新判断，并把这一切留存为可被复现、可被打分的轨迹。

页面最美的状态：

```text
旧判断是什么
新证据是什么
影响了哪个机制
概率怎么变
跨资产 target 怎么变
下一轮看什么
```

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
