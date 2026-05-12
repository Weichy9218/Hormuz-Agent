// Market page renders generated traffic and cross-asset background data.
import { useMemo, useState } from "react";
import {
  BarChart3,
  Database,
  LineChart as LineChartIcon,
  Ship,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { InfoTitle } from "../components/shared/InfoTitle";
import data from "../../data/generated/market_chart.json";
import type {
  MarketChartBundle,
  MarketChartGroup,
  MarketChartPoint,
} from "../types/marketChart";

const bundle = data as MarketChartBundle;
const dayMs = 24 * 60 * 60 * 1000;

const rangeOptions = [
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "1y", label: "1Y", days: 365 },
] as const;

type RangeKey = (typeof rangeOptions)[number]["key"];
type MarketSeriesItem = MarketChartBundle["series"][number];
type MarketOverlay = MarketChartBundle["event_overlays"][number];

type ChartPoint = MarketChartPoint & {
  rawValue?: number;
};

type ChartSeries = {
  id: string;
  label: string;
  color: string;
  unit: string;
  status: MarketSeriesItem["status"];
  points: ChartPoint[];
  dashed?: boolean;
  caveat: string;
};

type WindowRange = {
  key: RangeKey;
  label: string;
  days: number;
  startMs: number;
  endMs: number;
};

const sparkGroupMeta: Array<{
  group: Exclude<MarketChartGroup, "traffic">;
  title: string;
  subtitle: string;
  preferredIds: string[];
}> = [
  {
    group: "energy",
    title: "Energy",
    subtitle: "Oil proxies",
    preferredIds: ["brent-spot", "wti-spot"],
  },
  {
    group: "safe_haven_fx",
    title: "Safe haven & FX",
    subtitle: "Gold pending, USD rows active",
    preferredIds: ["gold-pending", "broad-usd", "usd-cny", "usd-cnh-pending"],
  },
  {
    group: "risk_rates_vol",
    title: "Risk / rates / vol",
    subtitle: "Equity, volatility, rates",
    preferredIds: ["vix", "us10y", "sp500", "nasdaq", "us-cpi"],
  },
];

const marketPageCss = `
.market-m7-page {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

.market-m7-page .console-card {
  min-width: 0;
}

.market-m7-controls,
.market-m7-chart-card,
.market-m7-spark-section,
.market-m7-coverage-card,
.market-m7-traffic-detail {
  display: grid;
  gap: 14px;
  grid-column: 1 / -1;
  padding: 18px;
}

.market-m7-controls {
  grid-template-columns: minmax(280px, 1fr) auto;
  align-items: center;
  border-color: #c9dcf4;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.market-m7-control-copy {
  display: grid;
  gap: 8px;
}

.market-m7-control-copy p,
.market-m7-chart-note,
.market-m7-card-note {
  margin: 0;
  color: #475569;
  font-size: 0.8rem;
  line-height: 1.45;
  text-wrap: pretty;
}

.market-m7-control-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.market-m7-range-tabs {
  display: inline-grid;
  grid-template-columns: repeat(4, minmax(46px, 1fr));
  gap: 3px;
  padding: 3px;
  border: 1px solid #d5deea;
  border-radius: 8px;
  background: #f4f7fb;
}

.market-m7-range-tabs button,
.market-m7-overlay-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  color: #526276;
  background: transparent;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 900;
  letter-spacing: 0;
}

.market-m7-range-tabs button {
  padding: 0 9px;
}

.market-m7-range-tabs button:hover,
.market-m7-range-tabs button:focus-visible,
.market-m7-overlay-toggle:hover,
.market-m7-overlay-toggle:focus-visible {
  color: #0f376b;
  background: #ffffff;
}

.market-m7-range-tabs button.selected {
  color: #0f376b;
  background: #ffffff;
  box-shadow: 0 1px 1px rgba(15, 23, 42, 0.06);
}

.market-m7-overlay-toggle {
  gap: 7px;
  padding: 0 10px;
  border: 1px solid #d5deea;
  background: #fbfdff;
}

.market-m7-overlay-toggle.active {
  color: #0f376b;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.market-m7-chart-head,
.market-m7-spark-head,
.market-m7-coverage-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.market-m7-chart-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}

.market-m7-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid #d8e4f2;
  border-radius: 7px;
  color: #475569;
  background: #fbfdff;
  font-size: 0.73rem;
  font-weight: 850;
  line-height: 1.2;
  white-space: nowrap;
}

.market-m7-chart-wrap {
  min-height: 320px;
  overflow: hidden;
  border: 1px solid #dfeaf6;
  border-radius: 8px;
  background: #ffffff;
}

.market-m7-chart-svg {
  display: block;
  width: 100%;
  height: 320px;
}

.market-m7-grid-line {
  stroke: #e8eef6;
  stroke-width: 1;
}

.market-m7-axis-text {
  fill: #64748b;
  font-size: 11px;
  font-weight: 780;
  letter-spacing: 0;
}

.market-m7-line {
  fill: none;
  stroke-width: 2.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.market-m7-line.dashed {
  stroke-dasharray: 7 6;
}

.market-m7-last-dot {
  stroke: #ffffff;
  stroke-width: 2;
}

.market-m7-event-line {
  stroke: #f59e0b;
  stroke-width: 1.7;
  stroke-dasharray: 4 5;
}

.market-m7-event-hit {
  fill: transparent;
  cursor: pointer;
}

.market-m7-zero-line {
  stroke: #94a3b8;
  stroke-width: 1;
  stroke-dasharray: 4 5;
}

.market-m7-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.market-m7-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid #d8e4f2;
  border-radius: 7px;
  color: #334155;
  background: #fbfdff;
  font-size: 0.74rem;
  font-weight: 850;
}

.market-m7-legend-item.pending,
.market-m7-legend-item.no-data {
  color: #7a8798;
  border-style: dashed;
  background: #f8fafc;
}

.market-m7-legend-swatch {
  width: 18px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
}

.market-m7-legend-swatch.dashed {
  height: 0;
  border-top: 3px dashed currentColor;
  background: transparent;
}

.market-m7-tag {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  color: #7a8798;
  background: #edf2f7;
  font-size: 0.66rem;
  font-weight: 900;
}

.market-m7-spark-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.market-m7-spark-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border: 1px solid #d8e4f2;
  border-radius: 8px;
  background: #fbfdff;
}

.market-m7-spark-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.market-m7-spark-title h3 {
  margin: 0;
  color: #0f172a;
  font-size: 0.98rem;
  font-weight: 900;
  line-height: 1.2;
}

.market-m7-spark-title p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 0.73rem;
  font-weight: 800;
  line-height: 1.35;
}

.market-m7-spark-row {
  display: grid;
  grid-template-columns: minmax(96px, 0.9fr) minmax(110px, 1fr) minmax(88px, auto);
  gap: 10px;
  align-items: center;
  min-height: 56px;
  padding: 9px;
  border: 1px solid #e2ebf6;
  border-radius: 8px;
  background: #ffffff;
}

.market-m7-spark-row.pending {
  color: #7a8798;
  border-style: dashed;
  background: #f8fafc;
}

.market-m7-spark-label {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.market-m7-spark-label strong {
  color: #0f172a;
  font-size: 0.78rem;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.market-m7-spark-label span {
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 850;
}

.market-m7-spark-row.pending strong,
.market-m7-spark-row.pending span,
.market-m7-spark-row.pending .market-m7-spark-value {
  color: #7a8798;
}

.market-m7-spark-svg {
  width: 100%;
  height: 38px;
  overflow: visible;
}

.market-m7-spark-line {
  fill: none;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.market-m7-spark-value {
  color: #0f172a;
  font-size: 0.76rem;
  font-weight: 900;
  line-height: 1.25;
  text-align: right;
  white-space: nowrap;
}

.market-m7-spark-change {
  display: block;
  margin-top: 2px;
  color: #475569;
  font-size: 0.68rem;
  font-weight: 850;
}

.market-m7-spark-change.up {
  color: #15803d;
}

.market-m7-spark-change.down {
  color: #dc2626;
}

.market-m7-coverage-wrap {
  overflow-x: auto;
  border: 1px solid #d8e4f2;
  border-radius: 8px;
  background: #ffffff;
}

.market-m7-coverage-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}

.market-m7-coverage-table th,
.market-m7-coverage-table td {
  padding: 10px 11px;
  border-bottom: 1px solid #e8eef6;
  color: #334155;
  font-size: 0.75rem;
  line-height: 1.35;
  text-align: left;
  vertical-align: top;
}

.market-m7-coverage-table th {
  color: #64748b;
  background: #f5f8fc;
  font-size: 0.68rem;
  font-weight: 900;
  text-transform: uppercase;
}

.market-m7-coverage-table tr:last-child td {
  border-bottom: 0;
}

.market-m7-coverage-table tr.pending td {
  color: #7a8798;
  background: #f8fafc;
}

.market-m7-series-cell {
  display: grid;
  gap: 4px;
}

.market-m7-series-cell strong {
  color: #0f172a;
  font-size: 0.8rem;
  font-weight: 900;
}

.market-m7-series-cell span,
.market-m7-muted {
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 800;
}

.market-m7-status {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 7px;
  border-radius: 6px;
  color: #0f5c35;
  background: #dcfce7;
  font-size: 0.67rem;
  font-weight: 900;
}

.market-m7-status.pending {
  color: #64748b;
  background: #e2e8f0;
}

.market-m7-caveat-cell {
  max-width: 34rem;
  overflow-wrap: anywhere;
}

@media (max-width: 980px) {
  .market-m7-controls,
  .market-m7-chart-head,
  .market-m7-spark-head,
  .market-m7-coverage-head {
    grid-template-columns: 1fr;
  }

  .market-m7-controls,
  .market-m7-chart-head,
  .market-m7-spark-head,
  .market-m7-coverage-head {
    display: grid;
  }

  .market-m7-control-actions,
  .market-m7-chart-meta {
    justify-content: flex-start;
  }

  .market-m7-spark-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .market-m7-controls,
  .market-m7-chart-card,
  .market-m7-spark-section,
  .market-m7-coverage-card,
  .market-m7-traffic-detail {
    padding: 14px;
  }

  .market-m7-control-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .market-m7-range-tabs {
    width: 100%;
  }

  .market-m7-overlay-toggle {
    width: 100%;
  }

  .market-m7-spark-row {
    grid-template-columns: 1fr;
  }

  .market-m7-spark-value {
    text-align: left;
  }
}
`;

function toDayMs(value: string) {
  const datePart = value.includes("T") ? value.slice(0, 10) : value;
  const parsed = Date.parse(`${datePart}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value?: string | null) {
  if (!value) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function formatDateTime(value?: string | null) {
  if (!value) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatSeriesValue(series: Pick<MarketSeriesItem, "unit">, value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "no data";
  if (series.unit.includes("daily transit")) return `${formatNumber(value, 0)}`;
  if (series.unit === "%") return `${formatNumber(value, 2)}%`;
  return `${formatNumber(value, 2)} ${series.unit}`;
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}%`;
}

function makeRange(key: RangeKey): WindowRange {
  const option = rangeOptions.find((item) => item.key === key) ?? rangeOptions[3];
  const endMs = toDayMs(bundle.data_as_of);
  return {
    ...option,
    startMs: endMs - (option.days - 1) * dayMs,
    endMs,
  };
}

function inRange(value: string, range: WindowRange) {
  const ms = toDayMs(value);
  return ms >= range.startMs && ms <= range.endMs;
}

function pointsInRange(points: MarketChartPoint[], range: WindowRange): MarketChartPoint[] {
  return points.filter((point) => inRange(point.date, range));
}

function lastPoint(points: MarketChartPoint[]) {
  return points.length > 0 ? points[points.length - 1] : undefined;
}

function linePath(
  points: ChartPoint[],
  xForDate: (date: string) => number,
  yForValue: (value: number) => number,
) {
  if (points.length < 2) return "";
  return points
    .map((point, index) => {
      const x = xForDate(point.date);
      const y = yForValue(point.value);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function chartDomain(values: number[], includeZero = false, clampMinZero = false) {
  const domainValues = includeZero ? [...values, 0] : values;
  if (domainValues.length === 0) return { min: 0, max: 1 };
  const rawMin = Math.min(...domainValues);
  const rawMax = Math.max(...domainValues);
  const span = rawMax - rawMin || Math.max(Math.abs(rawMax), 1);
  const padding = span * 0.12;
  return {
    min: clampMinZero ? Math.max(0, rawMin - padding) : rawMin - padding,
    max: rawMax + padding,
  };
}

function ticks(min: number, max: number, count = 4) {
  if (count <= 1) return [min];
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function overlayOffsets(events: MarketOverlay[]) {
  const grouped = new Map<string, MarketOverlay[]>();
  for (const event of events) {
    const key = event.event_at;
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }
  return events.map((event) => {
    const group = grouped.get(event.event_at) ?? [event];
    const index = group.findIndex((item) => item.event_id === event.event_id);
    return {
      event,
      offset: (index - (group.length - 1) / 2) * 3,
      count: group.length,
    };
  });
}

function normalizeSeries(series: MarketSeriesItem, range: WindowRange): ChartSeries {
  if (series.status !== "active") {
    return { ...series, points: [], caveat: series.caveat };
  }

  const visible = pointsInRange(series.points, range);
  const base = visible[0]?.value;
  if (!base || !Number.isFinite(base)) {
    return { ...series, points: [], caveat: series.caveat };
  }

  return {
    ...series,
    unit: "%",
    points: visible.map((point) => ({
      date: point.date,
      value: ((point.value / base) - 1) * 100,
      rawValue: point.value,
    })),
    caveat: series.caveat,
  };
}

function seriesSort(preferredIds: string[]) {
  return (a: MarketSeriesItem, b: MarketSeriesItem) => {
    const aIndex = preferredIds.indexOf(a.id);
    const bIndex = preferredIds.indexOf(b.id);
    const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    return safeA - safeB || a.label.localeCompare(b.label);
  };
}

function changeFor(points: MarketChartPoint[]) {
  if (points.length < 2) return { label: "no range", className: "" };
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (!first || !Number.isFinite(first) || !Number.isFinite(last)) {
    return { label: "no range", className: "" };
  }
  const change = ((last / first) - 1) * 100;
  return {
    label: formatPercent(change),
    className: change >= 0 ? "up" : "down",
  };
}

function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="market-m7-legend" aria-label="Chart legend">
      {series.map((item) => {
        const pending = item.status !== "active";
        const noData = item.status === "active" && item.points.length === 0;
        return (
          <li
            className={`market-m7-legend-item${pending ? " pending" : ""}${noData ? " no-data" : ""}`}
            key={item.id}
            title={item.caveat}
          >
            <span
              className={`market-m7-legend-swatch${item.dashed ? " dashed" : ""}`}
              style={{ color: pending || noData ? "#94a3b8" : item.color }}
            />
            {item.label}
            {pending ? <em className="market-m7-tag">pending</em> : null}
            {noData ? <em className="market-m7-tag">no data</em> : null}
          </li>
        );
      })}
    </ul>
  );
}

function LineChartSvg({
  series,
  events,
  range,
  valueLabel,
  includeZero,
  clampMinZero,
}: {
  series: ChartSeries[];
  events: MarketOverlay[];
  range: WindowRange;
  valueLabel: (value: number) => string;
  includeZero?: boolean;
  clampMinZero?: boolean;
}) {
  const width = 920;
  const height = 320;
  const padding = { top: 22, right: 24, bottom: 42, left: 66 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const domain = chartDomain(values, includeZero, clampMinZero);
  const yTicks = ticks(domain.min, domain.max, 4);
  const xTicks = [range.startMs, range.startMs + (range.endMs - range.startMs) / 2, range.endMs];
  const xForMs = (ms: number) => padding.left + ((ms - range.startMs) / (range.endMs - range.startMs || 1)) * plotWidth;
  const xForDate = (date: string) => xForMs(toDayMs(date));
  const yForValue = (value: number) =>
    padding.top + plotHeight - ((value - domain.min) / (domain.max - domain.min || 1)) * plotHeight;
  const zeroY = yForValue(0);

  return (
    <svg className="market-m7-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img">
      {yTicks.map((tick) => {
        const y = yForValue(tick);
        return (
          <g key={`y-${tick.toFixed(4)}`}>
            <line className="market-m7-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
            <text className="market-m7-axis-text" x={padding.left - 10} y={y + 4} textAnchor="end">
              {valueLabel(tick)}
            </text>
          </g>
        );
      })}

      {includeZero && zeroY >= padding.top && zeroY <= padding.top + plotHeight ? (
        <line className="market-m7-zero-line" x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} />
      ) : null}

      {xTicks.map((tick) => {
        const x = xForMs(tick);
        return (
          <g key={`x-${tick}`}>
            <line className="market-m7-grid-line" x1={x} x2={x} y1={padding.top} y2={padding.top + plotHeight} />
            <text className="market-m7-axis-text" x={x} y={height - 15} textAnchor="middle">
              {formatDate(new Date(tick).toISOString())}
            </text>
          </g>
        );
      })}

      {overlayOffsets(events).map(({ event, offset, count }) => {
        const x = xForDate(event.event_at) + offset;
        return (
          <a href={`/news#${event.event_id}`} key={event.event_id} aria-label={`Open News event ${event.title}`}>
            <title>{count > 1 ? `${event.title} (${count} events at this time)` : event.title}</title>
            <line
              className="market-m7-event-line"
              x1={x}
              x2={x}
              y1={padding.top}
              y2={padding.top + plotHeight}
            />
            <rect
              className="market-m7-event-hit"
              x={x - 5}
              y={padding.top}
              width="10"
              height={plotHeight}
            />
          </a>
        );
      })}

      {series.map((item) => {
        const path = linePath(item.points, xForDate, yForValue);
        const latest = lastPoint(item.points);
        return (
          <g key={item.id}>
            {path ? (
              <path
                className={`market-m7-line${item.dashed ? " dashed" : ""}`}
                d={path}
                style={{ stroke: item.color }}
              />
            ) : null}
            {latest ? (
              <circle
                className="market-m7-last-dot"
                cx={xForDate(latest.date)}
                cy={yForValue(latest.value)}
                r="4"
                style={{ fill: item.color }}
              >
                <title>
                  {item.label}: {valueLabel(latest.value)} on {latest.date}
                </title>
              </circle>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function ChartCard({
  icon,
  title,
  subtitle,
  series,
  events,
  range,
  valueLabel,
  includeZero,
  clampMinZero,
  note,
}: {
  icon: "traffic" | "asset";
  title: string;
  subtitle: string;
  series: ChartSeries[];
  events: MarketOverlay[];
  range: WindowRange;
  valueLabel: (value: number) => string;
  includeZero?: boolean;
  clampMinZero?: boolean;
  note?: string;
}) {
  const Icon = icon === "traffic" ? Ship : LineChartIcon;
  const hasData = series.some((item) => item.points.length > 0);

  return (
    <section className="console-card market-m7-chart-card">
      <div className="market-m7-chart-head">
        <InfoTitle title={title} subtitle={subtitle} />
        <div className="market-m7-chart-meta">
          <span className="market-m7-pill">
            <Icon size={14} />&nbsp;{range.label}
          </span>
          <span className="market-m7-pill">{events.length} events in range</span>
        </div>
      </div>

      <div className="market-m7-chart-wrap">
        {hasData ? (
          <LineChartSvg
            clampMinZero={clampMinZero}
            events={events}
            includeZero={includeZero}
            range={range}
            series={series}
            valueLabel={valueLabel}
          />
        ) : (
          <div className="market-m7-chart-svg" aria-label="No chart data in selected range" />
        )}
      </div>

      <ChartLegend series={series} />
      {note ? <p className="market-m7-chart-note">{note}</p> : null}
    </section>
  );
}

function Sparkline({
  points,
  color,
}: {
  points: MarketChartPoint[];
  color: string;
}) {
  const width = 150;
  const height = 38;
  const padding = 3;
  if (points.length < 2) {
    return (
      <svg className="market-m7-spark-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="No sparkline data">
        <line x1={padding} x2={width - padding} y1={height / 2} y2={height / 2} stroke="#cbd5e1" strokeDasharray="4 4" />
      </svg>
    );
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xForIndex = (index: number) => padding + (index / (points.length - 1)) * (width - padding * 2);
  const yForValue = (value: number) => height - padding - ((value - min) / span) * (height - padding * 2);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xForIndex(index).toFixed(1)} ${yForValue(point.value).toFixed(1)}`)
    .join(" ");

  return (
    <svg className="market-m7-spark-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sparkline">
      <path className="market-m7-spark-line" d={path} style={{ stroke: color }} />
    </svg>
  );
}

function SparklineRow({
  series,
  range,
}: {
  series: MarketSeriesItem;
  range: WindowRange;
}) {
  const visible = pointsInRange(series.points, range);
  const latest = lastPoint(visible);
  const change = changeFor(visible);
  const pending = series.status !== "active";

  return (
    <article className={`market-m7-spark-row${pending ? " pending" : ""}`} title={series.caveat}>
      <div className="market-m7-spark-label">
        <strong>{series.label}</strong>
        <span>{series.source_id}</span>
      </div>
      <Sparkline color={pending ? "#94a3b8" : series.color} points={pending ? [] : visible} />
      <div className="market-m7-spark-value">
        {pending ? "pending" : formatSeriesValue(series, latest?.value)}
        <span className={`market-m7-spark-change ${change.className}`}>{pending ? "no line" : change.label}</span>
      </div>
    </article>
  );
}

function SparklineGroups({
  series,
  range,
}: {
  series: MarketSeriesItem[];
  range: WindowRange;
}) {
  return (
    <section className="console-card market-m7-spark-section">
      <div className="market-m7-spark-head">
        <InfoTitle title="Grouped sparklines" subtitle="Range-controlled rows, capped at four series per group" />
        <span className="market-m7-pill">
          <BarChart3 size={14} />&nbsp;{range.label}
        </span>
      </div>

      <div className="market-m7-spark-grid">
        {sparkGroupMeta.map((group) => {
          const groupSeries = series
            .filter((item) => item.group === group.group)
            .sort(seriesSort(group.preferredIds))
            .slice(0, 4);
          return (
            <article className="market-m7-spark-card" key={group.group}>
              <div className="market-m7-spark-title">
                <div>
                  <h3>{group.title}</h3>
                  <p>{group.subtitle}</p>
                </div>
                <span className="market-m7-tag">{groupSeries.length} rows</span>
              </div>
              {groupSeries.map((item) => (
                <SparklineRow key={item.id} range={range} series={item} />
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TrafficDetail({
  series,
  range,
}: {
  series: MarketSeriesItem[];
  range: WindowRange;
}) {
  const detailSeries = series.filter(
    (item) =>
      item.group === "traffic" &&
      !item.target.endsWith("_all") &&
      !item.id.includes("7d-avg"),
  );

  if (detailSeries.length === 0) return null;

  return (
    <section className="console-card market-m7-traffic-detail">
      <InfoTitle title="Traffic detail" subtitle="PortWatch vessel-type series when available" />
      <div className="market-m7-spark-grid">
        {detailSeries.slice(0, 5).map((item) => (
          <SparklineRow key={item.id} range={range} series={item} />
        ))}
      </div>
    </section>
  );
}

function CoverageTable({ series }: { series: MarketSeriesItem[] }) {
  const pendingCount = series.filter((item) => item.status !== "active").length;

  return (
    <section className="console-card market-m7-coverage-card">
      <div className="market-m7-coverage-head">
        <InfoTitle title="Coverage table" subtitle="Source lineage, freshness, status, and caveats for every series" />
        <span className="market-m7-pill">
          <Database size={14} />&nbsp;{pendingCount} pending
        </span>
      </div>

      <div className="market-m7-coverage-wrap">
        <table className="market-m7-coverage-table">
          <thead>
            <tr>
              <th>series</th>
              <th>source</th>
              <th>status</th>
              <th>license</th>
              <th>retrieved_at</th>
              <th>raw_path</th>
              <th>caveat</th>
            </tr>
          </thead>
          <tbody>
            {series.map((item) => {
              const pending = item.status !== "active";
              return (
                <tr className={pending ? "pending" : ""} key={item.id}>
                  <td>
                    <div className="market-m7-series-cell">
                      <strong>{item.label}</strong>
                      <span>{item.target}</span>
                    </div>
                  </td>
                  <td>
                    <strong>{item.source_id}</strong>
                    <div className="market-m7-muted">provider: {item.provider_id ?? "unknown"}</div>
                  </td>
                  <td>
                    <span className={`market-m7-status${pending ? " pending" : ""}`}>
                      {pending ? "pending" : item.status}
                    </span>
                  </td>
                  <td>{item.license_status}</td>
                  <td>{formatDateTime(item.retrieved_at)}</td>
                  <td>{item.raw_path ?? "pending"}</td>
                  <td className="market-m7-caveat-cell">{item.caveat}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MarketControls({
  rangeKey,
  showEvents,
  onRangeChange,
  onToggleEvents,
}: {
  rangeKey: RangeKey;
  showEvents: boolean;
  onRangeChange: (range: RangeKey) => void;
  onToggleEvents: () => void;
}) {
  return (
    <section className="console-card market-m7-controls">
      <div className="market-m7-control-copy">
        <InfoTitle title="Market background" subtitle="Raw traffic and market series from generated local snapshots" />
        <p>
          Built {formatDateTime(bundle.built_at)} · data as of {formatDateTime(bundle.data_as_of)} · {bundle.series.length} series ·{" "}
          {bundle.event_overlays.length} event overlays
        </p>
      </div>
      <div className="market-m7-control-actions">
        <div className="market-m7-range-tabs" role="tablist" aria-label="Market range">
          {rangeOptions.map((option) => (
            <button
              aria-selected={rangeKey === option.key}
              className={rangeKey === option.key ? "selected" : ""}
              key={option.key}
              onClick={() => onRangeChange(option.key)}
              role="tab"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          aria-pressed={showEvents}
          className={`market-m7-overlay-toggle${showEvents ? " active" : ""}`}
          onClick={onToggleEvents}
          type="button"
        >
          {showEvents ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
          Event overlay
        </button>
      </div>
    </section>
  );
}

export function MarketPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [showEvents, setShowEvents] = useState(true);
  const range = useMemo(() => makeRange(rangeKey), [rangeKey]);

  const {
    trafficChartSeries,
    crossAssetSeries,
    visibleEvents,
    nonTrafficSeries,
    trafficCaveat,
  } = useMemo(() => {
    const trafficSeries = bundle.series.filter((item) => item.group === "traffic");
    const dailyTraffic =
      trafficSeries.find((item) => item.target === "portwatch_daily_transit_calls_all") ??
      trafficSeries.find((item) => item.baseline_points && item.baseline_points.length > 0);
    const baselineSeries: ChartSeries[] =
      dailyTraffic?.baseline_points && dailyTraffic.baseline_points.length > 0
        ? [
            {
              id: `${dailyTraffic.id}-baseline`,
              label: "1y baseline",
              color: "#64748b",
              unit: dailyTraffic.unit,
              status: "active",
              points: pointsInRange(dailyTraffic.baseline_points, range),
              dashed: true,
              caveat: "PortWatch same-window historical baseline derived from PortWatch history.",
            },
          ]
        : [];

    const activeTraffic = trafficSeries.map((item) => ({
      ...item,
      points: pointsInRange(item.points, range),
      caveat: item.caveat,
    }));
    const nonTraffic = bundle.series.filter((item) => item.group !== "traffic");
    const normalized = nonTraffic.map((item) => normalizeSeries(item, range));
    const overlays = showEvents
      ? bundle.event_overlays.filter((event) => inRange(event.event_at, range))
      : [];

    return {
      trafficChartSeries: [...activeTraffic, ...baselineSeries],
      crossAssetSeries: normalized,
      visibleEvents: overlays,
      nonTrafficSeries: nonTraffic,
      trafficCaveat: dailyTraffic?.caveat ?? "PortWatch traffic caveat pending.",
    };
  }, [range, showEvents]);

  return (
    <section className="page-grid market-page market-m7-page">
      <style>{marketPageCss}</style>

      <MarketControls
        onRangeChange={setRangeKey}
        onToggleEvents={() => setShowEvents((value) => !value)}
        rangeKey={rangeKey}
        showEvents={showEvents}
      />

      <ChartCard
        events={visibleEvents}
        icon="traffic"
        range={range}
        series={trafficChartSeries}
        subtitle="PortWatch daily transit calls, 7d average, and same-window historical baseline"
        title="Traffic chart"
        valueLabel={(value) => formatNumber(value, 0)}
        clampMinZero
        note={`AIS/GNSS caveat: ${trafficCaveat}`}
      />

      <ChartCard
        events={visibleEvents}
        icon="asset"
        includeZero
        range={range}
        series={crossAssetSeries}
        subtitle="Active non-traffic rows rebased to 0% at the first observation inside the selected range"
        title="Cross-asset normalized chart"
        valueLabel={formatPercent}
        note="Pending rows stay in the legend and table only; no line is drawn until raw lineage is available."
      />

      <SparklineGroups range={range} series={nonTrafficSeries} />

      <TrafficDetail range={range} series={bundle.series} />

      <CoverageTable series={bundle.series} />
    </section>
  );
}
