# Forecast Agent Live Viewer Plan

Last updated: 2026-05-12

只优化 Forecast / Galaxy visualization。Overview / Market / News 是背景页，
本计划不改它们。

## Objective

让 Forecast 页面成为一个**真实 galaxy-selfevolve run 的实时可视化器**：
点一次按钮，浏览器里看到 forecast agent 一步一步搜证据、读文章、做判断、
落 `record_forecast`，每个事件都能点开看原始 payload。

```text
question -> tool_call(search_web|web_fetch|sub_agent_*) -> tool_result
        -> assistant turn(reflection) -> record_forecast -> boxed answer
```

Done when:

1. 浏览器点 **Run galaxy** 后，本地 vite 进程 spawn 真实
   `.venv/bin/python main.py --run-config hormuz_test.yaml`（不是 deterministic
   local runner），并写入 `data/galaxy/runs/<date>/.../main_agent.jsonl`。
2. UI 在 `main_agent.jsonl` 还在被 galaxy 进程追加的过程中，**增量**渲染 React
   Flow DAG —— 节点按事件出现的顺序 fade-in，边由 `tool_call_id` 配对。
3. Reviewer 点任意节点，Inspector 显示该事件的**完整原始字段**：
   - assistant turn → content + tool_calls 列表
   - tool_call → tool name + args（完整 JSON）
   - tool_result → tool name + content（截断 + "view full"）
   - record_forecast → `\boxed{...}` + key_evidence / counterevidence /
     unresolved_concerns
4. 97 节点规模下图可读：dagre 自动布局 + collapse by lane + minimap +
   fitView。
5. 一次失败的 run（exit≠0 或没有 `record_forecast`）能停在最后有效状态，
   不会让 UI 假装成功。

## Current State (2026-05-12)

仓库里已经存在的能跑通的东西：

- `scripts/run-galaxy-hormuz.mjs` 已经会优先用
  `/Users/weichy/Desktop/Doing-Right-Things/FutureX/papers/galaxy-selfevolve/.venv/bin/python`
  调用 galaxy 的 `main.py`，传 `--run-config hormuz_test.yaml`。
- `data/galaxy/latest-run.json` 里有真实 galaxy 跑出来的 artifact：
  - `runMeta.status = "success"`、`finalPrediction = "D"`
  - `actionTrace.actions` 有 97 条，按 lane 标好
  - `sourceObservations / evidenceClaims / marketRead` 都已 normalize
- Vite middleware 已暴露：
  - `POST /api/galaxy-hormuz/run/start`（spawn 真实 galaxy）
  - `GET  /api/galaxy-hormuz/run/status`
  - `GET  /api/galaxy-hormuz/run/trace`（每次重新解析 `main_agent.jsonl`）
  - `GET  /api/galaxy-hormuz/latest`
- Forecast 页用 `@xyflow/react`（React Flow v12）渲染 lane-based 网格图。

## Real Problems (跑 `npm run dev` 看到的)

P0 — 阻塞"真实跑一遍 + 看到 agent 行为"用户故事：

1. **"Run" 按钮接错了 runtime。** `ForecastPage.handleRunGalaxy()`（命名
   误导）实际调 `/api/forecast-agent/run/start`，跑的是 `scripts/forecast-agent/`
   下的 deterministic 演示 runner，不是真实 galaxy。真实 galaxy 路径
   (`/api/galaxy-hormuz/run/start`) 现在没有 UI 入口。
2. **真实 galaxy artifact 没有 `actionTrace.graph`。** UI 只对本地 deterministic
   runner 的 `trace.graph.{nodes,edges}` 走 `layoutNativeGraph`；galaxy
   97-action 走 fallback `layoutActions`，固定 `x = laneIndex*260, y = ordinal*146`
   网格，按 lane 堆，高度爆炸、且没有真实父子边。
3. **不是 live。** `pollLiveRun` 每 1.5s 全量 GET `/run/trace`，后端每次
   重新读整份 `main_agent.jsonl` 并重建 actionTrace。事件多了之后会
   抖动，节点也会整体重排，看不出"新事件刚出现"。
4. **Inspector 信息不够。** 只显示 `argsSummary / sourceUrl / query`，看不到
   真实 tool_call 的完整 args / tool_result 的 content。reviewer 没法判断
   "agent 是不是真的读到了 UKMTO 那段话"。

P1 — 影响可读性：

5. 没有自动布局。97 节点在固定网格下溢出右下角，必须横向滚很远。
6. 没有 collapse / focus。Summary 模式只是 filter kind，没有按 lane 折叠或
   按 `record_forecast` 反向高亮 critical path。
7. `ReplayControls` 组件存在但没接 state machine —— 不能真正
   "回放到 evidence #3 那一刻"。

P2 — 不影响演示但已是债：

8. 本地 deterministic runner 和真实 galaxy 共用 `final forecast` 卡片，
   `schemaVersion` 分支判断散落在 `pollLiveRun` 里，未来加第三种 runner 会很乱。
9. `events.jsonl`（本地 deterministic 通道）不该被 UI 当成"galaxy 的 fallback"，
   应彻底分开。

## Invariants

- 真实 galaxy 是唯一 forecast truth；本地 deterministic runner 只作课堂
  fallback / offline demo。
- 不伪造任何 URL、freshness、概率、citation、metrics、sourceHash。
- 不在 UI 里暴露原始 system prompt / 内部 scratchpad（galaxy 第一条 system
  role 直接丢弃）。
- React Flow 节点 `id` 必须 stable（用 galaxy `tool_call_id` 或事件 index），
  不能每次 poll 重新随机化，否则增量 fade-in 无意义。
- 一切布局/动效都基于已 append 完的事件，未到达事件不预先占位。
- 不重复安装 galaxy 环境，复用
  `/Users/weichy/Desktop/Doing-Right-Things/FutureX/papers/galaxy-selfevolve/.venv`。

## P0: 接通真实 galaxy 并能 live 看到事件

目标：reviewer 在 `npm run dev` 里点一次按钮，能看到真正 galaxy 跑起来，
且每个事件按出现顺序进入 React Flow。

实施：

1. **修正 Run 按钮接线**。
   - `ForecastPage.handleRunGalaxy` 改调 `/api/galaxy-hormuz/run/start`。
   - Header 加显式 runtime 开关：`galaxy (.venv) | local-deterministic`，
     默认 `galaxy`。
   - Header 显示真实 command（`record.command` 已存在），让用户看到当前在跑
     `.venv/bin/python main.py --run-config hormuz_test.yaml ...`。

2. **后端补 graph 投影**。
   - 在 `scripts/run-galaxy-hormuz.mjs` 的 `buildActionTrace` 末尾新增
     `graph: { nodes, edges }`：
     - 每条 action → 一个 node，`id = action.actionId`；
     - `tool_result.parentActionIds`（已存在）→ edge `tool_call -> tool_result`；
     - assistant turn 之间用顺序 edge 串成主干；
     - `record_forecast` 节点标 `terminal: true`。
   - 这样 `/api/galaxy-hormuz/run/trace` 直接返回带 graph 的 trace，UI 一份
     `layoutNativeGraph` 既能渲染 deterministic 也能渲染 galaxy。

3. **incremental polling（先不上 SSE）**。
   - `/api/galaxy-hormuz/run/trace?afterIndex=N` 只返回 index ≥ N 的 actions
     及它们引用的 sourceObservations / evidenceClaims 子集。
   - 前端用 `useRef` 维护已渲染节点集合：新节点 push，旧节点位置保持不变。
   - 父子边由 React Flow `addEdge` 增量添加，不重排已有 node 的 `position`。

4. **DAG 自动布局**。
   - 引入 `dagre`（React Flow 社区惯例，体积小）。第一次拿到节点集
     之后跑一次 `dagre.layout`；之后只对**新增**节点用"挂到 parent 右侧"的
     增量策略；用户点 fitView 时再整图重算一次。
   - lane 不消失：dagre 按 `rank` 分层（question → tool_call → tool_result →
     assistant → forecast → checkpoint），lane 退化为颜色 + minimap group。

5. **Inspector 显示完整 payload**。
   - 后端 trace 已知每条 action 对应 `main_agent.jsonl` 的哪一行（已有
     index）。在 trace 里补 `rawPreview` 字段：
     - assistant: `content` 前 N 字 + tool_calls 名字列表
     - tool_call: `function.name` + `function.arguments`（完整 JSON 字符串）
     - tool_result: `tool_name` + `content` 截断到 4 KB
     - record_forecast: prediction / confidence / key_evidence /
       counterevidence / unresolved_concerns 完整对象
   - 不在 trace 里塞 system prompt 或 chain-of-thought 之外的隐私内容
     （galaxy `main_agent.jsonl` 第一条 system role 丢弃）。
   - 前端 Inspector 加 `<pre>` block + 折叠按钮 + "open raw file" 链接
     （复制 `runDir/main_agent.jsonl` 路径）。

Done when:

- 点 Run 后 5–10s 内浏览器开始看到 `question` 节点出现；之后
  `tool_call → tool_result` 成对 fade-in；最后一个节点是橙色 `record_forecast`。
- 进程崩了或 exit≠0，Header 显示 `status: failed`，已渲染节点保留，
  最后一个节点是失败前最后的 assistant turn。
- 任选一个 `tool_call(search_web)` 节点，Inspector 能看到完整 `arguments`
  JSON（包含 query 列表）和对应 result 的前 4 KB。

Verification:

```bash
# 1. CLI 真实跑（不通过 UI）
node scripts/run-galaxy-hormuz.mjs --execute --run-config hormuz_test.yaml

# 2. UI 真实跑
npm run dev
# 浏览器 http://localhost:5173/ → Forecast → Run galaxy

# 3. Audit & build
npm run audit:galaxy
npm run audit:ui
npm run lint
npm run build
```

## P1: 让图在 97 节点规模下可读

目标：reviewer 不需要滚 8 屏才能看到 `record_forecast`。

实施：

1. **三种 view mode（替换现有 summary/full 二选一）**：
   - `Story`：只保留 question + 每条 evidence claim 引用的 tool_call/result
     对 + record_forecast + checkpoint，~10–15 节点；
   - `Full`：所有 97+ 节点 + dagre 自动布局 + minimap；
   - `Replay`：按事件 index 推进的时间轴，节点逐步亮起，未到节点灰显。
2. **critical path 高亮**。从 `record_forecast.key_evidence` 反向 DFS 到
   它们的 tool_result / tool_call / assistant turn，整条 path 加粗 + 高亮色。
3. **focus on click**。点节点：(a) 高亮自己 + 1-hop 邻居；(b) 同步选中
   timeline 项；(c) 滚动 timeline 到对应位置；(d) Inspector 切到该 action。
4. **lane chips**。Header 下面横条显示各 lane count + 点击过滤
   （只灰显，不删边），保留全局拓扑。

Done when:

- Story 模式一屏看完核心 path。
- Replay 拖到中间时，未到节点半透明灰，已到节点 saturate；
  `record_forecast` 出现/缺失影响下方概率分布显示。
- 点 `tool_result` 节点时，对应 `tool_call` (parent) 也被高亮。

Verification:

```bash
npm run audit:ui
npm run lint
npm run build
```

Browser smoke:

- Story 模式：节点数 ≤ 20。
- Full 模式：滚动 < 2 屏可看到 question → record_forecast 全链。
- Replay：拖到 50% 时，剩余 50% 节点呈灰；拖到末尾时 boxed answer 出现。

## P1: 流式传输（替换 1.5s 全量轮询）

目标：事件出现到 UI 显示 < 1s，且不抖动。

实施：

1. 新增 `GET /api/galaxy-hormuz/run/events?runId=...&after=N` 走 SSE：
   - server 端用 `fs.watch` 监听 `main_agent.jsonl`，每追加一行就 parse 并
     emit `{ index, kind, ... }`；
   - 心跳 `: keep-alive` 防代理超时。
2. 前端用 `EventSource`，收到事件直接 push 到 `actions` state；
   `/run/status` 仍每 1s 轮询拿 elapsed / status。
3. 断线重连：用 `Last-Event-ID` 头带 `index`，server 从那一行继续。
4. `events.jsonl`（本地 deterministic 通道）保留独立 endpoint，不混。

Done when:

- 新事件出现到 React Flow 节点 fade-in 中位延迟 < 1s。
- 切到别的 tab 再回来，UI 自动 catch-up 缺失事件，不丢、不重。
- 真实失败的 run 触发 `run_failed` 事件后 SSE 关闭。

## P2: 把 deterministic local runner 降级为 fallback

目标：让真实 galaxy 是唯一 forecast truth；本地 deterministic 只作离线 demo。

实施：

1. UI runtime 切换显式标注 `galaxy = real LLM`，`local = offline demo (no LLM)`。
2. `FinalForecastCard` 显示来源徽标：`real galaxy run` vs `offline demo`。
3. `audit:forecast-agent` 改成只在 runtime=local 时跑，runtime=galaxy 走
   `audit:galaxy`。
4. `docs/data.md` 加段说明哪条路径是 forecast truth。

Done when:

- 一个新 reviewer 打开页面 30s 内能区分"现在在看真 LLM 跑的结果"还是
  "offline demo"。

## P2: 提升 React Flow 视觉与交互（参考 reactflow.dev / xyflow）

不为"好看"加特效；只接官方 pattern 中有明确收益的：

- 自定义节点：参考 `examples/custom-node`，把当前手写 `galaxy-action-node`
  换成三段（icon + lane / title / preview）。
- `useReactFlow().fitView({ duration: 400 })` 在 Story / Full / Replay
  切换时调用一次。
- `MiniMap` 给不同 kind 上色（已有 `nodeColor`，确认 minimap 用它）。
- 边类型：tool_call → tool_result 用 `step`，assistant 主干用 `smoothstep`，
  critical path 用 `straight` + 高亮 stroke。
- 不引入 `nodesDraggable` 自由拖拽；只允许 pan/zoom/click。

Done when:

- Story / Full / Replay 切换有清晰的 fitView 动画。
- 节点 hover 时若 title 被截断，浮出完整 title。

## Ownership

- `runtime-wiring`：vite middleware、Run 按钮接线、SSE。
- `graph`：buildActionTrace.graph 投影、dagre layout、view modes。
- `inspector`：trace.rawPreview 字段、Inspector 渲染、隐私过滤。
- `docs`：本 plan、`docs/data.md`、`docs/design.md` 关于 truth source。

High-conflict files：

```text
src/pages/ForecastPage.tsx
src/components/forecast/GalaxyActionGraph.tsx
src/components/forecast/ForecastInspector.tsx
scripts/run-galaxy-hormuz.mjs
vite.config.ts
```

## Default Verification

代码改动后：

```bash
npm run lint
npm run build
npm run audit:galaxy
npm run audit:ui
```

UI 改动后必须人工 smoke：

```bash
npm run dev
# 浏览器：Run galaxy → 等到 record_forecast 节点 → 点开看 boxed answer
```

## Principle

我们不要"更花哨的 agent log viewer"。我们要的是一份**可以指给课堂上任何
一个学生看的、能逐步说清楚 forecast agent 为什么改判**的实时图。所有 React
Flow、dagre、SSE 都为这条体验服务；只要它跑得起来 + 看得懂 + 点得开原始
payload，就够了。
