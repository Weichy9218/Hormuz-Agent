# Agent Visualization Design

Last updated: 2026-05-11

本文档只规定 Forecast 页如何把 `AgentRunEvent[]` 渲染成 reviewer 可读、可审计的解释界面。产品总纲、数据模型、evaluation 见 [docs/design.md](./design.md)。

产品不展示 raw logs、chain-of-thought、internal prompts 或泛化的 "agent is thinking" 动画。产品只展示：

```text
旧判断是什么 -> 新证据是什么 -> 影响哪个机制 -> 概率怎么变 -> target 怎么变 -> 下一轮看什么
```

## 1. Goal

Forecast 页回答唯一问题：

> Why did the agent revise its judgement?

用户应在 10 秒内看见：

1. Previous judgement 与 current judgement。
2. 新增或转 stale 的 evidence。
3. evidence 影响的 mechanism。
4. scenario 或 forecast target 的变化。
5. checkpoint 为下一轮留下的 state 与 next watch。

可视化同时服务 `design.md §13.2` 的 **revision trace quality** 评估：reviewer 在界面上看见的内容，就是 audit pipeline 在 schema 上能算出来的内容。两者一致是硬约束。

## 2. View Modes

| Mode | 默认状态 | 目的 |
| --- | --- | --- |
| Story mode | 默认 | 只展示本轮最重要 revision path，控制在 6-9 个节点 |
| Audit mode | 用户展开 | 展开全部 source、observation、evidence、mechanism、checkpoint |
| Replay mode | 用户触发 | 按事件时间播放 `AgentRunEvent[]`，展示 state 何时发生变化；锚点是 `eventId` + `retrievedAt`，有真实内容 digest 时再加入 `sourceHash` |

默认不展示完整图。完整图易变 spaghetti graph，降低 reviewer 对核心修订原因的理解。

## 3. Forecast Layout

桌面端"先结论、再图、再事件流"：

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

2026-05-12 reviewer pass 明确：Story-mode graph 是 Forecast 首屏主体。任何 `Sense / Interpret / Revise / Persist` 阶段说明只能作为 graph 之后的 contract strip，不能把 evidence chain 推到首屏外。

移动端顺序：

```text
Revision headline
Current forecast state
Explanation graph
Evidence shelf
Research stream
Evidence/source inspector
Checkpoint
```

图在窄屏可缩放，`fitView` 必须保证核心链条可见。

## 4. Core Visual Chain

Story mode 核心链：

```text
Previous judgement
  -> Source observation
  -> Evidence claim
  -> Mechanism
  -> Judgement delta
  -> Target forecast deltas
  -> Checkpoint + next watch
```

如果本轮 evidence >1 条，默认只展开 *最大 delta attribution path*；其余进入 **Evidence Shelf**：

- counter evidence
- uncertain evidence
- stale evidence
- pending source caveat
- corroborating sources

Evidence Shelf 在 Story mode 下折叠为一行 chip，点击展开。Audit mode 默认展开。

## 5. Event-to-UI Mapping

| AgentRunEvent | Stream Card | Graph Node | State Update |
| --- | --- | --- | --- |
| `run_started` | RunStartedCard | — | set run status = running |
| `source_read` | SourceReadCard | SourceNode | no forecast state change |
| `evidence_added` | EvidenceCard | EvidenceNode + MechanismNode | no forecast state change |
| `judgement_updated` | JudgementUpdateCard | JudgementDeltaNode + TargetDeltaNodes | update `scenario_distribution` + `targetForecasts` |
| `checkpoint_written` | CheckpointCard | CheckpointNode | persist checkpoint + nextWatch |
| `run_completed` | RunCompletedCard | — | set run status = complete |

硬规则：

> Only `judgement_updated` can modify forecast state.

## 6. Event Schema Requirements

数据 schema 由 `design.md §10` 定义。可视化只对其中以下字段有强依赖：

- `eventId`：graph node 稳定 id、replay 锚点。
- `parentEventIds`：构造 DAG 边、解释 attribution。
- `evidenceIds` / `sourceObservationIds`：点击 graph node → inspector 反查。
- `retrievedAt` / `licenseStatus`：inspector 显示 provenance 与 caveat；`sourceHash` 只有在存在真实 `sha256:<64 hex>` 内容 digest 时才显示。

若这些字段缺失，Story mode 仍可渲染，但 Audit mode 与 Replay mode 不可信。可视化层不允许伪造缺失字段。

## 7. Card Design

### SourceReadCard

必须展示：source name；source id；status（fresh / lagging / stale / missing / pending）；reliability；license / pending caveat；`retrievedAt` 或 as-of。

不展示：raw source content；crawler logs；internal prompt 或 scratchpad。

### EvidenceCard

必须展示：evidence summary；evidenceId；polarity（support / counter / uncertain）；affects[]；mechanismTags[]；confidence；evidence quality block（reliability / freshness / corroboration / directness）；sourceIds / sourceObservationIds；timestamp。

EvidenceCard 只登记候选证据，**不直接修改概率**。

### MechanismNode

必须展示：mechanism tag；short mechanism explanation；affected scenario 或 target；triggering evidenceIds。

机制层是产品解释层，不等于内部 agent implementation node。

### JudgementUpdateCard（视觉中心）

必须展示：previous scenario distribution；current scenario distribution；scenario delta；largest delta attribution；reason；target forecast deltas；涉及的 evidenceIds 与 mechanismTags；可选 sensitivity（若该 evidence 被 retract / counter，update 是否会被推翻）。

### CheckpointCard

必须展示：checkpointId；revisionReason；summary；nextWatch[]；下一轮 reused state（active / stale evidence、pending sources）；新增 / 移除 / 转 stale 的 evidence 摘要。

`checkpoint_written` 的输出会成为下一轮 previous state，是 *historical replay* 的状态锚点。

## 8. Graph Nodes

| Node | Shape | Content |
| --- | --- | --- |
| PreviousJudgementNode | compact card | previous base case + scenario distribution |
| SourceNode | small rectangle | source name、freshness、caveat |
| EvidenceNode | card | claim、polarity、confidence、quality |
| MechanismNode | pill / card | mechanism tag + short explanation |
| JudgementDeltaNode | large card | old → new、largest delta |
| TargetForecastNode | small card group | Brent / VIX / Broad USD / risk targets |
| CheckpointNode | document card | checkpoint id、next watch |

Story mode graph 默认 6-9 节点。Audit mode 可扩展，但必须支持按 source 与 mechanism 分组折叠。

## 9. Edge Semantics

不要只靠颜色编码语义；同时使用 label、line style 或 icon。

| Edge type | Meaning | Visual rule |
| --- | --- | --- |
| provenance | source / observation 产生 evidence | thin grey, label `observed` |
| support | evidence 推动判断变化 | solid green, label `supports` |
| counter | evidence 削弱判断变化 | thin red, label `counters` |
| uncertain | evidence 相关但不决定 | dashed amber, label `uncertain` |
| update | mechanism 改变 forecast state | solid blue, label `updates` |
| persist | checkpoint 留存可复用 state | grey arrow, label `persists` |

React Flow / XYFlow 实现：

- Nodes 与 edges 必须从 `AgentRunEvent[]` 生成，不允许 hardcode。
- Node id 使用稳定 `eventId` / `evidenceId` / `checkpointId`。
- Edges 必须包含 source 和 target id；优先从 `parentEventIds` 构造。
- Keyboard focus 与 screen-reader labels 是 P0 不是 nice-to-have。

## 10. Interactions

**点击 stream card**：highlight 对应 graph node；显示影响的 mechanism 与 target；inspector 显示 source / evidence 详情。

**点击 graph node**：highlight 对应 stream card；高亮相连 edges；inspector 显示节点详情。

**点击 judgement delta**：显示 previous / current / delta / reason / 涉及 evidenceIds 与 mechanismTags。

**点击 checkpoint**：显示 checkpoint summary、nextWatch、下一轮 reused state。

**Replay mode**：

- `source_read` 与 `evidence_added` 只 append UI，不更新 forecast state。
- `judgement_updated` 才触发 Current State 动画更新。
- error event 出现时停在 last valid checkpoint，**不伪造 judgement update**。

## 11. Empty / Loading / Error States

**Empty**：展示 previous state；`Run forecast update` CTA；source boundary summary。

**Running**：stream cards 增量 append；graph nodes 增量 append；Current State 在 `judgement_updated` 前不变。

**Error**：展示 failed event；展示 source 或 backend error；展示 last valid checkpoint；**不伪造 judgement update**。

**Pending source**：pending badge；caveat；不生成 high-confidence evidence；不作为 live market 或 flow evidence。

## 12. Optional Audit-Mode Disclosures

下列内容默认 *不* 出现在 reviewer 主界面；仅在 Audit mode、且用户主动展开时显示，用于可视化层与 audit pipeline 对齐。

| 项 | 用途 | 显示位置 |
| --- | --- | --- |
| `sourceHash`、`retrievedAt`、`sourceUrl` | replay 与 provenance | Inspector 折叠区 |
| `parentEventIds` DAG | 验证 attribution completeness | Audit mode graph 边的 hover |
| `sensitivity[]` | counter / retract 时 update 是否会被推翻 | JudgementUpdateCard 折叠区 |
| previous → current per-target Brier / log score（resolved 情况下） | 单点 prediction record | Inspector |

仍然 **不** 展示的：内部 prompt 模板、chain-of-thought、raw model scratchpad、未经清洗的 debug log。

## 13. Acceptance Criteria

可视化只有在以下条件都满足时才算完成：

1. Forecast 首屏显示 previous → current revision headline。
2. Story mode 显示 `previous -> evidence -> mechanism -> judgement delta -> checkpoint`。
3. Evidence cards 不直接改 forecast state。
4. `judgement_updated` 是唯一更新 scenario 或 target forecast 的事件。
5. Graph 从 `AgentRunEvent[]` 生成；node id 等于事件 / evidence / checkpoint id。
6. 点击任意 graph node 能映射回 stream card 或 inspector。
7. Checkpoint card 解释下一轮会复用什么。
8. Pending source caveat 在 card、inspector 或 Current State 中可见。
9. 页面不展示 raw debug logs、chain-of-thought 或 internal prompts。
10. 每个 `judgement_updated` 在 UI 上能看见 `design.md §13.2` 红线所要求的内容（evidence + mechanism + 方向解释 + counter-evidence 处理）。
