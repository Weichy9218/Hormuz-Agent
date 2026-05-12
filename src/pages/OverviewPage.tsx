// Overview page consumes the generated background snapshot for a 10-second Hormuz scan.
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarClock,
  ExternalLink,
  Ship,
} from "lucide-react";
import { CaseMap } from "../components/map/CaseMap";
import { InfoTitle } from "../components/shared/InfoTitle";
import snapshotJson from "../../data/generated/overview_snapshot.json";
import type { HormuzBaselineFact, OverviewSnapshot } from "../types/marketChart";
import type { PolymarketQuestionRef } from "../types/polymarket";
import type { TimelineEvent } from "../types/timeline";

const snapshot = snapshotJson as OverviewSnapshot;

const severityCopy: Record<OverviewSnapshot["current_severity"], string> = {
  quiet: "quiet",
  routine: "routine",
  watch: "watch",
  elevated: "elevated",
  severe: "severe",
};

const baselineLabels: Record<string, string> = {
  "oil-flow": "Oil flow",
  "bypass-capacity": "Bypass capacity",
  "asia-exposure": "Asia exposure",
  "lng-relevance": "LNG relevance",
};

function formatDateTime(value?: string | null) {
  if (!value) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value?: string | null) {
  if (!value) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00Z`));
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

function bestOutcome(ref: PolymarketQuestionRef) {
  const priced = ref.outcomes.filter((outcome) => outcome.last_price !== null);
  return priced.sort((a, b) => Number(b.last_price) - Number(a.last_price))[0] ?? ref.outcomes[0];
}

function HeadlineStrip({ snapshot }: { snapshot: OverviewSnapshot }) {
  const latest = snapshot.latest_events[0];

  return (
    <section className="console-card update-brief-card overview-brief-card">
      <div className="update-brief-kicker">
        <span>
          <CalendarClock size={16} />
          Hormuz status as of {formatDateTime(snapshot.data_as_of)}
        </span>
        <b>{severityCopy[snapshot.current_severity]}</b>
      </div>

      <div className="update-brief-headline unchanged">
        <span>Latest event</span>
        <strong>{latest?.title ?? "No recent event"}</strong>
      </div>

      <p>
        {latest?.description ??
          "No promoted timeline event is available in the current generated snapshot."}
      </p>

      <div className="overview-brief-meta" aria-label="overview source boundary">
        <span>last event {formatDateTime(latest?.event_at)}</span>
        <span>data built {formatDateTime(snapshot.built_at)}</span>
        <a href="/news" className="checkpoint-state-chip">
          see News <ArrowRight size={14} />
        </a>
      </div>
    </section>
  );
}

function BaselineStrip({ facts }: { facts: HormuzBaselineFact[] }) {
  return (
    <section className="console-card baseline-strip">
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
    <section className="console-card compact-list-card overview-decision-card">
      <InfoTitle title="Latest events" subtitle="Top promoted timeline entries" />
      <ul>
        {events.map((event) => (
          <li key={event.event_id}>
            <a href={`/news#${event.event_id}`}>
              <strong>{event.title}</strong>
            </a>
            <p>
              {event.source_name} · {event.severity_hint} · {formatDateTime(event.event_at)}
            </p>
            <small title={`retrieved ${formatDateTime(event.retrieved_at)}`}>
              source: {event.source_id}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrafficSnapshotCard({ snapshot }: { snapshot: OverviewSnapshot["traffic_snapshot"] }) {
  return (
    <section className="console-card compact-list-card overview-decision-card">
      <InfoTitle title="Traffic snapshot" subtitle="PortWatch daily transit calls" />
      {snapshot ? (
        <>
          <div className="update-metric-row">
            <article title={snapshot.caveat}>
              <span>{formatDate(snapshot.latest_date)}</span>
              <strong>{formatNumber(snapshot.latest_value, 0)}</strong>
              <em>daily calls</em>
            </article>
            <article title={snapshot.caveat}>
              <span>7d avg</span>
              <strong>{formatNumber(snapshot.avg_7d, 2)}</strong>
              <em>{formatDelta(snapshot.delta_vs_baseline_pct, "%")} vs 1y window</em>
            </article>
          </div>
          <p title={snapshot.caveat}>
            Baseline {formatNumber(snapshot.baseline_1y_same_window, 2)} · {snapshot.source_id} ·
            retrieved {formatDateTime(snapshot.retrieved_at)}
          </p>
        </>
      ) : (
        <p>PortWatch traffic snapshot pending.</p>
      )}
    </section>
  );
}

function MarketSnapshotCard({ snapshot }: { snapshot: OverviewSnapshot["market_snapshot"] }) {
  return (
    <section className="console-card compact-list-card overview-decision-card">
      <InfoTitle title="Market snapshot" subtitle="FRED active rows plus pending references" />
      <ul>
        {snapshot.map((item) => (
          <li key={item.target} title={`${item.caveat ?? ""} Retrieved ${formatDateTime(item.retrieved_at)}`}>
            <a href="/market">
              <strong>{item.label}</strong>
            </a>
            <p>
              {item.status === "pending_source" ? "pending" : `${formatNumber(item.value, 2)} ${item.unit}`}
              {item.status === "active" ? ` · 1d ${formatDelta(item.delta_1d)} · 7d ${formatDelta(item.delta_7d)}` : ""}
            </p>
            <small>{item.source_id}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PolymarketCard({ refs }: { refs: PolymarketQuestionRef[] }) {
  return (
    <section className="console-card checkpoint-strip overview-checkpoint-strip">
      <div>
        <InfoTitle
          title="External prediction markets"
          subtitle="External market, not our forecast"
        />
        <span className="checkpoint-state-chip">External market, not our forecast</span>
      </div>
      <div className="overview-checkpoint-grid">
        {refs.map((ref) => {
          const outcome = bestOutcome(ref);
          return (
            <article key={ref.question_id} title={ref.caveat}>
              <span>{ref.topic_tags.join(" / ")}</span>
              <a href={ref.question_url} rel="noreferrer" target="_blank">
                <strong>
                  {ref.title} <ExternalLink size={13} />
                </strong>
              </a>
              <p>
                {outcome?.last_price === null || outcome?.last_price === undefined
                  ? "odds pending"
                  : `${outcome.outcome_id}: ${formatNumber(outcome.last_price * 100, 1)}%`}
                {ref.total_volume_usd ? ` · volume $${formatNumber(ref.total_volume_usd, 0)}` : ""}
              </p>
              <p>{ref.resolution_criteria}</p>
              <small>retrieved {formatDateTime(ref.retrieved_at)}</small>
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
        <div className="overview-left-column">
          <HeadlineStrip snapshot={snapshot} />

          <div className="overview-top-row">
            <BaselineStrip facts={snapshot.baseline} />
            <CaseMap compact />
          </div>

          <div className="overview-signal-row">
            <article className="console-card">
              <Ship size={19} />
              <span>Traffic</span>
              <strong>{snapshot.traffic_snapshot ? `${formatNumber(snapshot.traffic_snapshot.latest_value, 0)} daily calls` : "pending"}</strong>
              <p>{snapshot.traffic_snapshot?.source_id ?? "PortWatch pending"}</p>
            </article>
            <article className="console-card">
              <BarChart3 size={19} />
              <span>Markets</span>
              <strong>{snapshot.market_snapshot.filter((item) => item.status === "active").length} active rows</strong>
              <p>Brent · WTI · VIX · Broad USD from local generated snapshot.</p>
            </article>
            <article className="console-card">
              <Activity size={19} />
              <span>Events</span>
              <strong>{snapshot.latest_events.length} latest entries</strong>
              <p>Deep links point to News timeline anchors.</p>
            </article>
          </div>
        </div>

        <aside className="overview-side-column">
          <LatestEventsCard events={snapshot.latest_events} />
          <TrafficSnapshotCard snapshot={snapshot.traffic_snapshot} />
          <MarketSnapshotCard snapshot={snapshot.market_snapshot} />
        </aside>
      </div>

      <PolymarketCard refs={snapshot.polymarket_refs} />
    </section>
  );
}
