# Hormuz Risk Intelligence Interface — Design

Last updated: 2026-05-12

唯一产品总纲。README 是入口；[`PLANS.md`](../PLANS.md) 规定 Forecast 页的实时可视化实现细节；[`docs/data.md`](data.md) 规定本地数据契约与采集 pipeline。本文件覆盖：产品定位、信息架构、背景三页设计、与 Forecast 页的边界、数据消费契约、视觉规范、evaluation 与 audit。

---

## 0. 本次重新定位（2026-05-12）

旧版本设计把整个仓库定位为"forecast revision 的可视化窗口"，让 Overview / Market / News 全部围绕 `scenario / mechanism / judgement_updated / checkpoint` 这条链路服务。这条契约在本仓库 *Forecast 页是 mock 状态机* 的阶段是成立的；但 Forecast 页一旦迁到真实 galaxy-selfevolve run（PLANS.md），背景三页继续绑这条契约会出现两个问题：

1. **真实 galaxy run 已经在自己的 trace 里输出 prediction / key_evidence / boxed answer**；背景三页没必要再造一份 `scenarioDistribution` 来"配合"它，否则两份概率不一致就成假信号。
2. **背景三页要回答的根本问题是"Hormuz 现在状态是什么 + 市场背景是什么"**，不是"Agent 为什么改判"。强行套 revision contract 让 Overview 长出 *Why not closure / next watch / checkpoint id* 这类只对 forecast pipeline 有意义的模块，对纯 reviewer 来说是噪声。

本版决定：

- **Forecast 页** 是**唯一** forecast truth surface；它的可视化、数据流、生命周期全部见 `PLANS.md`。
- **Overview / News / Market** 重新定位为**事件 + 市场背景层**，与 forecast pipeline **当前阶段完全解耦**。
- 旧的 `scenario / mechanism / judgement_updated / checkpoint` schema **保留在代码中**（Forecast 页未来若需要在 live viewer 之外加一层 reviewer 注释，仍可复用），但**不在背景三页渲染**。
- 新增两类数据：**Hormuz events timeline**（事件脉络叙事）+ **Polymarket reference questions**（外部预测对照）。

未来重新联动的可能路径（**不在本轮范围**）：

- Forecast 页落 `record_forecast` 之后，把 `key_evidence.url` 与 events timeline / advisories 做引用对齐，让 reviewer 反向跳转。
- Market 页在 Forecast run 完成后叠加 *该 run 关注的 horizon 窗口* 高亮。

## 1. 产品定位

**Hormuz Risk Intelligence Interface 是一个"事件背景 + Agent 实时跑动"双层界面。**

不是地缘政治新闻 dashboard、金融交易系统、AIS 实时监控系统或 LLM 调试台。它做两件事：

1. 把一个高维 case（Hormuz）的事件脉络和市场背景压成 reviewer 30 秒能消化的三页（Overview / News / Market）。
2. 让 reviewer 点一次按钮就能看到真实 forecast agent（galaxy-selfevolve）一步一步跑出 boxed answer（Forecast）。

差异化命题：

> 我们不展示霍尔木兹"应该"是什么状态；我们展示霍尔木兹**现在**是什么状态，以及一个真实 agent 给出预测的过程。

## 2. 信息架构

```text
顶层四页（左侧导航）
├── Overview   现在 Hormuz 是什么状态？(10s 摘要 + 关键事件 + 关键市场 + Polymarket)
├── News       Hormuz 事件如何走到这里？(events timeline + advisory 原文卡片)
├── Market     跨资产市场怎么走？(FRED 9 series + 事件标注)
└── Forecast   一次真实 galaxy run 长什么样？(live trace + boxed answer)
```

路由：背景三页 SPA 内部路由（`/`, `/news`, `/market`），Forecast 页保持 `/forecast`。地理信息只在 Overview mini map 出现；不做实时船舶地图（无授权 AIS 前）。

### 2.1 三页之间的耦合规则

- Overview 摘要里 *引用* News 页的最新事件、Market 页的当日 snapshot，引用本质是 *deep link*，不是 *派生计算*。
- News timeline 上的事件可以被 Market 页用作"时间轴标注"输入；Market 页**不二次解读**事件含义，只画一根竖线 + label。
- News / Market 都不调用 Overview 数据；Overview 是消费端，不是事实源。
- Forecast 页**不读** Overview / News / Market 任何状态，也不写回。它是独立 surface。

## 3. Case Narrative

### 3.1 Hormuz 结构性 baseline（Overview 永远在屏）

| Anchor | 文案 | Source boundary |
| --- | --- | --- |
| Oil flow | 近 20 mb/d petroleum liquids 经由 Hormuz | EIA/IEA chokepoint baseline；不是当日 throughput |
| Bypass capacity | 替代出口路线能力约 3.5–5.5 mb/d | IEA public explainer；精确拆分必须绑定可审计原始表 |
| Exposure | Asia-heavy crude / product exposure + LNG relevance | 结构性解释，不写成实时数据 |
| Caveat | closure 是尾部事件，需 verified flow stop 或 official avoidance | 仅作叙事，不作概率 |

文案模板：

```text
Why Hormuz matters
≈20 mb/d oil flows · 3.5–5.5 mb/d bypass capacity · Asia-heavy exposure · LNG relevance
```

### 3.2 当前事件状态来源

Overview 顶部"当前事件状态"卡片必须能回溯到 events timeline 里的具体 event id；它不是独立结论。

## 4. 非目标

- 不做全网新闻聚合器、实时 AIS 商业监控、交易建议、军事情报平台、通用宏观 dashboard、LLM 调试日志展示页、复杂 GIS。
- 不在背景三页伪造 scenario 概率、mechanism 链、agent 内部 state。
- 不让 Polymarket odds 进入任何 forecast 流程（PLANS.md 的 galaxy run 也不消费 polymarket）。

## 5. 页面设计

### 5.0 视觉方向

视觉目标是 **light reviewer console**，不是深色作战室。

- 白色或近白背景，低饱和蓝色为唯一主强调色。
- 橙/红/绿仅用于事件严重度（advisory severity）、涨跌、告警语义。
- 顶部固定产品栏：logo、产品名、四页 tabs、右侧 data-as-of badge（显示最新一次 `npm run build:data` 时间）。
- 模块为白底卡片、1px 冷灰边框、轻阴影、8px radius。
- 图标 `lucide-react`。
- 16:9 dashboard 为首要展示，移动端纵向堆叠。
- 数字 tabular nums。

设计 token：

| Token | 用途 | 建议值 |
| --- | --- | --- |
| `--bg` | 页面背景 | `#f8fafc` |
| `--surface` | 卡片背景 | `#ffffff` |
| `--line` | 卡片边框 | `#dfe7f1` |
| `--text` | 主文字 | `#0f172a` |
| `--muted` | 次级文字 | `#64748b` |
| `--blue` | 主强调 | `#0b66f6` |
| `--amber` | watch / elevated | `#ff9f1c` |
| `--red` | severe / negative | `#ef2b2d` |
| `--green` | de-escalation / positive | `#16a34a` |

Typography：

```text
Page title:    28–32px / 700
Section title: 16–18px / 650
Card title:    13–14px / 650
Body:          14px / 450
Caption:       12px / 450
Numbers:       tabular-nums
```

### 5.1 Overview

**核心问题：现在 Hormuz 是什么状态？外部市场怎么定价这个问题？**

10 秒消化目标。布局：

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Headline strip                                                        │
│ "Hormuz status as of 2026-05-12 — see News for full timeline"         │
│ severity chip · last-event-at · data-as-of                            │
└──────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────┬────────────────────────────────┐
│ Why Hormuz matters (baseline strip)  │ Mini map                       │
│ ≈20 mb/d · bypass · Asia exposure    │ Strait + bypass + advisory pin │
└─────────────────────────────────────┴────────────────────────────────┘

┌─────────────────────────────────────┬────────────────────────────────┐
│ Latest events (top 3 from timeline) │ Traffic (PortWatch, placed top)│
│ event title · source · at · severity│ daily transit calls (today)    │
│ → deep link to News                  │ 7d avg · vs 1y same-window     │
│                                      │ AIS caveat (hover)             │
│                                      ├────────────────────────────────┤
│                                      │ Market snapshot                │
│                                      │ Brent · WTI · VIX · Broad USD  │
│                                      │ gold: pending (legend only)    │
│                                      │ → deep link to Market          │
└─────────────────────────────────────┴────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ External prediction markets (Polymarket reference)                    │
│ "Strait of Hormuz traffic returns to normal by end of June" · 67%     │
│ resolution criteria · volume · last trade · source url                │
│ ⚠ external market, not our forecast                                   │
└──────────────────────────────────────────────────────────────────────┘
```

必须展示：

- Headline severity 标签来自 `events_timeline` 中**最近一条** event 的 `severity_hint`（routine / watch / elevated / severe）。如果最近 14 天没有 event，标 `quiet`。
- Baseline strip 来自 `hormuz_baseline.json`，与 News/Market 共用同一份事实。
- Mini map 静态底图 + advisory pin（来自 advisories.jsonl 的 geography 字段）。
- Latest events：取 events_timeline 按 `event_at desc` 前 3 条；点击跳 News 页对应 anchor。
- **Traffic（置顶于市场卡片）**：来自 `overview_snapshot.traffic_snapshot`：今日 PortWatch daily transit calls + 7d avg + 与过去 1y 同期均值的差异 %。曲线 baseline 由 PortWatch 自身派生，不跨源拼 IMO 阈值。AIS 局限（spoofing、dark vessels、PortWatch revision）做 hover caveat。文案只述事实，不出现"closure / scenario"。
- Market snapshot（次于 Traffic）：FRED 9 series 中 `brent / wti / vix / broad_usd` 当日值；gold / usd_cnh 保持 pending（`—`，hover 提示 pending reason）。
- Polymarket card：从 `polymarket_questions.json` 渲染 `selected_for_overview=true` 的 3–5 条；按 topic（hormuz → us_iran → oil → regional）排序；显示 last-fetched odds、resolution criteria、source url、明显 "External market, not our forecast" 免责。

**禁止**：scenario distribution、Why not closure、judgement_updated headline、checkpoint id、`pricingPattern`、Forecast agent 任何内部 state。

### 5.2 News

**核心问题：Hormuz 事件如何走到当前状态？官方/媒体说了什么？**

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Filter bar                                                            │
│ time-range · severity · source-type (official | media | open-source)  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ Vertical timeline                                                     │
│ ●─── 2026-05-10 UKMTO advisory — elevated                             │
│ │    "Vessels in Gulf of Oman advised to maintain heightened watch"   │
│ │    source: ukmto.org/... · retrieved 2026-05-12 · raw snapshot ↗    │
│ │                                                                     │
│ ●─── 2026-05-08 MARAD MSCI alert — watch                              │
│ │    ...                                                              │
│ │                                                                     │
│ ●─── 2026-04-22 Incident report — IRGC boarding (media)               │
│ │    [media] source: reuters.com/... · cross-checked: UKMTO yes/no    │
│ ●─── ...                                                              │
└──────────────────────────────────────────────────────────────────────┘
```

必须展示：

- 时间轴节点 = `events_timeline.jsonl` 一条 entry；按 `event_at desc` 渲染。
- 每条 entry 显示：event title、severity chip、event_at、source name + url、retrieved_at、raw snapshot 路径（点击在浏览器新 tab 打开本地静态文件）。
- Filter bar：时间范围（7d / 30d / 90d / all）、severity multiselect、source_type multiselect、topic tag multiselect（来自 `news_timeline.topic_index`）。
- 区分 `official` vs `media` vs `open-source` 三类 source；official 优先显示，media 视觉上稍弱。
- 每条 entry 可点击展开：完整 description + 原文摘要 + cross-check refs + **事件窗口 traffic 对照**（PortWatch 该事件 ±7d 的 daily transit calls mini sparkline，对照 1y 同期均值）。Traffic 对照是可选展开模块，不阻塞 News 主轴。

**禁止**：把 timeline 条目转写成 `EvidenceClaim` 后渲染回 Overview 的概率；任何"这条事件会让 X scenario 概率涨/跌"的解读。News 只叙事，不解读。

### 5.3 Market

**核心问题：跨资产市场怎么走？关键事件落在曲线哪里？**

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Range selector: 7d · 30d · 90d · 1y                                   │
│ Event overlay toggle: [✓] show events from News                       │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ Traffic chart — full width (PortWatch daily transit calls)            │
│ daily + 7d avg + 1y baseline (dashed)                                 │
│ ░░░░ Hormuz closure period shading (2026-02-28 → range end)           │
│ Event overlay vertical lines; AIS caveat below                        │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────┬───────────────────────────────────────────────┐
│ Brent (USD/bbl)       │ WTI (USD/bbl)                                 │
│ line chart, own y-axis│ line chart, own y-axis                        │
│ ░░ closure shading    │ ░░ closure shading                            │
└──────────────────────┴───────────────────────────────────────────────┘
┌──────────────────────┬───────────────────────────────────────────────┐
│ Broad USD index       │ Gold spot (USD/oz)                            │
└──────────────────────┴───────────────────────────────────────────────┘
┌──────────────────────┬───────────────────────────────────────────────┐
│ US10Y (%)             │ VIX                                           │
└──────────────────────┴───────────────────────────────────────────────┘
┌──────────────────────┬───────────────────────────────────────────────┐
│ NASDAQ                │ S&P 500                                       │
└──────────────────────┴───────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────┐
│ US CPI (monthly · sparse · points shown as dots)                      │
└──────────────────────────────────────────────────────────────────────┘
┌──────────────────────┬───────────────────────────────────────────────┐
│ USD/CNH [pending]     │                                               │
│ grey placeholder card │ grey placeholder card                         │
└──────────────────────┴───────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ Data coverage table                                                   │
│ series · source · license · retrieved_at · raw_path · provider_status │
└──────────────────────────────────────────────────────────────────────┘
```

必须展示：

- Range selector 控制所有图的 x 轴窗口。
- **Traffic chart（全宽）**：来自 `market_chart.json` `group="traffic"`：daily transit calls + 7d 滚动均值 + 1y 同期均值（baseline_points，虚线）；event overlay 竖线；AIS 局限 caveat 在图下方常驻。
- **每个指标独立折线图**（individual line chart，原生单位 y 轴，不 normalize）：Brent、WTI、Broad USD、Gold spot、US10Y、VIX、S&P500 各一张；NASDAQ 保留在 coverage table 作溯源，不作为主图；US CPI 月度数据单独一张（线 + 散点）。布局：**每行 2 张**，2 列 grid。Gold 当前使用 Stooq XAU/USD 1y daily OHLC 的 Close 字段作 spot proxy，必须在 caveat 标明它不是 LBMA benchmark 历史序列或 futures continuous contract。USD/CNY 与 USD/CNH 不在 Market 图表或 coverage table 展示。
- **Hormuz 封锁期色块**（closure shading）：每张图（包括 Traffic）都叠加一个半透明 amber 色块，x 区间 `2026-02-28` 至当前 range 末端，`opacity: 0.10–0.12`，右侧加小标注"封锁架构"。
- **节假日/gap 断线**：FRED 空值行（节假日/非交易日）不填 0，直接从 `points` 中剔除，折线在 gap 处显示为断开（不连接），不插值，不跌到 0。
- **日频 series 不画逐点圆点**：每条日频 series 只在最后一个数据点画一个小圆（半径 3px，颜色与线同色），用于显示"最新值"；不在中间每点都画 marker。月频稀疏 series（US CPI）才对每点画 marker。
- **Pending series**：保留数据契约和审计入口，但 Market 页不渲染独立 pending 占位区，也不进入 coverage table，避免把未接入 source 当作覆盖项。
- **Event overlay**：每张图（包括每个 series 小图）都支持事件竖线；hover 显示 event title，点击跳 `/news#<event_id>`。overlay toggle 关闭时全部隐藏。
- 底部 coverage table 显示 source、license、`retrieved_at`、provider_status，pending 行标灰。

**禁止**：`MarketRead` / `pricingPattern` / "市场支持哪个 scenario" / "市场已 price-in 多少"。Market 页只画原始数据 + 事件标注，**不做解读**。解读交给 Forecast agent（在 Forecast 页里做）。

### 5.4 Forecast

详见 [`PLANS.md`](../PLANS.md)。本文档只规定它与其他三页的边界：

- Forecast 页不消费 events_timeline、polymarket_questions、market_series。
- Forecast 页**唯一** truth source 是 `data/galaxy/runs/<date>/<task>/main_agent.jsonl` 的 live tail。
- Forecast 页的 boxed answer 不回写 Overview 任何字段；Overview 也不展示 Forecast 当前 prediction。
- 当前阶段不打通双向引用；未来打通方式见 §0。

## 6. 信息契约（背景三页范围）

所有背景三页 UI 模块必须能归入下面五类之一，否则不进入主界面。

| 类型 | 含义 | 出现位置 |
| --- | --- | --- |
| Baseline | Hormuz 结构性事实锚点 | Overview |
| Event | 时间戳明确、来源可追溯的具体事件 | Overview (top 3) / News (timeline) |
| Market datum | 单条市场数据点（series + date + value + source） | Overview snapshot / Market chart |
| External prediction | 外部预测市场的 question + odds + source | Overview Polymarket card |
| Caveat | pending / license / cross-check 警示 | 所有页面（必须在数据旁可见） |

旧版 `Forecast / Mechanism / Watch` 三类从背景三页移除，归到 Forecast 页（galaxy live trace 内部表达）。

## 7. 数据消费契约

```text
data/
  registry/
    sources.json                  ← Overview/News/Market 都读取，决定 source 元数据
    market_providers.json         ← Market 页 coverage table
  normalized/
    baseline/hormuz_baseline.json ← Overview baseline strip
    market/fred_series.csv        ← Market 主图 + Overview snapshot
    maritime/advisories.jsonl     ← News timeline (official channel)
    maritime/hormuz_transits.csv  ← 仅作 caveat 数据，不直接进 News 主轴
  events/
    events_timeline.jsonl         ← [NEW, P0] News 主轴 + Overview top 3 + Market overlay
  external/
    polymarket_questions.json     ← [NEW, P0] Overview Polymarket card
  galaxy/
    runs/<date>/<task>/...        ← Forecast 页专用，背景三页不读
```

具体 schema 见 [`docs/data.md`](data.md)。

硬规则：

1. 任何 Overview / Market 数字必须能追溯到 `data/normalized/...` 或 `data/external/...` 里某一条具体记录。
2. 任何 Polymarket 数据点必须显示 "External market, not our forecast" 免责 + source url + last_fetched。
3. 任何 pending series 必须显式标 pending（灰、不画线、不参与 normalize 计算）。
4. UI 不调用 live remote API；只读 `data/generated/` 与 `data/external/` 与 `data/galaxy/`。
5. Forecast 页不读背景三页数据；背景三页不读 galaxy artifact。

## 8. 系统架构

```text
背景三页 pipeline (offline)
  Source registry
    → Fetch scripts (fetch-fred / snapshot-advisories / snapshot-portwatch / curate-events / curate-polymarket)
    → data/raw/                    (append-only)
    → data/normalized/             (upsert by primary key)
    → data/events/events_timeline.jsonl  (curated, append + edit)
    → data/external/polymarket_questions.json  (curated, edit)
    → scripts/build-generated.mjs
    → data/generated/{market_series, overview_snapshot, news_timeline, market_chart}.json
    → src/state/* (consumes generated)
    → Overview / News / Market 页

Forecast 页 pipeline (online, on demand)
  reviewer clicks "Run galaxy"
    → vite middleware POST /api/galaxy-hormuz/run/start
    → spawn .venv/bin/python main.py --run-config hormuz_test.yaml
    → main_agent.jsonl append-only
    → SSE / polling tail
    → React Flow DAG live render
  (details in PLANS.md)
```

新增的 `scripts/build-generated.mjs` 负责把 `normalized/` + `events/` + `external/` 编译成前端直接消费的 `generated/` JSON。背景三页不在运行时再做 normalize / join。

## 9. Source Freshness 状态

```text
fresh       within expected cadence
lagging     missed one cadence
stale       missed multiple cadences
missing     fetch failed
pending     not authorized / not implemented
```

背景三页必须可见：`data-as-of`（最近一次 `npm run build:data` 完成时间）、每条 series / event 的 `retrieved_at`、pending series 的 caveat、license_status。

## 10. Evaluation 与 Audit

背景三页不做 forecast accuracy 评估（那是 Forecast 页 / galaxy-selfevolve 的职责）。背景三页的 audit 目标是**事实完整性 + 边界守护**。

### 10.1 必跑 audit（保留并扩展）

| Audit | 检查内容 | 范围 |
| --- | --- | --- |
| `audit:data` | FRED 9 series active 行有 raw_path / source_hash / retrieved_at / source_url / provider_id / license_status；pending 行 value=null + points=[]；USD/CNH 不来自 FRED DEXCHUS | Market |
| `audit:events` *(new)* | events_timeline.jsonl 每条 entry 有 event_id / event_at / source_url / retrieved_at / severity_hint；severity_hint ∈ 允许集合；source_type ∈ {official, media, open-source} | News / Overview |
| `audit:polymarket` *(new)* | polymarket_questions.json 每条有 question_id / question_url / resolution_criteria / last_fetched / odds 区间合法；不被任何 forecast pipeline / EvidenceClaim 消费 | Overview |
| `audit:legacy` | 防止旧 schema 回流；**扩展**：检查 Overview/Market/News 渲染代码不引用 `scenarioDistribution / pricingPattern / judgement_updated / mechanismTags / checkpoint` 等 forecast revision 字段 | 全仓 |
| `audit:galaxy` | galaxy artifact 完整性（与 Forecast 页相关，见 PLANS.md） | Forecast |
| `audit:ui` *(P2)* | 渲染时 pending caveat / retrieved_at / source_url 必须可见；events / polymarket / pending 行 dom 必须带对应 data-attr | 全仓 |

旧的 `audit:evidence` / `audit:forecast` / `audit:replay` 仍保留，但其检查目标缩到 `data/evidence/` 与 `data/galaxy/` 范围；不再校验 Overview/Market/News 渲染。

### 10.2 验收标准（背景三页）

- Reviewer 10 秒内能从 Overview 看出当前 Hormuz 事件 severity + 最近 3 条事件 + 关键市场水位 + 1 条 Polymarket 参考。
- News 页一屏能看到最近 30 天的所有 advisory + 5 条以上 curated event；每条都能点开看 source url 与本地 snapshot。
- Market 页 7d / 30d / 90d / 1y 切换流畅；事件竖线悬停能看到事件 title 并跳 News。
- 没有任何页面渲染 scenario 概率、`pricingPattern`、`judgement_updated`、`Why not closure`、mechanism 链。
- 任何 pending 数据都有 caveat；任何 Polymarket 数据都有外部市场免责。
- Forecast 页 Run galaxy 按钮工作；Forecast 页不读 Overview/Market/News 任何 state（grep 验证）。

## 11. 当前落地状态 vs 目标差距

| 模块 | 现状 | 目标 | 行动 |
| --- | --- | --- | --- |
| `src/App.tsx` 四页 IA | 四页齐备 | 保留 | — |
| Overview 页 | 渲染 scenario distribution / Why not closure / current checkpoint | 改为 baseline + latest events + market snapshot + Polymarket | `[P0]` 重写 |
| News 页 | 含 evidence handoff、candidate evidence 概念 | 改为纯 events timeline + advisories | `[P0]` 重写，去掉 evidence/forecast 引用 |
| Market 页 | 含 MarketRead / pricingPattern / scenario 关联文案 | 改为 raw 数据 + 事件标注，无解读 | `[P0]` 重写 |
| Forecast 页 | 部分接 deterministic local runner，部分接 galaxy | 按 PLANS.md 改为真实 galaxy live viewer | `[P0]` PLANS.md |
| `data/events/events_timeline.jsonl` | 不存在 | 必须存在 | `[P0]` 新增 |
| `data/external/polymarket_questions.json` | 不存在 | 必须存在 | `[P0]` 新增 |
| `src/state/forecastStore.ts` / `canonicalStore.ts` 中的 scenario / judgement_updated | 当前驱动 Overview/Market | 不再驱动背景三页；保留 schema 供 Forecast 页扩展 | `[P0]` 隔离 |
| `audit:events` / `audit:polymarket` | 不存在 | 必须存在 | `[P0]` 新增 |
| `audit:legacy` 范围 | 旧 forecast 字段防回流 | 扩展到"背景三页禁止引用 forecast revision 字段" | `[P0]` 扩展 |

## 12. 最终设计原则

> 背景三页让 reviewer 在 30 秒内理解 *Hormuz 现在是什么状态*；Forecast 页让 reviewer 在 5 分钟内看清楚 *一次真实 agent run 是怎么走完的*。两件事互不伪装、互不污染。

页面最美的状态：

```text
Overview: 一屏读懂当前 Hormuz 状态 + 外部市场怎么看
News:     一屏读懂事件如何走到这里
Market:   一屏读懂跨资产市场怎么走 + 事件落在哪里
Forecast: 一次按钮看到真 LLM agent 一步步跑完
```

## 13. Reference Sources

- [IEA Strait of Hormuz](https://www.iea.org/about/oil-security-and-emergency-response/strait-of-hormuz)
- [EIA Hormuz chokepoint note](https://www.eia.gov/todayinenergy/detail.php?id=65504)
- [FRED DTWEXBGS](https://fred.stlouisfed.org/series/DTWEXBGS)
- [FRED series observations API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html)
- [IMO Middle East / Strait of Hormuz hub](https://www.imo.org/en/mediacentre/hottopics/pages/middle-east-strait-of-hormuz.aspx)
- [MARAD U.S. Maritime Alerts](https://www.maritime.dot.gov/msci-alerts)
- [UKMTO recent incidents](https://www.ukmto.org/recent-incidents)
- [IMF PortWatch](https://data-download.imf.org/ClimateData/portwatch-monitor.html)
- [Polymarket: Strait of Hormuz traffic returns to normal by end of June](https://polymarket.com/zh/event/strait-of-hormuz-traffic-returns-to-normal-by-end-of-june)
- [ACLED Data Export Tool](https://acleddata.com/conflict-data/data-export-tool)
- [React Flow terms](https://reactflow.dev/learn/concepts/terms-and-definitions)
- [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
