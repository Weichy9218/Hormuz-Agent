// News page renders the generated Hormuz timeline with source-bound filters and event-window traffic context.
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
  Ship,
} from "lucide-react";
import { InfoTitle } from "../components/shared/InfoTitle";
import newsTimelineJson from "../../data/generated/news_timeline.json";
import marketChartJson from "../../data/generated/market_chart.json";
import type {
  MarketChartBundle,
  MarketChartPoint,
  NewsTimelineBundle,
} from "../types/marketChart";
import type {
  TimelineEvent,
  TimelineSeverity,
  TimelineSourceType,
} from "../types/timeline";

const newsTimeline = newsTimelineJson as NewsTimelineBundle;
const marketChart = marketChartJson as MarketChartBundle;

type TimeRange = "7d" | "30d" | "90d" | "all";
type SeverityFilter = "routine" | "elevated" | "critical";
type SourceFilter = "advisory" | "media";

const timeRanges: Array<{ id: TimeRange; label: string; days: number | null }> = [
  { id: "7d", label: "7d", days: 7 },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
  { id: "all", label: "All", days: null },
];

const severityFilters: Array<{ id: SeverityFilter; label: string }> = [
  { id: "routine", label: "routine" },
  { id: "elevated", label: "elevated" },
  { id: "critical", label: "critical" },
];

const sourceFilters: Array<{ id: SourceFilter; label: string }> = [
  { id: "advisory", label: "advisory" },
  { id: "media", label: "media" },
];

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "2-digit",
});

const compactDateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

const newsPageUi = {
  heroGrid: {
    display: "grid",
    gridColumn: "1 / -1",
    gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.58fr)",
    gap: 18,
    alignItems: "stretch",
    padding: 22,
  },
  heroCopy: {
    display: "grid",
    alignContent: "center",
    gap: 12,
    minWidth: 0,
  },
  kicker: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    width: "fit-content",
    color: "var(--blue)",
    fontSize: "0.76rem",
    fontWeight: 900,
  },
  headline: {
    maxWidth: "62rem",
    color: "var(--text)",
    fontSize: "clamp(1.8rem, 2.4vw, 2.75rem)",
    fontWeight: 920,
    lineHeight: 1.08,
    textWrap: "balance",
  },
  copy: {
    maxWidth: "66rem",
    color: "var(--product-note, var(--soft))",
    fontSize: "0.95rem",
    lineHeight: 1.58,
    textWrap: "pretty",
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  filterCard: {
    display: "grid",
    gridColumn: "1 / -1",
    gap: 16,
    padding: 18,
  },
  filterHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  filterGroups: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 0.7fr) minmax(220px, 1fr) minmax(190px, 0.8fr) minmax(260px, 1.2fr)",
    gap: 12,
  },
  filterGroup: {
    display: "grid",
    alignContent: "start",
    gap: 8,
    minWidth: 0,
    padding: 10,
    border: "1px solid #dbe7f5",
    borderRadius: "var(--radius)",
    background: "#fbfdff",
  },
  filterLabel: {
    color: "var(--muted)",
    fontSize: "0.72rem",
    fontWeight: 900,
  },
  buttonWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  filterButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    padding: "0 9px",
    border: "1px solid #d5deea",
    borderRadius: 7,
    background: "#ffffff",
    color: "#526276",
    fontSize: "0.76rem",
    fontWeight: 850,
  },
  filterButtonSelected: {
    border: "1px solid #9fc5f8",
    background: "var(--surface-blue)",
    color: "var(--blue-dark)",
    boxShadow: "0 1px 1px rgba(15, 23, 42, 0.06)",
  },
  mutedNote: {
    color: "var(--muted)",
    fontSize: "0.78rem",
    lineHeight: 1.4,
  },
  timelineHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sourceChipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
  },
  sourceChip: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 27,
    padding: "0 8px",
    border: "1px solid #d6e4f4",
    borderRadius: 7,
    background: "#fbfdff",
    color: "var(--soft)",
    fontSize: "0.72rem",
    fontWeight: 850,
  },
  entryButton: {
    display: "grid",
    width: "100%",
    gap: 9,
    padding: 0,
    border: 0,
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
  },
  entryTopline: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    minHeight: 25,
    padding: "0 8px",
    border: "1px solid #d7e5f5",
    borderRadius: 999,
    background: "#eef6ff",
    color: "var(--blue-dark)",
    fontSize: "0.72rem",
    fontWeight: 900,
  },
  sourcePillOfficial: {
    background: "#eef6ff",
    color: "var(--blue-dark)",
    border: "1px solid #bfdbfe",
  },
  sourcePillMedia: {
    background: "#f8fafc",
    color: "#526276",
    border: "1px solid #d8e1ed",
  },
  sourcePillOpen: {
    background: "#f0fdfa",
    color: "#0f766e",
    border: "1px solid #b7ece4",
  },
  entryMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    color: "var(--muted)",
    fontSize: "0.76rem",
    fontWeight: 760,
    lineHeight: 1.35,
  },
  entryBody: {
    display: "grid",
    gap: 14,
    paddingTop: 12,
    borderTop: "1px solid #e1ebf6",
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 0.56fr)",
    gap: 14,
  },
  detailBlock: {
    display: "grid",
    gap: 8,
    minWidth: 0,
  },
  detailTitle: {
    color: "var(--text)",
    fontSize: "0.83rem",
    fontWeight: 900,
  },
  detailText: {
    color: "var(--soft)",
    fontSize: "0.88rem",
    lineHeight: 1.55,
    textWrap: "pretty",
  },
  linkRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
  },
  inlineLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    minHeight: 28,
    padding: "0 8px",
    border: "1px solid #d5e3f2",
    borderRadius: 7,
    color: "var(--blue-dark)",
    background: "#fbfdff",
    fontSize: "0.76rem",
    fontWeight: 850,
    textDecoration: "none",
  },
  trafficPanel: {
    display: "grid",
    gap: 8,
    minWidth: 0,
    padding: 11,
    border: "1px solid #d9e7f6",
    borderRadius: "var(--radius)",
    background: "#ffffff",
  },
  trafficHead: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  trafficTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "var(--text)",
    fontSize: "0.82rem",
    fontWeight: 900,
  },
  sparkline: {
    width: "100%",
    height: 108,
    overflow: "visible",
  },
  emptyState: {
    display: "grid",
    minHeight: 92,
    placeItems: "center",
    border: "1px dashed #cddbea",
    borderRadius: 7,
    color: "var(--muted)",
    background: "#f8fbff",
    fontSize: "0.84rem",
    fontWeight: 850,
  },
  sideCard: {
    display: "grid",
    gap: 14,
    padding: 18,
  },
  indexList: {
    display: "grid",
    gap: 9,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  indexItem: {
    display: "grid",
    gap: 5,
    padding: 11,
    border: "1px solid #dbe7f5",
    borderRadius: "var(--radius)",
    background: "#fbfdff",
  },
  indexTitle: {
    color: "var(--text)",
    fontSize: "0.88rem",
    fontWeight: 900,
    overflowWrap: "anywhere",
  },
} satisfies Record<string, CSSProperties>;

function formatDateTime(value?: string | null) {
  if (!value) return "pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "pending";
  return dateTimeFormatter.format(date);
}

function formatDate(value?: string | null) {
  if (!value) return "pending";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "pending";
  return dateFormatter.format(date);
}

function compactDate(value: string) {
  return compactDateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value % 1 === 0 ? 0 : digits,
  }).format(value);
}

function dayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function addDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timeRangeStart(referenceTime: string, range: TimeRange) {
  const config = timeRanges.find((item) => item.id === range);
  if (!config?.days) return null;
  return addDays(dayKey(referenceTime), -config.days);
}

function severityBucket(severity: TimelineSeverity): SeverityFilter {
  if (severity === "severe") return "critical";
  if (severity === "watch" || severity === "elevated") return "elevated";
  return "routine";
}

function severityLabel(severity: TimelineSeverity) {
  return severity === "severe" ? "critical" : severity;
}

function sourceBucket(sourceType: TimelineSourceType): SourceFilter {
  return sourceType === "official" ? "advisory" : "media";
}

function sourceLabel(sourceType: TimelineSourceType) {
  if (sourceType === "official") return "advisory";
  return sourceType;
}

function eventClass(severity: TimelineSeverity) {
  if (severity === "routine" || severity === "deescalation") return "stable";
  if (severity === "watch") return "watch";
  return "elevated";
}

function sourcePillStyle(sourceType: TimelineSourceType) {
  if (sourceType === "official") {
    return { ...newsPageUi.pill, ...newsPageUi.sourcePillOfficial };
  }
  if (sourceType === "open-source") {
    return { ...newsPageUi.pill, ...newsPageUi.sourcePillOpen };
  }
  return { ...newsPageUi.pill, ...newsPageUi.sourcePillMedia };
}

function staticPath(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `/${path.replace(/^\/+/, "")}`;
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function activeButtonStyle(selected: boolean) {
  return selected
    ? { ...newsPageUi.filterButton, ...newsPageUi.filterButtonSelected }
    : newsPageUi.filterButton;
}

function filterEvents(
  events: TimelineEvent[],
  filters: {
    timeRange: TimeRange;
    severities: SeverityFilter[];
    sourceTypes: SourceFilter[];
    topics: string[];
  },
) {
  const reference = newsTimeline.data_as_of ?? events[0]?.event_at ?? new Date().toISOString();
  const start = timeRangeStart(reference, filters.timeRange);

  return events.filter((event) => {
    const eventDay = dayKey(event.event_at);
    if (start && eventDay < start) return false;
    if (
      filters.severities.length > 0 &&
      !filters.severities.includes(severityBucket(event.severity_hint))
    ) {
      return false;
    }
    if (
      filters.sourceTypes.length > 0 &&
      !filters.sourceTypes.includes(sourceBucket(event.source_type))
    ) {
      return false;
    }
    if (filters.topics.length > 0) {
      const eventTags = new Set(event.tags ?? []);
      if (!filters.topics.some((topic) => eventTags.has(topic))) return false;
    }
    return true;
  });
}

function sortEvents(events: TimelineEvent[]) {
  return [...events].sort((a, b) => {
    const timeDelta = Date.parse(b.event_at) - Date.parse(a.event_at);
    if (timeDelta !== 0) return timeDelta;
    return a.title.localeCompare(b.title);
  });
}

function pointsInWindow(points: MarketChartPoint[], center: string, radiusDays = 7) {
  const start = addDays(center, -radiusDays);
  const end = addDays(center, radiusDays);
  return points.filter((point) => point.date >= start && point.date <= end);
}

function linePath(
  points: MarketChartPoint[],
  bounds: {
    start: string;
    end: string;
    min: number;
    max: number;
    width: number;
    height: number;
    padding: number;
  },
) {
  if (points.length === 0) return "";
  const startMs = Date.parse(`${bounds.start}T00:00:00Z`);
  const endMs = Date.parse(`${bounds.end}T00:00:00Z`);
  const spanMs = Math.max(endMs - startMs, 1);
  const valueSpan = Math.max(bounds.max - bounds.min, 1);
  const usableWidth = bounds.width - bounds.padding * 2;
  const usableHeight = bounds.height - bounds.padding * 2;

  return points
    .map((point, index) => {
      const pointMs = Date.parse(`${point.date}T00:00:00Z`);
      const x = bounds.padding + ((pointMs - startMs) / spanMs) * usableWidth;
      const y =
        bounds.padding +
        (1 - (point.value - bounds.min) / valueSpan) * usableHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function NewsFilterBar({
  timeRange,
  severities,
  sourceTypes,
  topics,
  resultCount,
  onTimeRangeChange,
  onSeveritiesChange,
  onSourceTypesChange,
  onTopicsChange,
}: {
  timeRange: TimeRange;
  severities: SeverityFilter[];
  sourceTypes: SourceFilter[];
  topics: string[];
  resultCount: number;
  onTimeRangeChange: (value: TimeRange) => void;
  onSeveritiesChange: (value: SeverityFilter[]) => void;
  onSourceTypesChange: (value: SourceFilter[]) => void;
  onTopicsChange: (value: string[]) => void;
}) {
  return (
    <section className="console-card" style={newsPageUi.filterCard}>
      <div style={newsPageUi.filterHeader}>
        <InfoTitle
          title="Timeline filters"
          subtitle="Filter by event time, severity, source type, and curated topic tags"
        />
        <span style={newsPageUi.sourceChip}>
          <Filter size={13} />
          {resultCount} visible events
        </span>
      </div>

      <div style={newsPageUi.filterGroups}>
        <div style={newsPageUi.filterGroup}>
          <span style={newsPageUi.filterLabel}>time range</span>
          <div style={newsPageUi.buttonWrap}>
            {timeRanges.map((item) => (
              <button
                key={item.id}
                onClick={() => onTimeRangeChange(item.id)}
                style={activeButtonStyle(timeRange === item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div style={newsPageUi.filterGroup}>
          <span style={newsPageUi.filterLabel}>severity</span>
          <div style={newsPageUi.buttonWrap}>
            <button
              onClick={() => onSeveritiesChange([])}
              style={activeButtonStyle(severities.length === 0)}
              type="button"
            >
              all
            </button>
            {severityFilters.map((item) => (
              <button
                key={item.id}
                onClick={() => onSeveritiesChange(toggleValue(severities, item.id))}
                style={activeButtonStyle(severities.includes(item.id))}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div style={newsPageUi.filterGroup}>
          <span style={newsPageUi.filterLabel}>source type</span>
          <div style={newsPageUi.buttonWrap}>
            <button
              onClick={() => onSourceTypesChange([])}
              style={activeButtonStyle(sourceTypes.length === 0)}
              type="button"
            >
              all
            </button>
            {sourceFilters.map((item) => (
              <button
                key={item.id}
                onClick={() => onSourceTypesChange(toggleValue(sourceTypes, item.id))}
                style={activeButtonStyle(sourceTypes.includes(item.id))}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div style={newsPageUi.filterGroup}>
          <span style={newsPageUi.filterLabel}>topic tags</span>
          <div style={newsPageUi.buttonWrap}>
            <button
              onClick={() => onTopicsChange([])}
              style={activeButtonStyle(topics.length === 0)}
              type="button"
            >
              all
            </button>
            {newsTimeline.topic_index.map((topic) => (
              <button
                key={topic.tag}
                onClick={() => onTopicsChange(toggleValue(topics, topic.tag))}
                style={activeButtonStyle(topics.includes(topic.tag))}
                title={`${topic.event_count} events`}
                type="button"
              >
                {topic.tag}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniTrafficSparkline({
  event,
  trafficSeries,
}: {
  event: TimelineEvent;
  trafficSeries: MarketChartBundle["series"][number] | undefined;
}) {
  const center = dayKey(event.event_at);
  const start = addDays(center, -7);
  const end = addDays(center, 7);
  const dailyPoints = trafficSeries ? pointsInWindow(trafficSeries.points, center) : [];
  const baselinePoints = trafficSeries?.baseline_points
    ? pointsInWindow(trafficSeries.baseline_points, center)
    : [];
  const allValues = [...dailyPoints, ...baselinePoints].map((point) => point.value);
  const width = 360;
  const height = 104;
  const padding = 12;

  if (dailyPoints.length === 0) {
    return (
      <div style={newsPageUi.trafficPanel}>
        <div style={newsPageUi.trafficHead}>
          <span style={newsPageUi.trafficTitle}>
            <Ship size={14} />
            Traffic ±7d
          </span>
          <span style={newsPageUi.mutedNote}>
            {compactDate(start)}-{compactDate(end)}
          </span>
        </div>
        <div style={newsPageUi.emptyState}>No traffic data in window</div>
      </div>
    );
  }

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const bounds = { start, end, min, max, width, height, padding };
  const dailyPath = linePath(dailyPoints, bounds);
  const baselinePath = linePath(baselinePoints, bounds);
  const latestDaily = dailyPoints[dailyPoints.length - 1];

  return (
    <div style={newsPageUi.trafficPanel} title={trafficSeries?.caveat}>
      <div style={newsPageUi.trafficHead}>
        <span style={newsPageUi.trafficTitle}>
          <Ship size={14} />
          Traffic ±7d
        </span>
        <span style={newsPageUi.mutedNote}>
          {compactDate(start)}-{compactDate(end)}
        </span>
      </div>

      <svg
        aria-label={`Daily transit calls around ${formatDate(center)}`}
        role="img"
        style={newsPageUi.sparkline}
        viewBox={`0 0 ${width} ${height}`}
      >
        <line
          stroke="#dbe7f5"
          strokeWidth="1"
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
        />
        <line
          stroke="#dbe7f5"
          strokeWidth="1"
          x1={padding}
          x2={padding}
          y1={padding}
          y2={height - padding}
        />
        {baselinePath ? (
          <path
            d={baselinePath}
            fill="none"
            stroke="#94a3b8"
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        ) : null}
        <path
          d={dailyPath}
          fill="none"
          stroke="var(--blue)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {dailyPoints.map((point) => {
          const x =
            padding +
            ((Date.parse(`${point.date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
              Math.max(Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`), 1)) *
              (width - padding * 2);
          const y =
            padding +
            (1 - (point.value - min) / Math.max(max - min, 1)) * (height - padding * 2);
          return (
            <circle
              cx={x}
              cy={y}
              fill="#ffffff"
              key={point.date}
              r="3.5"
              stroke="var(--blue)"
              strokeWidth="2"
            />
          );
        })}
      </svg>

      <div style={newsPageUi.entryMeta}>
        <span>{formatNumber(latestDaily.value, 0)} daily calls on {formatDate(latestDaily.date)}</span>
        <span>{trafficSeries?.source_id ?? "traffic-source"}</span>
        {trafficSeries?.retrieved_at ? (
          <span>retrieved {formatDateTime(trafficSeries.retrieved_at)}</span>
        ) : null}
      </div>
      <p style={newsPageUi.mutedNote}>
        Solid line is daily transit calls; dashed line is same-window baseline where available.
      </p>
    </div>
  );
}

function TimelineEntry({
  event,
  expanded,
  onToggle,
  trafficSeries,
}: {
  event: TimelineEvent;
  expanded: boolean;
  onToggle: () => void;
  trafficSeries: MarketChartBundle["series"][number] | undefined;
}) {
  const rawHref = staticPath(event.raw_path);

  return (
    <article
      className={`timeline-event ${eventClass(event.severity_hint)}`}
      id={event.event_id}
      style={{ scrollMarginTop: 104 }}
      tabIndex={-1}
    >
      <span>{formatDate(event.event_at)}</span>
      <div
        style={{
          borderColor: event.source_type === "official" ? "#c4daf7" : "#dbe7f5",
          opacity: event.source_type === "media" ? 0.92 : 1,
        }}
      >
        <button
          aria-controls={`${event.event_id}-details`}
          aria-expanded={expanded}
          onClick={onToggle}
          style={newsPageUi.entryButton}
          type="button"
        >
          <span style={newsPageUi.entryTopline}>
            <span style={sourcePillStyle(event.source_type)}>{sourceLabel(event.source_type)}</span>
            <span style={newsPageUi.pill}>{severityLabel(event.severity_hint)}</span>
            {event.tags?.slice(0, 3).map((tag) => (
              <span key={tag} style={newsPageUi.pill}>
                {tag}
              </span>
            ))}
          </span>
          <strong>{event.title}</strong>
          <span style={newsPageUi.entryMeta}>
            <span>{event.source_name}</span>
            <span>{formatDateTime(event.event_at)}</span>
            <span>retrieved {formatDateTime(event.retrieved_at)}</span>
            <span>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
          </span>
        </button>

        {expanded ? (
          <div id={`${event.event_id}-details`} style={newsPageUi.entryBody}>
            <div style={newsPageUi.detailGrid}>
              <div style={newsPageUi.detailBlock}>
                <span style={newsPageUi.detailTitle}>Description</span>
                <p style={newsPageUi.detailText}>{event.description}</p>

                <span style={newsPageUi.detailTitle}>Source</span>
                <div style={newsPageUi.linkRow}>
                  <a
                    href={event.source_url}
                    rel="noreferrer"
                    style={newsPageUi.inlineLink}
                    target="_blank"
                  >
                    source url <ExternalLink size={13} />
                  </a>
                  {rawHref ? (
                    <a
                      href={rawHref}
                      rel="noreferrer"
                      style={newsPageUi.inlineLink}
                      target="_blank"
                    >
                      raw snapshot <ExternalLink size={13} />
                    </a>
                  ) : null}
                </div>

                {event.cross_check_source_urls?.length ? (
                  <>
                    <span style={newsPageUi.detailTitle}>Cross-check refs</span>
                    <div style={newsPageUi.linkRow}>
                      {event.cross_check_source_urls.map((url) => (
                        <a
                          href={url}
                          key={url}
                          rel="noreferrer"
                          style={newsPageUi.inlineLink}
                          target="_blank"
                        >
                          cross-check <ExternalLink size={13} />
                        </a>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <span style={newsPageUi.detailTitle}>Cross-check refs</span>
                    <p style={newsPageUi.mutedNote}>No cross-check refs recorded for this entry.</p>
                  </>
                )}
              </div>

              <MiniTrafficSparkline event={event} trafficSeries={trafficSeries} />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function TimelineList({
  events,
  expandedId,
  onToggle,
  trafficSeries,
}: {
  events: TimelineEvent[];
  expandedId: string | null;
  onToggle: (eventId: string) => void;
  trafficSeries: MarketChartBundle["series"][number] | undefined;
}) {
  if (events.length === 0) {
    return (
      <section className="console-card news-timeline-card">
        <InfoTitle title="Timeline" subtitle="No promoted entries match the current filters" />
        <div style={newsPageUi.emptyState}>No events match the current filters</div>
      </section>
    );
  }

  return (
    <section className="console-card news-timeline-card">
      <div style={newsPageUi.timelineHeader}>
        <InfoTitle title="Timeline" subtitle="Promoted advisory and media entries, newest first" />
        <div style={newsPageUi.sourceChipRow}>
          <span style={newsPageUi.sourceChip}>{events.length} entries</span>
          <span style={newsPageUi.sourceChip}>sorted by event_at desc</span>
        </div>
      </div>

      <div className="event-timeline">
        {events.map((event) => (
          <TimelineEntry
            event={event}
            expanded={expandedId === event.event_id}
            key={event.event_id}
            onToggle={() => onToggle(event.event_id)}
            trafficSeries={trafficSeries}
          />
        ))}
      </div>
    </section>
  );
}

function SourceIndexCard() {
  return (
    <section className="console-card news-source-card" style={newsPageUi.sideCard}>
      <InfoTitle title="Source index" subtitle="Generated source coverage for this timeline bundle" />
      <ul style={newsPageUi.indexList}>
        {newsTimeline.source_index.map((source) => (
          <li
            key={`${source.source_id}-${source.source_name}-${source.source_type}`}
            style={newsPageUi.indexItem}
          >
            <span style={sourcePillStyle(source.source_type)}>{sourceLabel(source.source_type)}</span>
            <strong style={newsPageUi.indexTitle}>{source.source_name}</strong>
            <small style={newsPageUi.mutedNote}>
              {source.event_count} events · {source.source_id}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopicIndexCard() {
  return (
    <section className="console-card news-source-card" style={newsPageUi.sideCard}>
      <InfoTitle title="Topic index" subtitle="Curated tags available for filtering" />
      <ul style={newsPageUi.indexList}>
        {newsTimeline.topic_index.map((topic) => (
          <li key={topic.tag} style={newsPageUi.indexItem}>
            <strong style={newsPageUi.indexTitle}>{topic.tag}</strong>
            <small style={newsPageUi.mutedNote}>{topic.event_count} events</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NewsPage() {
  const sortedEvents = useMemo(() => sortEvents(newsTimeline.events), []);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [severities, setSeverities] = useState<SeverityFilter[]>([]);
  const [sourceTypes, setSourceTypes] = useState<SourceFilter[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : decodeURIComponent(window.location.hash.replace(/^#/, "")) || null,
  );

  const trafficSeries = useMemo(
    () =>
      marketChart.series.find(
        (series) =>
          series.id === "portwatch-daily-transit-calls-all" &&
          series.status === "active",
      ),
    [],
  );

  const visibleEvents = useMemo(
    () =>
      filterEvents(sortedEvents, {
        timeRange,
        severities,
        sourceTypes,
        topics,
      }),
    [severities, sortedEvents, sourceTypes, timeRange, topics],
  );

  useEffect(() => {
    function handleHashChange() {
      const target = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (target) setExpandedId(target);
    }

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!expandedId) return;
    const target = document.getElementById(expandedId);
    if (!target) return;
    window.requestAnimationFrame(() => {
      const y = target.getBoundingClientRect().top + window.scrollY - 104;
      window.scrollTo({ top: Math.max(y, 0), behavior: "smooth" });
    });
  }, [expandedId]);

  const elevatedCount = newsTimeline.events.filter(
    (event) => severityBucket(event.severity_hint) === "elevated",
  ).length;

  return (
    <section className="page-grid news-page">
      <section className="console-card news-hero-card" style={newsPageUi.heroGrid}>
        <div style={newsPageUi.heroCopy}>
          <span style={newsPageUi.kicker}>
            <CalendarDays size={15} />
            Data as of {formatDateTime(newsTimeline.data_as_of)}
          </span>
          <h1 style={newsPageUi.headline}>Hormuz event timeline</h1>
          <p style={newsPageUi.copy}>
            Promoted official advisories and curated media entries are shown as a source-bound
            chronology. The page is descriptive only: it preserves event provenance and optional
            traffic context without turning events into risk calls.
          </p>
        </div>

        <div className="news-hero-metrics" style={newsPageUi.metricGrid}>
          <article>
            <span>events</span>
            <b>{newsTimeline.events.length}</b>
          </article>
          <article>
            <span>elevated bucket</span>
            <b>{elevatedCount}</b>
          </article>
          <article>
            <span>topics</span>
            <b>{newsTimeline.topic_index.length}</b>
          </article>
        </div>
      </section>

      <NewsFilterBar
        onSeveritiesChange={setSeverities}
        onSourceTypesChange={setSourceTypes}
        onTimeRangeChange={setTimeRange}
        onTopicsChange={setTopics}
        resultCount={visibleEvents.length}
        severities={severities}
        sourceTypes={sourceTypes}
        timeRange={timeRange}
        topics={topics}
      />

      <TimelineList
        events={visibleEvents}
        expandedId={expandedId}
        onToggle={(eventId) => setExpandedId((current) => (current === eventId ? null : eventId))}
        trafficSeries={trafficSeries}
      />

      <aside className="news-side-stack">
        <SourceIndexCard />
        <TopicIndexCard />
      </aside>
    </section>
  );
}
