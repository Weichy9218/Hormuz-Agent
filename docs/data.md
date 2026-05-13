# Hormuz Data Plan

Last updated: 2026-05-12

本文件定义**背景三页**（Overview / News / Market）使用的数据：本地存哪些、用什么格式、谁消费、如何审计。Forecast 页（galaxy-selfevolve real run）的数据流见 [`PLANS.md`](../PLANS.md)，本文件只标边界，不重述。

设计配套见 [`docs/design.md`](design.md)。

## 0. 本次重新定位的数据影响

旧 data.md 假设所有数据都为 forecast revision contract（`SourceObservation → EvidenceClaim → judgement_updated → checkpoint`）服务。重新定位后：

- **背景三页**不再消费 `EvidenceClaim` / `judgement_updated` / `scenarioDistribution` 任何字段。
- 现有 `data/observations/source_observations.jsonl` 与 `data/evidence/evidence_claims.jsonl` 保留，但**仅用于**：
  1. Forecast 页未来扩展（reviewer-annotated evidence 层）；
  2. audit 验证旧字段不回流到背景三页。
- 新增/升级三类专用数据：
  1. `data/events/events_timeline.jsonl` — Hormuz 事件脉络（News 主轴 + Overview top 3 + Market overlay）。
  2. `data/external/polymarket_questions.json` — 外部预测市场引用（Overview 卡片）。
  3. PortWatch traffic 升级为 UI 一等公民（Overview 置顶 Traffic 行 + Market 主图 traffic 组）。
- News 页 topic 区从 raw tag button wall 升级为 `topic_cloud`：用生成数据给出高权重词、显示 label、event_count、event_ids 和筛选 key；UI 可以渲染为词云图，但仍保持点击筛选语义。
- PortWatch daily history 必须分页抓取 ArcGIS layer 全量历史，而不是只取最近窗口。当前上游 `chokepoint6` 可返回 `2019-01-01` 起的 daily rows；历史事件的 `Traffic ±7d` 不能因为本地只抓最近 430 条而显示空窗。
- Market 页可显示 `stooq-market` 的 XAU/USD 1y daily OHLC history；图上使用 Close 作避险资产 spot proxy，不替代 LBMA benchmark 历史序列或 futures continuous contract。
- GDELT 升级为 P0 auto-ingest 通道，灌入 events_timeline 的 candidate 池。
- `data/galaxy/runs/...` 完全归 Forecast 页使用；背景三页不读它，audit 也不混。

## 1. Priority Rules

| Priority | Meaning | 进入背景三页的条件 |
| --- | --- | --- |
| P0 | 没有它背景三页讲不清当前状态 | 本地持久化；source_id、retrieved_at、source_url / raw_path 齐全 |
| P1 | 帮助 corroborate 或扩展 | 可本地持久化；默认仅 News 引用，不进 Overview headline |
| P2 | Historical / UI support | 不阻塞当前显示；用于背景图、replay |
| Hold | 暂不接入 | 缺授权、缺稳定 API，或会污染叙事 |

## 2. Source Inventory

| Priority | source_id | Role | 消费方 | Boundary |
| --- | --- | --- | --- | --- |
| P0 | `eia-iea-hormuz` | 结构性 baseline（≈20 mb/d、bypass、Asia exposure、LNG） | Overview baseline strip；News 顶部 context | 永远 baseline；不写成当日 throughput |
| P0 | `official-advisory` | 官方海事 advisory（UKMTO / MARAD / IMO） | News timeline（official channel）；Overview latest events | 单条 advisory 可产生 timeline entry；severity_hint 必须基于原文 |
| P0 | `imf-portwatch-hormuz` | 公开 traffic-flow proxy（AIS 反演的**日通过船数**，含 tanker/cargo/container 等同源拆分） | **Overview Traffic 行（置顶）** + Market 主图 Traffic 组 + News 事件窗口对照 | 必须分页抓全量 daily history（当前 `chokepoint6` 可到 2019-01-01）；baseline 用 PortWatch **自己**的 1y/5y 同期均值（**不**与 IMO `60 7d avg` threshold 跨源拼数）；AIS 局限（spoofing、dark vessels、revision）做 hover caveat；文案只述事实不做 "closure 概率" 解读 |
| P0 | `imo-hormuz-monthly` | 月度 traffic 交叉验证 | News 背景说明（可选）；**不进 Overview / Market 主图** | 仅作为 PortWatch 趋势的 sanity check；数值未提取前留 chart snapshot |
| P0 | `fred-market` | 9 个 FRED series：Brent / WTI / VIX / Broad USD / USD/CNY / US10Y / SP500 / NASDAQ / CPI | Market 主图 + sparkline；Overview snapshot（4 series） | 原始数值，不解读 |
| P0 | `stooq-market` | XAU/USD 1y daily OHLC history | Market Gold spot 卡片；Overview 暂不消费 | 仅用 Close 作 safe-haven spot proxy；必须有 raw historical-page snapshot + `source_hash`；不是 LBMA benchmark 历史序列，也不是 futures 主连 |
| P0 | `events-curated` *(new)* | curated Hormuz / US-Iran 事件脉络（advisory + GDELT auto-ingest + 人工 review 后入库） | News timeline 主轴；Overview top 3；Market overlay | 每条必须有可追溯 source_url + retrieved_at；GDELT auto-ingest 产生 `status="candidate"`，必须 promote 才进 timeline 渲染 |
| P0 | `gdelt-news` *(upgraded)* | 自动新闻发现（GDELT DOC 2.0 `/api/v2/doc/doc`），灌入 candidate 池 | 不直接进 UI；只作为 events_timeline candidate 来源 | 仅产生 candidate；query 关键词限定 Hormuz / Iran / IRGC / Persian Gulf / Gulf of Oman / US Navy；按 url SHA1 去重；记录 query 与 retrieved_at |
| P0 | `polymarket-curated` *(new)* | Polymarket 上 Hormuz / US-Iran / Oil / Regional 相关问题（gamma-api `/events` 抓取后筛） | Overview External prediction card（3–5 条） | 仅作外部对照；**不进入任何 forecast pipeline**；必须显示 "External market, not our forecast"；筛选规则见 §4.8 与 §5 |
| P1 | `acled-conflict` | 结构化区域冲突 context | News 可选背景层 | 需要 token；不替代 official advisory |
| P2 | `ucdp-ged` | 历史评估 | replay / 评估 | 非 live |
| P2 | `natural-earth` | 静态地图底图 | Overview mini map | UI only |
| P2 | `global-shipping-lanes` | 静态航线 geometry | Overview mini map | UI only |
| Hold | `ais-flow-pending` | 实时 vessel-level AIS / SAR | — | 无授权前 pending |

说明：

- PortWatch 是本项目最直接、最量化的 traffic 信号，也是 Polymarket "traffic returns to normal" 类问题事实上的 resolution 数据，必须进 UI。处理边界：(1) baseline 与 delta 全部用 PortWatch 自己的历史序列算，不跨源拼 IMO 阈值；(2) AIS 局限以 caveat 文案 + tooltip 形式展示；(3) 文案只描述事实，不出现 "closure 概率 / scenario" 语言；(4) News 历史事件窗口优先用 PortWatch 全量 daily history，缺口只能来自上游无值或抓取失败，不能来自本地 `resultRecordCount` 截断。
- 旧 `polymarket-hormuz-traffic` 状态合并入 `polymarket-curated`；仅作 Overview 引用卡片来源；任何 forecast pipeline / EvidenceClaim 仍禁止消费。

## 3. Directory Layout

```text
data/
  registry/
    sources.json                  # P0/P1/P2/Hold 源元数据（含新增 events-curated, polymarket-curated, gdelt-news）
    market_providers.json
  raw/
    fred/<SERIES_ID>/*.csv
    advisories/<source_name>/<retrieved_at>.<html|pdf>
    advisories/<source_name>/<retrieved_at>.meta.json
    traffic/portwatch/<retrieved_at>.<csv|json>
    traffic/imo/<retrieved_at>.<html|png>
    stooq/xauusd/<retrieved_at>.json
    gdelt/<query_slug>/<retrieved_at>.json      # GDELT DOC 2.0 query 原始返回
    polymarket/events/<retrieved_at>.json       # gamma-api /events 全量列表快照
    polymarket/event/<slug>/<retrieved_at>.json # 单题详情快照（可选）
    events/<event_id>/<retrieved_at>.<html|pdf> # 每条 timeline event 的原文 snapshot（如可保存）
  normalized/
    baseline/hormuz_baseline.json
    market/fred_series.csv
    market/gold_xauusd_history.json
    maritime/advisories.jsonl
    maritime/hormuz_transits.csv                # PortWatch + IMO，按 source_id 区分
  events/
    events_candidates.jsonl                     # NEW [P0] GDELT 自动 ingest 候选池
    events_timeline.jsonl                       # NEW [P0] News 主轴（仅 promoted）
  external/
    polymarket_questions.json                   # NEW [P0] Overview Polymarket card
  observations/
    source_observations.jsonl                   # 旧 evidence pipeline；当前阶段背景三页不消费
  evidence/
    evidence_claims.jsonl                       # 同上
  checkpoints/
    forecast_checkpoints.jsonl                  # 同上
  generated/
    overview_snapshot.json                      # NEW
    news_timeline.json                          # NEW
    market_chart.json                           # NEW
    market_series.json                          # 旧；过渡期可与 market_chart 并存
    canonical_inputs.json                       # 旧；保留供 Forecast 页未来 fallback
  galaxy/
    runs/<date>/<task>/...                      # Forecast 页专用 (PLANS.md)
    latest-run.json
```

规则：

- `raw/` 全部 append-only；命名 `<retrieved_at>`（ISO-8601，文件名中冒号用 `-` 替换）。
- `normalized/` 可按 source-native primary key + date upsert。
- `events_timeline.jsonl` 与 `polymarket_questions.json` 是 curated 数据：允许人工 edit；每次 edit 更新 `retrieved_at`（curate-* 脚本自动维护）。
- `events_candidates.jsonl` 是机器灌入的候选池；人工只决定 promote / reject，**不直接编辑**该文件字段。
- `generated/*.json` 由 `scripts/build-generated.mjs` 重建，不手动编辑。
- `source_hash` 仅在存在真实 raw 文件且哈希为 `sha256:<64hex>` 时填入；其余写 `null`。
- UI 只读 `generated/` 与 `external/` 与 `galaxy/`；不直接读 `raw/` / `normalized/`。
- TypeScript 文件只保存 schema、transforms、projections、labels，不保存事实数据。

### 3.1 News 本地保存与每日更新

News / 事件页是**本地 bundle 页面**，不是浏览器端 live news feed：

- 页面运行时只读 `data/generated/news_timeline.json` 和 `data/generated/market_chart.json`。
- 事件事实源保存在 `data/events/events_timeline.jsonl`；人工精选历史节点保存在 `data/events/history_seed.jsonl`；GDELT 自动发现先落 `data/events/events_candidates.jsonl`。
- 官方网页、GDELT 返回、PortWatch 等 remote inputs 必须先保存到 `data/raw/**` 或 normalized 文件，再由脚本重建 `generated/**`。UI 不直接调用外部 API。

每日更新入口：

```bash
npm run refresh:news
```

该命令面向 daily job：

1. snapshot 官方 maritime advisory 页面；
2. 用较短时间窗刷新 GDELT candidate pool；
3. `curate-events.mjs --skip-gdelt` mirror advisories + merge `history_seed.jsonl`；
4. 重建 `data/generated/{overview_snapshot,news_timeline,market_chart}.json`；
5. 跑 `audit:events`；
6. 写出 `data/generated/news_refresh_status.json`，记录成功/失败、事件数、candidate 数和每步日志摘要。

刷新语义：

- 外部抓取失败不能清空已有 timeline；失败只记录在 refresh status，页面继续使用上一份本地可用 bundle。
- GDELT 默认只产生 candidate，不直接进入主 timeline；只有 `--interactive` 或明确 `--auto-promote` 才会 promote。
- Daily refresh 的目标是“补充新候选 + 保持本地 bundle 新鲜”，不是每天自动改写人工 title / description / severity。

## 4. Schemas

### 4.1 `data/registry/sources.json` 条目

```ts
type SourceCategory =
  | "official"
  | "market"
  | "maritime"
  | "conflict"
  | "news"                  // 含 GDELT 自动 ingest
  | "external_prediction"   // NEW: Polymarket
  | "events"                // NEW: events-curated（advisory + media merge）
  | "pending";

interface SourceRegistryItem {
  id: string;
  name: string;
  category: SourceCategory;
  reliability: "high" | "medium" | "low";
  refreshCadence: string;
  expectedLatency: string;
  licenseStatus: "open" | "restricted" | "pending" | "unknown";
  caveat: string;
  pending: boolean;
  url?: string;
  parser?: string;
  owner?: string;
}
```

### 4.2 `data/normalized/baseline/hormuz_baseline.json`

```ts
interface HormuzBaselineFact {
  fact_id: string;
  value: string;
  unit: string;
  as_of: string;
  source_id: "eia-iea-hormuz";
  source_url: string;
  retrieved_at: string;
  cross_check_source_url?: string;
  caveat: string;
}
```

### 4.3 `data/normalized/market/fred_series.csv`

```ts
interface NormalizedMarketObservation {
  source_id: "fred-market";
  series_id: string;
  target:
    | "brent" | "wti" | "vix" | "broad_usd"
    | "usd_cny" | "us10y" | "sp500" | "nasdaq" | "us_cpi";
  date: string;
  value: number | null;
  unit: string;
  source_url: string;
  retrieved_at: string;
  license_status: "open";
}
```

FRED `DEXCHUS` → `usd_cny` only。任何映射到 `usd_cnh` 必须来自有效 FX vendor（candidate，目前 pending）。

**空值处理规则（重要）**：FRED CSV 中节假日/非交易日的 `value` 字段为空字符串 `""`。`build-generated.mjs` 里的 `numeric()` 函数必须在 `Number()` 转换前先检查空串：

```js
// 正确
function numeric(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;           // 空串 → null，不是 0
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
// 错误示例：Number("") === 0，会把节假日转成 0，造成折线图剧烈下跌
```

空值行必须被 builder 过滤掉（不进入 `points` 数组）。下游 UI 对 null/gap 的处理：折线图应在 gap 处断开（不连接两侧点），而不是插值或连接到 0。

### 4.4 `data/normalized/maritime/advisories.jsonl`

```ts
interface MaritimeAdvisoryRecord {
  source_id: "official-advisory";
  advisory_id: string;
  source_name: "UKMTO" | "MARAD" | "IMO" | "JMIC" | "JMICC";
  title: string;
  published_at?: string;
  effective_from?: string;
  effective_to?: string;
  geography: string[];
  event_type?: string;
  severity_hint?: "routine" | "watch" | "elevated" | "severe";
  source_url: string;
  retrieved_at: string;
  license_status: "open" | "unknown";
  raw_path: string;
  source_hash?: `sha256:${string}` | null;
}
```

每条 advisory 会被 `curate-events.mjs` 自动 mirror 一条 `events_timeline.jsonl` entry（`source_type="official"`），advisory_id ↔ event_id 一一对应（详见 §4.7）。

### 4.5 `data/normalized/maritime/hormuz_transits.csv`

```ts
interface HormuzTransitObservation {
  source_id: "imf-portwatch-hormuz" | "imo-hormuz-monthly";
  metric: "daily_transit_calls" | "monthly_avg_daily_transits";
  vessel_type?: "all" | "tanker" | "lng" | "container" | "dry_bulk" | "other";
  date: string;
  value: number | null;
  direction?: "eastbound" | "westbound" | "both";
  window?: "daily" | "7d_avg" | "monthly";
  source_url: string;
  retrieved_at: string;
  license_status: "open";
  caveat: string;
}
```

PortWatch 日序列**直接进 UI**（见 §4.11 Market `traffic` 组、§4.9 Overview Traffic 行）。基线计算规则由 `scripts/build-generated.mjs` 派生：

- `7d_avg`：滚动 7 天均值。
- `baseline_1y_same_window`：当日历窗口（±15d）在过去 1 年内的均值，作为 "vs normal" 对照。
- `snapshot-portwatch.mjs` / `fetch-traffic.mjs` 必须使用 ArcGIS pagination 抓取全量 `Daily_Chokepoints_Data` rows：先用 `returnCountOnly=true` 与 `outStatistics(min(date), max(date), count(date))` 记录覆盖范围，再按 `resultOffset + resultRecordCount` 分页下载，直到没有 `exceededTransferLimit` 或已达到 `count`。禁止只用固定 `resultRecordCount` 最近 N 条作为 normalized daily history。
- 当前 PortWatch `chokepoint6` endpoint 已确认覆盖 `2019-01-01` 至 `2026-05-10`、约 2687 条 daily rows；本地 normalized coverage 低于上游 count 或 `min(date)` 晚于上游 `min_date` 时，`audit:data` 应 fail。
- PortWatch 同一 raw daily row 应派生同源船型拆分：
  - `vessel_type="all"` ← `n_total`
  - `vessel_type="tanker"` ← `n_tanker`
  - `vessel_type="container"` ← `n_container`
  - `vessel_type="dry_bulk"` ← `n_dry_bulk`
  - `vessel_type="other"` ← `n_cargo - n_container - n_dry_bulk - n_general_cargo - n_roro`（若为负或任一字段缺失则不写该拆分行）
- 中文讨论里常说的"油轮通行"对应 `vessel_type="tanker"`；如果要表示 cruise/passenger ship，当前 PortWatch daily endpoint 没有对应字段，必须保持 pending，不能把 `tanker` 误写成 cruise。
- 跨源拼接禁止：`imo-hormuz-monthly` 不与 `imf-portwatch-hormuz` 共曲线，仅作 News 背景 sanity check。
- AIS caveat（spoofing、dark vessels、PortWatch revision）必须在 UI hover / coverage table 中可见。

News 事件窗口渲染规则：

- `Traffic ±7d` 只在事件窗口与 PortWatch numeric coverage 有交集时画 sparkline。
- 若事件早于 PortWatch 覆盖期或上游该窗口确实无值，UI 文案应写成 `Traffic data unavailable for this date range`，并显示 coverage range，而不是只写 `No traffic data`。
- `events_timeline` 覆盖到 2022–2024 时，PortWatch 全量历史应能支持这些窗口；若仍为空，应优先检查 fetch pagination / normalized coverage，而不是删历史事件。

### 4.6 `data/raw/gdelt/<query_slug>/<retrieved_at>.json` 与 `data/events/events_candidates.jsonl` *(NEW, P0)*

GDELT auto-ingest 走 [GDELT DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)：`https://api.gdeltproject.org/api/v2/doc/doc?query=<q>&mode=ArtList&format=JSON&maxrecords=75&timespan=14d&sort=DateDesc`。

Query 集合（写死在 `scripts/curate-events.mjs` 的常量中，可 PR review 调整）：

```text
"Strait of Hormuz"
"Hormuz" AND (tanker OR vessel OR ship)
"Hormuz" AND (advisory OR incident OR attack)
IRGC OR "Revolutionary Guard" "Hormuz"
"Gulf of Oman" AND (incident OR attack OR seized)
Iran "US Navy" "Persian Gulf"
"Bandar Abbas" AND (navy OR drill OR missile)
Iran sanctions oil export
```

每个 query 的原始返回直接落到 `data/raw/gdelt/<slug>/<retrieved_at>.json`，append-only。Candidate 池（按 url SHA1 去重）：

```ts
interface EventCandidate {
  candidate_id: string;                  // sha1(url) 前 16 位
  source_query: string;                  // 触发该候选的 GDELT query
  url: string;
  domain: string;
  title: string;
  seendate: string;                      // GDELT seendate (UTC, ISO-like)
  language?: string;
  sourcecountry?: string;
  tone?: number;                         // GDELT tone score
  relevance_score?: number;              // local keyword/domain score for reviewer triage
  retrieved_at: string;
  status: "candidate" | "promoted" | "rejected";
  promoted_event_id?: string;
  rejected_reason?: string;
  reviewed_at?: string;
  reviewed_by?: string;
}
```

Promote 规则（`curate-events.mjs --promote <candidate_id>` 或 `--auto-promote`）：

1. GDELT 抓取先按本地 `relevance_score` 降噪：标题 / URL 本身必须命中 Hormuz / Gulf of Oman / Persian Gulf / IRGC / maritime / blockade / AIS 等核心信号；query 关键词只能提供弱加分，不能单独把宏观泛新闻放进候选池。低分 candidate 不写入池。
2. `--auto-promote` 仅在 `domain` 命中 allowlist 且 `relevance_score >= AUTO_PROMOTE_MIN_RELEVANCE` 时自动入库（reuters.com / apnews.com / bloomberg.com / aljazeera.com / wsj.com / ft.com / state.gov / defense.gov / cnn.com / bbc.co.uk / nytimes.com）；其他必须 `--interactive` 人工 review。
3. Promote 时生成 `events_timeline.jsonl` 一条 entry：`event_id = "evt-" + seendate(YYYYMMDD) + "-" + slug(title 前 6 词)`，`source_type="media"`（除非 domain 是官方机构则 `"official"`），`severity_hint` 必须手填或由 keyword 规则给 `"watch"`（GDELT 不提供该字段）。
4. Promote 后 candidate `status="promoted"`，记 `promoted_event_id`；拒绝则 `status="rejected"` + `rejected_reason`。
5. 一旦 promoted，timeline entry 与 candidate 解耦；后续 timeline edit 不影响 candidate 历史记录。

### 4.7 `data/events/events_timeline.jsonl` *(NEW, P0)*

每行一个 event。这是 News 主轴 + Overview top 3 + Market overlay 的**唯一**事实源。**仅** promoted 的事件出现在此文件；GDELT raw / candidate 不出现。

```ts
interface TimelineEvent {
  event_id: string;
  event_at: string;                     // ISO-8601；事件发生时间，不是 retrieved_at
  title: string;                        // ≤ 80 char
  description: string;                  // 1–3 句话；只述事实
  source_type: "official" | "media" | "open-source";
  source_id: string;                    // official-advisory / gdelt-news / events-curated
  source_name: string;                  // "UKMTO" / "Reuters"
  source_url: string;
  retrieved_at: string;
  raw_path?: string | null;
  source_hash?: `sha256:${string}` | null;
  severity_hint: "routine" | "watch" | "elevated" | "severe" | "deescalation";
  geography?: string[];                 // ["Strait of Hormuz", "Gulf of Oman"]
  cross_check_source_urls?: string[];
  related_advisory_ids?: string[];
  related_candidate_ids?: string[];     // 关联 GDELT candidate (audit / 回溯)
  related_market_targets?: Array<
    "brent" | "wti" | "vix" | "broad_usd" | "usd_cny" | "us10y" | "sp500" | "nasdaq" | "traffic"
  >;
  tags?: string[];                      // ["incident", "diplomatic", "naval", "iran", "us-iran", ...]
  curated_by?: string;                  // 空表示纯 auto-promote
  curated_at?: string;
}
```

写入规则：

1. `event_id` 全局唯一且稳定；后续 update 不变 id。
2. 同一来源的同一事件不重复登记。Advisory 已在 advisories.jsonl 时，timeline entry 引用 `related_advisory_ids` 并复用 source_url，不另存 raw_path。
3. `severity_hint` 必须可以从 description / 原文直接读出，不依赖任何 forecast pipeline 计算。
4. `related_market_targets` 仅标"该事件期间值得在 Market 图上画竖线"的 target，包含 `"traffic"`（PortWatch 曲线）；**不写**涨/跌方向。
5. `description` 不允许出现 "Agent 判断 / 概率上调 / 支持 closure scenario" 等解读语言。

### 4.8 `data/external/polymarket_questions.json` *(NEW, P0)*

```ts
interface PolymarketQuestionRef {
  question_id: string;                  // 等于 event_slug
  event_slug: string;                   // gamma-api events.slug
  question_url: string;                 // https://polymarket.com/event/<slug>
  title: string;                        // events.title 或 markets[0].question
  description: string;                  // gamma-api description 全文
  resolution_criteria: string;          // 通常等于 description 中规则段落
  market_type: "binary" | "categorical";
  outcomes: Array<{
    outcome_id: string;
    last_price: number | null;          // 0–1
    last_volume?: number | null;
  }>;
  closes_at?: string | null;            // events.endDate
  total_volume_usd?: number | null;
  tags: string[];                       // gamma-api tags[].label
  topic_tags: Array<
    "hormuz" | "us_iran" | "oil" | "iran_domestic" | "regional"
  >;
  source: "polymarket";
  source_endpoint: "gamma-api/events";
  retrieved_at: string;
  raw_path: string;
  source_hash?: `sha256:${string}` | null;
  selected_for_overview: boolean;       // Overview 卡片只展示 selected_for_overview=true
  caveat: string;                       // 必须包含 "External market, not our forecast"
}
```

筛选规则（`scripts/curate-polymarket.mjs`）：

1. 拉 `https://gamma-api.polymarket.com/events?limit=200&closed=false&order=volume24hr&ascending=false`，落 `data/raw/polymarket/events/<retrieved_at>.json`。**不**翻页/无限抓；单次 200 条按 24h 成交量降序已足够覆盖热门题目。
2. 对每个 event，关键词匹配（不区分大小写，匹配 `title ∪ description ∪ tags[].label`）：
   - **hormuz**：`hormuz`, `strait of hormuz`, `persian gulf`, `gulf of oman`, `bandar abbas`
   - **us_iran**：`iran`, `irgc`, `revolutionary guard`, `khamenei`, `tehran`, `iran-us`, `us-iran`, `iran sanctions`, `jcpoa`, `nuclear deal`
   - **oil**：`brent`, `wti`, `opec`, `crude oil`, `oil price`
   - **regional**：`israel`, `houthi`, `red sea`, `saudi`, `yemen`
3. 至少命中一个 topic 才入库；否则丢弃。一个 event 可命中多个 topic。
4. 同步该 event 的所有 `markets[]`：取 binary 一题或 categorical 全部 outcomes；记 `last_price`、`closes_at`、`total_volume_usd`。
5. 写入 `data/external/polymarket_questions.json`：按 topic 分组，每组按 `total_volume_usd desc` 排，每组最多 5 条（总 ≤ 20 条入库）。
6. `selected_for_overview` 由人工标 true/false；默认 false。推荐：hormuz top 1 + us_iran top 1 + oil top 1 = 3 条入 Overview。
7. odds (`last_price`) 是引用值，不进任何 forecast 计算；EvidenceClaim / canonical_inputs 不允许引用此文件（audit 检查）。
8. `caveat` 必须显式包含 "External market, not our forecast"（audit 检查）。

参考实现：[`/Users/weichy/code/benchmark_merge_v8/source/Polymarket_source.py`](file:///Users/weichy/code/benchmark_merge_v8/source/Polymarket_source.py) 给出 gamma-api `/events` 的请求参数模板（含 `closed=false&order=volume24hr` 等）；本项目**不复用**其 question-formatting 部分（不需要把题目格式化成 A/B/C 选项），只复用其 endpoint / 字段抽取思路。

### 4.9 `data/generated/overview_snapshot.json` *(NEW)*

```ts
interface OverviewSnapshot {
  built_at: string;
  data_as_of: string;
  baseline: HormuzBaselineFact[];
  current_severity: "quiet" | "routine" | "watch" | "elevated" | "severe";
  latest_events: TimelineEvent[];       // top 3，按 event_at desc
  traffic_snapshot: {                   // PortWatch 置顶
    latest_date: string;
    latest_value: number | null;
    avg_7d: number | null;
    baseline_1y_same_window: number | null;
    delta_vs_baseline_pct: number | null;
    vessel_type: "all";
    source_id: "imf-portwatch-hormuz";
    retrieved_at: string;
    caveat: string;                     // AIS 局限
  } | null;
  market_snapshot: Array<{
    target: string;
    label: string;
    value: number | null;
    unit: string;
    delta_1d?: number | null;
    delta_7d?: number | null;
    source_id: string;
    retrieved_at: string;
    status: "active" | "pending_source";
    caveat?: string;
  }>;
  polymarket_refs: PolymarketQuestionRef[];  // 仅 selected_for_overview=true，按 topic 顺序
}
```

### 4.10 `data/generated/news_timeline.json` *(NEW)*

```ts
interface NewsTimelineBundle {
  built_at: string;
  data_as_of: string;
  events: TimelineEvent[];              // 全量按 event_at desc
  source_index: Array<{
    source_id: string;
    source_name: string;
    source_type: "official" | "media" | "open-source";
    event_count: number;
  }>;
  topic_index: Array<{
    tag: string;
    event_count: number;
  }>;
  topic_cloud: Array<{
    key: string;                         // stable filter key; usually a canonical tag
    label: string;                       // display label; may be zh-CN for reviewer readability
    event_count: number;
    weight: number;                      // normalized 0–1, for font size / opacity
    event_ids: string[];                 // event_id list used when clicked
    source_tags: string[];               // raw tags folded into this cloud term
  }>;
}
```

`topic_index` 保留为兼容字段和 audit 计数；News filter UI 不应再把所有 raw tags 渲染成按钮墙。`topic_cloud` 是推荐入口：

- Builder 从 `events[].tags`、标题和 description 中抽取候选词，停用 `core_event`、`hormuz` 这类低信息密度全局词；保留 `irgc`、`blockade`、`vessel_seizure`、`ais`、`bunker_fuel`、`escort` 等能解释事件结构的词。
- 语义近似 raw tags 必须折叠为一个 cloud term，例如 `tankers` + `tanker` → `tanker`，`gnss` + `ais` 可分别保留但不重复到多个同义按钮。
- `weight = sqrt(event_count / max_event_count)` 或等价的单调归一化；UI 用 weight 表达重要性，但点击行为仍等价于筛选 `event_ids`。
- Cloud 数量建议 12–18 个。少于 8 个时退回 compact tag list；多于 18 个时只显示 top weighted terms，并在 tooltip / inspector 中保留完整 tag coverage。
- Cloud 是导航/筛选，不是 evidence。不得从词云权重推出 severity、概率或 forecast 结论。

### 4.11 `data/generated/market_chart.json` *(NEW)*

```ts
interface MarketChartBundle {
  built_at: string;
  data_as_of: string;
  series: Array<{
    id: string;
    target: string;
    label: string;
    group: "energy" | "safe_haven_fx" | "risk_rates_vol" | "traffic";
    color: string;
    unit: string;
    status: "active" | "pending_source" | "candidate";
    source_id: string;
    provider_id?: string;
    license_status: "open" | "restricted" | "pending" | "unknown";
    retrieved_at?: string;
    raw_path?: string | null;
    source_hash?: `sha256:${string}` | null;
    points: Array<{ date: string; value: number }>;            // active 才有；Gold spot 使用 Stooq daily Close
    baseline_points?: Array<{ date: string; value: number }>;  // traffic 专用：1y 同期均值曲线
    missing_points?: Array<{ date: string; reason: string }>;  // sparse macro/FRED 官方空值；不插值、不连线
    caveat: string;
    evidenceEligible: false;            // 强制 false
  }>;
  event_overlays: Array<{
    event_id: string;
    event_at: string;
    title: string;
    severity_hint: TimelineEvent["severity_hint"];
    related_market_targets: TimelineEvent["related_market_targets"];
  }>;
}
```

`traffic` 组建议至少一条 series：`{ target: "portwatch_daily_transit_calls_all", group: "traffic", points: <daily>, baseline_points: <1y same-window avg> }`。如有 vessel-type 拆分，新增 `tanker / lng / container` 同组兄弟 series。

### 4.12 旧 schema 的归属

`SourceObservation` / `EvidenceClaim` / `EvidenceQuality` / `AgentRunEvent` / `ForecastCheckpoint` / `MarketRead.pricingPattern` / `ScenarioDefinition` / `ForecastTarget` / `MechanismTag` 全部保留在 TypeScript 中，但：

- 不被 Overview / News / Market 任何组件 import；
- audit:legacy 增加 grep 检查（见 §6）；
- 仅 Forecast 页可在未来需要时复用。

## 5. Fetch / Build Pipeline

```text
npm run fetch:p0
  ├── fetch-fred.mjs               → data/raw/fred/**, data/normalized/market/fred_series.csv
  ├── snapshot-advisories.mjs      → data/raw/advisories/**, data/normalized/maritime/advisories.jsonl
  ├── fetch-traffic.mjs            → data/raw/traffic/**, data/normalized/maritime/hormuz_transits.csv
  └── snapshot-baseline.mjs        → data/normalized/baseline/hormuz_baseline.json

npm run curate:events     [NEW]
  └── curate-events.mjs
       1. mirror advisories.jsonl → events_timeline.jsonl (official channel)
       2. fetch GDELT queries → data/raw/gdelt/**
       3. dedupe by sha1(url) → events_candidates.jsonl
       4. auto-promote allowlist domains, or interactive review
       5. emit / update events_timeline.jsonl

npm run curate:polymarket [NEW]
  └── curate-polymarket.mjs
       1. gamma-api GET /events?limit=200&closed=false&order=volume24hr
       2. keyword + tag 筛 hormuz/us_iran/oil/regional
       3. dedupe by event_slug
       4. write data/external/polymarket_questions.json (preserve human-set selected_for_overview)

npm run build:evidence              (保留)
  └── build-local-evidence.mjs     observations + evidence claims + canonical_inputs
                                   背景三页不读

npm run build:generated   [NEW]
  └── build-generated.mjs          baseline + fred + advisories + transits + events + polymarket
                                   → data/generated/{overview_snapshot,news_timeline,market_chart}.json

npm run build:data                  composite
  = fetch:p0
  → curate:events (non-interactive refresh)
  → curate:polymarket (non-interactive refresh)
  → build:evidence (legacy)
  → build:generated
```

Traffic fetch 细节：

```text
fetch-traffic.mjs
  1. snapshot PortWatch public page + download index
  2. query ArcGIS metadata layer for `chokepoint6`
  3. query ArcGIS daily layer count + min/max date
  4. paginate Daily_Chokepoints_Data by `resultOffset` until full history is stored
  5. write one raw JSON per page plus a merged raw manifest
  6. normalize all/tanker/container/dry_bulk/other rows into hormuz_transits.csv
  7. snapshot IMO Hormuz page + chart images as cross-check metadata only
```

`resultRecordCount` is a page size, not a history horizon. If ArcGIS returns `exceededTransferLimit=true`, the script must continue paging; writing only the first page is a data bug because it creates false `No traffic data` windows for historical events.

curate 脚本设计原则：

- 默认 **non-interactive refresh**：只 update `retrieved_at` / odds / 新增 candidates；不改写人工填写的 title / description / severity_hint / selected_for_overview。
- `--interactive` 打开 CLI 提示，让 reviewer 评 candidate / 调 selected_for_overview。
- 任何 entry 一旦人工 curate 过，自动 refresh 不覆盖人工字段；记录 `curated_at`。
- `npm run curate:events -- --gdelt-only`：只跑 GDELT 抓取与 candidate 灌入，不 promote。
- `npm run curate:events -- --auto-promote`：仅 allowlist domain 自动入 timeline。
- `npm run curate:events -- --gdelt-only --prune-candidates`：刷新 candidate relevance score，并把低相关、未 promote 的旧 candidate 标记为 `rejected`；不删除历史记录。

## 6. Audit Rules

### 6.1 必跑 audit

```bash
npm run audit
  ├── audit:data            FRED 9 series lineage、PortWatch 日序列完整性
  ├── audit:events          [NEW] events_timeline + events_candidates 完整性、promote 链路
  ├── audit:polymarket      [NEW] polymarket_questions 完整性 + 防回流
  ├── audit:evidence        evidence_claims.jsonl 完整性（范围限 data/evidence/）
  ├── audit:forecast        判断 update 链一致性（范围限 data/evidence/, data/checkpoints/, data/galaxy/）
  ├── audit:replay          deterministic replay contract
  ├── audit:legacy          [EXPAND] 防旧字段回流 + 背景三页不引用 forecast revision 字段
  ├── audit:galaxy          galaxy artifact 完整性
  └── audit:ui              [P2] 渲染时 caveat / retrieved_at / source_url 可见
```

### 6.2 audit 失败条件

任意以下情况必须 fail：

- `events_timeline.jsonl` 任一 entry 缺 `event_id` / `event_at` / `source_url` / `retrieved_at` / `severity_hint`；
- `severity_hint` ∉ {routine, watch, elevated, severe, deescalation}；
- `source_type` ∉ {official, media, open-source}；
- 同一 `event_id` 出现多次；
- `events_timeline.jsonl` entry 的 `description` 含 forecast 解读关键词（"scenario", "judgement", "probability", "概率", "支持", "agent"）；
- `events_candidates.jsonl` 中 `status="promoted"` 的 candidate 找不到对应 `events_timeline.jsonl` entry（双向一致性）；
- `polymarket_questions.json` 任一 entry 缺 `question_url` / `resolution_criteria` / `retrieved_at` / `caveat`；
- `caveat` 不含 "External market, not our forecast" 子串；
- 任一 `EvidenceClaim` 或 `canonical_inputs.json` 引用 `polymarket-curated` 或 `events-curated` 或 `gdelt-news` 任一 source_id；
- 背景三页源代码（`src/pages/{OverviewPage,NewsPage,MarketPage}.tsx` 与其 children）import 或字面引用 `scenarioDistribution / pricingPattern / judgement_updated / mechanismTags / checkpointId / Why not closure / next watch`；
- `data/generated/market_chart.json` 任一 series `evidenceEligible !== false`；
- pending series 出现 non-null value 或 non-empty points；
- FRED `DEXCHUS` 被映射到 `usd_cnh`；
- 任一 active generated 市场行缺 `raw_path` / `source_hash` / `retrieved_at` / `source_url` / `provider_id` / `license_status`；
- `source_hash` 不解析为真实 raw 文件或哈希不匹配；
- PortWatch daily layer 返回 `exceededTransferLimit=true` 但 fetch 脚本没有继续分页；
- `hormuz_transits.csv` 的 PortWatch daily numeric rows 明显少于上游 ArcGIS `returnCountOnly`，或本地 `min(date)` 晚于上游 `min_date`；
- PortWatch `n_tanker` 被标成 cruise/passenger，或无字段时伪造 passenger/cruise 通行量；
- PortWatch traffic 行 `baseline_points` 使用了非 PortWatch 来源（跨源拼接）；
- `news_timeline.json` 缺 `topic_cloud`，或 `topic_cloud` 直接渲染 `core_event` / `hormuz` 这类全局低信息 tag 为最高权重词；
- `audit:legacy` 检测到 `MarketRead.pricingPattern` / `Why not closure` 字面出现在背景三页 dom。

## 7. Implementation Status (2026-05-12)

| Layer | Artifact | State | Action |
| --- | --- | --- | --- |
| Source registry | `data/registry/sources.json` | 含 P0/P1/P2/Hold；需新增 `events-curated`, `polymarket-curated`, `gdelt-news` 三条 + category `external_prediction` / `events` | `[P0]` 扩展 |
| Provider registry | `data/registry/market_providers.json` | OK | — |
| FRED | `data/raw/fred/**`, `data/normalized/market/fred_series.csv` | 9 series 已落地 | — |
| Baseline | `data/normalized/baseline/hormuz_baseline.json` | OK | — |
| Advisories | `data/normalized/maritime/advisories.jsonl` | OK | — |
| PortWatch / IMO | `data/normalized/maritime/hormuz_transits.csv` | 当前本地 PortWatch numeric rows 只覆盖最近约 430 天；上游 daily layer 已确认可到 2019-01-01 | `[P0]` `fetch-traffic.mjs` 改为 ArcGIS pagination 全量抓取；派生 all/tanker/container/dry_bulk/other；build-generated 派生 baseline 序列；News 历史事件窗口用全量 history |
| GDELT candidates | `data/raw/gdelt/**`, `data/events/events_candidates.jsonl` | **不存在** | `[P0]` 实现 GDELT fetch + dedupe + candidate pool |
| Events timeline | `data/events/events_timeline.jsonl` | **不存在** | `[P0]` curate-events.mjs：advisory mirror + candidate promote |
| Polymarket refs | `data/external/polymarket_questions.json` | **不存在** | `[P0]` curate-polymarket.mjs (gamma-api /events) |
| Generated overview | `data/generated/overview_snapshot.json` | 不存在 | `[P0]` build-generated.mjs |
| Generated news | `data/generated/news_timeline.json` | 已有 events/source_index/topic_index；topic tags 在 UI 上会变成按钮墙 | `[P0]` build-generated.mjs 新增 `topic_cloud`，UI 用词云图替代 raw tag button wall |
| Generated market | `data/generated/market_chart.json` | 不存在；当前用 `market_series.json` | `[P0]` 新增；旧文件向后兼容期保留 |
| Evidence pipeline | `data/observations/`, `data/evidence/`, `data/checkpoints/`, `data/generated/canonical_inputs.json` | 已存在；当前驱动 Overview/Market | `[P0]` 解除与背景三页绑定（不删数据，只断 UI 引用） |
| Galaxy artifact | `data/galaxy/runs/**`, `data/galaxy/latest-run.json` | 已有真实 run | Forecast 页消费，背景三页不读 |
| audit:data | `scripts/audit-data.mjs` | OK | 微调（加 PortWatch baseline 一致性） |
| audit:events / audit:polymarket | 不存在 | `[P0]` 新增 |
| audit:legacy 扩展 | 现仅防旧字段 | `[P0]` 增加 grep 规则禁止背景三页 import forecast revision 字段 |

## 8. Update Path

```bash
npm run build:data        # 完整刷新
npm run audit             # 跑全套 audit
npm run build             # tsc + vite build
```

人工 curate：

```bash
npm run curate:events -- --interactive       # 评 GDELT candidate / advisory mirror
npm run curate:events -- --auto-promote      # 仅 allowlist 自动入库
npm run curate:polymarket -- --interactive   # 调 selected_for_overview / caveat
```

## 9. Explicit Non-Goals

- 不让 UI 直接调用 live remote API；UI 只读 `data/generated/` 与 `data/external/` 与 `data/galaxy/`。
- 不把 Polymarket odds 当作 ground truth 或 forecast evidence；它**永远**只是 Overview 引用。
- 不让 events_timeline 进入 EvidenceClaim / judgement_updated / scenarioDistribution；它是叙事数据。
- 不在背景三页渲染任何 scenario probability / pricingPattern / mechanism 链 / checkpoint。
- 不抓 GDELT 全量；GDELT 只产候选，必须经 `curate:events` 决定 promote。
- 不跨源拼 PortWatch 与 IMO threshold；PortWatch baseline 来自自身历史。
- 不用 IMO monthly chart 或其他来源补 PortWatch daily 空窗；IMO 只能做月度 sanity check / source panel。
- 不把 PortWatch `n_tanker` 翻译或标注成 passenger/cruise ship；若需要 passenger/cruise，需要新 source 或保持 pending。
- 不把 News topic cloud 作为风险强度、事件重要性或 forecast evidence；它只服务浏览和筛选。
- 不为 Gold / silver / USD-CNH / HSTECH / SHCOMP / 国内期货主连写入伪造走势；Gold 只允许在有 raw lineage 时显示 Stooq XAU/USD daily Close 历史，LBMA benchmark / futures history 未接入前仍不能画对应历史走势；其余保持 pending。
- 不写 `source_hash` 而对应 raw 文件不存在。
- 不在 forecast pipeline 与背景三页之间建立双向引用（当前阶段）。

## 10. Reference URLs

- FRED API: https://fred.stlouisfed.org/docs/api/fred/series/series_observations.html
- FRED graph CSV pattern: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES_ID>`
- EIA World Oil Transit Chokepoints: https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints/wotc.pdf
- IEA Strait of Hormuz: https://www.iea.org/about/oil-security-and-emergency-response/strait-of-hormuz
- IMO Hormuz hub: https://www.imo.org/en/mediacentre/hottopics/pages/strait-of-hormuz-middle-east-data.aspx
- IMF PortWatch: https://data-download.imf.org/ClimateData/portwatch-monitor.html
- IMF PortWatch Hormuz ArcGIS daily layer: https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0
- IMF PortWatch chokepoints metadata layer: https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0
- UKMTO recent incidents: https://www.ukmto.org/recent-incidents
- MARAD U.S. Maritime Alerts: https://www.maritime.dot.gov/msci-alerts
- GDELT DOC 2.0 API: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- Polymarket gamma-api events: https://gamma-api.polymarket.com/events
- Polymarket Hormuz traffic question: https://polymarket.com/zh/event/strait-of-hormuz-traffic-returns-to-normal-by-end-of-june
- ACLED API: https://acleddata.com/acled-api-documentation
- UCDP API: https://ucdp.uu.se/apidocs/index.html
- LBMA Gold Price: https://www.lbma.org.uk/prices-and-data/lbma-gold-price
- Stooq XAU/USD historical data: https://stooq.com/q/d/?s=xauusd
