// News page renders the generated Hormuz timeline with source-bound filters and event-window traffic context.
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ExternalLink,
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

type TopicCloudItem = NewsTimelineBundle["topic_cloud"][number];
const timelineDisplayTagStop = new Set(["core_event", "hormuz", "iran"]);

const topicCloud: TopicCloudItem[] =
  newsTimeline.topic_cloud?.length
    ? newsTimeline.topic_cloud
    : newsTimeline.topic_index.slice(0, 18).map((topic) => ({
        key: topic.tag,
        label: topic.tag,
        event_count: topic.event_count,
        weight: 0.72,
        event_ids: newsTimeline.events
          .filter((event) => event.tags?.includes(topic.tag))
          .map((event) => event.event_id),
        source_tags: [topic.tag],
      }));
const topicCloudByKey = new Map(topicCloud.map((topic) => [topic.key, topic]));
const topicCloudZhLabels = new Map([
  ["shipping_disruption", "航运中断"],
  ["naval", "海军部署"],
  ["us-iran", "US-Iran"],
  ["irgc", "IRGC"],
  ["vessel_seizure", "扣押船只"],
  ["blockade", "封锁"],
  ["tanker", "油轮"],
  ["ais", "AIS"],
  ["attack", "袭击"],
  ["drone", "无人机"],
  ["escort", "护航"],
  ["missile", "导弹"],
  ["shipping_risk", "航运风险"],
  ["bunker_fuel", "燃油供应"],
  ["china", "中国"],
  ["deescalation", "降级"],
  ["diplomatic", "外交"],
  ["france", "法国"],
]);
const topicCloudPositions = [
  { left: "46%", top: "45%" },
  { left: "67%", top: "34%" },
  { left: "29%", top: "35%" },
  { left: "55%", top: "68%" },
  { left: "78%", top: "59%" },
  { left: "18%", top: "62%" },
  { left: "38%", top: "73%" },
  { left: "84%", top: "30%" },
  { left: "14%", top: "31%" },
  { left: "71%", top: "78%" },
  { left: "27%", top: "78%" },
  { left: "90%", top: "72%" },
  { left: "59%", top: "20%" },
  { left: "10%", top: "78%" },
  { left: "35%", top: "20%" },
  { left: "50%", top: "86%" },
  { left: "75%", top: "18%" },
  { left: "20%", top: "18%" },
];

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const dateFormatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

const compactDateFormatter = new Intl.DateTimeFormat("en", {
  year: "2-digit",
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
    gap: 14,
    padding: 18,
  },
  filterHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  topicCloudStage: {
    position: "relative",
    minHeight: 250,
    padding: "18px 22px",
    border: "1px solid #dbe7f5",
    borderRadius: "var(--radius)",
    background:
      "radial-gradient(circle at 48% 42%, rgba(59, 130, 246, 0.10), transparent 32%), #fbfdff",
    overflow: "hidden",
  },
  topicCloudHalo: {
    position: "absolute",
    inset: 18,
    border: "1px dashed #d5e5f7",
    borderRadius: "50%",
    pointerEvents: "none",
  },
  topicCloudCenter: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "var(--blue)",
    boxShadow: "0 0 0 8px rgba(37, 99, 235, 0.08)",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
  },
  topicCloudReset: {
    position: "absolute",
    top: 12,
    right: 14,
    zIndex: 2,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    minHeight: 28,
    padding: "0 9px",
    border: "1px solid #cfe0f4",
    borderRadius: 7,
    background: "#ffffff",
    color: "var(--blue-dark)",
    fontSize: "0.74rem",
    fontWeight: 900,
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
  topicCloudWrap: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
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
  topicCloudButton: {
    position: "absolute",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    minHeight: 34,
    maxWidth: 190,
    padding: "3px 8px",
    border: "1px solid transparent",
    borderRadius: 7,
    background: "transparent",
    color: "#43566f",
    fontWeight: 880,
    lineHeight: 1.08,
    whiteSpace: "nowrap",
    transform: "translate(-50%, -50%)",
    transition: "background-color 150ms ease, border-color 150ms ease, transform 150ms ease",
  },
  topicCloudCount: {
    color: "inherit",
    fontSize: "0.68rem",
    fontWeight: 900,
    opacity: 0.72,
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
    height: 148,
    overflow: "visible",
  },
  trafficStats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 6,
  },
  trafficStat: {
    display: "grid",
    gap: 2,
    padding: "7px 8px",
    border: "1px solid #e0eaf6",
    borderRadius: 7,
    background: "#fbfdff",
  },
  trafficStatLabel: {
    color: "var(--muted)",
    fontSize: "0.66rem",
    fontWeight: 850,
    textTransform: "uppercase",
  },
  trafficStatValue: {
    color: "var(--text)",
    fontSize: "0.78rem",
    fontWeight: 920,
  },
  trafficLegend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    color: "var(--muted)",
    fontSize: "0.7rem",
    fontWeight: 820,
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  },
  legendLineDaily: {
    width: 16,
    height: 3,
    borderRadius: 999,
    background: "var(--blue)",
  },
  legendLineBaseline: {
    width: 16,
    height: 0,
    borderTop: "2px dashed #94a3b8",
  },
  emptyState: {
    display: "grid",
    minHeight: 92,
    placeItems: "center",
    gap: 4,
    padding: 12,
    textAlign: "center",
    border: "1px dashed #cddbea",
    borderRadius: 7,
    color: "var(--muted)",
    background: "#f8fbff",
    fontSize: "0.84rem",
    fontWeight: 850,
  },
  emptyStateCaption: {
    color: "var(--muted)",
    fontSize: "0.72rem",
    fontWeight: 760,
    lineHeight: 1.35,
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

function severityBucket(severity: TimelineSeverity) {
  if (severity === "severe") return "critical";
  if (severity === "watch" || severity === "elevated") return "elevated";
  return "routine";
}

function severityLabel(severity: TimelineSeverity) {
  return severity === "severe" ? "critical" : severity;
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

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function topicCloudButtonStyle(topic: TopicCloudItem, selected: boolean) {
  const weight = Math.min(Math.max(topic.weight, 0), 1);
  const size = 0.82 + weight * 0.78;
  return {
    ...newsPageUi.topicCloudButton,
    fontSize: `${size.toFixed(2)}rem`,
    color: selected ? "var(--blue-dark)" : weight > 0.7 ? "#27384f" : "#5a6b80",
    background: selected ? "var(--surface-blue)" : "transparent",
    borderColor: selected ? "#9fc5f8" : "transparent",
    boxShadow: selected ? "0 1px 1px rgba(15, 23, 42, 0.06)" : "none",
    opacity: 0.72 + weight * 0.28,
  };
}

function topicDisplayLabel(topic: TopicCloudItem) {
  return topicCloudZhLabels.get(topic.key) ?? topic.label;
}

function eventMatchesTopic(event: TimelineEvent, topicKey: string) {
  const topic = topicCloudByKey.get(topicKey);
  if (topic) return topic.event_ids.includes(event.event_id);
  return Boolean(event.tags?.includes(topicKey));
}

function displayTags(event: TimelineEvent) {
  return (event.tags ?? []).filter((tag) => !timelineDisplayTagStop.has(tag)).slice(0, 3);
}

function filterEvents(
  events: TimelineEvent[],
  filters: {
    topics: string[];
  },
) {
  return events.filter((event) => {
    if (filters.topics.length > 0) {
      if (!filters.topics.some((topic) => eventMatchesTopic(event, topic))) return false;
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

function trafficCoverage(trafficSeries: MarketChartBundle["series"][number] | undefined) {
  const points = trafficSeries?.points ?? [];
  if (points.length === 0) return null;
  const dates = points.map((point) => point.date).filter(Boolean).sort();
  const start = dates[0];
  const end = dates.at(-1);
  if (!start || !end) return null;
  return { start, end };
}

function trafficEmptyCopy(
  start: string,
  end: string,
  trafficSeries: MarketChartBundle["series"][number] | undefined,
) {
  const coverage = trafficCoverage(trafficSeries);
  if (!coverage) {
    return {
      title: "暂无通行序列",
      caption: "generated bundle 中没有 active PortWatch 日通行序列。",
    };
  }
  if (end < coverage.start || start > coverage.end) {
    return {
      title: "该时间窗口暂无通行数据",
      caption: `覆盖期 ${compactDate(coverage.start)}-${compactDate(coverage.end)}`,
    };
  }
  return {
    title: "该窗口没有 PortWatch 观测",
    caption: `覆盖期 ${compactDate(coverage.start)}-${compactDate(coverage.end)}`,
  };
}

function chartX(dateKey: string, bounds: {
  start: string;
  end: string;
  width: number;
  padLeft: number;
  padRight: number;
}) {
  const startMs = Date.parse(`${bounds.start}T00:00:00Z`);
  const endMs = Date.parse(`${bounds.end}T00:00:00Z`);
  const spanMs = Math.max(endMs - startMs, 1);
  const pointMs = Date.parse(`${dateKey}T00:00:00Z`);
  const usableWidth = bounds.width - bounds.padLeft - bounds.padRight;
  return bounds.padLeft + ((pointMs - startMs) / spanMs) * usableWidth;
}

function chartY(value: number, bounds: {
  min: number;
  max: number;
  height: number;
  padTop: number;
  padBottom: number;
}) {
  const valueSpan = Math.max(bounds.max - bounds.min, 1);
  const usableHeight = bounds.height - bounds.padTop - bounds.padBottom;
  return bounds.padTop + (1 - (value - bounds.min) / valueSpan) * usableHeight;
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
    padLeft: number;
    padRight: number;
    padTop: number;
    padBottom: number;
  },
) {
  if (points.length === 0) return "";

  return points
    .map((point, index) => {
      const x = chartX(point.date, bounds);
      const y = chartY(point.value, bounds);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function niceTrafficDomain(values: number[]) {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(rawMax - rawMin, 1);
  const min = Math.max(0, Math.floor((rawMin - span * 0.12) / 5) * 5);
  const max = Math.ceil((rawMax + span * 0.12) / 5) * 5;
  return { min, max: Math.max(max, min + 5) };
}

function TopicCloudPanel({
  topics,
  resultCount,
  onTopicsChange,
}: {
  topics: string[];
  resultCount: number;
  onTopicsChange: (value: string[]) => void;
}) {
  return (
    <section className="console-card" style={newsPageUi.filterCard}>
      <div style={newsPageUi.filterHeader}>
        <InfoTitle
          title="事件词云"
          subtitle="点击高权重主题，快速定位对应 timeline 事件"
        />
        <span style={newsPageUi.sourceChip}>
          {resultCount} 条可见事件
        </span>
      </div>

      <div style={newsPageUi.topicCloudStage}>
        <span style={newsPageUi.topicCloudHalo} />
        <span style={newsPageUi.topicCloudCenter} />
        <button
          onClick={() => onTopicsChange([])}
          style={{
            ...newsPageUi.topicCloudReset,
            ...(topics.length === 0 ? newsPageUi.filterButtonSelected : {}),
          }}
          type="button"
        >
          全部
          <span style={newsPageUi.topicCloudCount}>{newsTimeline.events.length}</span>
        </button>
        {topicCloud.map((topic, index) => {
          const position = topicCloudPositions[index % topicCloudPositions.length];
          return (
            <button
              key={topic.key}
              onClick={() => onTopicsChange(toggleValue(topics, topic.key))}
              style={{
                ...topicCloudButtonStyle(topic, topics.includes(topic.key)),
                left: position.left,
                top: position.top,
              }}
              title={`${topic.event_count} 条事件 · ${topic.source_tags.join(", ")}`}
              type="button"
            >
              {topicDisplayLabel(topic)}
              <span style={newsPageUi.topicCloudCount}>{topic.event_count}</span>
            </button>
          );
        })}
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
  const height = 148;
  const padLeft = 42;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 30;

  if (dailyPoints.length === 0) {
    const emptyCopy = trafficEmptyCopy(start, end, trafficSeries);
    return (
      <div style={newsPageUi.trafficPanel}>
        <div style={newsPageUi.trafficHead}>
          <span style={newsPageUi.trafficTitle}>
            <Ship size={14} />
            通行 ±7d
          </span>
          <span style={newsPageUi.mutedNote}>
            {compactDate(start)}-{compactDate(end)}
          </span>
        </div>
        <div style={newsPageUi.emptyState}>
          <span>{emptyCopy.title}</span>
          <small style={newsPageUi.emptyStateCaption}>{emptyCopy.caption}</small>
        </div>
      </div>
    );
  }

  const { min, max } = niceTrafficDomain(allValues);
  const bounds = { start, end, min, max, width, height, padLeft, padRight, padTop, padBottom };
  const dailyPath = linePath(dailyPoints, bounds);
  const baselinePath = linePath(baselinePoints, bounds);
  const latestDaily = dailyPoints[dailyPoints.length - 1];
  const dailyValues = dailyPoints.map((point) => point.value);
  const minDaily = Math.min(...dailyValues);
  const maxDaily = Math.max(...dailyValues);
  const yTicks = [max, Math.round((min + max) / 2), min];
  const xTicks = [
    { date: start, label: compactDate(start), anchor: "start" as const },
    { date: center, label: compactDate(center), anchor: "middle" as const },
    { date: end, label: compactDate(end), anchor: "end" as const },
  ];

  return (
    <div style={newsPageUi.trafficPanel} title={trafficSeries?.caveat}>
      <div style={newsPageUi.trafficHead}>
        <span style={newsPageUi.trafficTitle}>
          <Ship size={14} />
          通行 ±7d
        </span>
        <span style={newsPageUi.mutedNote}>
          {compactDate(start)}-{compactDate(end)}
        </span>
      </div>

      <svg
        aria-label={`${formatDate(center)} 前后日通行量`}
        role="img"
        style={newsPageUi.sparkline}
        viewBox={`0 0 ${width} ${height}`}
      >
        {yTicks.map((tick) => {
          const y = chartY(tick, bounds);
          return (
            <g key={tick}>
              <line
                stroke="#e4edf7"
                strokeWidth="1"
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
              />
              <text
                dominantBaseline="middle"
                fill="#6b7a90"
                fontSize="10"
                fontWeight="760"
                textAnchor="end"
                x={padLeft - 7}
                y={y}
              >
                {formatNumber(tick, 0)}
              </text>
            </g>
          );
        })}
        <line
          stroke="#cbd8e7"
          strokeWidth="1"
          x1={padLeft}
          x2={width - padRight}
          y1={height - padBottom}
          y2={height - padBottom}
        />
        <line
          stroke="#cbd8e7"
          strokeWidth="1"
          x1={padLeft}
          x2={padLeft}
          y1={padTop}
          y2={height - padBottom}
        />
        {xTicks.map((tick) => {
          const x = chartX(tick.date, bounds);
          return (
            <g key={tick.date}>
              <line
                stroke="#cbd8e7"
                strokeWidth="1"
                x1={x}
                x2={x}
                y1={height - padBottom}
                y2={height - padBottom + 4}
              />
              <text
                fill="#6b7a90"
                fontSize="10"
                fontWeight="760"
                textAnchor={tick.anchor}
                x={x}
                y={height - 10}
              >
                {tick.label}
              </text>
            </g>
          );
        })}
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
          const x = chartX(point.date, bounds);
          const y = chartY(point.value, bounds);
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

      <div style={newsPageUi.trafficStats}>
        <span style={newsPageUi.trafficStat}>
          <small style={newsPageUi.trafficStatLabel}>最新</small>
          <strong style={newsPageUi.trafficStatValue}>{formatNumber(latestDaily.value, 0)}</strong>
        </span>
        <span style={newsPageUi.trafficStat}>
          <small style={newsPageUi.trafficStatLabel}>窗口低点</small>
          <strong style={newsPageUi.trafficStatValue}>{formatNumber(minDaily, 0)}</strong>
        </span>
        <span style={newsPageUi.trafficStat}>
          <small style={newsPageUi.trafficStatLabel}>窗口高点</small>
          <strong style={newsPageUi.trafficStatValue}>{formatNumber(maxDaily, 0)}</strong>
        </span>
      </div>
      <div style={newsPageUi.entryMeta}>
        <span>{formatDate(latestDaily.date)} 日通行量 {formatNumber(latestDaily.value, 0)}</span>
        <span>{trafficSeries?.source_id ?? "traffic-source"}</span>
        {trafficSeries?.retrieved_at ? (
          <span>检索于 {formatDateTime(trafficSeries.retrieved_at)}</span>
        ) : null}
      </div>
      <div style={newsPageUi.trafficLegend}>
        <span style={newsPageUi.legendItem}>
          <span style={newsPageUi.legendLineDaily} />
          日通行量
        </span>
        <span style={newsPageUi.legendItem}>
          <span style={newsPageUi.legendLineBaseline} />
          1y 同期基线
        </span>
      </div>
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
            {displayTags(event).map((tag) => (
              <span key={tag} style={newsPageUi.pill}>
                {tag}
              </span>
            ))}
          </span>
          <strong>{event.title}</strong>
          <span style={newsPageUi.entryMeta}>
            <span>{event.source_name}</span>
            <span>{formatDateTime(event.event_at)}</span>
            <span>检索于 {formatDateTime(event.retrieved_at)}</span>
            <span>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
          </span>
        </button>

        {expanded ? (
          <div id={`${event.event_id}-details`} style={newsPageUi.entryBody}>
            <div style={newsPageUi.detailGrid}>
              <div style={newsPageUi.detailBlock}>
                <span style={newsPageUi.detailTitle}>事件描述</span>
                <p style={newsPageUi.detailText}>{event.description}</p>

                <span style={newsPageUi.detailTitle}>来源</span>
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
                    <span style={newsPageUi.detailTitle}>交叉核验</span>
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
                    <span style={newsPageUi.detailTitle}>交叉核验</span>
                    <p style={newsPageUi.mutedNote}>该条目未记录交叉核验链接。</p>
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
        <InfoTitle title="时间线" subtitle="当前主题下没有匹配事件" />
        <div style={newsPageUi.emptyState}>没有匹配事件</div>
      </section>
    );
  }

  return (
    <section className="console-card news-timeline-card">
      <div style={newsPageUi.timelineHeader}>
        <InfoTitle title="时间线" subtitle="按 event_at 从新到旧排列" />
        <div style={newsPageUi.sourceChipRow}>
          <span style={newsPageUi.sourceChip}>{events.length} 条事件</span>
          <span style={newsPageUi.sourceChip}>最新在前</span>
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
      <InfoTitle title="来源索引" subtitle="本时间线 bundle 的来源覆盖" />
      <ul style={newsPageUi.indexList}>
        {newsTimeline.source_index.map((source) => (
          <li
            key={`${source.source_id}-${source.source_name}-${source.source_type}`}
            style={newsPageUi.indexItem}
          >
            <span style={sourcePillStyle(source.source_type)}>{sourceLabel(source.source_type)}</span>
            <strong style={newsPageUi.indexTitle}>{source.source_name}</strong>
            <small style={newsPageUi.mutedNote}>
              {source.event_count} 条事件 · {source.source_id}
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
      <InfoTitle title="主题词" subtitle="词云中的高频事件结构" />
      <ul style={newsPageUi.indexList}>
        {topicCloud.map((topic) => (
          <li key={topic.key} style={newsPageUi.indexItem}>
            <strong style={newsPageUi.indexTitle}>{topicDisplayLabel(topic)}</strong>
            <small style={newsPageUi.mutedNote}>
              {topic.event_count} 条事件 · {topic.source_tags.slice(0, 4).join(", ")}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NewsPage() {
  const sortedEvents = useMemo(() => sortEvents(newsTimeline.events), []);
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
        topics,
      }),
    [sortedEvents, topics],
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
            数据截至 {formatDateTime(newsTimeline.data_as_of)}
          </span>
          <h1 style={newsPageUi.headline}>霍尔木兹事件时间线</h1>
          <p style={newsPageUi.copy}>
            这里按时间展示已核验的官方 advisory 与人工整理的公开报道。页面只做事实叙事：
            保留来源、检索时间和可选的 PortWatch 通行对照，不把事件直接解释成风险判断。
          </p>
        </div>

        <div className="news-hero-metrics" style={newsPageUi.metricGrid}>
          <article>
            <span>事件</span>
            <b>{newsTimeline.events.length}</b>
          </article>
          <article>
            <span>升级类</span>
            <b>{elevatedCount}</b>
          </article>
          <article>
            <span>主题词</span>
            <b>{topicCloud.length}</b>
          </article>
        </div>
      </section>

      <TopicCloudPanel
        onTopicsChange={setTopics}
        resultCount={visibleEvents.length}
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
