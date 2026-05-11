# Hormuz Risk Intelligence Interface

事件驱动的 forecast-agent demo，用来展示 Agent 如何把 Hormuz 相关新证据转化为可审计的跨资产风险判断修订。

唯一设计源是 [docs/design.md](docs/design.md)。Forecast 页的 Agent 可视化细则见 [docs/agent_visualization.md](docs/agent_visualization.md)。

## Product Contract

唯一主问题：

> 当前 Hormuz 风险是否改变了跨资产判断？如果改变，是哪条新证据导致了这次修订？

本 demo 不是新闻 dashboard、AIS 实时地图、交易建议系统或 LLM 调试台。它只展示一条 reviewer 能复核的预测修订链：

```text
baseline -> source -> observation -> evidence -> mechanism -> judgement delta -> target forecast -> checkpoint -> next watch
```

## Case Narrative

Hormuz 是适合展示 forecast agent 的 case，因为它同时连接能源供给、航运安全、战争风险、通胀预期、避险资产、美元和风险资产。

产品叙事采用三层结构：

| Layer | 页面表达 | 目的 |
| --- | --- | --- |
| Baseline | Why Hormuz matters: 近 20 mb/d petroleum liquids，经由海峡；替代出口路线能力约 3.5-5.5 mb/d | 先给 reviewer 一个结构性事实锚点 |
| Signal | maritime advisory、traffic/flow proxy、market pricing、conflict context | 说明本轮新增了什么可核验证据 |
| Revision | old -> new scenario delta、target deltas、checkpoint、next watch | 展示 Agent 为什么改判，而不是只展示结论 |

重要事实边界：

- IEA/EIA 的 Hormuz chokepoint baseline 用作结构性背景，不代表当日 throughput。
- Gold、AIS、USD/CNH 没有稳定授权 source 前保持 pending，不伪装成 live evidence。
- Market 页只解释 pricing pattern；它不是第二个 forecast engine。
- 新闻只产生 candidate evidence；概率修订必须通过 evidence -> mechanism -> judgement update。

## Pages

顶层只保留三页：

| Page | 核心问题 | 首屏必须让用户看见 |
| --- | --- | --- |
| `Overview` | 当前判断是什么？ | base case、scenario distribution、Why not closure、Hormuz baseline strip、next watch |
| `Market` | 市场是否已经定价？ | pricing pattern、data coverage/as-of、normalized cross-asset chart、raw metrics |
| `Forecast` | Agent 为什么改判？ | previous -> current headline、highlighted revision path、current state、research stream、checkpoint |

Routes 不作为顶层页。地图只做 context：标出 Strait of Hormuz、Persian Gulf / Gulf of Oman、关键 bypass corridor 和 advisory/incident marker。没有授权 AIS 前不做实时船舶地图。

## Data And Audit Contract

核心数据对象：

- `SourceRegistryItem`：事实边界，记录 source id、reliability、cadence、license/pending caveat。
- `SourceObservation`：某次抓取或人工登记的可追溯 observation。
- `EvidenceClaim`：从 observation 提取出来、对预测有方向性的 claim。
- `AgentRunEvent`：Forecast 页的事件流。
- `ForecastCheckpoint`：下一轮复用的 previous state。

硬规则：

1. `judgement_updated` 是唯一能改变 scenario 或 target forecast 的事件。
2. 每个 `judgement_updated` 必须能回溯到 evidence ids 和 mechanism tags。
3. 每个 pending source 必须在 UI 上显示 caveat。
4. Market interpretation 只能作为 evidence 输入，不能直接覆盖 forecast state。
5. Checkpoint 必须说明 revision reason、next watch 和下一轮会复用什么状态。

## Run

```bash
npm install
npm run dev -- --port 5173
```

默认本地地址：

```text
http://localhost:5173/
```

## Verify

```bash
npm run lint
npm run build
npm run audit:data
```

`audit:data` 会检查 FRED 展示点位、source id、pending 数据边界和 `AgentRunEvent` contract。后续应扩展为：

```text
audit:sources   source registry、URL、license/pending 状态
audit:evidence  evidence 是否绑定 sourceObservationIds
audit:forecast  judgement_updated 是否解释 evidence -> mechanism -> delta
audit:ui        pending caveat、as-of、source id 是否可见
```

## Implementation Priority

P0 先让 demo 变清楚：

- Overview 增加 Hormuz baseline strip。
- Forecast 首屏增加 old -> new revision headline。
- Scenario 增加 trigger / exit / observable signals / market signature。
- Market 从 `supportsScenario` 改为 `pricingPattern`。
- Pending 数据在 Overview / Market / Forecast 都显式显示 caveat。

P1 让 Agent 可信：

- `AgentRunEvent` 增加 `eventId`、`evidenceIds`、`sourceObservationIds`。
- 新增 `SourceObservation` 和 `EvidenceClaim`。
- `judgement_updated` 必须引用 evidence 和 mechanism。
- checkpoint 存 previous state、reusable state 和 delta attribution。

P2 让界面更像产品：

- Forecast 默认 Story mode，只展示最重要 revision path。
- Audit mode 再展开全部 source/evidence/checkpoint。
- Market 使用大图 + 右侧 legend + data coverage。
- Overview 用 12-column reviewer console grid，减少长文。

最终原则：

> 不要让用户看 Agent 做了多少事；要让用户看懂 Agent 为什么改判。
