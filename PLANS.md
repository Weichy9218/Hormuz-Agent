# Forecast Agent Live Viewer — 实现状态（2026-05-13）

只优化 Forecast / Galaxy visualization。Overview / Market / News 是背景页，本计划不改它们。

## Objective

让 reviewer 在一屏内回答三件事：

1. 预测对象是什么（target / unit / resolution source）
2. 预测数字有没有 grounding（相对最近实测在哪个位置）
3. 图上哪几条证据真正推到了 `record_forecast`

---

## 当前实现状态（代码即文档）

### 数据流

```
galaxy main_agent.jsonl
  ↓ buildActionTrace() [scripts/run-galaxy-hormuz.mjs]
  → GalaxyActionTraceItem[] + ForecastAgentGraphNode[] + ForecastAgentGraphEdge[]
  → run-artifact.json → data/galaxy/latest-run.json

ForecastPage (2s 增量 poll → /api/galaxy-hormuz/run/trace)
  mergeTrace() 按 afterIndex 增量追加 actions
  ↓
GalaxyActionGraph + ActionTimeline + NumericForecastCard + ActionInspector
```

### 运行入口

| 操作 | 路径 |
|---|---|
| 启动 dev server | `npm run dev -- --port 5173` |
| 浏览器 Run 按钮 | POST `/api/galaxy-hormuz/run/start` → spawn `run-galaxy-hormuz.mjs --execute` |
| 默认 LLM | GLM5.1（`apihy_glm51`，见 `scripts/run-galaxy-hormuz.mjs` + `hormuz_test.yaml`） |
| 问题预设 | Brent 周高（`brent-weekly-high`）或自定义 textarea |
| 问题文件 | `data/galaxy/hormuz-daily-question.jsonl` |

### GalaxyActionGraph 三视图

| 视图 | 节点数 | 选取逻辑 |
|---|---|---|
| 故事路径（summary） | ≤7 | `storyActionIds()`：question + 开场推理 + 最终综合 + forecast/checkpoint + 主题化证据对 |
| 关键路径（critical） | ~27（本 run） | 仅 `action.criticalPath === true` 的节点，即 galaxy 算法标注的推理链路 |
| 完整审计（full） | 110（本 run） | 全部 actions |

布局：dagre LR，summary/critical 模式 nodesep=24/ranksep=62，full 模式 nodesep=44/ranksep=96。  
节点位置由 `useStableNodePositions` 缓存，增量追加不跳动。

### 节点卡片（GalaxyActionNode）

- `actionTone(kind, toolName)` 决定 border-top 颜色 + 背景渐变（question/tool/result/synthesis/calculation/delegation/final/checkpoint）
- `criticalPath` 节点：amber glow + `<em>` 中文原因徽标（由 `displayCriticalReason()` 翻译）
- `title` attribute：完整 HTML tooltip（title + summary + critical reason + boxedAnswer）
- `final_forecast` 节点：显示 `<code class="galaxy-node-prediction">` 展示 boxed answer 数字

### 边

- 边标签中文：调用 / 返回 / 记录 / 存储 / 继续
- 默认 `opacity: 0`，hover 淡入；critical-path 边始终显示（amber stroke, width 3）
- Critical-path 边双端同为 critical 时才标记为 critical

### 双向联动（已实现）

- 时间线 button click → `onSelectAction(id)` → `FlowSelectedNodeFocuser.setCenter()`
- DAG node click → `onSelectAction(id)` → `ActionTimeline useEffect` → `container.scrollTo()`

### NumericForecastCard

- sparkline：最近 30 个 FRED DCOILBRENTEU 交易日，显示实际日期范围
- 现货说明：DCOILBRENTEU 为 ICE Brent 现货日价，非期货；ICE M1 期货通常差 ±$1–3/bbl
- 证据列表（关键/反向/待观察）默认折叠在 `<details>`

### 导航状态持久化

- `questionPreset` + `customQuestionText` → `sessionStorage`（跨页面导航保留）
- mount-only `useEffect` 重连：回到 Forecast 页时 poll `/api/galaxy-hormuz/run/status`，若仍 running 则恢复 live 状态

### Brent 问题描述修复

- Brent 预设选中时，"当前目标"显示固定的 Brent 描述，不从 stale artifact 的 `question` 字段读取
- 条件：`artifactQuestionKind === "brent_weekly_high"` 才读 artifact，否则用 hardcoded 描述

---

## 关键数据说明

| 项目 | 内容 |
|---|---|
| sparkline 数据源 | `data/normalized/market/fred_series.csv`，FRED DCOILBRENTEU |
| sparkline 覆盖日期 | 最近 30 个交易日（约 6 周） |
| FRED 抓取时间 | 2026-05-12T13:26:25Z |
| 数值类型 | **现货**日价（ICE Brent spot），非期货 |
| 期货差值 | ICE M1 期货通常 ±$1–3/bbl；backwardation 时期货低于现货 |
| 分辨率标准 | 题目明确锁定 FRED DCOILBRENTEU 现货，agent 框架正确 |
| 最近一次真实 run | 2026-05-13，GLM5.1，预测 **109.50 USD/bbl**，110 actions，27 critical path |

---

## 待优化问题清单

### Issue 1 · Agent 行为图剩余优化（P2）

- [ ] **lane strip 与节点位置不对齐**：dagre X 坐标与 lane 不严格对应，lane strip 有误导性，考虑移除或改为纯图例
- [ ] **minimap 噪声**（full 模式）：110 节点 minimap 可辨识度低，考虑在 critical 模式也关掉

### Issue 2 · NumericForecastCard 布局（P2，部分完成）

- [x] 证据折叠到 `<details>`，默认折叠
- [x] sparkline 高度 100px
- [ ] 或将 NumericForecastCard 和 ActionInspector 改为 tab 切换

### Issue 3 · Inspector "open raw" 增强（P2）

- [ ] `View full preview` 按钮：展开完整 `rawPreview.text`（目前 1200 字符截断，`showFullRaw` toggle 已有）

### Issue 4 · Replay 最小版（P3，未启动）

- [ ] 三 tab：`故事路径 | 关键路径 | 完整审计 | Replay`
- [ ] `replayIndex: number` state，slider 控制显示 `action.index <= replayIndex` 的节点
- [ ] 落点到 `record_forecast` 时 `fitView`

### Issue 5 · Sub-agent 节点折叠（P3，未启动）

- [ ] Full 模式识别 `sub_agent_*` 连续区间，收成 `subagent_group` 单节点
- [ ] 目标：Full 模式从 110 个节点降到 ~30 个可读节点

### Issue 6 · SSE 推流（P4，放最后）

触发条件：轮询卡顿明显才考虑。

---

## High-conflict Files

```text
src/pages/ForecastPage.tsx
src/components/forecast/GalaxyActionGraph.tsx
src/components/forecast/NumericForecastCard.tsx
src/styles/forecast.css
scripts/run-galaxy-hormuz.mjs
vite.config.ts
data/galaxy/latest-run.json
```

## Default Verification

```bash
npm run lint
npm run build
npm run audit:galaxy
```

Browser smoke（当前基准）：

```bash
npm run dev
# → /forecast
# Brent 周高模式：当前目标显示 Brent 描述（不受 stale artifact 影响）
# NumericForecastCard：sparkline 日期范围 + 现货说明
# 故事路径：7 个关键节点
# 关键路径：~27 个 critical-path 节点，record_forecast 节点显示 boxed answer
# 完整审计：110 个节点，MiniMap 可见
# Inspector：点击节点 → critical path 状态 + rawPreview
# 时间线：点击 → DAG pan；DAG 点击 → 时间线 scroll
```

## Principle

不要"更花哨的 log viewer"。要的是一份可以指给任何学生看、能说清楚
"forecast agent 为什么得出这个数字"的实时图。一切 UI 改动都为这条体验服务。
