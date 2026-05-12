# AGENTS.md

## Scope of this file

通用工作流、ownership、git 与 verify 规则。**产品规则与页面契约**以下面文档为准（优先级从高到低）：

1. `docs/data.md` — 数据契约
2. `docs/design.md` — IA / 页面 / 视觉
3. `README.md` — 总入口与定位
4. `PLANS.md` — Forecast 页（galaxy-selfevolve live viewer）专用规划

本文件与上述文档冲突时，**以上述文档为准**；本文件只保留协作层规则。

## Start

Before editing, read:

1. `README.md`
2. `docs/design.md`
3. `docs/data.md`
4. 与你任务相关的：`PLANS.md`（Forecast）或 `docs/codex-background-pages.md`（背景三页）
5. `AGENTS.md`

Then run:

```bash
git status --short
git branch --show-current
```

Dirty files are user or peer-agent work. Do not revert or overwrite unrelated changes. Use Chinese for summaries; keep code, APIs, scripts, and schema names in English.

## Two parallel tracks

本仓库当前同时推进两条平行工作线，互不污染：

| Track | Owner agent / docs | 目标 | 数据源 |
| --- | --- | --- | --- |
| **Background pages**（Overview / News / Market） | `docs/codex-background-pages.md`（codex） + `docs/design.md` + `docs/data.md` | 让 reviewer 30 秒内理解 Hormuz 当前事件状态 + 市场背景 + 外部预测引用 | `data/generated/{overview_snapshot,news_timeline,market_chart}.json`、`data/external/polymarket_questions.json` |
| **Forecast page**（galaxy live viewer） | `PLANS.md` | 真实 galaxy-selfevolve run 的实时可视化器 | `data/galaxy/runs/<date>/.../main_agent.jsonl` |

跨界规则：

- 背景三页**不读** `data/galaxy/**`，不渲染 Forecast 任何 state。
- Forecast 页**不读** `data/generated/`、`data/events/`、`data/external/`，不调用 Overview/News/Market 任何组件 / store。
- 当前阶段两条线**不双向引用**；未来联动方向见 `docs/design.md` §0。

## Product invariants（适用两条线）

- 不伪造 sources, metrics, probabilities, citations, freshness, URLs, 或 `source_hash`。
- Pending sources 必须 visibly pending，不能产生 high-confidence live evidence；pending UI 上不画线、不出数值。
- IEA/EIA Hormuz facts 是结构性 baseline，不是 real-time throughput。
- UI 不暴露 raw debug logs、chain-of-thought、internal prompts。
- PortWatch baseline 只由 PortWatch 自身历史派生，不与 IMO threshold 跨源拼接。
- Polymarket odds / events_timeline / GDELT 永远不进入 `EvidenceClaim` / `canonical_inputs.json` / forecast pipeline。
- `EvidenceClaim` / `judgement_updated` / `scenarioDistribution` / `MarketRead.pricingPattern` / `mechanismTags` / `checkpointId` schema 保留，但**不在背景三页渲染**；仅 Forecast 页（PLANS.md）未来可能复用。
- 不在背景三页源代码中字面引用上述 forecast revision 字段（由 `audit:legacy` grep 守门）。

## Page boundaries（一句话版；细节看 design.md §5）

- **Overview**：当前事件状态 + Hormuz baseline + Traffic snapshot（PortWatch 置顶）+ 关键 market snapshot + Polymarket 外部预测。零 scenario 概率 / 零 Why-not-closure / 零 checkpoint。
- **News**：events_timeline 时间轴（advisory + GDELT promoted）+ filter bar + 每条可展开 PortWatch ±7d 对照。只叙事不解读。
- **Market**：Traffic chart（PortWatch daily + 7d avg + 1y baseline）+ 跨资产 normalized chart + 三组 sparkline + coverage table。不做 pricing pattern 解读。
- **Forecast**：galaxy-selfevolve live trace；细节 PLANS.md。

## Ownership

Each task has one primary owner. Keep changes inside that scope.

- `contract`: `src/types/**`, `src/state/**`, `src/lib/forecast/**`, `src/data/sourceRegistry.ts`, non-UI `scripts/audit-*.mjs`。
- `forecast`: `src/pages/Forecast*`, `src/components/forecast/**`, `scripts/run-galaxy-hormuz.mjs`, `vite.config.ts` 的 galaxy middleware, Forecast story/replay/inspector UI。**只**由 PLANS.md track 触及。
- `product-surface`: `src/pages/{Overview,News,Market}*`, `src/components/layout/**`, `src/components/shared/**`, `src/components/map/**`, `src/styles/product.css`, UI copy/helpers, `scripts/audit-ui.mjs`。**只**由 codex-background-pages.md track 触及。
- `data`: `data/**`, `scripts/fetch-*.mjs`, `scripts/snapshot-*.mjs`, `scripts/curate-*.mjs`, `scripts/build-generated.mjs`, `scripts/build-local-evidence.mjs`, `scripts/run-galaxy-hormuz.mjs`（galaxy track 部分）, `docs/data.md`。
- `docs`: `README.md`, `docs/**`, `AGENTS.md`, `PLANS.md`。
- `infra`: `package.json`, `vite.config.ts`, `tsconfig*.json`, build/lint setup。

High-conflict files：

```text
src/App.tsx
src/state/projections.ts
src/state/canonicalStore.ts
src/data.ts
src/styles.css
src/styles/product.css
package.json
vite.config.ts
README.md
docs/*
AGENTS.md
PLANS.md
```

Before editing a high-conflict file, inspect its diff. Preserve peer work unless the user explicitly asks otherwise.

## Git

Use git as coordination state.

- Start and end every task with `git status --short`。
- If remote/peer branches matter, `git fetch --all --prune` first。
- Do not pull or merge before understanding local dirty files。
- Commit only scoped task files when asked to commit。
- If versions differ, finish and verify your task first, then review and merge peer work。
- After merges or conflict resolution, rerun relevant checks。

For peer review:

```bash
git log --oneline --decorate --max-count=12 --all
git diff <base>...<peer-branch> --stat
git diff <base>...<peer-branch> -- <shared-paths>
```

## Verify

Default:

```bash
npm run lint
npm run build
npm run audit
```

`npm run audit` 聚合（详见 `docs/data.md` §6）：

```text
audit:data          FRED 行 lineage、PortWatch baseline 一致性、pending 行规则
audit:events        events_timeline + events_candidates 完整性、promote 链路
audit:polymarket    polymarket_questions 完整性 + 防回流 EvidenceClaim 引用
audit:evidence      data/evidence/ 范围（背景三页不消费）
audit:forecast      data/evidence/ + data/checkpoints/ + data/galaxy/
audit:replay        deterministic replay contract
audit:legacy        旧字段防回流 + 背景三页禁字面引用 forecast revision 字段
audit:galaxy        galaxy artifact 完整性
audit:ui            [P2] 渲染时 caveat / retrieved_at / source_url 可见
```

针对性 audit 选用（按当前任务 owner）：

- `contract` / `data` 改动：`audit:data`、`audit:events`、`audit:polymarket`、`audit:legacy`。
- `product-surface` 改动：`audit:legacy`、`audit:ui`（P2）。
- `forecast` 改动：`audit:galaxy`、`audit:forecast`、`audit:replay`。

Do not claim a check passed unless it ran.

## Data pipeline 速查

```bash
npm run fetch:p0          # FRED + advisories + PortWatch + baseline
npm run curate:events     # advisory mirror + GDELT ingest → candidates / timeline
npm run curate:polymarket # gamma-api /events → polymarket_questions.json
npm run build:evidence    # legacy（背景三页不消费）
npm run build:generated   # → data/generated/{overview_snapshot,news_timeline,market_chart}.json
npm run build:data        # 聚合以上
```

人工 curate：

```bash
npm run curate:events -- --interactive
npm run curate:events -- --auto-promote
npm run curate:polymarket -- --interactive
```

## Final Summary

每个任务结束包含：

- summary
- owner
- files touched
- verification（哪条 audit / lint / build 跑过、结果）
- git status / commit / merge state
- risks or next steps
