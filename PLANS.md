# Forecast Agent Live Viewer Plan

Last updated: 2026-05-13 (rev 2)

只优化 Forecast / Galaxy visualization。Overview / Market / News 是背景页，
本计划不改它们。

## Objective

让 reviewer 在一屏内回答三件事：

1. 预测对象是什么（target / unit / resolution source）
2. 预测数字有没有 grounding（相对最近实测在哪个位置）
3. 图上哪几条证据真正推到了 `record_forecast`

## 已落地 P0 + P0.5 + Task A + Task B（核查 2026-05-13 rev2）

| 计划项 | 状态 | 证据 |
|---|---|---|
| Run 按钮接真 galaxy `.venv` | ✓ | `ForecastPage.tsx` `/api/galaxy-hormuz/run/start` |
| `actionTrace.graph` (nodes/edges) | ✓ | `run-galaxy-hormuz.mjs` 末尾投影，97 nodes / 122 edges |
| dagre 自动布局 + 位置缓存 | ✓ | `useStableNodePositions`；`fitView` 只在切换时触发 |
| `rawPreview` 字段 | ✓ | 所有 tool_call / tool_result / final_forecast action |
| 增量 polling `afterIndex=N` + merge | ✓ | `ForecastPage.tsx` `mergeTrace` |
| Critical path 标注（`criticalPath / criticalReason`） | ✓ | graph nodes 里标了 criticalPath |
| Story path 按 critical path 精简 | ✓ | ~12 key actions；record_forecast 恒保留 |
| `NumericForecastCard` 组件 | ✓ | `src/components/forecast/NumericForecastCard.tsx` |
| Brent sparkline + delta + evidence | ✓ | `projectBrentDailySeries(30)` 已接 |
| Inspector: critical path 徽标 + reason | ✓ | `ForecastPage.tsx` Inspector 渲染 |
| Inspector: Copy raw path + view full | ✓ | footer 按钮 |
| `audit:galaxy` numeric 红线 | ✓ | numeric final parseFloat / metadata / Story 含 record_forecast |
| `audit:galaxy` rawPreview system/prompt leak guard | ✓ | `audit-galaxy.mjs` 逐条扫 |
| Task A：删除 local runtime toggle | ✓ | `ForecastPage.tsx` 只剩 galaxy 路径，无 radio |
| Task B：demo artifact（`build-demo-artifact.mjs`） | ✓ | `data/galaxy/latest-run.json` demo=true |
| Task B：prediction 使用真实 FRED 数据 | ✓ | `latest×1.01`；$66.20 硬编码 bug 已修复 |
| Task B：`demo` 徽标显示 | ✓ | header chips 里 `[demo]` badge |

### 修复记录：$66.20 硬编码 bug（2026-05-13）

**原因**：`scripts/build-demo-artifact.mjs` 第 220 行 `const predictionValue = 66.2`
硬编码，忽略了本地 FRED 数据（DCOILBRENTEU 最新 $118.26，区间 $98–$138）。

**修复**：改为 `Math.round((latest?.value ?? 100) * 1.01 * 100) / 100`，即
FRED 最近一日收盘价 × 1.01（demo 风险溢价），所有 `"66.20"` 字符串替换为
`predictionStr` 模板变量。`buildArtifact` 从 `trace.actions` 动态提取
`finalPrediction` 而非 hardcode。

**结果**：demo artifact 现在输出约 `$119.44 USD/bbl`，在 FRED 实测区间内。
不变量：不伪造实测数据；demo 值来自 FRED 文件，非凭空捏造。

## 不变量

- 真实 galaxy run 是唯一 forecast truth。demo artifact 必须显式标 `runMeta.demo: true`。
- 不伪造实测数据、citation、sourceHash。demo prediction 必须基于实际 FRED 数据推算。
- 不在 rawPreview 里暴露 system prompt / chain-of-thought。
- 不重复安装 galaxy 环境；复用 `.venv`。
- React Flow 节点 id 必须 stable；新事件增量追加，旧 position 不重排。

---

## 当前状态（2026-05-13 rev2）

- Task A ✓ 已完成：UI 只剩 `Run galaxy` 按钮，无 local runtime toggle
- Task B ✓ 已完成：demo artifact 开机显示 `NumericForecastCard`，预测值基于 FRED 实测
- Task C：**等待用户批准**（真实 galaxy LLM Brent run）

开机验证：`npm run dev` → Forecast 页显示 `NumericForecastCard`（$~119 USD/bbl）+
sparkline + demo 徽标 + Story mode critical path 高亮。

## 下一轮任务（按优先顺序）

### Task C · 真实 Brent 运行（Stage 0 smoke，需用户批准）

等 Task A + B 完成、页面能清楚展示数值 demo 后，再跑一次真实 galaxy LLM run：

- `npm run dev` → Run galaxy → 等到 `record_forecast` 节点出现
- 或 `node scripts/run-galaxy-hormuz.mjs --execute`
- 验证 `latest-run.json.runMeta.demo` 不存在（真实 run 不应有 demo 标记）
- 验证 `finalPrediction` 是可 parseFloat 的数字
- 验证 `audit:galaxy` 通过

Done when：`demo: true` 徽标消失，页面显示真实 LLM 预测数字。

### Task D · Inspector "open raw" 增强（已在 P0.5 中部分做）

确认 Copy raw path 复制的是带行号的绝对路径，并在 Inspector footer 加：

- `View full preview` 按钮：前端展开完整 `rawPreview.text`（4 KB 截断后继续）
- **不做** `open in finder`（需要 dev middleware + 路径白名单，安全面大，收益小）

### Task E · Replay 最小版

等 Task A–C 完成后再做：

- view mode tab：`Story | Full | Replay`
- `replayIndex: number` state，slider 控制 `index <= replayIndex`
- 未到节点 `opacity: 0.25`，已到节点正常
- 落点到 `record_forecast` 节点，触发 `fitView({ duration: 220 })`
- NumericCard 在 replayIndex 未到 record_forecast 时显示 `pending`

### Task F · Sub-agent grouping（低优先）

- `buildActionTrace` 里识别 `sub_agent_*` enter/exit 连续区间，收成 `subagent_group` action
- Full 模式折叠成单节点，Inspector 展开内部 action list
- 目标：Full 模式从 97 降到 ~30

### Task G · SSE（放最后）

触发条件：Task A–E 完成后，如果轮询卡顿仍明显才做。

实施要点：

- `GET /api/galaxy-hormuz/run/events?runId=...&after=N` SSE endpoint
- `fs.watch(main_agent.jsonl)` + 逐行 parse push
- `EventSource` + `lastEventId` 重连
- status polling 只保留 elapsed / terminal state check

---

## Ownership

- `ui-cleanup`：ForecastPage local runtime 删除（Task A）。
- `demo-artifact`：build-demo-artifact script + latest-run.json 更新（Task B）。
- `graph`：criticalPath 投影、dagre、view modes（ongoing）。
- `numeric-surface`：NumericForecastCard、Brent series、demo badge（Task B 联动）。
- `inspector`：rawPreview 展开、Copy raw path（Task D）。
- `audit`：audit-galaxy.mjs 红线（ongoing）。

High-conflict files：

```text
src/pages/ForecastPage.tsx                          (Task A 主战场)
scripts/run-galaxy-hormuz.mjs                       (Task B --demo flag)
scripts/build-demo-artifact.mjs                     (Task B 新文件)
data/galaxy/latest-run.json                         (Task B 输出)
data/galaxy/hormuz-daily-question.jsonl             (Task B 输出)
src/components/forecast/GalaxyActionGraph.tsx
scripts/audit-galaxy.mjs
```

## Default Verification

```bash
npm run lint
npm run build
npm run audit:galaxy
npm run audit:ui
```

Browser smoke（Task B 完成后）：

```bash
npm run dev
# Forecast 页开机即显示 NumericForecastCard + sparkline + "demo" 徽标
# Story mode 有 critical path 高亮节点
# Inspector 点 final_forecast 节点 → 显示 critical path: yes + 完整 rawPreview
# 切 Full mode → 97 nodes / 16 critical；切 Story → ~12 key nodes
```

## Principle

不要"更花哨的 log viewer"。要的是一份可以指给任何学生看、能说清楚
"forecast agent 为什么得出这个数字"的实时图。一切 UI 改动都为这条体验服务。
