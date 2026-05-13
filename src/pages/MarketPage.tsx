// Market page renders generated traffic and per-indicator market charts.
import { useMemo, useState } from "react";
import {
  BarChart3,
  Database,
  LineChart as LineChartIcon,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { InfoTitle } from "../components/shared/InfoTitle";
import data from "../../data/generated/market_chart.json";
import type {
  MarketChartBundle,
  MarketChartMissingPoint,
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
type MarketRegimeOverlay = NonNullable<MarketChartBundle["regime_overlays"]>[number];

type WindowRange = {
  key: RangeKey;
  label: string;
  days: number;
  startMs: number;
  endMs: number;
};

type ChartSeries = {
  id: string;
  target: string;
  label: string;
  color: string;
  unit: string;
  status: MarketSeriesItem["status"];
  points: MarketChartPoint[];
  missingPoints?: MarketChartMissingPoint[];
  band?: Array<{ date: string; lower: number; upper: number }>;
  dashed?: boolean;
  caveat: string;
};

type VisibleRegimeOverlay = MarketRegimeOverlay & {
  startMs: number;
  endMs: number;
};

type MarketSection = {
  title: string;
  subtitle: string;
  ids: string[];
  wide?: boolean;
};

const marketSections: MarketSection[] = [
  {
    title: "能源价格",
    subtitle: "Brent / WTI 是原油现货代理，用原始 USD/bbl 单位展示",
    ids: ["brent-spot", "wti-spot"],
  },
  {
    title: "美元 / 汇率",
    subtitle: "Broad USD 看美元相对一篮子贸易伙伴货币的整体强弱，Gold 用 Stooq XAU/USD daily close 作避险代理",
    ids: ["broad-usd", "gold-spot"],
  },
  {
    title: "利率 / 波动 / 风险资产",
    subtitle: "保留 VIX，不画 NASDAQ：VIX 更直接反映风险外溢；NASDAQ 与 S&P 500 信息重叠较高",
    ids: ["us10y", "vix", "sp500"],
  },
  {
    title: "美国 CPI",
    subtitle: "FRED CPIAUCSL：月度 CPI 指数，1982-1984=100、季节调整；不是同比通胀率百分比",
    ids: ["us-cpi"],
    wide: true,
  },
];

const indicatorNotes = [
  {
    title: "Gold",
    detail:
      "已接入 Stooq XAU/USD 1 年日线 OHLC，图上使用 Close 作为现货代理。它不是 LBMA Gold Price benchmark 历史序列，也不是 COMEX futures continuous contract。",
  },
  {
    title: "Broad USD / VIX",
    detail:
      "Broad USD 是 FRED 的广义美元指数，衡量美元相对一篮子贸易伙伴货币的整体强弱，不是兑人民币单一汇率。VIX 更直接反映风险偏好，NASDAQ 保留在 coverage table 作溯源。",
  },
  {
    title: "美国 CPI",
    detail:
      "本页使用 FRED CPIAUCSL，全项目 CPI 指数（Index 1982-1984=100，季节调整，月度）。当前 FRED 快照中 2025-10-01 是官方空值，图中标记为缺值，不补 0、不插值。",
  },
];

const marketPageCss = `
.market-m8-page {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

.market-m8-page .console-card {
  min-width: 0;
}

.market-m8-controls,
.market-m8-notes-card,
.market-m8-chart-card,
.market-m8-section,
.market-m8-coverage-card {
  display: grid;
  grid-column: 1 / -1;
  gap: 14px;
  padding: 18px;
}

.market-m8-controls {
  grid-template-columns: minmax(280px, 1fr) auto;
  align-items: center;
  border-color: #c9dcf4;
  background: #f8fbff;
}

.market-m8-control-copy {
  display: grid;
  gap: 8px;
}

.market-m8-title {
  margin: 0;
  color: #0f172a;
  font-size: clamp(1.65rem, 2.2vw, 2.2rem);
  font-weight: 920;
  line-height: 1.04;
  letter-spacing: 0;
}

.market-m8-subtitle {
  margin: 0;
  max-width: 58rem;
  color: #475569;
  font-size: 0.9rem;
  font-weight: 760;
  line-height: 1.42;
  text-wrap: pretty;
}

.market-m8-control-copy p,
.market-m8-chart-note,
.market-m8-card-note {
  margin: 0;
  color: #475569;
  font-size: 0.8rem;
  line-height: 1.45;
  text-wrap: pretty;
}

.market-m8-control-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.market-m8-notes-card {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-color: #d5e4f6;
  background: #fbfdff;
}

.market-m8-note-item {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.market-m8-note-item strong {
  color: #0f172a;
  font-size: 0.86rem;
  font-weight: 900;
  line-height: 1.25;
}

.market-m8-note-item p {
  margin: 0;
  color: #475569;
  font-size: 0.78rem;
  line-height: 1.45;
  text-wrap: pretty;
}

.market-m8-range-tabs {
  display: inline-grid;
  grid-template-columns: repeat(4, minmax(46px, 1fr));
  gap: 3px;
  padding: 3px;
  border: 1px solid #d5deea;
  border-radius: 8px;
  background: #f4f7fb;
}

.market-m8-range-tabs button,
.market-m8-overlay-toggle {
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

.market-m8-range-tabs button {
  padding: 0 9px;
}

.market-m8-range-tabs button:hover,
.market-m8-range-tabs button:focus-visible,
.market-m8-overlay-toggle:hover,
.market-m8-overlay-toggle:focus-visible {
  color: #0f376b;
  background: #ffffff;
}

.market-m8-range-tabs button.selected {
  color: #0f376b;
  background: #ffffff;
  box-shadow: 0 1px 1px rgba(15, 23, 42, 0.06);
}

.market-m8-overlay-toggle {
  gap: 7px;
  padding: 0 10px;
  border: 1px solid #d5deea;
  background: #fbfdff;
}

.market-m8-overlay-toggle.active {
  color: #0f376b;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.market-m8-section-head,
.market-m8-chart-head,
.market-m8-coverage-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.market-m8-section {
  border-color: #d5e4f6;
}

.market-m8-section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.market-m8-section-grid .market-m8-chart-card {
  grid-column: auto;
}

.market-m8-section.wide .market-m8-section-grid .market-m8-chart-card {
  grid-column: 1 / -1;
}

.market-m8-chart-card {
  padding: 15px;
  border-color: #d8e4f2;
  background: #fbfdff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.market-m8-chart-card.traffic {
  padding: 18px;
  border-color: #bdd4ef;
  background: #ffffff;
}

.market-m8-chart-title {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.market-m8-chart-title h3 {
  margin: 0;
  color: #0f172a;
  font-size: 1rem;
  font-weight: 900;
  line-height: 1.2;
}

.market-m8-chart-title p {
  margin: 0;
  color: #64748b;
  font-size: 0.73rem;
  font-weight: 800;
  line-height: 1.35;
  text-wrap: pretty;
}

.market-m8-chart-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}

.market-m8-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid #d8e4f2;
  border-radius: 7px;
  color: #475569;
  background: #ffffff;
  font-size: 0.73rem;
  font-weight: 850;
  line-height: 1.2;
  white-space: nowrap;
}

.market-m8-chart-wrap {
  position: relative;
  min-height: 250px;
  overflow: hidden;
  border: 1px solid #dfeaf6;
  border-radius: 8px;
  background: #ffffff;
}

.market-m8-chart-card.traffic .market-m8-chart-wrap {
  min-height: 320px;
}

.market-m8-chart-svg {
  display: block;
  width: 100%;
  height: 250px;
}

.market-m8-chart-card.traffic .market-m8-chart-svg {
  height: 320px;
}

.market-m8-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 850;
  pointer-events: none;
}

.market-m8-chart-note {
  padding: 10px 12px;
  border: 1px solid #d8e4f2;
  border-radius: 8px;
  background: #f8fbff;
}

.market-m8-grid-line {
  stroke: #e8eef6;
  stroke-width: 1;
}

.market-m8-axis-text {
  fill: #64748b;
  font-size: 11px;
  font-weight: 780;
  letter-spacing: 0;
}

.market-m8-line {
  fill: none;
  stroke-width: 2.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.market-m8-line.dashed {
  stroke-dasharray: 7 6;
}

.market-m8-variance-band {
  opacity: 0.16;
}

.market-m8-marker {
  fill: currentColor;
  stroke: #ffffff;
  stroke-width: 2;
}

.market-m8-event-line {
  stroke: #f59e0b;
  stroke-width: 1.6;
  stroke-dasharray: 4 5;
}

.market-m8-event-hit {
  fill: transparent;
  cursor: pointer;
}

.market-m8-structure-band {
  fill: #f59e0b;
  opacity: 0.12;
}

.market-m8-structure-label {
  fill: #b45309;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0;
}

.market-m8-missing-line {
  stroke: #b91c1c;
  stroke-width: 1.25;
  stroke-dasharray: 2 5;
  opacity: 0.72;
}

.market-m8-missing-label {
  fill: #991b1b;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
}

.market-m8-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.market-m8-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid #d8e4f2;
  border-radius: 7px;
  color: #334155;
  background: #ffffff;
  font-size: 0.74rem;
  font-weight: 850;
}

.market-m8-legend-item.pending,
.market-m8-legend-item.no-data {
  color: #7a8798;
  border-style: dashed;
  background: #f8fafc;
}

.market-m8-legend-swatch {
  width: 18px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
}

.market-m8-legend-swatch.dashed {
  height: 0;
  border-top: 3px dashed currentColor;
  background: transparent;
}

.market-m8-tag {
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

.market-m8-coverage-wrap {
  overflow-x: auto;
  border: 1px solid #d8e4f2;
  border-radius: 8px;
  background: #ffffff;
}

.market-m8-coverage-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}

.market-m8-coverage-table th,
.market-m8-coverage-table td {
  padding: 10px 11px;
  border-bottom: 1px solid #e8eef6;
  color: #334155;
  font-size: 0.75rem;
  line-height: 1.35;
  text-align: left;
  vertical-align: top;
}

.market-m8-coverage-table th {
  color: #64748b;
  background: #f5f8fc;
  font-size: 0.68rem;
  font-weight: 900;
  text-transform: uppercase;
}

.market-m8-coverage-table tr:last-child td {
  border-bottom: 0;
}

.market-m8-coverage-table tr.pending td {
  color: #7a8798;
  background: #f8fafc;
}

.market-m8-series-cell {
  display: grid;
  gap: 4px;
}

.market-m8-series-cell strong {
  color: #0f172a;
  font-size: 0.8rem;
  font-weight: 900;
}

.market-m8-series-cell span,
.market-m8-muted {
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 800;
}

.market-m8-status {
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

.market-m8-status.pending {
  color: #64748b;
  background: #e2e8f0;
}

.market-m8-caveat-cell {
  max-width: 34rem;
  overflow-wrap: anywhere;
}

.market-m8-missing-summary {
  margin-top: 6px;
  color: #991b1b;
  font-size: 0.72rem;
  font-weight: 850;
}

@media (max-width: 980px) {
  .market-m8-controls,
  .market-m8-notes-card,
  .market-m8-section-head,
  .market-m8-chart-head,
  .market-m8-coverage-head {
    display: grid;
    grid-template-columns: 1fr;
  }

  .market-m8-control-actions,
  .market-m8-chart-meta {
    justify-content: flex-start;
  }

  .market-m8-section-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .market-m8-controls,
  .market-m8-notes-card,
  .market-m8-chart-card,
  .market-m8-section,
  .market-m8-coverage-card {
    padding: 14px;
  }

  .market-m8-control-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .market-m8-range-tabs,
  .market-m8-overlay-toggle {
    width: 100%;
  }
}
`;

function toDayMs(value: string) {
  const datePart = value.includes("T") ? value.slice(0, 10) : value;
  const parsed = Date.parse(`${datePart}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysBetween(laterMs: number, earlierMs: number) {
  return Math.round((laterMs - earlierMs) / dayMs);
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
  if (value === null || value === undefined || !Number.isFinite(value)) return "无数据";
  if (isTrafficUnit(series.unit)) return `${formatNumber(value, 0)} 日通过船次`;
  if (series.unit === "%") return `${formatNumber(value, 2)}%`;
  if (series.unit === "index") return `${formatNumber(value, 2)} 指数点`;
  return `${formatNumber(value, 2)} ${displayUnit(series.unit)}`;
}

function makeRange(key: RangeKey): WindowRange {
  const option = rangeOptions.find((item) => item.key === key) ?? rangeOptions[1];
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

function pointsInRange(points: MarketChartPoint[], range: WindowRange) {
  return points.filter((point) => inRange(point.date, range));
}

function isTrafficUnit(unit: string) {
  return unit.includes("daily transit") || unit.includes("日通过船次");
}

function displayUnit(unit: string) {
  if (isTrafficUnit(unit)) return "日通过船次";
  if (unit === "index") return "指数点";
  return unit;
}

function lastPoint(points: MarketChartPoint[]) {
  return points.length > 0 ? points[points.length - 1] : undefined;
}

function chartDomain(values: number[], clampMinZero = false) {
  if (values.length === 0) return { min: 0, max: 1 };
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
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

function linePath(
  points: MarketChartPoint[],
  xForDate: (date: string) => number,
  yForValue: (value: number) => number,
  maxGapDays = 3,
) {
  if (points.length < 2) return "";
  return points
    .map((point, index) => {
      const x = xForDate(point.date);
      const y = yForValue(point.value);
      const previous = points[index - 1];
      const command =
        !previous || daysBetween(toDayMs(point.date), toDayMs(previous.date)) > maxGapDays ? "M" : "L";
      return `${command}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function bandPath(
  band: Array<{ date: string; lower: number; upper: number }>,
  xForDate: (date: string) => number,
  yForValue: (value: number) => number,
  maxGapDays = 3,
) {
  if (band.length < 2) return "";
  const segments: Array<Array<{ date: string; lower: number; upper: number }>> = [];
  for (const point of band) {
    const previous = segments.at(-1)?.at(-1);
    if (!previous || daysBetween(toDayMs(point.date), toDayMs(previous.date)) > maxGapDays) {
      segments.push([point]);
    } else {
      segments.at(-1)?.push(point);
    }
  }

  return segments
    .filter((segment) => segment.length > 1)
    .map((segment) => {
      const upper = segment
        .map((point, index) => `${index === 0 ? "M" : "L"}${xForDate(point.date).toFixed(1)} ${yForValue(point.upper).toFixed(1)}`)
        .join(" ");
      const lower = [...segment]
        .reverse()
        .map((point) => `L${xForDate(point.date).toFixed(1)} ${yForValue(point.lower).toFixed(1)}`)
        .join(" ");
      return `${upper} ${lower} Z`;
    })
    .join(" ");
}

function movingAveragePoints(points: MarketChartPoint[], windowSize: number) {
  return points.map((point, index) => {
    const window = points.slice(Math.max(0, index - windowSize + 1), index + 1);
    const value = window.reduce((sum, item) => sum + item.value, 0) / window.length;
    return { date: point.date, value: Number(value.toFixed(2)) };
  });
}

function rollingVarianceBand(points: MarketChartPoint[], windowSize: number) {
  return points.map((point, index) => {
    const window = points.slice(Math.max(0, index - windowSize + 1), index + 1);
    const mean = window.reduce((sum, item) => sum + item.value, 0) / window.length;
    const variance = window.reduce((sum, item) => sum + (item.value - mean) ** 2, 0) / window.length;
    const deviation = Math.sqrt(variance);
    return {
      date: point.date,
      lower: Math.max(0, Number((mean - deviation).toFixed(2))),
      upper: Number((mean + deviation).toFixed(2)),
    };
  });
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

function visibleRegimeOverlays(overlays: MarketRegimeOverlay[] | undefined, range: WindowRange): VisibleRegimeOverlay[] {
  return (overlays ?? [])
    .map((overlay) => {
      const startMs = toDayMs(overlay.start_at);
      const endMs = overlay.end_at ? toDayMs(overlay.end_at) : range.endMs;
      return { ...overlay, startMs, endMs };
    })
    .filter((overlay) => Number.isFinite(overlay.startMs) && Number.isFinite(overlay.endMs))
    .filter((overlay) => overlay.endMs >= range.startMs && overlay.startMs <= range.endMs)
    .map((overlay) => ({
      ...overlay,
      startMs: Math.max(overlay.startMs, range.startMs),
      endMs: Math.min(overlay.endMs, range.endMs),
    }));
}

function changeFor(points: MarketChartPoint[]) {
  if (points.length < 2) return "no range";
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (!first || !Number.isFinite(first) || !Number.isFinite(last)) return "no range";
  const change = ((last / first) - 1) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${formatNumber(change, 1)}%`;
}

function getSeries(id: string) {
  return bundle.series.find((series) => series.id === id);
}

function isHiddenMarketSeries(series: MarketSeriesItem) {
  return series.surface === "hidden" || series.coverage_visible === false;
}

function chartSeriesFrom(series: MarketSeriesItem, range: WindowRange): ChartSeries {
  return {
    id: series.id,
    target: series.target,
    label: series.label,
    color: series.color,
    unit: series.unit,
    status: series.status,
    points: series.status === "active" ? pointsInRange(series.points, range) : [],
    missingPoints: series.missing_points?.filter((point) => inRange(point.date, range)),
    caveat: series.caveat,
  };
}

function trafficLabel(item: Pick<ChartSeries, "id" | "target" | "label"> | Pick<MarketSeriesItem, "id" | "target" | "label">) {
  if (item.id.includes("smoothed-3d")) return "3日平滑日通行量";
  if (item.id.includes("variance-3d")) return "3日波动包络";
  if (item.id.endsWith("-baseline")) return "1年同期基线";
  if (item.target === "portwatch_7d_avg_transit_calls_all") return "7日均值";
  if (item.target === "portwatch_daily_transit_calls_all") return "日通行量";
  if (item.target === "portwatch_daily_transit_calls_tanker") return "油轮通行量";
  if (item.target === "portwatch_daily_transit_calls_container") return "集装箱船通行量";
  if (item.target === "portwatch_daily_transit_calls_dry_bulk") return "干散货船通行量";
  if (item.target === "portwatch_daily_transit_calls_other") return "其他货船通行量";
  return item.label;
}

function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="market-m8-legend" aria-label="Chart legend">
      {series.map((item) => {
        const pending = item.status !== "active";
        const noData = item.status === "active" && item.points.length === 0;
        const hasBand = Boolean(item.band?.length);
        const hasMissing = Boolean(item.missingPoints?.length);
        return (
          <li
            className={`market-m8-legend-item${pending ? " pending" : ""}${noData ? " no-data" : ""}`}
            key={item.id}
            title={item.caveat}
          >
            <span
              className={`market-m8-legend-swatch${item.dashed ? " dashed" : ""}`}
              style={{ color: pending || noData ? "#94a3b8" : item.color }}
            />
            {trafficLabel(item)}
            {hasBand ? <em className="market-m8-tag">±1σ</em> : null}
            {hasMissing ? <em className="market-m8-tag">缺值</em> : null}
            {pending ? <em className="market-m8-tag">待接入</em> : null}
            {noData ? <em className="market-m8-tag">无数据</em> : null}
          </li>
        );
      })}
    </ul>
  );
}

function LineChartSvg({
  series,
  events,
  regimes,
  range,
  valueLabel,
  clampMinZero,
  dense,
  showMarkers,
}: {
  series: ChartSeries[];
  events: MarketOverlay[];
  regimes: VisibleRegimeOverlay[];
  range: WindowRange;
  valueLabel: (value: number) => string;
  clampMinZero?: boolean;
  dense?: boolean;
  showMarkers?: boolean;
}) {
  const width = dense ? 720 : 920;
  const height = dense ? 250 : 320;
  const padding = { top: 22, right: 24, bottom: 42, left: 66 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = series.flatMap((item) => [
    ...item.points.map((point) => point.value),
    ...(item.band?.flatMap((point) => [point.lower, point.upper]) ?? []),
  ]);
  const domain = chartDomain(values, clampMinZero);
  const yTicks = ticks(domain.min, domain.max, 4);
  const xTicks = [range.startMs, range.startMs + (range.endMs - range.startMs) / 2, range.endMs];
  const xForMs = (ms: number) => padding.left + ((ms - range.startMs) / (range.endMs - range.startMs || 1)) * plotWidth;
  const xForDate = (date: string) => xForMs(toDayMs(date));
  const yForValue = (value: number) =>
    padding.top + plotHeight - ((value - domain.min) / (domain.max - domain.min || 1)) * plotHeight;
  const shouldShowEveryMarker = Boolean(showMarkers);
  const maxGapDays = shouldShowEveryMarker ? 45 : 3;

  return (
    <svg className="market-m8-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img">
      {regimes.map((overlay) => (
        <g key={overlay.id}>
          <title>
            {overlay.label}: {formatDate(new Date(overlay.startMs).toISOString())}
            {overlay.end_at ? ` - ${formatDate(new Date(overlay.endMs).toISOString())}` : " onward"}。{overlay.caveat}
          </title>
          <rect
            className="market-m8-structure-band"
            height={plotHeight}
            width={Math.max(xForMs(overlay.endMs) - xForMs(overlay.startMs), 0)}
            x={xForMs(overlay.startMs)}
            y={padding.top}
          />
          <text
            className="market-m8-structure-label"
            textAnchor="end"
            x={Math.min(xForMs(overlay.endMs) - 6, width - padding.right - 8)}
            y={padding.top + 17}
          >
            {overlay.label}
          </text>
        </g>
      ))}

      {yTicks.map((tick) => {
        const y = yForValue(tick);
        return (
          <g key={`y-${tick.toFixed(4)}`}>
            <line className="market-m8-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
            <text className="market-m8-axis-text" x={padding.left - 10} y={y + 4} textAnchor="end">
              {valueLabel(tick)}
            </text>
          </g>
        );
      })}

      {xTicks.map((tick) => {
        const x = xForMs(tick);
        return (
          <g key={`x-${tick}`}>
            <line className="market-m8-grid-line" x1={x} x2={x} y1={padding.top} y2={padding.top + plotHeight} />
            <text className="market-m8-axis-text" x={x} y={height - 15} textAnchor="middle">
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
              className="market-m8-event-line"
              x1={x}
              x2={x}
              y1={padding.top}
              y2={padding.top + plotHeight}
            />
            <rect
              className="market-m8-event-hit"
              x={x - 5}
              y={padding.top}
              width="10"
              height={plotHeight}
            />
          </a>
        );
      })}

      {series.flatMap((item) =>
        (item.missingPoints ?? []).map((point) => {
          const x = xForDate(point.date);
          return (
            <g key={`${item.id}-missing-${point.date}`}>
              <title>
                {item.label}: {point.date} 缺值。{point.reason}
              </title>
              <line
                className="market-m8-missing-line"
                x1={x}
                x2={x}
                y1={padding.top}
                y2={padding.top + plotHeight}
              />
              <text className="market-m8-missing-label" textAnchor="middle" x={x} y={padding.top + 16}>
                缺值
              </text>
            </g>
          );
        }),
      )}

      {series.map((item) => {
        const varianceBand = item.band ? bandPath(item.band, xForDate, yForValue, maxGapDays) : "";
        const path = linePath(item.points, xForDate, yForValue, maxGapDays);
        const showSinglePoint = item.points.length === 1;
        const markers = shouldShowEveryMarker
          ? item.points
          : [item.points[item.points.length - 1]].filter(Boolean);
        return (
          <g key={item.id}>
            {varianceBand ? (
              <path
                className="market-m8-variance-band"
                d={varianceBand}
                style={{ fill: item.color }}
              />
            ) : null}
            {path ? (
              <path
                className={`market-m8-line${item.dashed ? " dashed" : ""}`}
                d={path}
                style={{ stroke: item.color }}
              />
            ) : null}
            {showSinglePoint ? (
              <line
                className="market-m8-grid-line"
                x1={padding.left}
                x2={width - padding.right}
                y1={yForValue(item.points[0].value)}
                y2={yForValue(item.points[0].value)}
              />
            ) : null}
            {markers.map((point) => (
              <circle
                className="market-m8-marker"
                cx={xForDate(point.date)}
                cy={yForValue(point.value)}
                key={`${item.id}-${point.date}`}
                r={shouldShowEveryMarker ? 4 : 3}
                style={{ color: item.color, fill: item.color }}
              >
                <title>
                  {item.label}: {valueLabel(point.value)} on {point.date}
                </title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function MarketLineChart({
  series,
  events,
  regimes,
  range,
  traffic,
  note,
  showMarkers,
}: {
  series: ChartSeries[];
  events: MarketOverlay[];
  regimes?: VisibleRegimeOverlay[];
  range: WindowRange;
  traffic?: boolean;
  note?: string;
  showMarkers?: boolean;
}) {
  const first = series[0];
  const hasData = series.some((item) => item.points.length > 0);
  const latest = lastPoint(first.points);
  const latestChange = !traffic && first.points.length > 1 ? changeFor(first.points) : "";
  const valueLabel = (value: number) => {
    if (isTrafficUnit(first.unit)) return formatNumber(value, 0);
    if (first.unit === "%") return `${formatNumber(value, 2)}%`;
    return formatNumber(value, first.unit === "index" ? 2 : 2);
  };

  return (
    <article className={`console-card market-m8-chart-card${traffic ? " traffic" : ""}`}>
      <div className="market-m8-chart-head">
        <div className="market-m8-chart-title">
          <h3>{traffic ? "霍尔木兹通行" : first.label}</h3>
          <p>
            {traffic
              ? "PortWatch 日通过船次：3日平滑、7日均值与1年同期基线"
              : `${displayUnit(first.unit)} · ${first.id}`}
          </p>
        </div>
        <div className="market-m8-chart-meta">
          <span className="market-m8-pill">
            <LineChartIcon size={14} />&nbsp;{range.label}
          </span>
          <span className="market-m8-pill">{events.length} 条事件标注</span>
          <span className="market-m8-pill">
            {latest ? formatSeriesValue(first, latest.value) : traffic ? "单位：日通过船次" : "无数据"}
            {latestChange ? ` · ${latestChange}` : ""}
          </span>
        </div>
      </div>

      <div className="market-m8-chart-wrap">
        <LineChartSvg
          clampMinZero={traffic}
          dense={!traffic}
          events={events}
          regimes={regimes ?? []}
          range={range}
          series={series}
          showMarkers={showMarkers}
          valueLabel={valueLabel}
        />
        {!hasData ? <div className="market-m8-empty">当前区间无数据</div> : null}
      </div>

      <ChartLegend series={series} />
      {note ? <p className="market-m8-chart-note">{note}</p> : null}
    </article>
  );
}

function MarketSectionCharts({
  section,
  events,
  regimes,
  range,
}: {
  section: MarketSection;
  events: MarketOverlay[];
  regimes: VisibleRegimeOverlay[];
  range: WindowRange;
}) {
  const rows = section.ids
    .map(getSeries)
    .filter((series): series is MarketSeriesItem => Boolean(series))
    .filter((series) => series.status === "active" && series.surface === "market_chart");

  return (
    <section className={`console-card market-m8-section${section.wide ? " wide" : ""}`}>
      <div className="market-m8-section-head">
        <InfoTitle title={section.title} subtitle={section.subtitle} />
        <span className="market-m8-pill">
          <BarChart3 size={14} />&nbsp;{rows.length} 张图
        </span>
      </div>
      <div className="market-m8-section-grid">
        {rows.map((series) => (
          <MarketLineChart
            events={events}
            key={series.id}
            note={series.caveat}
            range={range}
            regimes={regimes}
            series={[chartSeriesFrom(series, range)]}
            showMarkers={series.id === "us-cpi"}
          />
        ))}
      </div>
    </section>
  );
}

function IndicatorNotes() {
  return (
    <section className="console-card market-m8-notes-card" aria-label="Market indicator notes">
      {indicatorNotes.map((item) => (
        <div className="market-m8-note-item" key={item.title}>
          <strong>{item.title}</strong>
          <p>{item.detail}</p>
        </div>
      ))}
    </section>
  );
}

function CoverageTable({ series }: { series: MarketSeriesItem[] }) {
  const coverageRows = series.filter((item) => !isHiddenMarketSeries(item));

  return (
    <section className="console-card market-m8-coverage-card">
      <div className="market-m8-coverage-head">
        <InfoTitle title="数据覆盖表" subtitle="逐项列出 source id、许可、刷新时间、raw_path、缺值和数据局限" />
        <span className="market-m8-pill">
          <Database size={14} />&nbsp;{coverageRows.length} 条展示序列
        </span>
      </div>

      <div className="market-m8-coverage-wrap">
        <table className="market-m8-coverage-table">
          <thead>
            <tr>
              <th>序列</th>
              <th>source id</th>
              <th>状态</th>
              <th>许可</th>
              <th>retrieved_at</th>
              <th>raw_path</th>
              <th>数据说明</th>
            </tr>
          </thead>
          <tbody>
            {coverageRows.map((item) => {
              const pending = item.status !== "active";
              const missingSummary = item.missing_points?.map((point) => point.date).join(", ");
              return (
                <tr className={pending ? "pending" : ""} key={item.id}>
                  <td>
                    <div className="market-m8-series-cell">
                      <strong>{item.label}</strong>
                      <span>{item.target}</span>
                    </div>
                  </td>
                  <td>
                    <strong>{item.source_id}</strong>
                    <div className="market-m8-muted">provider: {item.provider_id ?? "unknown"}</div>
                  </td>
                  <td>
                    <span className={`market-m8-status${pending ? " pending" : ""}`}>
                      {pending ? "待接入" : "已接入"}
                    </span>
                  </td>
                  <td>{item.license_status}</td>
                  <td>{formatDateTime(item.retrieved_at)}</td>
                  <td>{item.raw_path ?? "pending"}</td>
                  <td className="market-m8-caveat-cell">
                    {item.caveat}
                    {missingSummary ? (
                      <div className="market-m8-missing-summary">缺值：{missingSummary}（官方空值；未插值）</div>
                    ) : null}
                  </td>
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
    <section className="console-card market-m8-controls">
      <div className="market-m8-control-copy">
        <h1 className="market-m8-title">市场背景</h1>
        <p className="market-m8-subtitle">
          原始交通与跨资产市场数据，只做背景展示，不做 forecast 解读。
        </p>
        <p>
          生成时间 {formatDateTime(bundle.built_at)} · 数据截至 {formatDateTime(bundle.data_as_of)} · {bundle.series.length} 条
          原始序列 · {bundle.series.filter((series) => !isHiddenMarketSeries(series)).length} 条展示序列 ·{" "}
          {bundle.event_overlays.length} 条事件标注 · {bundle.regime_overlays?.length ?? 0} 条 source-backed regime overlay
        </p>
      </div>
      <div className="market-m8-control-actions">
        <div className="market-m8-range-tabs" role="tablist" aria-label="Market range">
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
          className={`market-m8-overlay-toggle${showEvents ? " active" : ""}`}
          onClick={onToggleEvents}
          type="button"
        >
          {showEvents ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
          事件标注
        </button>
      </div>
    </section>
  );
}

export function MarketPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("90d");
  const [showEvents, setShowEvents] = useState(true);
  const range = useMemo(() => makeRange(rangeKey), [rangeKey]);

  const { trafficChartSeries, visibleEvents, visibleRegimes, trafficCaveat } = useMemo(() => {
    const trafficRows = bundle.series.filter((item) => item.group === "traffic");
    const dailyTraffic =
      trafficRows.find((item) => item.target === "portwatch_daily_transit_calls_all") ??
      trafficRows.find((item) => item.baseline_points && item.baseline_points.length > 0);
    const rollingTraffic = trafficRows.find((item) => item.target === "portwatch_7d_avg_transit_calls_all");
    const dailyRangePoints = dailyTraffic ? pointsInRange(dailyTraffic.points, range) : [];
    const smoothedTrafficSeries: ChartSeries[] =
      dailyTraffic && dailyRangePoints.length > 0
        ? [
            {
              id: `${dailyTraffic.id}-smoothed-3d`,
              target: dailyTraffic.target,
              label: "3日平滑日通行量",
              color: dailyTraffic.color,
              unit: dailyTraffic.unit,
              status: "active",
              points: pointsInRange(movingAveragePoints(dailyTraffic.points, 3), range),
              band: rollingVarianceBand(dailyTraffic.points, 3).filter((point) => inRange(point.date, range)),
              caveat: "日通行量先做 3 日移动平均；半透明包络为同一 3 日窗口内的均值 ± 1 标准差。",
            },
          ]
        : [];
    const rollingSeries: ChartSeries[] = rollingTraffic
      ? [
          {
            ...chartSeriesFrom(rollingTraffic, range),
            label: "7日均值",
            color: "#0f766e",
          },
        ]
      : [];
    const baselineSeries: ChartSeries[] =
      dailyTraffic?.baseline_points && dailyTraffic.baseline_points.length > 0
        ? [
            {
              id: `${dailyTraffic.id}-baseline`,
              target: dailyTraffic.target,
              label: "1年同期基线",
              color: "#64748b",
              unit: dailyTraffic.unit,
              status: "active",
              points: pointsInRange(dailyTraffic.baseline_points, range),
              dashed: true,
              caveat: "由 PortWatch 自身历史派生的 1 年同期窗口均值，不与 IMO 阈值跨源拼接。",
            },
          ]
        : [];
    const overlays = showEvents
      ? bundle.event_overlays.filter((event) => inRange(event.event_at, range))
      : [];
    const regimes = visibleRegimeOverlays(bundle.regime_overlays, range);

    return {
      trafficChartSeries: [...smoothedTrafficSeries, ...rollingSeries, ...baselineSeries],
      visibleEvents: overlays,
      visibleRegimes: regimes,
      trafficCaveat:
        dailyTraffic?.caveat ??
        "PortWatch 通行量 caveat 待确认：AIS/GNSS 船舶信号可能受干扰、伪装、关闭 AIS 或事后修订影响。",
    };
  }, [range, showEvents]);

  return (
    <section className="page-grid market-page market-m8-page">
      <style>{marketPageCss}</style>

      <MarketControls
        onRangeChange={setRangeKey}
        onToggleEvents={() => setShowEvents((value) => !value)}
        rangeKey={rangeKey}
        showEvents={showEvents}
      />

      <IndicatorNotes />

      <MarketLineChart
        events={visibleEvents}
        note={`AIS/GNSS 注意事项：${trafficCaveat}`}
        range={range}
        regimes={visibleRegimes}
        series={trafficChartSeries}
        traffic
      />

      {marketSections.map((section) => (
        <MarketSectionCharts
          events={visibleEvents}
          key={section.title}
          range={range}
          regimes={visibleRegimes}
          section={section}
        />
      ))}
      <CoverageTable series={bundle.series} />
    </section>
  );
}
