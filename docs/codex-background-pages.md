# Codex Prompt — 背景三页（Overview / News / Market）实现

> Hand this file to codex as the working brief. Forecast 页（galaxy-selfevolve live viewer）由 `PLANS.md` 单独驱动，**不在本任务范围**。两条路径并行推进。

---

## 0. 你的角色与边界

你是本仓库（`hormuz-risk-interface`）的实现 agent，目标是把 **Overview / News / Market 三页** 从"forecast revision 可视化"重构为"Hormuz 事件背景 + 市场背景 + 外部预测引用"独立形态。**Forecast 页不动**（它由另一条工作线按 `PLANS.md` 实现）。

你必须先读这三份文件，并把它们视为**唯一权威**：

1. [`README.md`](../README.md) — 总入口与四页定位。
2. [`docs/design.md`](design.md) — 页面 IA、视觉、字段、信息契约。
3. [`docs/data.md`](data.md) — 本地数据契约、目录、schema、采集与 audit。

任何冲突以 `data.md` > `design.md` > `README.md` 优先级解决。若发现文档自身有冲突或缺失，**先停下写一段 Plan 反问**，不要自己推断填补。

不要碰：

- `src/pages/ForecastPage.tsx`、`src/components/forecast/*`、`scripts/run-galaxy-hormuz.mjs`、`vite.config.ts` 的 galaxy middleware、`data/galaxy/**`、`PLANS.md`。
- `src/state/forecastStore.ts` / `src/state/canonicalStore.ts` 中 scenario / mechanism / judgement_updated / checkpoint 相关字段（保留供 Forecast 页未来用，仅断 UI 引用）。
- 现有 `data/observations/` / `data/evidence/` / `data/checkpoints/` 内容（保留，仅停止被背景三页消费）。

## 1. 工作方式

- 每个 milestone 开始前先写一段 **Plan**（≤ 200 字）：要改哪些文件、为什么、verify 命令。Plan 得到 OK 后再动手。
- 每个 milestone 结束跑对应 audit + `npm run lint` + `npm run build`，把输出贴回来。UI 改动后必须人工 smoke（`npm run dev`），截图或文字说明三页关键区块是否符合 `design.md`。
- 提交粒度：一个 milestone 一个 commit，commit message `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` 注脚保留。
- 不写无关 refactor、不补 backward-compat shim、不给"将来可能用"的字段。每一行改动可追到当前 milestone。
- 不写 `source_hash` 而对应 raw 文件不存在；不伪造数值；不让 Polymarket odds / events / pending series 进入 EvidenceClaim 或 forecast 任何流程。
- 中文优先回答（技术名词保留英文）；代码与注释按 `data.md` / `design.md` 既有风格（中英混排，注释只写 *为什么*，不写显而易见的 *做了什么*）。

## 2. 目标终态（Done When）

打开 `npm run dev`：

1. **Overview 页** 一屏看到：headline severity strip → baseline strip + mini map → latest events (top 3) + Traffic snapshot（置顶）→ Market snapshot → Polymarket card（3–5 条，来自 hormuz / us_iran / oil 三类）。零 scenario 概率、零 `Why not closure`、零 `pricingPattern`、零 checkpoint id。
2. **News 页** 一屏看到时间轴（advisory + GDELT promoted media events），filter bar（time / severity / source_type / topic），每条可展开看 description + cross-check + PortWatch ±7d 对照。
3. **Market 页** Traffic chart（PortWatch 日序列 + 7d avg + 1y baseline 虚线）→ cross-asset normalized chart → 三组 sparkline → traffic vessel-type detail (if any) → coverage table。所有图都能 overlay News 事件竖线。
4. **Forecast 页未被本任务改动**（git diff 空）。
5. `npm run audit` 全绿，包括新增的 `audit:events` / `audit:polymarket` / 扩展的 `audit:legacy`。
6. `npm run build` 通过。

## 3. Milestones

### M1 — Registry / Schema / Pipeline scaffold

**目标**：把 `sources.json` / `market_providers.json` 扩展，把 `data/events/` `data/external/` 目录建好，把 TypeScript schema 落到 `src/types/`。**不**实现 fetch 脚本。

Deliverables：

- 更新 `data/registry/sources.json`：新增 / 更新 `events-curated`, `gdelt-news`, `polymarket-curated`（详见 `data.md` §2、§4.1）。
- 新增空文件占位：`data/events/events_candidates.jsonl`、`data/events/events_timeline.jsonl`、`data/external/polymarket_questions.json`（含一条手填 Hormuz traffic 题作种子）。
- 新增 / 更新 TypeScript 类型：`src/types/timeline.ts`（`TimelineEvent`, `EventCandidate`）、`src/types/polymarket.ts`（`PolymarketQuestionRef`）、`src/types/marketChart.ts`（`MarketChartBundle`, `OverviewSnapshot`, `NewsTimelineBundle`, `HormuzTransitObservation`）。
- 不修改任何渲染代码。

Verify：`npm run lint && npm run build && npm run audit:legacy`（audit 不应报错）。

### M2 — GDELT + Polymarket + PortWatch 数据采集

**目标**：实现三条 fetch / curate 脚本，能产出 `data/raw/gdelt/**`、`data/events/events_candidates.jsonl`、`data/external/polymarket_questions.json`、以及完整的 PortWatch 日序列（已有 `snapshot-portwatch.mjs` 检查/补全）。

Deliverables：

- `scripts/curate-events.mjs`：
  - GDELT DOC 2.0 `/api/v2/doc/doc?mode=ArtList&format=JSON&maxrecords=75&timespan=14d` 抓 `data.md` §4.6 列出的 query 集合 → `data/raw/gdelt/<slug>/<ts>.json`。
  - 把 `data/normalized/maritime/advisories.jsonl` 自动 mirror 一条 `events_timeline.jsonl` entry（advisory_id ↔ event_id 一一对应）。
  - 把 GDELT 结果 sha1(url) 去重写入 `data/events/events_candidates.jsonl`。
  - `--auto-promote`：仅 allowlist domain（见 `data.md` §4.6）自动 promote 到 `events_timeline.jsonl`。
  - `--interactive`：CLI 列出 candidate，让 reviewer y/n + 填 severity_hint / tags。
  - 默认 non-interactive refresh：仅新增 candidate / 更新 retrieved_at；不覆盖人工 curate 过的 timeline entry。
- `scripts/curate-polymarket.mjs`：
  - GET `https://gamma-api.polymarket.com/events?limit=200&closed=false&order=volume24hr&ascending=false` → `data/raw/polymarket/events/<ts>.json`。参考 `/Users/weichy/code/benchmark_merge_v8/source/Polymarket_source.py` 的 endpoint / 字段抽取**思路**，但不复用题目格式化逻辑。
  - 按 `data.md` §4.8 关键词规则筛 hormuz / us_iran / oil / regional，每组 top 5 by 24h volume，总入库 ≤ 20。
  - 保留人工设置的 `selected_for_overview`（按 `question_id` 匹配后合并）。
  - 失败 / 限流时落空 raw 文件并 exit 非零；不静默吞错。
- `scripts/snapshot-portwatch.mjs`（已存在）补足：确保 `data/normalized/maritime/hormuz_transits.csv` 字段含 `vessel_type`（默认 `all`），且日序列覆盖近 1 年（够 `baseline_1y_same_window` 计算）。
- `package.json` 新增 npm scripts：`curate:events`、`curate:polymarket`，并把它们接进 `build:data`（详见 `data.md` §5）。

Verify：

```bash
npm run curate:events
npm run curate:polymarket
ls data/raw/gdelt/ data/raw/polymarket/ data/events/ data/external/
wc -l data/events/events_candidates.jsonl data/events/events_timeline.jsonl
```

至少有 1 条 advisory mirror entry + ≥10 条 GDELT candidate + Polymarket ≥3 个 topic 各有候选。

### M3 — `build-generated.mjs` 三 bundle

**目标**：把 baseline + FRED + advisories + transits + events + polymarket 编译成 UI 直接消费的 generated bundle。

Deliverables：

- `scripts/build-generated.mjs`：
  - 读 normalized + events + external 文件，组装：
    - `data/generated/overview_snapshot.json`（schema `data.md` §4.9）
    - `data/generated/news_timeline.json`（schema §4.10）
    - `data/generated/market_chart.json`（schema §4.11）
  - PortWatch baseline：滚动 7d avg + 同期 ±15d 1y 均值，纯在 builder 派生，不跨源。
  - `current_severity` 取最近一条 timeline entry 的 `severity_hint`，14d 无 entry → `quiet`。
  - `market_chart.series[group="traffic"]` 至少一条 `target=portwatch_daily_transit_calls_all`，含 `baseline_points`。
  - `event_overlays` 仅取最近 365d events，含 `related_market_targets`。
- 把 `build:generated` 接进 `npm run build:data`；保留旧 `market_series.json`（兼容期）。

Verify：

```bash
npm run build:data
cat data/generated/overview_snapshot.json | jq '.traffic_snapshot, .current_severity, (.latest_events | length), (.polymarket_refs | length)'
cat data/generated/market_chart.json | jq '.series[] | {target, group, status, has_points: (.points | length > 0)}'
```

### M4 — 解耦 + audit 扩展（守护轨道）

**目标**：在重写 UI 之前先把守门员就位，避免重写过程中把旧 forecast 耦合带回背景三页。

Deliverables：

- 新增：
  - `scripts/audit-events.mjs`（`data.md` §6.2 列举的所有 events 失败条件）。
  - `scripts/audit-polymarket.mjs`（同上 polymarket 部分；包括 "External market, not our forecast" 子串检查、防回流 EvidenceClaim 引用检查）。
- 扩展 `scripts/audit-legacy.mjs`：grep `src/pages/{OverviewPage,NewsPage,MarketPage}.tsx` 及其 imports（递归 dependency），禁止字面出现：`scenarioDistribution`, `pricingPattern`, `judgement_updated`, `mechanismTags`, `checkpointId`, `Why not closure`, `next watch`, `MarketRead`。
- 微调 `scripts/audit-data.mjs`：增加 `market_chart.json` series `evidenceEligible !== false` 即 fail；traffic 行 `baseline_points` 必须来自 PortWatch（用 `source_id` 校验）。
- `package.json` 把 `audit:events`, `audit:polymarket` 加入 `audit` 聚合。

Verify：`npm run audit` 必须**报告**当前 UI 仍引用旧字段（如果是的话），明确列出违规 grep 行号；本 milestone 不修复，只让 audit 把违规暴露出来。

### M5 — Overview 页重写

**目标**：按 `design.md` §5.1 落地 Overview。

Deliverables：

- `src/pages/OverviewPage.tsx` 重写：消费 `data/generated/overview_snapshot.json`。
- 组件拆分（建议）：`HeadlineSeverityStrip`、`BaselineStrip`、`MiniMap`（保留现有 / 简化）、`LatestEventsCard`、`TrafficSnapshotCard`、`MarketSnapshotCard`、`PolymarketCard`。
- Polymarket card 强制渲染 caveat（"External market, not our forecast"）。
- 移除所有旧引用：scenario distribution、Why not closure、judgement headline、checkpoint id、`pricingPattern`。
- Latest events / Market snapshot 上点击跳 `/news#<event_id>` / `/market`。

Verify：`npm run audit:legacy` 关于 OverviewPage 必须由 fail 变 pass；`npm run lint && npm run build`；浏览器 smoke：截图或文字描述六个区块都在位、Polymarket caveat 可见、所有数字旁有 retrieved_at hover。

### M6 — News 页重写

**目标**：按 `design.md` §5.2 落地 News。

Deliverables：

- `src/pages/NewsPage.tsx` 重写：消费 `data/generated/news_timeline.json`。
- 组件：`NewsFilterBar`（time range / severity / source_type / topic）、`TimelineList`（按 event_at desc）、`TimelineEntry`（含 expand 展示 description + cross-check + PortWatch ±7d mini sparkline）。
- 每条 entry id 在 DOM 上是 `id={event_id}`，支持 `/news#evt-...` 直接跳到锚点。
- raw_path 点击在浏览器新 tab 打开本地 snapshot 文件（vite static serve 即可）。

Verify：`audit:legacy` NewsPage 通过；浏览器 smoke：filter 工作、官方 / media 视觉层级正确、展开 mini sparkline 出现。

### M7 — Market 页重写

**目标**：按 `design.md` §5.3 落地 Market。

Deliverables：

- `src/pages/MarketPage.tsx` 重写：消费 `data/generated/market_chart.json`。
- 顺序：Range selector + event overlay toggle → **Traffic chart**（PortWatch daily + 7d avg + 1y baseline 虚线）→ Cross-asset normalized chart → 三组 sparkline → Traffic vessel-type detail（如有）→ Coverage table。
- 不引入 `MarketRead` / `pricingPattern` / "市场支持哪个 scenario" 任何字段或文案。
- 事件竖线 hover 显示 title + 跳 `/news#<event_id>`。
- pending series 在 legend / coverage table 显式标 pending 灰。

Verify：`audit:legacy` MarketPage 通过；浏览器 smoke：range 切换、event overlay 切换、Traffic baseline 虚线可见、coverage table 字段齐。

### M8 — 收尾

- 删除 / 隔离 Overview / Market / News 不再使用的旧组件（如 `WhyNotClosureCard` 之类）。**只删被 OvervewPage / NewsPage / MarketPage 引用过的**；通用 forecast 组件保留。
- 更新 README 的 Implementation Status 表格：把 `[P0]` 已完成的勾成 `[implemented]`。
- 跑全套：

```bash
npm run build:data
npm run audit
npm run lint
npm run build
npm run dev   # 人工 smoke 三页 + 确认 Forecast 页 git diff 空
```

## 4. Verification 命令速查

```bash
npm run fetch:p0
npm run curate:events
npm run curate:polymarket
npm run build:data         # 等于 fetch:p0 + curate:events + curate:polymarket + build:evidence + build:generated
npm run audit              # data + events + polymarket + evidence + forecast + replay + legacy + galaxy
npm run lint
npm run build
npm run dev                # http://localhost:5173/
```

## 5. 你不可以做的事（再次强调）

- 不动 Forecast 页与 galaxy pipeline。
- 不让 Polymarket / events_timeline / GDELT 进入 EvidenceClaim、judgement_updated、scenarioDistribution、canonical_inputs。
- 不在 PortWatch UI 文案里出现 "closure" / "scenario" / "probability" 这种解读语。
- 不跨源拼 PortWatch baseline 与 IMO threshold。
- 不写 `source_hash` 而对应 raw 文件不存在。
- 不为伪造 Gold / USD-CNH / HSTECH / 国内期货主连写假走势。
- 不补"将来可能用"的字段；不为 hypothetical scenario 写代码路径。
- 不在 commit 里夹 unrelated refactor。

## 6. 卡住怎么办

- 文档冲突：贴出冲突段落 + 你的解读，停下来问，不擅自决定。
- 上游 source 抓不到（GDELT 限流 / Polymarket 字段变 / PortWatch 改版）：保留 raw 抓取证据，把 stale 状态写进 `retrieved_at` + caveat，**不**回退到造假；明确告知后由人决定 hold 还是 ship。
- audit 红：不要为了让 audit 绿而改 audit 规则；改代码或数据来满足规则。改 audit 规则需在 Plan 里单独提出并得到 OK。

## 7. 收到本 prompt 后

请先回我一个**总体 Plan**：你打算先做哪个 milestone、为什么、verify 命令、有哪些已发现的文档歧义需要先澄清。**不要直接开干**。
