# Hormuz Risk Intelligence Interface

围绕 Strait of Hormuz 一个深度 case 的双层 demo：

1. **Forecast 页** — 真实 `galaxy-selfevolve` run 的实时可视化器。Reviewer 点一次按钮，浏览器里看 forecast agent 一步步搜证据、读文章、做判断、落 `record_forecast`，每个事件都能点开看原始 payload。
2. **背景三页（Overview / News / Market）** — 帮 reviewer 在打开 Forecast 之前先把 Hormuz 事件脉络和市场背景理清楚。它们**不参与 forecast 流程、不消费 galaxy artifact**，与 Forecast 页松耦合。

产品总纲：[`docs/design.md`](docs/design.md)。数据契约：[`docs/data.md`](docs/data.md)。Forecast 页实现细则：[`PLANS.md`](PLANS.md)。

## Positioning

| 系统 | 形态 | 回答的问题 |
| --- | --- | --- |
| FutureX / galaxy-selfevolve | batch + online eval，多任务、多 horizon | Agent 在大样本上预测得多准？skill 是否能自演化？ |
| Hormuz Risk Interface（本仓库） | 单 case、reviewer console | 在一个高维事件上，Agent 跑一次具体长什么样？事件脉络和市场背景是什么？ |

## Product Surface

```text
┌──────────────────────────────────────────────────────────────────────┐
│ 背景层 (独立，不与 Forecast 耦合)                                      │
│   Overview  当前事件状态 + Hormuz 是什么 + 外部预测参考(Polymarket)   │
│   News      Hormuz 事件发展时间线                                      │
│   Market    跨资产市场数据可视化（FRED 9 series + 事件标注）           │
├──────────────────────────────────────────────────────────────────────┤
│ Forecast 层 (PLANS.md)                                                │
│   Forecast  真实 galaxy-selfevolve run 的实时可视化器                  │
│             三视图 DAG：故事路径 / 关键路径 / 完整审计                  │
│             NumericForecastCard + 双向联动时间线 + Inspector           │
└──────────────────────────────────────────────────────────────────────┘
```

## Implementation Status

| 模块 | 状态 |
| --- | --- |
| 四页 IA (Overview / News / Market / Forecast) | `[implemented]` |
| Forecast 页：真实 galaxy live viewer（GLM5.1 默认） | `[implemented]` |
| Forecast 页：三视图 DAG（故事路径 / 关键路径 / 完整审计） | `[implemented]` |
| Forecast 页：节点 boxed answer + 边中文标签 + tooltip | `[implemented]` |
| Forecast 页：双向联动（时间线↔DAG scroll/pan） | `[implemented]` |
| Forecast 页：导航后运行任务重连（sessionStorage + mount useEffect） | `[implemented]` |
| Forecast 页：Brent 预设描述修复（不读 stale artifact） | `[implemented]` |
| `data/galaxy/runs/...` artifact 采集 | `[implemented]` |
| FRED 9 series fetch + normalize + `market_series.json` | `[implemented]` |
| `hormuz_baseline.json`（≈20 mb/d、bypass、LNG、Asia） | `[implemented]` |
| Advisory snapshots（UKMTO / MARAD / IMO） | `[implemented]` |
| Events timeline 数据集 | `[implemented]` |
| Polymarket 引用问题 registry | `[implemented]` |
| audit:data / audit:evidence / audit:forecast / audit:galaxy | `[implemented]` |

## Run

```bash
npm install
npm run dev -- --port 5173
# → http://localhost:5173/
```

Forecast 页点 **Run galaxy** 启动真实 LLM agent run（需本地 `.venv` 已配置）。

## Data Refresh

```bash
npm run build:data    # fetch FRED/advisories/traffic + curate events/polymarket + build generated/
npm run audit         # data / evidence / forecast / galaxy 全套检查
npm run build         # tsc + vite build
```

详见 [`docs/data.md`](docs/data.md)。

## Final Principle

> 背景三页让 reviewer 在 30 秒内理解 Hormuz 当前状态和市场背景；Forecast 页让 reviewer 在 5 分钟内看清楚一次真实 agent run 是怎么走完的。两件事现在是平行的，不要互相伪装成对方的输入。
