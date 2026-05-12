# Hormuz Risk Intelligence Agent

事件驱动的 forecast-agent demo。本仓库用 Hormuz 这一单一深度 case，展示一个 Future Prediction Agent 系统如何把碎片化的新证据转化为 *reviewer 可审计的跨资产风险判断修订*。

唯一产品总纲：[docs/design.md](docs/design.md)。Forecast 页可视化细则：[docs/agent_visualization.md](docs/agent_visualization.md)。

## Positioning

本项目是 forecast-agent system 的 **reviewer-facing deep case surface**，与 batch eval 系统（[galaxy-selfevolve / FutureX](../../../Doing-Right-Things/FutureX/papers/galaxy-selfevolve)）互补：

| 系统 | 形态 | 回答的问题 |
| --- | --- | --- |
| FutureX / galaxy-selfevolve | batch + online eval，多任务、多 horizon | Agent 在大样本上预测得多准？skill 是否能自演化？ |
| Hormuz Risk Agent（本仓库） | 单 case、reviewer console | 在一个高维事件上，Agent 为什么改判？改判过程是否可审计？ |

两套系统共享同一个底层契约：**新证据 → 机制 → 判断修订 → checkpoint** 必须可被复现、可被打分。Hormuz 是把这个契约 *可视化* 到 reviewer 面前的窗口。

## Product Contract

唯一主问题：

> 当前 Hormuz 风险是否改变了跨资产判断？如果改变，是哪条新证据导致了这次修订？

本 demo 不是新闻 dashboard、AIS 实时地图、交易建议系统或 LLM 调试台。它只展示一条 reviewer 能复核的预测修订链：

```text
baseline -> source -> observation -> evidence -> mechanism -> judgement delta -> target forecast -> checkpoint -> next watch
```

## Case Narrative

Hormuz 适合作为 forecast agent demo case，因为它同时连接能源供给、航运安全、战争风险、通胀预期、避险资产、美元和风险资产；并且方向可能冲突（油价上行 vs 风险资产承压 vs USD 避险），必须解释机制而不是只给涨跌结论。

原始方案的核心 case-room 顺序保留为：

```text
态势时间线 -> 关键指标面板 -> 机制解释链 -> 情景预测卡片
```

当前 UI 将这条线映射为 `News -> Market -> Forecast -> Overview`，其中 Overview 是 reviewer 的入口摘要，负责把最新 `judgement_updated` 后的情景概率、guardrail、next watch 和 checkpoint 收束到一屏。

产品叙事采用三层结构：

| Layer | 页面表达 | 目的 |
| --- | --- | --- |
| Baseline | 近 20 mb/d petroleum liquids 经由海峡；替代出口路线能力约 3.5–5.5 mb/d；Asia-heavy exposure；LNG relevance | 给 reviewer 一个结构性事实锚点 |
| Signal | maritime advisory、traffic/flow proxy、market pricing、conflict context | 说明本轮新增了什么可核验证据 |
| Revision | old → new scenario delta、target deltas、checkpoint、next watch | 展示 Agent 为什么改判，而不是只展示结论 |

事实边界（重要）：

- IEA/EIA 的 Hormuz chokepoint baseline 用作结构性背景，不代表当日 throughput。
- Gold、AIS、USD/CNH 在没有稳定授权 source 前保持 pending，不伪装成 live evidence。
- Market 页只解释 *pricing pattern*；它不是第二个 forecast engine。
- 新闻只产生 candidate evidence；概率修订必须经过 evidence → mechanism → judgement update。

## Pages

顶层保留四页：

| Page | 核心问题 | 首屏必须让用户看见 |
| --- | --- | --- |
| `Overview` | 当前判断是什么？ | base case、scenario distribution、Why not closure、Hormuz baseline strip、next watch |
| `Market` | 市场是否已经定价？ | pricing pattern、data coverage / as-of、key market curves、event-window move |
| `News` | 事件脉络如何进入预测系统？ | event timeline、source boundary、candidate evidence handoff |
| `Forecast` | Agent 为什么改判？ | previous → current headline、Story mode revision path、current state、research stream、checkpoint |

Routes 不作为顶层页。地图只做 context：标出 Strait of Hormuz、Persian Gulf / Gulf of Oman、关键 bypass corridor 和 advisory / incident marker。**没有授权 AIS 前不做实时船舶地图。**

## Data And Audit Contract

核心数据对象（详见 design.md §10）：

- `SourceRegistryItem`：事实边界，记录 source id、reliability、cadence、license / pending caveat。
- `SourceObservation`：某次抓取或人工登记的可追溯 observation。
- `EvidenceClaim`：从 observation 提取出来、对预测有方向性的 claim。
- `AgentRunEvent`：Forecast 页的事件流。
- `ForecastCheckpoint`：下一轮复用的 previous state。

硬规则：

1. `judgement_updated` 是唯一能改变 scenario 或 target forecast 的事件。
2. 每个 `judgement_updated` 必须能回溯到 evidence ids 和 mechanism tags。
3. 每个 pending source 必须在 UI 上显示 caveat。
4. Market interpretation 只能作为 evidence 输入，不能直接覆盖 forecast state。
5. Checkpoint 必须说明 revision reason、next watch、下一轮会复用什么状态。

## Implementation Status

`[implemented]` = 代码已落地；`[P0]` / `[P1]` / `[P2]` = 下一步优先级。

| 模块 | 状态 |
| --- | --- |
| Four-page IA (Overview / Market / News / Forecast) | `[implemented]` |
| `ScenarioId`、`ForecastTarget`、`TargetForecast`、`MechanismTag` | `[implemented]` |
| `AgentRunEvent`（run/source/evidence/judgement/checkpoint） | `[implemented]` |
| `sourceRegistry` 含 category / reliability / pending / caveat | `[implemented]` |
| `audit:data`（FRED 点位、source id、pending、event contract） | `[implemented]` |
| Hormuz baseline strip on Overview | `[implemented]` |
| Forecast revision headline + Story mode | `[implemented]` |
| Scenario operational fields（trigger / exit / observable / market signature） | `[implemented]` |
| `MarketRead.supportsScenario` → `pricingPattern` | `[implemented]` |
| Pending caveat 在 Overview / Market / News / Forecast 显式可见 | `[implemented, audit:ui planned]` |
| `AgentRunEvent` 增 `eventId` / `parentEventIds` / `evidenceIds` / `sourceObservationIds` | `[implemented, sourceHash expansion planned]` |
| `SourceObservation`、`EvidenceClaim`、`EvidenceQuality` 落地 | `[implemented]` |
| `checkpoint_written` 包含 previous-state reuse 摘要 + delta attribution | `[implemented]` |
| Forecast Audit mode + script-level replay audit | `[implemented]` |
| UI Replay mode | `[P2]` |
| `audit:data` / `audit:evidence` / `audit:forecast` / `audit:legacy` / `audit:replay` | `[implemented]` |
| `audit:ui` | `[P2]` |
| Historical replay + online validation eval pipeline | `[P2]` |

## Run

```bash
npm install
npm run dev -- --port 5173
```

默认本地地址：`http://localhost:5173/`。

## Verify

```bash
npm run lint
npm run build
npm run audit
```

`npm run audit` 目前包含：

```text
audit:data      FRED 展示点位、source id、pending 数据边界
audit:evidence  evidence 是否绑定 sourceObservationIds 与 source ids
audit:forecast  judgement_updated 是否解释 evidence -> mechanism -> delta
audit:replay    deterministic replay contract
audit:legacy    防止旧版字段/旧 pipeline 回流
```

下一阶段补 `audit:ui`：pending caveat、as-of、source id 是否在页面上可见。

## Final Principle

> 不要让用户看 Agent 做了多少事；要让用户看懂 Agent 为什么改判，以及这次改判在历史上是否站得住脚。
