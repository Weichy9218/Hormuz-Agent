# Hormuz Risk Intelligence Interface

事件驱动的 forecast-agent demo，用来展示 Hormuz 相关新证据如何通过 mechanism layer 修订情景概率、跨资产 target forecast 和下一步观察项。

唯一设计源是 [docs/design.md](docs/design.md)。

## Product Contract

唯一主问题：

> 当前 Hormuz 风险是否改变了跨资产判断？如果改变，是哪条新证据导致了这次修订？

顶层只保留三页：

- `Overview`：当前判断是什么。
- `Market`：市场是否已经定价。
- `Forecast`：Agent 为什么改判。

核心链路：

```text
source -> evidence -> mechanism -> judgement delta -> target forecast -> checkpoint -> next watch
```

重要边界：

- Routes 不作为顶层页，只作为 mini map / geo context。
- 战争趋势不做枚举状态，而是 `regional_escalation_7d`、`transit_disruption_7d` 等 forecast targets。
- Gold、AIS、USD/CNH 没有稳定授权 source 前保持 pending，不伪装成 live evidence。
- Market 页只提供 `marketRead` 和 raw metrics，不直接改 scenario judgement。

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

`audit:data` 会检查 FRED 展示点位、source id、pending 数据边界和 `AgentRunEvent` contract。
