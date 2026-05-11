# Agent Visualization Design

Last updated: 2026-05-11

本文档定义 Hormuz Risk Intelligence Interface 如何可视化 Agent 行为。`docs/design.md` 仍是产品总纲；本文只规定 Forecast 页如何把 AgentRunEvent[] 转成 reviewer 可读的解释界面。

产品不展示 raw logs、chain-of-thought、internal prompts 或泛化的 "agent is thinking" 动画。产品只展示新证据如何改变 forecast state。

核心视觉链：

```text
source -> evidence -> mechanism -> judgement_updated -> checkpoint
```

## 1. Goal

Forecast 页必须回答：

> Why did the agent revise its judgement?

用户应该能看见：

1. 读了什么 source。
2. 新增了什么 evidence。
3. evidence 影响了哪个 mechanism。
4. 哪个 scenario 或 forecast target 改变了。
5. checkpoint 为下一轮留下了什么。

## 2. Layout

桌面端使用三栏布局：

```text
┌────────────────────┬───────────────────────────┬──────────────────────┐
│ Research Stream     │ Evidence Graph             │ Current State         │
│ event cards         │ React Flow graph            │ scenario + targets    │
│                     │ source -> evidence -> ...   │ next watch            │
└────────────────────┴───────────────────────────┴──────────────────────┘
```

左栏：Research Stream

- 按时间展示 AgentRunEvent。
- 卡片必须是用户可读的 research progress，不是 debug log。
- 包含 SourceReadCard、EvidenceCard、JudgementUpdateCard、CheckpointCard。

中栏：Evidence Graph

- 用 React Flow 实现只读 explanation graph。
- 节点包括 SourceNode、EvidenceNode、MechanismNode、JudgementDeltaNode、CheckpointNode。
- 边表达 source/evidence/mechanism/judgement/checkpoint 的因果关系。

右栏：Current State

- 展示最新 scenario_distribution。
- 展示 largest scenario delta。
- 展示 target forecast changes。
- 展示 checkpoint id、revisionReason、nextWatch。

## 3. Event-to-UI Mapping

| AgentRunEvent | Stream Card | Graph Node | State Update |
| --- | --- | --- | --- |
| `run_started` | RunStartedCard | none | set run status = running |
| `source_read` | SourceReadCard | SourceNode | no forecast state change |
| `evidence_added` | EvidenceCard | EvidenceNode + MechanismNode | no forecast state change |
| `judgement_updated` | JudgementUpdateCard | JudgementDeltaNode | update scenario_distribution and targetForecasts |
| `checkpoint_written` | CheckpointCard | CheckpointNode | persist checkpoint + nextWatch |
| `run_completed` | RunCompletedCard | none | set run status = complete |

硬规则：

Only `judgement_updated` can modify forecast state.

## 4. Card Design

### SourceReadCard

必须展示：

- source name
- source id
- status: fresh / lagging / missing / pending
- caveat
- timestamp

不展示：

- full raw source content
- crawler logs

### EvidenceCard

必须展示：

- evidence summary
- polarity: support / counter / uncertain
- affects[]
- mechanismTags[]
- confidence
- source ids
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
- reason
- target forecast deltas

JudgementUpdateCard 是 Forecast 页的视觉中心，也是唯一展示实际 forecast revision 的卡片。

### CheckpointCard

必须展示：

- checkpointId
- revisionReason
- summary
- nextWatch[]

checkpoint_written 的输出会成为下一轮 previous state。

## 5. Graph Behavior

graph 在一次 run 内 append-only。

当 `source_read` 到达：

- 添加 SourceNode。
- 高亮对应 stream card。

当 `evidence_added` 到达：

- 添加 EvidenceNode。
- 为每个 mechanismTag 添加或复用 MechanismNode。
- 连接 SourceNode -> EvidenceNode。
- 连接 EvidenceNode -> MechanismNode。

当 `judgement_updated` 到达：

- 添加 JudgementDeltaNode。
- 连接相关 MechanismNode -> JudgementDeltaNode。
- Current State panel 动画更新 scenario delta。

当 `checkpoint_written` 到达：

- 添加 CheckpointNode。
- 连接 JudgementDeltaNode -> CheckpointNode。
- 更新 nextWatch。

## 6. Edge Semantics

| Polarity | Edge meaning |
| --- | --- |
| support | evidence supports scenario or target movement |
| counter | evidence weakens scenario or target movement |
| uncertain | evidence is relevant but not decisive |

不要只靠颜色编码语义；同时使用 label、line style 或 icon。

## 7. Interactions

点击 stream card：

- highlight corresponding graph node。
- show affected mechanisms and targets。

点击 graph node：

- scroll stream to matching event。
- highlight stream card。
- highlight connected edges where available。

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

## 8. Mobile Layout

移动端使用堆叠布局：

```text
Current State
Research Stream
Evidence Graph
Checkpoint
```

图在窄屏可以保持 React Flow 缩放，但默认 fitView 必须保证核心链条可见。

## 9. Empty / Loading / Error States

Empty：

- 展示 previous state。
- 展示 "Run forecast update" CTA。
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

## 10. Product Boundary

Do not show：

- chain-of-thought
- raw model scratchpad
- raw debug traces
- internal prompt templates
- unverified news as final reason

Do show：

- evidence summary
- source ids
- mechanism tags
- explicit reason for state update
- checkpoint revision reason

## 11. Acceptance Criteria

可视化实现只有在满足以下条件时才算完成：

1. Forecast 页显示 `old -> evidence -> mechanism -> new -> checkpoint`。
2. Evidence cards do not directly change forecast state。
3. `judgement_updated` 是唯一更新 scenario 或 target forecast 的事件。
4. React Flow graph 从 AgentRunEvent[] 生成。
5. 点击任意 graph node 能映射回 stream card。
6. Checkpoint card 解释下一轮会复用什么。
7. 页面不展示 raw debug logs、chain-of-thought 或 internal prompts。
