// Overview page consumes the generated background snapshot for a 10-second Hormuz scan.
import {
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { CaseMap } from "../components/map/CaseMap";
import { InfoTitle } from "../components/shared/InfoTitle";
import snapshotJson from "../../data/generated/overview_snapshot.json";
import type { HormuzBaselineFact, OverviewSnapshot } from "../types/marketChart";
import type { PolymarketQuestionRef } from "../types/polymarket";
import type { TimelineEvent, TimelineSeverity } from "../types/timeline";

const snapshot = snapshotJson as OverviewSnapshot;

const severityCopy: Record<OverviewSnapshot["current_severity"], string> = {
  quiet: "QUIET",
  routine: "ROUTINE",
  watch: "WATCH",
  elevated: "ELEVATED",
  severe: "SEVERE",
};

type SeverityTone = OverviewSnapshot["current_severity"] | TimelineSeverity;

const baselineLabels: Record<string, string> = {
  "oil-flow": "Oil flow",
  "bypass-capacity": "Bypass capacity",
  "asia-exposure": "Asia exposure",
  "lng-relevance": "LNG relevance",
};

function parseDate(value?: string | null) {
  if (!value) return null;
  const input = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value?: string | null) {
  if (!value) return "pending";
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
  if (!value) return "pending";
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

function eventSeverityTone(severity: TimelineSeverity): SeverityTone {
  return severity === "deescalation" ? "quiet" : severity;
}

function bestOutcome(ref: PolymarketQuestionRef) {
  const priced = ref.outcomes.filter((outcome) => outcome.last_price !== null);
  return priced.sort((a, b) => Number(b.last_price) - Number(a.last_price))[0] ?? ref.outcomes[0];
}

function truncateText(value: string, maxLength = 100) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}…`;
}

const marketLabels: Record<string, string> = {
  brent: "Brent",
  wti: "WTI",
  vix: "VIX",
  broad_usd: "Broad USD",
  gold: "Gold",
  usd_cnh: "USD/CNH",
};

const marketOrder = ["brent", "wti", "vix", "broad_usd"];

function HeadlineStrip({ snapshot }: { snapshot: OverviewSnapshot }) {
  const latest = snapshot.latest_events[0];

  return (
    <section className="console-card overview-headline-strip">
      <span className="overview-severity-badge" data-severity={snapshot.current_severity}>
        {severityCopy[snapshot.current_severity]}
      </span>
      <h1>Hormuz status as of {formatDateTime(snapshot.data_as_of)}</h1>
      {latest ? (
        <p className="overview-headline-event">
          <span>{latest.title}</span>
          <a href="/news">
            News <ArrowRight size={14} />
          </a>
        </p>
      ) : null}
      <div className="overview-headline-meta" aria-label="overview freshness">
        <span>last event {formatDateTime(latest?.event_at)}</span>
        <span aria-hidden="true">·</span>
        <span>built {formatDate(snapshot.built_at)}</span>
      </div>
    </section>
  );
}

function SeverityChip({
  severity,
  size = "small",
}: {
  severity: SeverityTone;
  size?: "small" | "large";
}) {
  const label = severity === "quiet" ? "QUIET" : severity.toUpperCase();
  return (
    <span className={`overview-severity-chip overview-severity-chip-${size}`} data-severity={severity}>
      {label}
    </span>
  );
}

function DeltaBadge({
  value,
  unit = "",
  suffix,
}: {
  value: number | null | undefined;
  unit?: string;
  suffix?: string;
}) {
  return (
    <span className="overview-delta-badge" data-direction={deltaDirection(value)}>
      {formatDelta(value, unit)}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

function MetricBlock({
  label,
  value,
  unit,
  subtitle,
  deltaValue,
  deltaUnit,
  deltaSuffix,
}: {
  label: string;
  value: string;
  unit: string;
  subtitle: string;
  deltaValue?: number | null;
  deltaUnit?: string;
  deltaSuffix?: string;
}) {
  return (
    <article className="overview-traffic-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{unit}</em>
      <small>{subtitle}</small>
      {deltaSuffix ? (
        <DeltaBadge value={deltaValue} unit={deltaUnit} suffix={deltaSuffix} />
      ) : null}
    </article>
  );
}

function BaselineStrip({ facts }: { facts: HormuzBaselineFact[] }) {
  return (
    <section className="console-card overview-baseline-strip">
      <InfoTitle title="Why Hormuz matters" subtitle="Structural baseline, not same-day throughput" />
      <ul>
        {facts.map((fact) => (
          <li key={fact.fact_id} title={`${fact.caveat} Retrieved ${formatDateTime(fact.retrieved_at)}`}>
            <strong>{fact.value}</strong>
            <em>{fact.unit}</em>
            <p>{baselineLabels[fact.fact_id] ?? fact.fact_id}</p>
            <small>
              {fact.source_id} · retrieved {formatDateTime(fact.retrieved_at)}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LatestEventsCard({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="console-card overview-latest-events-card">
      <InfoTitle title="Latest events" subtitle="Top 3 promoted timeline entries" />
      <ul>
        {events.slice(0, 3).map((event) => (
          <li key={event.event_id}>
            <a href={`/news#${event.event_id}`} className="overview-event-link" title={event.description}>
              <SeverityChip severity={eventSeverityTone(event.severity_hint)} />
              <span className="overview-event-copy">
                <strong>{event.title}</strong>
                <span>
                  {event.source_name} · {formatDate(event.event_at)}
                </span>
              </span>
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrafficSnapshotCard({ snapshot }: { snapshot: OverviewSnapshot["traffic_snapshot"] }) {
  return (
    <section className="console-card overview-traffic-card">
      <InfoTitle title="Traffic snapshot" subtitle="PortWatch daily transit calls" />
      {snapshot ? (
        <>
          <div className="overview-traffic-metrics" title={snapshot.caveat}>
            <MetricBlock
              label="Latest"
              value={formatNumber(snapshot.latest_value, 0)}
              unit="daily transit calls"
              subtitle={formatDate(snapshot.latest_date)}
            />
            <MetricBlock
              label="7d avg"
              value={formatNumber(snapshot.avg_7d, 2)}
              unit="daily transit calls"
              subtitle={`1y avg ${formatNumber(snapshot.baseline_1y_same_window, 2)}`}
              deltaValue={snapshot.delta_vs_baseline_pct}
              deltaUnit="%"
              deltaSuffix="vs 1y avg"
            />
          </div>
          <p className="overview-card-caveat">{snapshot.caveat}</p>
        </>
      ) : (
        <p className="overview-card-caveat">PortWatch traffic snapshot pending.</p>
      )}
    </section>
  );
}

function MarketSnapshotCard({ snapshot }: { snapshot: OverviewSnapshot["market_snapshot"] }) {
  const activeRows = marketOrder
    .map((target) => snapshot.find((item) => item.target === target && item.status === "active"))
    .filter((item): item is OverviewSnapshot["market_snapshot"][number] => Boolean(item));
  const pendingRows = snapshot.filter((item) => item.status === "pending_source");

  return (
    <section className="console-card overview-market-card">
      <InfoTitle title="Market snapshot" subtitle="FRED active rows, raw values only" />
      <ul className="overview-market-list">
        {activeRows.map((item) => (
          <li key={item.target} title={`${item.caveat ?? ""} Retrieved ${formatDateTime(item.retrieved_at)}`}>
            <span>{marketLabels[item.target] ?? item.label}</span>
            <strong>
              {formatNumber(item.value, 2)} {item.unit}
              <DeltaBadge value={item.delta_1d} suffix="1d" />
            </strong>
          </li>
        ))}
      </ul>
      {pendingRows.length > 0 ? (
        <div className="overview-market-pending" aria-label="pending market coverage">
          {pendingRows.map((item) => (
            <span key={item.target} title={item.caveat}>
              {marketLabels[item.target] ?? item.label} — pending
            </span>
          ))}
          <a href="/market">coverage in Market</a>
        </div>
      ) : null}
    </section>
  );
}

function PolymarketCard({ refs }: { refs: PolymarketQuestionRef[] }) {
  return (
    <section className="console-card overview-polymarket-card">
      <div className="overview-polymarket-banner">External market, not our forecast</div>
      <div className="overview-polymarket-heading">
        <InfoTitle
          title="External prediction markets"
          subtitle="Selected Polymarket references, excluded from forecast inputs"
        />
      </div>
      <div className="overview-polymarket-grid">
        {refs.map((ref) => {
          const outcome = bestOutcome(ref);
          const lastPrice = outcome?.last_price;
          const hasOdds = lastPrice !== null && lastPrice !== undefined;
          return (
            <article key={ref.question_id} title={ref.caveat}>
              <span className="overview-polymarket-topic">{ref.topic_tags.join(" / ")}</span>
              <a href={ref.question_url} rel="noreferrer" target="_blank">
                <strong>
                  {ref.title} <ExternalLink size={13} />
                </strong>
              </a>
              <p className="overview-polymarket-odds">
                {hasOdds ? `${outcome.outcome_id.toUpperCase()}: ${(lastPrice * 100).toFixed(0)}%` : "odds pending"}
                {!hasOdds && ref.stale ? <span>stale</span> : null}
              </p>
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
      <div className="overview-main-layout">
        <HeadlineStrip snapshot={snapshot} />

        <BaselineStrip facts={snapshot.baseline} />

        <div className="overview-map-slot">
          <CaseMap compact />
        </div>

        <LatestEventsCard events={snapshot.latest_events} />

        <aside className="overview-right-stack">
          <TrafficSnapshotCard snapshot={snapshot.traffic_snapshot} />
          <MarketSnapshotCard snapshot={snapshot.market_snapshot} />
        </aside>

        <PolymarketCard refs={snapshot.polymarket_refs} />
      </div>
    </section>
  );
}
