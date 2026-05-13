// Overview is the reviewer entry page: static product framing plus dynamic, sourced previews.
import {
  Activity,
  ArrowRight,
  BarChart3,
  ExternalLink,
  Newspaper,
} from "lucide-react";
import { CaseMap } from "../components/map/CaseMap";
import { InfoTitle } from "../components/shared/InfoTitle";
import snapshotJson from "../../data/generated/overview_snapshot.json";
import type { OverviewSnapshot } from "../types/marketChart";
import type { PolymarketQuestionOutcome, PolymarketQuestionRef } from "../types/polymarket";
import type { TimelineEvent } from "../types/timeline";

const snapshot = snapshotJson as OverviewSnapshot;

const pageLinks = [
  {
    href: "/forecast",
    icon: Activity,
    label: "Forecast Agent",
    meta: "dynamic run trace",
    title: "看一次真实 forecast agent 怎么跑完",
    body: "从问题设置、web evidence、tool calls 到最终 record_forecast，Forecast 是唯一的预测 truth surface。",
  },
  {
    href: "/market",
    icon: BarChart3,
    label: "Market",
    meta: "dynamic data",
    title: "看市场和 traffic 背景",
    body: "Traffic transit calls、Brent / WTI / VIX / Broad USD 与事件 overlay，只展示原始市场背景。",
  },
  {
    href: "/news",
    icon: Newspaper,
    label: "News",
    meta: "curated timeline",
    title: "看事件时间线",
    body: "官方 advisory 与 promoted media events，按 source、severity、topic 可过滤，可回到原始来源。",
  },
];

const exampleQuestions = [
  "这次 Hormuz 相关事件是否足以改变 Brent 近一周高点预测？",
  "Traffic 是否已经回到历史同窗口水平？",
  "同一条 advisory 在 News timeline、Market overlay 和 Forecast evidence 中如何被复核？",
];

const staticDynamicRows = [
  {
    label: "Static",
    title: "Case context",
    body: "网站定位、Hormuz baseline、地图轮廓和页面导航是静态解释层。",
  },
  {
    label: "Dynamic",
    title: "Local snapshots",
    body: "Traffic、market rows、events timeline 来自 data/generated，显示 built_at / retrieved_at。",
  },
  {
    label: "External",
    title: "Polymarket reference",
    body: "外部市场只作参考，不进入 forecast pipeline；live fetch 不稳定时显式 pending。",
  },
];

function parseDate(value?: string | null) {
  if (!value) return null;
  const input = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
  }).format(date);
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(digits, 2),
  }).format(value);
}

function formatDelta(value: number | null | undefined, unit = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 2)}${unit}`;
}

function deltaDirection(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "positive" : "negative";
}

function truncateText(value: string, maxLength = 115) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}…`;
}

function cleanOutcomeId(outcomeId: string) {
  const suffix = outcomeId.includes(":") ? outcomeId.split(":").at(-1) : outcomeId;
  return String(suffix ?? outcomeId).replace(/_/g, " ").toUpperCase();
}

function sortedOutcomes(ref: PolymarketQuestionRef) {
  const outcomes = [...ref.outcomes];
  return outcomes.sort((a, b) => Number(b.last_price ?? -1) - Number(a.last_price ?? -1));
}

function outcomePercent(outcome: PolymarketQuestionOutcome) {
  return outcome.last_price === null || outcome.last_price === undefined
    ? null
    : Math.max(0, Math.min(100, outcome.last_price * 100));
}

function staticTrafficSummary(snapshot: OverviewSnapshot) {
  const traffic = snapshot.traffic_snapshot;
  if (!traffic) return "Traffic snapshot pending";
  return `${formatNumber(traffic.latest_value, 0)} daily transit calls · ${formatDelta(traffic.delta_vs_baseline_pct, "%")} vs 1y avg`;
}

function HeroPanel({ snapshot }: { snapshot: OverviewSnapshot }) {
  return (
    <section className="console-card overview-product-hero">
      <div className="overview-hero-copy">
        <span className="overview-page-kicker">Single-case reviewer console</span>
        <h1>Hormuz Risk Interface shows what the case is, what the market says, and how the forecast agent reasons.</h1>
        <p>
          This site is a compact review surface for one high-dimensional geopolitical forecasting case.
          Use Overview to orient yourself, then jump into the live agent trace, market background, or event timeline.
        </p>
        <div className="overview-hero-actions" aria-label="primary overview links">
          <a href="/forecast">
            Open Forecast Agent <ArrowRight size={15} />
          </a>
          <a href="/market">Market background</a>
          <a href="/news">Event timeline</a>
        </div>
      </div>
      <aside className="overview-hero-status" aria-label="static and dynamic data boundary">
        <div>
          <span>Static frame</span>
          <strong>Website guide + Hormuz context</strong>
        </div>
        <div>
          <span>Dynamic snapshot</span>
          <strong>{staticTrafficSummary(snapshot)}</strong>
        </div>
        <div>
          <span>Data built</span>
          <strong>{formatDateTime(snapshot.built_at)}</strong>
        </div>
      </aside>
    </section>
  );
}

function NavigationCards() {
  return (
    <section className="overview-navigation-grid" aria-label="overview page destinations">
      {pageLinks.map((item) => {
        const Icon = item.icon;
        return (
          <a className="console-card overview-nav-card" href={item.href} key={item.href}>
            <span className="overview-nav-icon">
              <Icon size={18} />
            </span>
            <span className="overview-nav-meta">{item.meta}</span>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
            <span className="overview-nav-link">
              {item.label} <ArrowRight size={14} />
            </span>
          </a>
        );
      })}
    </section>
  );
}

function ExampleQuestions() {
  return (
    <section className="console-card overview-questions-card">
      <InfoTitle title="Example questions" subtitle="What this demo is good for asking" />
      <ol>
        {exampleQuestions.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ol>
    </section>
  );
}

function StaticDynamicCard({ snapshot }: { snapshot: OverviewSnapshot }) {
  const sourceIds = [
    "source ids",
    "eia-iea-hormuz",
    snapshot.traffic_snapshot?.source_id,
    "fred-market",
    "events-curated",
    "polymarket-curated",
  ].filter(Boolean).join(" · ");

  return (
    <section className="console-card overview-boundary-card">
      <InfoTitle title="Static vs dynamic" subtitle="Do not mix context with live evidence" />
      <div className="overview-boundary-list">
        {staticDynamicRows.map((row) => (
          <article key={row.label}>
            <span>{row.label}</span>
            <strong>{row.title}</strong>
            <p>{row.body}</p>
          </article>
        ))}
      </div>
      <p className="overview-card-caveat">
        Current local snapshot: built {formatDateTime(snapshot.built_at)} · data as-of {formatDateTime(snapshot.data_as_of)} · {sourceIds}.
      </p>
    </section>
  );
}

function ContextMapCard() {
  return (
    <div className="overview-context-map">
      <CaseMap compact variant="context" />
    </div>
  );
}

function LatestEventsPreview({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="console-card overview-preview-card">
      <InfoTitle title="Latest sourced events" subtitle="Dynamic · from generated news timeline" />
      <ul className="overview-event-preview-list">
        {events.slice(0, 3).map((event) => (
          <li key={event.event_id}>
            <a href={`/news#${event.event_id}`} title={event.description}>
              <span data-severity={event.severity_hint}>{event.severity_hint.toUpperCase()}</span>
              <strong>{event.title}</strong>
              <small>
                {event.source_name} · {formatDate(event.event_at)}
              </small>
            </a>
          </li>
        ))}
      </ul>
      <a className="overview-inline-link" href="/news">
        Open full timeline <ArrowRight size={14} />
      </a>
    </section>
  );
}

function MarketPreview({ snapshot }: { snapshot: OverviewSnapshot }) {
  const traffic = snapshot.traffic_snapshot;
  const marketRows = snapshot.market_snapshot
    .filter((item) => ["brent", "wti", "vix", "broad_usd"].includes(item.target))
    .slice(0, 4);

  return (
    <section className="console-card overview-preview-card">
      <InfoTitle title="Market and traffic preview" subtitle="Dynamic · local generated snapshot" />
      <div className="overview-traffic-preview">
        <span>Traffic</span>
        <strong>{traffic ? formatNumber(traffic.latest_value, 0) : "—"}</strong>
        <small>
          daily transit calls
          {traffic ? ` · ${formatDate(traffic.latest_date)}` : ""}
        </small>
        {traffic ? (
          <b data-direction={deltaDirection(traffic.delta_vs_baseline_pct)}>
            {formatDelta(traffic.delta_vs_baseline_pct, "%")} vs 1y avg
          </b>
        ) : null}
      </div>
      <ul className="overview-market-preview-list">
        {marketRows.map((item) => (
          <li key={item.target}>
            <span>{item.label.replace(" spot proxy", "")}</span>
            <strong>
              {formatNumber(item.value, 2)} {item.unit}
            </strong>
            <b data-direction={deltaDirection(item.delta_1d)}>{formatDelta(item.delta_1d)} 1d</b>
          </li>
        ))}
      </ul>
      <a className="overview-inline-link" href="/market">
        Open market background <ArrowRight size={14} />
      </a>
    </section>
  );
}

function PolymarketCard({ refs }: { refs: PolymarketQuestionRef[] }) {
  return (
    <section className="console-card overview-polymarket-card">
      <div className="overview-polymarket-banner">External market, not our forecast</div>
      <div className="overview-polymarket-heading">
        <InfoTitle
          title="Polymarket-style external reference"
          subtitle="Dynamic only when curated odds are available; otherwise visibly pending"
        />
      </div>
      <div className="overview-polymarket-grid">
        {refs.map((ref) => {
          const outcomes = sortedOutcomes(ref);
          const hasOdds = outcomes.some((outcome) => outcomePercent(outcome) !== null);
          return (
            <article key={ref.question_id} title={ref.caveat}>
              <div className="overview-polymarket-card-head">
                <span>{ref.topic_tags.join(" / ")}</span>
                <a href={ref.question_url} rel="noreferrer" target="_blank">
                  Polymarket <ExternalLink size={13} />
                </a>
              </div>
              <strong>{ref.title}</strong>
              <div className="overview-polymarket-outcomes">
                {outcomes.slice(0, 4).map((outcome) => {
                  const pct = outcomePercent(outcome);
                  return (
                    <div key={outcome.outcome_id}>
                      <span>{cleanOutcomeId(outcome.outcome_id)}</span>
                      <b>{pct === null ? "pending" : `${pct.toFixed(0)}%`}</b>
                      <i style={{ width: `${pct ?? 0}%` }} />
                    </div>
                  );
                })}
              </div>
              {!hasOdds ? (
                <p className="overview-polymarket-pending">
                  odds pending · external page may have live odds, but local curated snapshot has not captured them.
                </p>
              ) : null}
              <p className="overview-polymarket-resolution" title={ref.resolution_criteria}>
                {truncateText(ref.resolution_criteria)}
              </p>
              <small>
                {ref.total_volume_usd ? `volume $${formatNumber(ref.total_volume_usd, 0)} · ` : ""}
                retrieved {formatDateTime(ref.retrieved_at)}
              </small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function OverviewPage() {
  return (
    <section className="page-grid overview-page">
      <div className="overview-guide-layout">
        <HeroPanel snapshot={snapshot} />
        <NavigationCards />

        <div className="overview-guide-main">
          <div className="overview-guide-left">
            <ExampleQuestions />
            <ContextMapCard />
          </div>

          <aside className="overview-guide-right">
            <StaticDynamicCard snapshot={snapshot} />
            <MarketPreview snapshot={snapshot} />
            <LatestEventsPreview events={snapshot.latest_events} />
          </aside>
        </div>

        <PolymarketCard refs={snapshot.polymarket_refs} />
      </div>
    </section>
  );
}
