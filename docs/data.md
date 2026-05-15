# Hormuz Local Data System

Last updated: 2026-05-15

本文档说明当前仓库的**本地文件数据库**如何构建、如何 daily 同步、哪些产物由 UI 消费、哪些数据绝不能回流到 forecast pipeline。

本文件是现状说明，不是 0-1 设计计划。页面设计见 [`docs/design.md`](design.md)。Forecast 页的真实 `galaxy-selfevolve` run 数据流见 [`PLANS.md`](../PLANS.md)，这里只说明边界。

## 1. 当前数据模型

本仓库没有 SQL/向量数据库。所谓“本地数据库”是一组可审计的 versioned files：

```text
remote sources
  -> data/raw/**                 # append-only 原始快照
  -> data/normalized/**          # source-native normalized tables
  -> data/events/**              # curated event timeline + GDELT candidate pool
  -> data/external/**            # external prediction-market refs
  -> data/generated/**           # UI-ready bundles
```

运行时边界：

- Overview / News / Market 只读 `data/generated/{overview_snapshot,news_timeline,market_chart}.json`，以及由 bundle 引用的 source metadata。
- Browser UI 不直接调用 FRED、PortWatch、GDELT、Polymarket、Stooq 或官方 advisory 页面。
- `data/raw/**` 是 evidence lineage，不是 UI API。
- `data/generated/**` 是 derived artifact，可重建，不手动编辑。
- `data/events/**` 与 `data/external/**` 是 curated local database，允许人工 review，但必须保留 `source_url`、`retrieved_at` 和 caveat。
- `data/galaxy/**`、`data/forecast-agent/**` 是 Forecast 页 / agent run 专用，不是背景三页输入。

## 2. 数据源

当前 active / curated sources：

| Source | 本地入口 | 用途 | 边界 |
| --- | --- | --- | --- |
| EIA / IEA Hormuz baseline | `data/normalized/baseline/hormuz_baseline.json` | Overview baseline strip | 结构性 chokepoint baseline，不是当日 throughput |
| FRED | `scripts/fetch-fred.mjs` -> `data/normalized/market/fred_series.csv` | Brent / WTI spot proxy、VIX、Broad USD、USD/CNY、US10Y、S&P 500、NASDAQ、US CPI | UI 用本地快照；DEXCHUS 只能是 USD/CNY，不能当 USD/CNH |
| Stooq XAU/USD | `scripts/fetch-gold.mjs` -> `data/normalized/market/gold_xauusd_history.json` | Market Gold spot proxy | 使用 Close 作为 XAU/USD proxy，不等同 LBMA benchmark 或 futures continuous contract |
| Official advisories | `scripts/fetch-advisories.mjs` -> `data/normalized/maritime/advisories.jsonl` | News official events seed | page snapshot / advisory candidate，不直接成为 forecast evidence |
| IMF PortWatch | `scripts/fetch-traffic.mjs` -> `data/normalized/maritime/hormuz_transits.csv` | Overview Traffic、Market traffic chart、News event window traffic context | AIS/GNSS derived aggregate；baseline 只由 PortWatch 自身历史派生 |
| IMO Hormuz monthly page | `scripts/fetch-traffic.mjs` raw snapshots | traffic sanity context | 当前保存 page / chart image，不抽取数值进主图 |
| GDELT DOC 2.0 | `scripts/curate-events.mjs` -> `data/events/events_candidates.jsonl` | news discovery candidate pool | candidate 不能直接渲染；promote 后才进 timeline |
| Curated events | `data/events/events_timeline.jsonl` + `history_seed.jsonl` | News timeline、Overview latest events、Market overlays | 只叙事，不表达 probability / scenario / judgement |
| Polymarket gamma API | `scripts/curate-polymarket.mjs` -> `data/external/polymarket_questions.json` | Overview external prediction-market reference | External market, not our forecast；永不进入 EvidenceClaim / canonical_inputs |

Pending / candidate providers 保存在 `data/registry/market_providers.json` 与 `data/registry/sources.json`。Pending source 可以在 UI 里显示为 caveat 或 coverage row，但不能产生 active values，也不能进入 `EvidenceClaim`。

## 3. 目录职责

```text
data/
  registry/
    sources.json
    market_providers.json

  raw/
    fred/<SERIES_ID>/<retrieved_at>.csv
    advisories/<source>/<kind>/<retrieved_at>-*.html
    traffic/imf-portwatch-hormuz/<retrieved_at>-*.json|html
    traffic/imo-hormuz-monthly/<retrieved_at>-*.html|png
    stooq/xauusd/<retrieved_at>.json
    gdelt/<query_slug>/<retrieved_at>.json
    polymarket/events/<retrieved_at>.json

  normalized/
    baseline/hormuz_baseline.json
    market/fred_series.csv
    market/gold_xauusd_history.json
    maritime/advisories.jsonl
    maritime/hormuz_transits.csv

  events/
    history_seed.jsonl
    events_candidates.jsonl
    events_timeline.jsonl

  external/
    polymarket_questions.json

  generated/
    overview_snapshot.json
    news_timeline.json
    market_chart.json
    market_series.json
    canonical_inputs.json
    news_refresh_status.json

  observations/
    source_observations.jsonl

  evidence/
    evidence_claims.jsonl

  galaxy/
    ...
```

规则：

- `raw/` append-only。文件名使用 safe ISO timestamp，冒号和点替换为 `-`。
- `normalized/` 可由脚本 upsert / rewrite；必须能追溯到 raw snapshot。
- `events_candidates.jsonl` 是机器发现池；人工状态只应通过 `curate-events.mjs` 的 promote / reject 流程改变。
- `events_timeline.jsonl` 是 reviewer-facing curated timeline；每条必须有 `event_id`、`event_at`、`source_url`、`retrieved_at`、`severity_hint`。
- `polymarket_questions.json` 保存外部预测问题引用；`selected_for_overview` 是人工选择字段，`curate-polymarket.mjs` 会尽量保留。
- `generated/*.json` 只由 `scripts/build-generated.mjs` 或相关 build scripts 写入。

## 4. 全量构建

标准入口：

```bash
npm run build:data
```

当前 `build:data` 展开为：

```text
npm run fetch:p0
  -> npm run fetch:fred
  -> npm run fetch:advisories
  -> npm run fetch:traffic

npm run fetch:gold || warn and keep latest local snapshot
npm run curate:events
npm run curate:polymarket || warn and keep seed/local refs
npm run build:evidence
npm run build:generated
```

各步骤写入：

| Command | 写入 | 说明 |
| --- | --- | --- |
| `fetch:fred` | `data/raw/fred/**`、`data/normalized/market/fred_series.csv`、`data/generated/market_series.json` | 抓最近一年 FRED CSV；保留官方空值为 `""`，不把 missing value 转成 0 |
| `fetch:advisories` | `data/raw/advisories/**`、`data/normalized/maritime/advisories.jsonl` | snapshot UKMTO / MARAD / IMO 页面；MARAD detail page 会抽取候选 |
| `fetch:traffic` | `data/raw/traffic/**`、`data/normalized/maritime/hormuz_transits.csv` | 抓 PortWatch ArcGIS full daily layer + IMO page/chart snapshots |
| `fetch:gold` | `data/raw/stooq/xauusd/**`、`data/normalized/market/gold_xauusd_history.json` | 抓 Stooq XAU/USD 1y daily OHLC；失败时 `build:data` 不清空旧数据 |
| `curate:events` | `data/raw/gdelt/**`、`data/events/events_candidates.jsonl`、`data/events/events_timeline.jsonl` | mirror advisories，merge `history_seed`，刷新 GDELT candidate pool |
| `curate:polymarket` | `data/raw/polymarket/events/**`、`data/external/polymarket_questions.json` | 从 gamma API 筛选相关 open events，保留人工 `selected_for_overview` |
| `build:evidence` | `data/observations/source_observations.jsonl`、`data/evidence/evidence_claims.jsonl`、`data/generated/canonical_inputs.json` | legacy / forecast-contract artifacts；背景三页不消费 |
| `build:generated` | `data/generated/overview_snapshot.json`、`news_timeline.json`、`market_chart.json` | 编译 UI 直接消费的 bundle |

`build:data` 是 daily full refresh 的推荐入口，尤其是在 FRED / Stooq / PortWatch 更新完成后运行。

## 5. Daily 同步

### 5.1 标准 daily full refresh

每天一次，用于刷新市场、traffic、official advisory、GDELT candidates、Polymarket refs 和 UI bundles：

```bash
npm run build:data
npm run audit
npm run build
```

建议顺序：

1. 运行 `npm run build:data`。
2. 如果 `curate:events` 报 GDELT 部分 query 失败，先看 stderr。脚本会保留成功 query 的 raw/candidate，并把 `gdelt-news.status` 写成 `lagging` 或 `missing`；不要手动清空 candidate pool。
3. 如果 `fetch:gold` 或 `curate:polymarket` 失败，`build:data` 会 warning 并继续使用本地旧快照 / seed；随后必须用 audit 判断是否仍可交付。
4. 运行 `npm run audit`。
5. 运行 `npm run build`。
6. 若 UI 需要人工 smoke，再运行 `npm run dev -- --port 5173`。

### 5.2 轻量 News refresh

如果只是想更频繁刷新 News / Overview latest events，而不重新抓 FRED、PortWatch、Stooq、Polymarket：

```bash
npm run refresh:news
```

它做的事：

1. `fetch-advisories.mjs`：尝试更新 official advisory snapshots，允许失败。
2. `curate-events.mjs --gdelt-only --prune-candidates`：用较短 GDELT window 刷新 candidate pool，允许失败。
3. `curate-events.mjs --skip-gdelt`：mirror advisories + merge `history_seed.jsonl`。
4. `build-generated.mjs`：用现有 normalized market / traffic 数据和最新 timeline 重建 bundles。
5. `audit-events.mjs`：检查 timeline / candidate linkage。
6. 写 `data/generated/news_refresh_status.json`，记录每步 command、exit code、stdout/stderr tail、event/candidate counts。

失败语义：

- 外部 fetch 失败不会清空现有 timeline。
- 成功的 raw snapshots / candidates 会保留。
- 只有 generation 或 `audit:events` 失败时，本次 `refresh:news` 才应视为不可交付。
- `refresh:news` 不更新 FRED / PortWatch / Stooq / Polymarket；Market 数字仍来自上一次 full refresh。

## 6. 人工 curate

### 6.1 Events

默认 `npm run curate:events` 会：

- mirror `advisories.jsonl` 中的 official advisory candidate；
- merge `data/events/history_seed.jsonl`；
- query GDELT DOC 2.0；
- 按 `sha1(url)` upsert `events_candidates.jsonl`；
- 不自动把普通 candidate 渲染进 News。

人工 review：

```bash
npm run curate:events -- --interactive
```

允许自动 promote allowlisted + high-relevance items：

```bash
npm run curate:events -- --auto-promote
```

只做本地 advisory/history merge，不触网：

```bash
npm run curate:events -- --skip-gdelt
```

promoted candidate 必须满足：

- candidate `status="promoted"`；
- candidate `promoted_event_id` 指向 timeline event；
- timeline event 的 `related_candidate_ids` 反向包含该 candidate；
- `description` 不含 forecast interpretation，如 scenario / judgement / probability / agent。

### 6.2 Polymarket

```bash
npm run curate:polymarket
```

脚本从 `https://gamma-api.polymarket.com/events` 抓 open events，按 topic rules 筛 `hormuz`、`us_iran`、`oil`、`regional`、`iran_domestic`。输出最多 20 条到 `data/external/polymarket_questions.json`。

人工选择 Overview 展示项时，只改 curated file 里的：

- `selected_for_overview`
- 必要时 `caveat`

下一次 `curate:polymarket` 会按 `question_id` 尽量保留这些人工字段。每条 caveat 必须包含：

```text
External market, not our forecast
```

## 7. Generated bundles

`scripts/build-generated.mjs` 是背景三页的编译器。

### 7.1 `overview_snapshot.json`

给 Overview 页使用，主要字段：

- `built_at`
- `data_as_of`
- `baseline`
- `current_severity`
- `latest_events`
- `traffic_snapshot`
- `market_snapshot`
- `polymarket_refs`

`current_severity` 来自 rendered timeline 最新事件；如果最近 14 天无事件，则为 `quiet`。`traffic_snapshot` 来自 PortWatch all-vessel daily rows，含 latest value、7d avg、same-window 1y baseline 和 caveat。

### 7.2 `news_timeline.json`

给 News 页使用，主要字段：

- `built_at`
- `data_as_of`
- `source_event_count`
- `rendered_event_count`
- `candidate_count`
- `render_policy`
- `candidate_policy`
- `events`
- `source_index`
- `topic_index`
- `topic_cloud`

当前 render policy 是：如果存在 `source_id="events-curated"` 或 `tags` 含 `core_event` 的事件，优先渲染 core events；否则回退渲染全部 timeline events。GDELT candidate 的 policy 固定是 `held_until_promoted`。

### 7.3 `market_chart.json`

给 Market 页使用，主要字段：

- `built_at`
- `data_as_of`
- `series`
- `event_overlays`
- `regime_overlays`

`series` 中 active rows 必须有 `source_id`、`provider_id`、`license_status`、`retrieved_at`、`source_url`、`raw_path`、`source_hash`、`caveat`。所有 `market_chart` series 的 `evidenceEligible` 必须是 `false`。

Traffic rows：

- `portwatch_daily_transit_calls_all`
- `portwatch_7d_avg_transit_calls_all`
- vessel-type coverage rows: tanker / container / dry_bulk / other

Traffic `baseline_points` 只允许挂在 PortWatch traffic series 上，方法是 `same_calendar_window`、31-day window、1-year lookback。不能把 IMO threshold 或其他来源拼入 PortWatch baseline。

### 7.4 `market_series.json`

这是较早的 market bundle，仍由 `fetch:fred` 生成并被 legacy / audit 读取。背景三页主图当前以 `market_chart.json` 为准，但不要随意删除 `market_series.json`，因为 `build:evidence`、`audit:market-lineage` 和若干 legacy checks 还依赖它。

## 8. Forecast boundary

背景三页数据与 Forecast 页数据并行存在：

| Surface | 可以读取 | 不可以读取 |
| --- | --- | --- |
| Overview / News / Market | `data/generated/overview_snapshot.json`、`news_timeline.json`、`market_chart.json`、`data/external/polymarket_questions.json` | `data/galaxy/**`、Forecast agent trace、raw prompts、chain-of-thought |
| Forecast | `data/galaxy/**`、`data/forecast-agent/**`、Forecast-specific artifacts | `events_timeline` / Polymarket / GDELT 作为 forecast evidence |

强约束：

- Polymarket odds、GDELT candidates、events timeline 不进入 `EvidenceClaim`、`canonical_inputs.json` 或 Forecast forecast-state。
- Background pages 不渲染 `scenarioDistribution`、`judgement_updated`、`pricingPattern`、`mechanismTags`、`checkpointId`。
- PortWatch daily rows 可以作为 UI traffic context；不能在未验证 metric definition 前生成 `traffic_flow_down` 之类 forecast evidence。
- Pending source 不生成 active values。

## 9. Audit

全量：

```bash
npm run audit
```

聚合顺序当前为：

```text
audit:data
audit:events
audit:polymarket
audit:market-providers
audit:pending-sources
audit:market-lineage
audit:galaxy
audit:forecast-agent
audit:evidence
audit:forecast
audit:replay
audit:legacy
audit:ui
```

常用 targeted checks：

| Command | 检查重点 |
| --- | --- |
| `npm run audit:data` | FRED missing value、baseline facts、advisory raw hash、PortWatch pagination / coverage、generated bundles、canonical artifacts |
| `npm run audit:events` | `events_timeline.jsonl` 字段、severity/source_type、candidate promote linkage、source_hash |
| `npm run audit:polymarket` | Polymarket caveat、outcome price bounds、防止 external refs 回流 forecast evidence |
| `npm run audit:market-providers` | provider status / license / allowed use，active rows 只能用 active production provider |
| `npm run audit:pending-sources` | pending/candidate rows 不得有 values / points，不得进入 EvidenceClaim |
| `npm run audit:market-lineage` | `market_series.json` 与 normalized FRED / raw hash 对齐 |
| `npm run audit:legacy` | 背景页禁止旧 forecast revision 字段回流 |
| `npm run audit:ui` | source/as-of/caveat 可见性和 debug / internal prompt 禁止项 |

不要为了让 audit 绿而降低 audit；先修数据或代码。

## 10. 快速检查命令

查看 UI bundle 新鲜度：

```bash
node -e 'for (const f of ["overview_snapshot","news_timeline","market_chart"]) { const j=require(`./data/generated/${f}.json`); console.log(f, j.built_at, j.data_as_of); }'
```

查看 PortWatch 本地 coverage：

```bash
node -e 'const fs=require("fs"); const lines=fs.readFileSync("data/normalized/maritime/hormuz_transits.csv","utf8").trim().split(/\r?\n/); const h=lines[0].split(","); const rows=lines.slice(1).map(l=>Object.fromEntries(l.split(",").map((v,i)=>[h[i],v]))).filter(r=>r.source_id==="imf-portwatch-hormuz"&&r.metric==="daily_transit_calls"&&r.window==="daily"&&(r.vessel_type||"all")==="all").sort((a,b)=>a.date.localeCompare(b.date)); console.log(rows.length, rows[0]?.date, rows.at(-1)?.date, rows.at(-1)?.value);'
```

查看 News refresh status：

```bash
cat data/generated/news_refresh_status.json | jq '{ok, started_at, finished_at, counts, generated, steps: [.steps[] | {label, ok, exit_code, allowed_failure}]}'
```

## 11. Promotion rules for new sources

新增或升级 source 时，先更新 `data/registry/sources.json` 或 `data/registry/market_providers.json`，再接脚本。Promotion 到 active production 必须满足：

1. raw snapshot 写入 `data/raw/**`。
2. normalized row 有 stable source-native key、date/time、`source_url`、`retrieved_at`。
3. active generated row 有 `raw_path` 和匹配的 `source_hash`。
4. provider license / allowed use 通过 registry audit。
5. pending / candidate 数据不进入 `EvidenceClaim`。
6. UI caveat 清楚说明 proxy / lag / license / source limitation。
7. `npm run audit` 通过。

如果 source 失败或不稳定，状态应是 `pending`、`candidate_smoke_test`、`dev_crosscheck_only` 或 `lagging`，不要伪造成 active 数据。
