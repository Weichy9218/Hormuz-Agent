# Hormuz Data Plan

Last updated: 2026-05-12

本文档定义本项目的数据源优先级、cross-verification 规则和 local persistence 方案。它的目标不是收集尽可能多的数据，而是维护一条可审计的 forecast chain：

```text
baseline -> source -> observation -> evidence -> mechanism -> judgement delta -> target forecast -> checkpoint -> next watch
```

核心判断：不是所有可能相关的数据都应该进入系统。P0 只保留能直接支撑 reviewer 判断的问题：

```text
Hormuz 风险是否改变了跨资产判断？
如果改变，是哪条新证据导致修订？
```

## 1. Review Decision

上一版数据清单的问题：

- `forecast-critical`、`candidate discovery`、`UI support`、`external market odds` 混在一个表里。
- 有些数据源有用，但不是第一阶段必须，例如 ACLED、UCDP、Natural Earth、shipping lanes。
- Polymarket odds 容易污染 forecast state；它可以做外部对照，不应进入核心 evidence pipeline。
- Gold、USD/CNH、licensed AIS 都缺稳定授权 source，应继续 pending。

本版做三件事：

- 明确每个 source 的 forecast role。
- 给出 cross-verification gate：什么可以单源进入，什么必须交叉验证后才能改判。
- 把实现顺序压到最小可用数据层：先本地持久化 P0，再考虑 P1/P2。

## 2. Priority Rules

| Priority | Meaning | 进入 forecast 的条件 |
| --- | --- | --- |
| P0 | Forecast-critical，本系统没有它就无法解释本轮判断 | 必须本地持久化；必须有 source id、retrieved_at、source_url 或 raw_path；关键 judgement update 必须可追溯 |
| P1 | Corroboration / discovery，帮助确认或发现新证据 | 可本地持久化；默认只产生 candidate evidence；改判前必须被 P0 source 或另一类独立 source 支持 |
| P2 | Historical / evaluation / UI support | 不阻塞当前 forecast；用于 replay、backtest、地图或解释背景 |
| Hold | 暂不接入 | 缺授权、缺稳定 API、容易污染判断，或不符合 product boundary |

Forecast importance 和 implementation order 不完全相同：

- 最重要的 forecast evidence 是 `official-advisory` + `traffic-flow proxy`。
- 最容易先落地的是 `fred-market` + `eia-iea-hormuz`，因为它们稳定、低权限、便于验证。
- 第一阶段执行顺序应按“低风险落地 -> 高价值 operational source”推进。

## 3. Cross-Verification Gates

### 3.1 Structural Baseline

Examples: oil flow, bypass capacity, LNG relevance, Asia exposure.

Rule:

- 可以使用单个高质量官方 baseline 作为结构性事实，但至少要有一个 cross-check source 或 prior version note。
- Baseline 不能被写成 current-day throughput。
- Baseline 不直接改变 scenario probability，只提供判断锚点。

Accepted sources:

- EIA World Oil Transit Chokepoints.
- IEA oil security / Strait of Hormuz explainer.

### 3.2 Official Maritime Events

Examples: advisory wording, incident, threat area, avoidance instruction.

Rule:

- `source_read` 可以由单个 official source 产生。
- `evidence_added` 可以登记单源 official advisory，但 confidence 最高为 `medium`，除非有独立 corroboration。
- `judgement_updated` 如果要显著提高 `severe` 或 `closure`，必须满足至少一个：
  - official avoidance / closure wording;
  - verified traffic-flow disruption;
  - multiple official maritime sources describe the same event;
  - closure-style market shock corroborates official signal.
- Media/news recap 不能替代 official advisory。

Primary sources:

- UKMTO recent incidents.
- MARAD U.S. Maritime Alerts / Advisories.
- IMO Middle East / Strait of Hormuz hub.
- JMIC / JMICC only when we have a stable retrievable page or file.

### 3.3 Traffic / Flow Proxy

Examples: transit calls, traffic-normal threshold, sustained traffic drop.

Rule:

- Public AIS-derived aggregate can support `traffic_flow_down`, but cannot by itself prove full closure.
- High-confidence closure evidence requires official wording or independent flow corroboration.
- Data must carry AIS/GNSS caveat because spoofing, vessels going dark, and revisions are material risks.
- Recent data should be re-fetched over a rolling window because PortWatch-style data can revise.
- Current PortWatch numeric rows use `metric=daily_transit_calls` and `window=daily`.
  The baseline threshold fact uses `60 7d avg transit calls`. These two must not
  be compared directly until metric definition and denominator are confirmed.
- Until that confirmation exists, PortWatch daily rows may produce source
  observations and metric-boundary caveat evidence, but must not produce
  `support + traffic_flow_down`, severe, or closure evidence.

Primary sources:

- IMF PortWatch data download / Strait of Hormuz page.
- IMO monthly transits through the Strait of Hormuz.

### 3.4 Market Pricing

Examples: Brent, WTI, VIX, Broad USD, USD/CNY, US10Y, S&P 500.

Rule:

- Market data is evidence input only; it never directly updates forecast state.
- A single FRED series can be accepted for that series' observed value.
- Interpretation must use cross-asset consistency:
  - oil risk premium alone supports `pricing_controlled_disruption` or `mixed`;
  - closure-style pricing requires oil shock plus VIX / equity / USD / rates stress.
- Gold and USD/CNH remain pending until a stable source and license boundary exist.

Primary source:

- FRED API / FRED graph CSV.

### 3.5 News / Conflict Context

Examples: reported incident, rhetoric, regional escalation, conflict event.

Rule:

- News discovery can only create candidate evidence.
- Candidate evidence becomes forecast evidence only after official, traffic, market, or independent source corroboration.
- ACLED is useful for structured conflict context, but should not replace maritime official sources.
- UCDP is mainly for historical replay / evaluation, not current 7d or 14d operational updates.

Sources:

- GDELT Cloud API for discovery.
- ACLED API for conflict context, subject to account/token.
- UCDP API for historical datasets, subject to token since 2026.

## 4. Source Priority List

| Priority | source_id | Keep? | Role | Cross-verification requirement | First implementation |
| --- | --- | --- | --- | --- | --- |
| P0 | `eia-iea-hormuz` | yes | Structural baseline: oil flow, bypass capacity, LNG relevance, Asia exposure | EIA plus IEA or versioned prior baseline; never treated as live throughput | Manual snapshot into `data/normalized/baseline/hormuz_baseline.json` |
| P0 | `official-advisory` | yes | Operational maritime signal: incident, advisory, avoidance wording | For large scenario move, corroborate with another official source, traffic proxy, or closure-style market stress | Snapshot UKMTO + MARAD + IMO pages/files into `data/raw/advisories/` |
| P0 | `imf-portwatch-hormuz` | yes | Public traffic-flow proxy and traffic-normal watch | Cross-check with IMO monthly transits and official advisory context; keep AIS/GNSS caveat | Fetch/download PortWatch data, normalize into `data/normalized/maritime/hormuz_transits.csv` |
| P0 | `fred-market` | yes | Cross-asset pricing pattern | Value-level check via FRED raw snapshot; interpretation requires cross-series consistency | Fetch seven P0 FRED series into local raw + normalized files |
| P1 | `gdelt-news` | later | Candidate event/rhetoric discovery | Must be confirmed by P0 source or another independent source before forecast use | Add after P0 local store is stable |
| P1 | `acled-conflict` | later | Structured regional conflict context | Requires account/token; cannot replace maritime advisories | Add only if escalation target needs structured context |
| P2 | `ucdp-ged` | later | Historical replay and evaluation labels | Versioned dataset/token; not live trigger | Add during replay/evaluation phase |
| P2 | `natural-earth` | yes, UI only | Static map context | Versioned download; no forecast evidence | Optional one-time UI asset migration |
| P2 | `global-shipping-lanes` | maybe, UI only | Static route geometry | Public repository plus local bounds check; no AIS semantics | Optional one-time UI asset migration |
| Hold | `polymarket-hormuz-traffic` | no for core pipeline | External consensus / question template only | Never ground truth; never direct forecast evidence | Keep out of P0/P1 pipeline |
| Hold | `gold-pending` | no | Safe-haven target | Need licensed/stable daily source; LBMA benchmark usage may require IBA licence | Keep pending |
| Hold | `usdcnh-pending` | no | Offshore RMB target | Need stable daily source and licensing boundary | Keep pending |
| Hold | `ais-flow-pending` | no | Vessel-level AIS / tanker / LNG flow | Need licensed AIS/SAR or production-grade provider | Keep pending |

## 5. Minimal Local Storage Contract

Use the filesystem first. Do not introduce a database until append/update semantics are proven.

```text
data/
  registry/
    sources.json
  raw/
    <source_id>/<dataset>/<retrieved_at>.<json|csv|html|pdf>
  normalized/
    baseline/hormuz_baseline.json
    market/fred_series.csv
    maritime/advisories.jsonl
    maritime/hormuz_transits.csv
  observations/
    source_observations.jsonl
  evidence/
    evidence_claims.jsonl
  checkpoints/
    forecast_checkpoints.jsonl
  generated/
    market_series.json
    canonical_inputs.json
```

Rules:

- `raw/` is append-only.
- `normalized/` may upsert by source-native primary key plus date.
- Every normalized record must include `source_id`, `source_url`, `retrieved_at`, `license_status`, and either `published_at`, `observed_at`, or `date`.
- `source_hash` is allowed only when raw content exists and has been hashed as `sha256:<64 hex>`.
- UI reads generated/local data, not live remote endpoints.
- TypeScript should contain schema, transforms, projections, and labels, not durable factual data.
- `data/observations/source_observations.jsonl` and `data/evidence/evidence_claims.jsonl`
  are generated from normalized artifacts by `scripts/build-local-evidence.mjs`.
- `src/state/canonicalStore.ts` consumes `data/generated/canonical_inputs.json`, not
  hand-written SourceObservation / EvidenceClaim fixtures.

## 5.1 Current Local Data State

As of 2026-05-12, P0 local storage is in place for market, structural baseline,
official advisory snapshots, and traffic proxy snapshots.

| Layer | Artifact | Current state | Runtime consumer |
| --- | --- | --- | --- |
| Source registry | `data/registry/sources.json` | P0/P1/P2/Hold source metadata and caveats | `src/data/sourceRegistry.ts` |
| FRED raw | `data/raw/fred/<SERIES_ID>/*.csv` | 7 local CSV snapshots | audit/hash lineage |
| FRED normalized | `data/normalized/market/fred_series.csv` | 342 local rows across 7 P0 FRED series | `scripts/build-local-evidence.mjs`, `scripts/audit-data.mjs` |
| Market generated | `data/generated/market_series.json` | 9 UI market series: 7 FRED + Gold pending + USD/CNH pending | `src/data.ts`, builder |
| Baseline normalized | `data/normalized/baseline/hormuz_baseline.json` | 7 structural facts, including PortWatch threshold and AIS caveat | `src/data/sourceRegistry.ts`, builder |
| Advisory raw | `data/raw/advisories/**` | UKMTO/MARAD/IMO page snapshots with hashes | audit/hash lineage |
| Advisory normalized | `data/normalized/maritime/advisories.jsonl` | 21 source snapshot / candidate records | builder |
| Traffic raw | `data/raw/traffic/**` | PortWatch page/download/API snapshots plus IMO page/chart images | audit/hash lineage |
| Traffic normalized | `data/normalized/maritime/hormuz_transits.csv` | 65 rows: 60 PortWatch daily numeric rows, 3 source snapshots, 2 IMO chart snapshots | builder |
| Observations | `data/observations/source_observations.jsonl` | 15 generated SourceObservation records | generated canonical input |
| Evidence | `data/evidence/evidence_claims.jsonl` | 3 generated EvidenceClaim records | generated canonical input |
| Canonical input | `data/generated/canonical_inputs.json` | generated bundle consumed by canonicalStore | `src/state/canonicalStore.ts` |

Current generated EvidenceClaim set:

- `ev-local-market-risk-premium`: FRED cross-asset market bundle supports a
  controlled-disruption risk premium, not closure pricing.
- `ev-local-official-advisory`: official advisory snapshots preserve elevated
  maritime/security context, but parser has not extracted verified avoidance or
  closure wording; confidence remains capped at medium.
- `ev-local-portwatch-metric-caveat`: PortWatch daily value is stored, but
  `daily_transit_calls` is not mixed with the `60 7d avg transit calls`
  threshold; it supports keeping `traffic_flow_down` out of severe/closure
  evidence until metric definitions are verified.

Update path:

```bash
npm run fetch:p0
npm run build:evidence
npm run audit:data
npm run audit:evidence
npm run audit:forecast
npm run build
```

For a full refresh and verification:

```bash
npm run build:data
npm run audit
npm run build
```

`npm run build:data` refetches P0 raw/normalized data and then regenerates
observation/evidence/canonical input artifacts. It can change local snapshots
when upstream pages or CSVs change.

## 6. P0 Data Schemas

### FRED Market Series

P0 series:

| Target | FRED series | Local key |
| --- | --- | --- |
| Brent | `DCOILBRENTEU` | `brent` |
| WTI | `DCOILWTICO` | `wti` |
| VIX | `VIXCLS` | `vix` |
| Broad USD | `DTWEXBGS` | `broad_usd` |
| USD/CNY | `DEXCHUS` | `usd_cny` |
| US10Y | `DGS10` | `us10y` |
| S&P 500 | `SP500` | `sp500` |

```ts
interface NormalizedMarketObservation {
  source_id: "fred-market";
  series_id: string;
  target: "brent" | "wti" | "vix" | "broad_usd" | "usd_cny" | "us10y" | "sp500";
  date: string;
  value: number | null;
  unit: string;
  source_url: string;
  retrieved_at: string;
  license_status: "open";
}
```

### Baseline Facts

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

### Maritime Advisory

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
  source_hash?: string;
}
```

### Hormuz Transit / Flow Proxy

```ts
interface HormuzTransitObservation {
  source_id: "imf-portwatch-hormuz" | "imo-hormuz-monthly";
  metric: "daily_transit_calls" | "monthly_avg_daily_transits";
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

## 7. Implementation Order

1. Create `data/` directories and `.gitkeep` files.
2. Move source registry out of TypeScript:
   - create `data/registry/sources.json`;
   - keep `src/data/sourceRegistry.ts` as a typed loader or generated mirror until runtime migration is done.
3. Implement `scripts/fetch-fred.mjs`:
   - fetch seven P0 FRED series;
   - write raw CSV snapshots;
   - upsert `data/normalized/market/fred_series.csv`;
   - generate `data/generated/market_series.json`.
4. Update `scripts/audit-data.mjs`:
   - validate local normalized data against latest raw snapshots;
   - spot-check upstream FRED;
   - fail if UI fixture diverges from generated data.
5. Move baseline facts from `src/data/sourceRegistry.ts` into `data/normalized/baseline/hormuz_baseline.json`.
6. Implement advisory snapshot scripts for UKMTO / MARAD / IMO.
7. Implement PortWatch / IMO transit normalization.
8. Implement `scripts/build-local-evidence.mjs`:
   - read normalized market / advisory / traffic / baseline artifacts;
   - write SourceObservation JSONL and EvidenceClaim JSONL;
   - generate `data/generated/canonical_inputs.json`;
   - enforce the PortWatch daily-vs-7d metric boundary.
9. Make `src/state/canonicalStore.ts` consume generated canonical inputs.
10. Only after P0 works end-to-end, add GDELT and ACLED candidate layers.
11. Add UCDP only when historical replay/evaluation starts.

## 8. Explicit Non-Goals

- Do not make UI call live remote APIs directly.
- Do not crawl every source in the registry before P0 is stable.
- Do not use Polymarket odds as ground truth or direct forecast evidence.
- Do not promote Gold, USD/CNH, or vessel-level AIS without stable provider and license review.
- Do not let market data act as a second forecast engine.
- Do not write `sourceHash` without a real raw file.

## 9. Reference URLs

- FRED API: https://fred.stlouisfed.org/docs/api/fred/series/series_observations.html
- FRED graph CSV pattern: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES_ID>`
- EIA World Oil Transit Chokepoints: https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints/wotc.pdf
- IEA oil security and emergency response: https://www.iea.org/about/oil-security-and-emergency-response
- IMO monthly Hormuz transit data: https://www.imo.org/en/mediacentre/hottopics/pages/strait-of-hormuz-middle-east-data.aspx
- IMF PortWatch data download: https://data-download.imf.org/ClimateData/portwatch-monitor.html
- UKMTO recent incidents: https://www.ukmto.org/recent-incidents
- MARAD Office of Maritime Security: https://www.maritime.dot.gov/ports/office-security/office-maritime-security
- MARAD U.S. Maritime Alerts: https://www.maritime.dot.gov/msci-alerts
- GDELT Cloud API v2: https://docs.gdeltcloud.com/api-reference
- ACLED API documentation: https://acleddata.com/acled-api-documentation
- UCDP API documentation: https://ucdp.uu.se/apidocs/index.html
- Natural Earth: https://www.naturalearthdata.com/
- LBMA Gold Price: https://www.lbma.org.uk/prices-and-data/lbma-gold-price
