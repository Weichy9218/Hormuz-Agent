# Agent Visualization Design

Last updated: 2026-05-11

本文档定义 Hormuz Risk Intelligence Interface 如何把 `AgentRunEvent[]` 渲染成 reviewer 可读的解释界面。`docs/design.md` 是产品总纲；本文只规定 Forecast 页的 Agent 可视化、交互和审计边界。

产品不展示 raw logs、chain-of-thought、internal prompts 或泛化的 "agent is thinking" 动画。产品只展示：

```text
旧判断是什么 -> 新证据是什么 -> 影响哪个机制 -> 概率怎么变 -> target 怎么变 -> 下一轮看什么
```

## 1. Goal

Forecast 页必须回答：

> Why did the agent revise its judgement?

用户应该能在 10 秒内看见：

1. Previous judgement 和 Current judgement。
2. 新增或变 stale 的 evidence。
3. evidence 影响的 mechanism。
4. scenario 或 forecast target 的变化。
5. checkpoint 为下一轮留下的 state 和 next watch。

## 2. Primary View Modes

Forecast 页支持三种模式，但默认必须是 `Story mode`。

| Mode | 默认状态 | 目的 |
| --- | --- | --- |
| Story mode | 默认 | 只展示本轮最重要 revision path，控制在 6-9 个节点 |
| Audit mode | 用户展开 | 展开全部 source、observation、evidence、mechanism、checkpoint |
| Replay mode | 用户触发 | 按事件时间播放 `AgentRunEvent[]`，展示 state 何时发生变化 |

默认不展示完整图。完整图很容易变成 spaghetti graph，降低 reviewer 对核心修订原因的理解。

## 3. Forecast Layout

桌面端使用“先结论、再图、再事件流”的结构：

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Revision headline                                                     │
│ Previous: Controlled 52% -> Current: Controlled 58%                   │
│ Reason: Fresh maritime/market evidence raised transit-risk signal     │
└──────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────┬─────────────────────────────────┐
│ Explanation graph                   │ Current forecast state          │
│ old -> evidence -> mechanism        │ scenario distribution           │
│ -> delta -> checkpoint              │ target deltas + next watch      │
└────────────────────────────────────┴─────────────────────────────────┘

┌────────────────────────────────────┬─────────────────────────────────┐
│ Research stream                     │ Evidence/source inspector       │
│ readable cards, not logs            │ quality, caveats, provenance    │
└────────────────────────────────────┴─────────────────────────────────┘
```

移动端顺序：

```text
Revision headline
Current forecast state
Research stream
Explanation graph
Evidence/source inspector
Checkpoint
```

图在窄屏可以缩放，但 `fitView` 必须保证核心链条可见。

## 4. Core Visual Chain

Story mode 的核心链条：

```text
Previous judgement
  -> Source observation
  -> Evidence claim
  -> Mechanism
  -> Judgement delta
  -> Target forecast deltas
  -> Checkpoint + next watch
```

如果本轮 evidence 多于一条，默认只展开最大 delta attribution path，其余进入 Evidence Shelf。

Evidence Shelf 用于显示：

- counter evidence
- uncertain evidence
- stale evidence
- pending source caveat
- corroborating sources

## 5. Event-to-UI Mapping

| AgentRunEvent | Stream Card | Graph Node | State Update |
| --- | --- | --- | --- |
| `run_started` | RunStartedCard | none | set run status = running |
| `source_read` | SourceReadCard | SourceNode | no forecast state change |
| `evidence_added` | EvidenceCard | EvidenceNode + MechanismNode | no forecast state change |
| `judgement_updated` | JudgementUpdateCard | JudgementDeltaNode + TargetDeltaNodes | update scenario_distribution and targetForecasts |
| `checkpoint_written` | CheckpointCard | CheckpointNode | persist checkpoint + nextWatch |
| `run_completed` | RunCompletedCard | none | set run status = complete |

硬规则：

> Only `judgement_updated` can modify forecast state.

## 6. Event Schema Requirements

当前实现已有 `runId`、`evidenceId`、`sourceIds` 和 `mechanismTags`。为了达到可审计预测流水线，下一版事件模型应补齐：

```ts
interface AgentRunEventBase {
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

新增两个中间对象：

```ts
interface SourceObservation {
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

interface EvidenceClaim {
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

Evidence quality:

```ts
interface EvidenceQuality {
  sourceReliability: "high" | "medium" | "low";
  freshness: "fresh" | "lagging" | "stale";
  corroboration: "single_source" | "multi_source" | "conflicting";
  directness: "direct" | "proxy" | "context";
}
```

## 7. Card Design

### SourceReadCard

必须展示：

- source name
- source id
- status: fresh / lagging / stale / missing / pending
- reliability
- license or pending caveat
- retrievedAt / as-of

不展示：

- full raw source content
- crawler logs
- internal prompt or scratchpad

### EvidenceCard

必须展示：

- evidence summary
- evidence id
- polarity: support / counter / uncertain
- affects[]
- mechanismTags[]
- confidence
- evidence quality block
- source ids / sourceObservationIds
- timestamp

EvidenceCard 只登记候选证据，不直接修改概率。

### MechanismNode

必须展示：

- mechanism tag
- short mechanism explanation
- affected scenario or target
- triggering evidence ids

机制层是产品解释层，不等于内部 Agent implementation node。

### JudgementUpdateCard

必须展示：

- previous scenario distribution
- current scenario distribution
- scenario delta
- largest delta attribution
- reason
- target forecast deltas
- evidence ids and mechanism tags involved

JudgementUpdateCard 是 Forecast 页的视觉中心，也是唯一展示实际 forecast revision 的卡片。

### CheckpointCard

必须展示：

- checkpointId
- revisionReason
- summary
- nextWatch[]
- previous state reused next run
- newly added / removed / stale evidence summary

checkpoint_written 的输出会成为下一轮 previous state。

## 8. Graph Nodes

| Node | Shape | Content |
| --- | --- | --- |
| PreviousJudgementNode | compact card | previous base case and scenario distribution |
| SourceNode | small rectangle | source name、freshness、caveat |
| EvidenceNode | card | claim、polarity、confidence、quality |
| MechanismNode | pill/card | mechanism tag + short explanation |
| JudgementDeltaNode | large card | old -> new、largest delta |
| TargetForecastNode | small card group | Brent / VIX / Broad USD / risk targets |
| CheckpointNode | document card | checkpoint id、next watch |

Default Story mode graph should stay between 6 and 9 nodes. Audit mode can expand more nodes, but must support grouping by source and mechanism.

## 9. Edge Semantics

不要只靠颜色编码语义；同时使用 label、line style 或 icon。

| Edge type | Meaning | Visual rule |
| --- | --- | --- |
| provenance | source/observation produced evidence | thin grey, label `observed` |
| support | evidence supports movement | solid green, label `supports` |
| counter | evidence weakens movement | thin red, label `counters` |
| uncertain | evidence is relevant but not decisive | dashed amber, label `uncertain` |
| update | mechanism changed forecast state | solid blue, label `updates` |
| persist | checkpoint records reusable state | grey arrow, label `persists` |

React Flow / XYFlow implementation notes:

- Nodes and edges must be generated from `AgentRunEvent[]`, not hardcoded UI state.
- Node ids should use stable event/evidence/checkpoint ids.
- Edges must include source and target ids.
- Keep keyboard focus and screen-reader labels for nodes and controls.

## 10. Interactions

点击 stream card：

- highlight corresponding graph node。
- show affected mechanisms and targets。
- open inspector with source/evidence details。

点击 graph node：

- highlight matching stream card。
- highlight connected edges。
- populate inspector。

点击 judgement delta：

- show previous。
- show current。
- show delta。
- show reason。
- show evidence ids and mechanism tags involved。

点击 checkpoint：

- show checkpoint summary。
- show nextWatch。
- show what will be reused as previous state next run。

Replay mode：

- `source_read` 和 `evidence_added` 只能 append UI。
- `judgement_updated` 才触发 Current State 动画更新。
- error event 出现时必须停在 last valid checkpoint，不伪造 judgement update。

## 11. Empty / Loading / Error States

Empty：

- 展示 previous state。
- 展示 `Run forecast update` CTA。
- 展示 source boundary summary。

Running：

- stream cards incremental append。
- graph nodes incremental append。
- Current State 在 `judgement_updated` 前不改变。

Error：

- 展示 failed event。
- 展示 source or backend error。
- 展示 last valid checkpoint。
- 不伪造 judgement update。

Pending source：

- 显示 pending badge。
- 显示 caveat。
- 不生成 high-confidence evidence。
- 不作为 live market or flow evidence。

## 12. Product Boundary

Do not show：

- chain-of-thought
- raw model scratchpad
- raw debug traces
- internal prompt templates
- unverified news as final reason
- decorative "agent thinking" animation

Do show：

- evidence summary
- source ids / observation ids
- mechanism tags
- explicit reason for state update
- scenario delta and target deltas
- checkpoint revision reason
- pending / stale / license caveats

## 13. Acceptance Criteria

可视化实现只有在满足以下条件时才算完成：

1. Forecast 首屏显示 previous -> current revision headline。
2. Story mode 显示 `previous -> evidence -> mechanism -> judgement delta -> checkpoint`。
3. Evidence cards do not directly change forecast state。
4. `judgement_updated` 是唯一更新 scenario 或 target forecast 的事件。
5. Graph 从 `AgentRunEvent[]` 生成。
6. 点击任意 graph node 能映射回 stream card 或 inspector。
7. Checkpoint card 解释下一轮会复用什么。
8. Pending source 的 caveat 在 card、inspector 或 Current State 中可见。
9. 页面不展示 raw debug logs、chain-of-thought 或 internal prompts。
