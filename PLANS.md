# Forecast Agent Live Viewer Plan

Last updated: 2026-05-13 (rev 4)

只优化 Forecast / Galaxy visualization。Overview / Market / News 是背景页，
本计划不改它们。

## Objective

让 reviewer 在一屏内回答三件事：

1. 预测对象是什么（target / unit / resolution source）
2. 预测数字有没有 grounding（相对最近实测在哪个位置）
3. 图上哪几条证据真正推到了 `record_forecast`

---

## 已完成项（rev 4 核查 2026-05-13）

| 计划项 | 完成时间 | 证据 |
|---|---|---|
| Run 按钮接真 galaxy `.venv` | rev1 | `ForecastPage.tsx` `/api/galaxy-hormuz/run/start` |
| `actionTrace.graph` (nodes/edges/criticalPath) | rev1 | `run-galaxy-hormuz.mjs`，109 actions / 25 critical |
| dagre 自动布局 + 位置缓存 | rev1 | `useStableNodePositions`；`fitView` 仅切换时触发 |
| `rawPreview` 字段 | rev1 | 所有 tool_call / tool_result / final_forecast |
| 增量 polling `afterIndex=N` + merge | rev1 | `mergeTrace` in `ForecastPage.tsx` |
| Critical path 标注（`criticalPath / criticalReason`） | rev1 | graph nodes 里标 criticalPath，orange 高亮 |
| Story path 按 critical path 精简 | rev1 | ~25 关键 actions；record_forecast 恒保留 |
| `NumericForecastCard` 组件 | rev1 | `src/components/forecast/NumericForecastCard.tsx` |
| Brent sparkline + delta + evidence | rev1 | `projectBrentDailySeries(30)` 已接 |
| Inspector: critical path 徽标 + reason | rev1 | `ForecastPage.tsx` Inspector 渲染 |
| Inspector: Copy raw path + view full | rev1 | footer 按钮已实现 |
| `audit:galaxy` 红线 | rev1 | `audit-galaxy.mjs` 覆盖 numeric/rawPreview 检查 |
| Task A：删除 local runtime toggle | rev2 | `ForecastPage.tsx` 只剩 galaxy 路径 |
| Task B：demo artifact（`build-demo-artifact.mjs`） | rev2 | `data/galaxy/latest-run.json` demo=true |
| Task B：$66.20 硬编码 bug 修复 | rev2 | 改为 `FRED latest × 1.01`，约 $119.44 |
| Task C：真实 galaxy LLM Brent run | rev2 | 无 demo 标记，finalPrediction 可 parseFloat，audit 通过 |
| **UI Round 1**：Chinese 标签全局化 | rev3 | `NumericForecastCard`、`GalaxyActionGraph` lane labels |
| **UI Round 1**：Story path 清晰度 | rev3 | 图标题加 critical 数 / 总节点数 / 橙色说明 |
| **UI Round 1**：GraphMode tab 移入 graph card | rev3 | `GalaxyActionGraph` 内 replay-command-row |
| **UI Round 1**：status chip 着色 + prediction chip | rev3 | running=蓝色脉冲，completed=绿，failed=红，prediction=琥珀 |
| **UI Round 1**：collapsible command block | rev3 | `<details>` 折叠执行命令 |
| **UI Round 1**：timeline 步数标注 + critical-path 高亮 | rev3 | 标题 `共 N 步`；orange border 高亮关键步 |
| **UI Round 2**：右侧 side panel 拓宽 360→400px | rev3 | `forecast.css` |
| **UI Round 2**：graph 高度 560→600px | rev3 | `forecast.css` |
| **通用问题支持**：preset toggle + 自定义 textarea | rev3 | `ForecastPage.tsx` 新增 questionPreset state |
| **通用问题支持**：vite 后端写 custom JSONL | rev3 | `vite.config.ts` startRun(questionText?) |
| **通用问题支持**：mjs 支持 `--question-kind custom` | rev3 | `run-galaxy-hormuz.mjs` custom branch |
| **UI Round 3**：timeline max-height 560→820px | rev4 | `forecast.css` |
| **UI Round 3**：lane strip auto-fill（7/9 列自适应） | rev4 | `forecast.css` repeat(auto-fill, ...) |
| **UI Round 3**：sparkline 显示实际日期范围 | rev4 | `NumericForecastCard.tsx`，显示起止日 + 天数 |
| **UI Round 3**：现货 vs 期货说明（黄色注释栏） | rev4 | DCOILBRENTEU 为现货，期货差 ±$1–3/bbl |

### 关键数据说明（2026-05-13 核查）

| 项目 | 内容 |
|---|---|
| sparkline 数据源 | `data/normalized/market/fred_series.csv`，FRED DCOILBRENTEU |
| sparkline 覆盖日期 | 最近 30 个交易日，约 2026-03-21 → 2026-05-01 |
| FRED 抓取时间 | 2026-05-12T13:26:25Z |
| 数值类型 | **现货**日价（ICE Brent spot），非期货 |
| 期货差值 | ICE M1 期货通常 ±$1–3/bbl；backwardation 时期货低于现货 |
| 分辨率标准 | 题目明确锁定 FRED DCOILBRENTEU 现货，现有 agent 框架正确 |

---

## 待优化问题清单（供 Codex 参考，按优先顺序）

### Issue 1 · Agent 行为图视觉设计优化（P1，用户明确提出）

**现状**：节点排布和视觉分层基本可用，但有以下不足：

- [ ] **节点卡片信息密度**：title 截断时无 tooltip；summary 3 行 clamp 导致关键信息丢失
- [ ] **边标签可读性差**：`returns / calls / records / continues` 字体太小，边和标签颜色混淆
- [ ] **节点类型色彩区分不足**：tool_call（蓝）和 tool_result（绿）在 critical path 下全被橙色覆盖，失去类型辨识
- [ ] **lane strip 与节点位置不对齐**：lane strip 是 label 行，但实际 dagre X 坐标与 lane 不严格对应，容易产生误导
- [ ] **minimap 噪声**：minimap 在节点多时难以辨认，可考虑只在 Full mode 显示
- [ ] **Story mode 节点数仍偏多（26 个）**：应进一步精简到 12–15 个，强调"推理链"而非"所有高亮步骤"

**建议方向**：
- 节点卡片 title 加 `title` attribute（HTML tooltip）
- 边标签改为只在 hover edge 时显示（用 CSS `opacity: 0` → hover `opacity: 1`）
- Critical path 节点用橙色 border-top 但保留类型底色（tool/result/synthesis 各自颜色）
- Story mode：storyActionIds 逻辑收紧，目标 ≤ 15 节点

---

### Issue 2 · NumericForecastCard 布局过长（P1，用户明确提出）

**现状**：右侧 400px 面板中 NumericForecastCard 占据大量垂直空间，
导致 ActionInspector 被推到很下方，需要大量滚动。

- [ ] 将"关键证据 / 反向证据 / 待观察风险"部分改为可折叠 `<details>`，默认折叠
- [ ] sparkline 高度从 128px 适当减小至 100px（已经包含了 3 行 metrics，整体太高）
- [ ] 或将 NumericForecastCard 和 ActionInspector 改为 tab 切换，而非垂直堆叠

---

### Issue 3 · 动作时间线与主图联动体验（P1）

**现状**：时间线和 DAG 图可以互相 highlight，但：

- [ ] 时间线选中某节点时，DAG 图没有自动 `fitView` 跳转到该节点
- [ ] DAG 图点击节点时，时间线不会滚动到对应 item（特别是在 story mode 下，时间线 index 不连续）
- [ ] 建议：选中 actionId 时，timeline 对应 item `scrollIntoView()`；DAG 图 `panTo` 该节点

---

### Issue 4 · 自定义问题运行后 UI 状态更新（P2）

**现状**：自定义问题运行完成后，右侧显示的是 `FinalForecastCard`（通用卡），
但顶部问题描述区域还显示旧 artifact 的 brent_weekly_high 问题文字（`questionSummary` 读 artifact 中的 question）。

- [ ] 自定义 run 完成后，问题摘要行应显示用户实际输入的 `customQuestionText`，而非 artifact 解析结果
- [ ] 建议：`questionSummary` 在 `questionPreset === "custom"` 时优先返回 `customQuestionText`

---

### Issue 5 · Task D · Inspector "open raw" 增强（P2）

- [ ] `View full preview` 按钮：展开完整 `rawPreview.text`（目前 1200 字符截断）
- [ ] 已在 P0.5 中部分做，`showFullRaw` toggle 已存在，需确认边界行为

---

### Issue 6 · Task E · Replay 最小版（P3，未启动）

- [ ] view mode：`Story | Full | Replay` 三 tab
- [ ] `replayIndex: number` state，slider 控制显示 `action.index <= replayIndex` 的节点
- [ ] 未到节点 `opacity: 0.25`，已到正常显示
- [ ] 落点到 `record_forecast` 节点，触发 `fitView({ duration: 220 })`
- [ ] NumericCard 在 replayIndex 未到 record_forecast 时显示 `pending`

---

### Issue 7 · Task F · Sub-agent 节点折叠（P3，未启动）

- [ ] `buildActionTrace` 里识别 `sub_agent_*` enter/exit 连续区间，收成 `subagent_group` action
- [ ] Full 模式折叠成单节点，Inspector 展开内部 action list
- [ ] 目标：Full 模式从 109 个 action 降到 ~30 个可读节点

---

### Issue 8 · Task G · SSE 推流（P4，放最后）

触发条件：Issue 3 做完、轮询卡顿仍明显才考虑。

- [ ] `GET /api/galaxy-hormuz/run/events?runId=...&after=N` SSE endpoint
- [ ] `fs.watch(main_agent.jsonl)` + 逐行 parse push
- [ ] `EventSource` + `lastEventId` 重连

---

## 不变量

- 真实 galaxy run 是唯一 forecast truth。demo artifact 必须显式标 `runMeta.demo: true`。
- 不伪造实测数据、citation、sourceHash。
- 不在 rawPreview 里暴露 system prompt / chain-of-thought。
- 不重复安装 galaxy 环境；复用 `.venv`。
- React Flow 节点 id 必须 stable；新事件增量追加，旧 position 不重排。

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
npm run audit:ui
```

Browser smoke（当前基准）：

```bash
npm run dev
# → /forecast
# Brent 周高模式：显示 NumericForecastCard + sparkline（日期范围标注）+ 现货说明
# Story mode：26 个关键节点 / 109 个全节点，橙色标 critical path
# Full mode：109 个节点，lane strip 9 列自适应
# 自定义模式：切换到"自定义问题"，输入问题文本，"运行 Galaxy" 按钮激活
# Inspector：点击任意节点 → 显示 critical path 状态 + rawPreview
```

## Principle

不要"更花哨的 log viewer"。要的是一份可以指给任何学生看、能说清楚
"forecast agent 为什么得出这个数字"的实时图。一切 UI 改动都为这条体验服务。
