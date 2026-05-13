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
  MarketChartPoint,
} from "../types/marketChart";

const bundle = data as MarketChartBundle;
const dayMs = 24 * 60 * 60 * 1000;
const structureStartMs = toDayMs("2026-02-28");

const rangeOptions = [
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "1y", label: "1Y", days: 365 },
] as const;

type RangeKey = (typeof rangeOptions)[number]["key"];
type MarketSeriesItem = MarketChartBundle["series"][number];
type MarketOverlay = MarketChartBundle["event_overlays"][number];

type WindowRange = {
  key: RangeKey;
  label: string;
  days: number;
  startMs: number;
  endMs: number;
};

type ChartSeries = {
  id: string;
  label: string;
  color: string;
  unit: string;
  status: MarketSeriesItem["status"];
  points: MarketChartPoint[];
  dashed?: boolean;
  caveat: string;
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
    subtitle: "USD/CNY 看人民币即期压力，Broad USD 看美元整体避险强弱",
    ids: ["usd-cny", "broad-usd"],
  },
  {
    title: "利率 / 波动 / 风险资产",
    subtitle: "保留 VIX，不画 NASDAQ：VIX 更直接反映风险外溢；NASDAQ 与 S&P 500 信息重叠较高",
    ids: ["us10y", "vix", "sp500"],
  },
  {
    title: "美国 CPI",
    subtitle: "月度、滞后发布的通胀背景指标；只作为宏观背景，不解释事件当日价格",
    ids: ["us-cpi"],
    wide: true,
  },
];

const pendingIds = ["gold-pending", "usd-cnh-pending"];

const indicatorNotes = [
  {
    title: "Gold",
    detail:
      "黄金是典型避险资产，但 LBMA benchmark 与主流 futures 数据涉及 licence / vendor 边界；没有可审计授权源前保持 pending，不画假走势。",
  },
  {
    title: "USD/CNH",
    detail:
      "USD/CNH 是离岸人民币汇率，不等于 FRED DEXCHUS 的 USD/CNY。Alpha Vantage / Twelve Data 可做 token 候选源，但需要 raw snapshot、source_hash 和审计后才能上线。",
  },
  {
    title: "VIX vs NASDAQ",
    detail:
      "本页主图保留 VIX，隐藏 NASDAQ。VIX 更适合观察油价与航运风险是否扩散到全球风险偏好；NASDAQ 仍保留在 coverage table 里作数据溯源。",
  },
];

const pendingChineseNotes: Record<string, string> = {
  "gold-pending":
    "候选方向：LBMA / ICE benchmark 或 licensed futures vendor。当前未满足 licence 与 raw lineage 要求，因此不生成 live 金价。",
  "usd-cnh-pending":
    "候选方向：Alpha Vantage / Twelve Data 等 FX API。必须确认是 offshore CNH，并完成 token、raw snapshot、source_hash 审计后才可提升为 active。",
};

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
.market-m8-pending-section,
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
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.market-m8-control-copy {
  display: grid;
  gap: 8px;
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
}

.market-m8-chart-card.traffic {
  padding: 18px;
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

.market-m8-pending-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.market-m8-pending-card {
  display: grid;
  gap: 8px;
  min-height: 132px;
  padding: 15px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  color: #64748b;
  background: #f8fafc;
}

.market-m8-pending-card strong {
  color: #334155;
  font-size: 0.95rem;
  font-weight: 900;
}

.market-m8-pending-card b {
  width: fit-content;
  min-height: 24px;
  padding: 3px 7px;
  border-radius: 6px;
  color: #64748b;
  background: #e2e8f0;
  font-size: 0.7rem;
  font-weight: 900;
}

.market-m8-pending-card p {
  margin: 0;
  color: #64748b;
  font-size: 0.8rem;
  line-height: 1.45;
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

  .market-m8-section-grid,
  .market-m8-pending-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .market-m8-controls,
  .market-m8-notes-card,
  .market-m8-chart-card,
  .market-m8-section,
  .market-m8-pending-section,
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
  if (value === null || value === undefined || !Number.isFinite(value)) return "no data";
  if (series.unit.includes("daily transit")) return `${formatNumber(value, 0)}`;
  if (series.unit === "%") return `${formatNumber(value, 2)}%`;
  return `${formatNumber(value, 2)} ${series.unit}`;
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

function chartSeriesFrom(series: MarketSeriesItem, range: WindowRange): ChartSeries {
  return {
    id: series.id,
    label: series.label,
    color: series.color,
    unit: series.unit,
    status: series.status,
    points: series.status === "active" ? pointsInRange(series.points, range) : [],
    caveat: series.caveat,
  };
}

function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="market-m8-legend" aria-label="Chart legend">
      {series.map((item) => {
        const pending = item.status !== "active";
        const noData = item.status === "active" && item.points.length === 0;
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
            {item.label}
            {pending ? <em className="market-m8-tag">pending</em> : null}
            {noData ? <em className="market-m8-tag">no data</em> : null}
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
  clampMinZero,
  dense,
  showMarkers,
}: {
  series: ChartSeries[];
  events: MarketOverlay[];
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
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const domain = chartDomain(values, clampMinZero);
  const yTicks = ticks(domain.min, domain.max, 4);
  const xTicks = [range.startMs, range.startMs + (range.endMs - range.startMs) / 2, range.endMs];
  const xForMs = (ms: number) => padding.left + ((ms - range.startMs) / (range.endMs - range.startMs || 1)) * plotWidth;
  const xForDate = (date: string) => xForMs(toDayMs(date));
  const yForValue = (value: number) =>
    padding.top + plotHeight - ((value - domain.min) / (domain.max - domain.min || 1)) * plotHeight;
  const bandStartMs = Math.max(structureStartMs, range.startMs);
  const showStructureBand = bandStartMs <= range.endMs;
  const shouldShowEveryMarker = Boolean(showMarkers);
  const maxGapDays = shouldShowEveryMarker ? 45 : 3;

  return (
    <svg className="market-m8-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img">
      {showStructureBand ? (
        <>
          <rect
            className="market-m8-structure-band"
            height={plotHeight}
            width={Math.max(xForMs(range.endMs) - xForMs(bandStartMs), 0)}
            x={xForMs(bandStartMs)}
            y={padding.top}
          />
          <text
            className="market-m8-structure-label"
            textAnchor="end"
            x={width - padding.right - 8}
            y={padding.top + 17}
          >
            封锁架构
          </text>
        </>
      ) : null}

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

      {series.map((item) => {
        const path = linePath(item.points, xForDate, yForValue, maxGapDays);
        const markers = shouldShowEveryMarker
          ? item.points
          : [item.points[item.points.length - 1]].filter(Boolean);
        return (
          <g key={item.id}>
            {path ? (
              <path
                className={`market-m8-line${item.dashed ? " dashed" : ""}`}
                d={path}
                style={{ stroke: item.color }}
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
  range,
  traffic,
  note,
  showMarkers,
}: {
  series: ChartSeries[];
  events: MarketOverlay[];
  range: WindowRange;
  traffic?: boolean;
  note?: string;
  showMarkers?: boolean;
}) {
  const first = series[0];
  const hasData = series.some((item) => item.points.length > 0);
  const latest = lastPoint(first.points);
  const valueLabel = (value: number) => {
    if (first.unit.includes("daily transit")) return formatNumber(value, 0);
    if (first.unit === "%") return `${formatNumber(value, 2)}%`;
    return formatNumber(value, first.unit === "index" ? 2 : 2);
  };

  return (
    <article className={`console-card market-m8-chart-card${traffic ? " traffic" : ""}`}>
      <div className="market-m8-chart-head">
        <div className="market-m8-chart-title">
          <h3>{traffic ? "Traffic" : first.label}</h3>
          <p>
            {traffic
              ? "PortWatch daily, 7d average, and same-window baseline"
              : `${first.unit} · ${first.id}`}
          </p>
        </div>
        <div className="market-m8-chart-meta">
          <span className="market-m8-pill">
            <LineChartIcon size={14} />&nbsp;{range.label}
          </span>
          <span className="market-m8-pill">{events.length} events in range</span>
          {!traffic ? (
            <span className="market-m8-pill">
              {latest ? formatSeriesValue(first, latest.value) : "no data"}
              {latest ? ` · ${changeFor(first.points)}` : ""}
            </span>
          ) : null}
        </div>
      </div>

      <div className="market-m8-chart-wrap">
        <LineChartSvg
          clampMinZero={traffic}
          dense={!traffic}
          events={events}
          range={range}
          series={series}
          showMarkers={showMarkers}
          valueLabel={valueLabel}
        />
        {!hasData ? <div className="market-m8-empty">No data in selected range</div> : null}
      </div>

      <ChartLegend series={series} />
      {note ? <p className="market-m8-chart-note">{note}</p> : null}
    </article>
  );
}

function MarketSectionCharts({
  section,
  events,
  range,
}: {
  section: MarketSection;
  events: MarketOverlay[];
  range: WindowRange;
}) {
  const rows = section.ids
    .map(getSeries)
    .filter((series): series is MarketSeriesItem => Boolean(series))
    .filter((series) => series.status === "active");

  return (
    <section className={`console-card market-m8-section${section.wide ? " wide" : ""}`}>
      <div className="market-m8-section-head">
        <InfoTitle title={section.title} subtitle={section.subtitle} />
        <span className="market-m8-pill">
          <BarChart3 size={14} />&nbsp;{rows.length} charts
        </span>
      </div>
      <div className="market-m8-section-grid">
        {rows.map((series) => (
          <MarketLineChart
            events={events}
            key={series.id}
            note={series.caveat}
            range={range}
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

function PendingSection() {
  const pendingRows = pendingIds
    .map(getSeries)
    .filter((series): series is MarketSeriesItem => Boolean(series));

  return (
    <section className="console-card market-m8-pending-section">
      <div className="market-m8-section-head">
        <InfoTitle title="待接入指标" subtitle="保留数据契约和审计入口，但不画未经验证的 live 曲线" />
        <span className="market-m8-pill">{pendingRows.length} placeholders</span>
      </div>
      <div className="market-m8-pending-grid">
        {pendingRows.map((series) => (
          <article className="market-m8-pending-card" key={series.id}>
            <b>数据待接入</b>
            <strong>{series.label}</strong>
            <p>{pendingChineseNotes[series.id] ?? series.caveat}</p>
            <span className="market-m8-muted">
              {series.source_id} · {series.unit}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function CoverageTable({ series }: { series: MarketSeriesItem[] }) {
  const pendingCount = series.filter((item) => item.status !== "active").length;

  return (
    <section className="console-card market-m8-coverage-card">
      <div className="market-m8-coverage-head">
        <InfoTitle title="数据覆盖表" subtitle="每条 series 的 source id、许可、刷新时间、raw_path 与 caveat" />
        <span className="market-m8-pill">
          <Database size={14} />&nbsp;{pendingCount} pending
        </span>
      </div>

      <div className="market-m8-coverage-wrap">
        <table className="market-m8-coverage-table">
          <thead>
            <tr>
              <th>series</th>
              <th>source id</th>
              <th>状态</th>
              <th>许可</th>
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
                      {pending ? "pending" : item.status}
                    </span>
                  </td>
                  <td>{item.license_status}</td>
                  <td>{formatDateTime(item.retrieved_at)}</td>
                  <td>{item.raw_path ?? "pending"}</td>
                  <td className="market-m8-caveat-cell">{item.caveat}</td>
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
        <InfoTitle title="市场背景" subtitle="原始交通与跨资产市场数据，只做背景展示，不做 forecast 解读" />
        <p>
          生成时间 {formatDateTime(bundle.built_at)} · 数据截至 {formatDateTime(bundle.data_as_of)} · {bundle.series.length} 条
          series · {bundle.event_overlays.length} 条事件标注
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

  const { trafficChartSeries, visibleEvents, trafficCaveat } = useMemo(() => {
    const trafficRows = bundle.series.filter((item) => item.group === "traffic");
    const dailyTraffic =
      trafficRows.find((item) => item.target === "portwatch_daily_transit_calls_all") ??
      trafficRows.find((item) => item.baseline_points && item.baseline_points.length > 0);
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
    const activeTraffic = trafficRows
      .filter((item) => item.status === "active")
      .map((item) => chartSeriesFrom(item, range));
    const overlays = showEvents
      ? bundle.event_overlays.filter((event) => inRange(event.event_at, range))
      : [];

    return {
      trafficChartSeries: [...activeTraffic, ...baselineSeries],
      visibleEvents: overlays,
      trafficCaveat: dailyTraffic?.caveat ?? "PortWatch traffic caveat pending.",
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
        note={`AIS/GNSS caveat: ${trafficCaveat}`}
        range={range}
        series={trafficChartSeries}
        traffic
      />

      {marketSections.map((section) => (
        <MarketSectionCharts
          events={visibleEvents}
          key={section.title}
          range={range}
          section={section}
        />
      ))}

      <PendingSection />

      <CoverageTable series={bundle.series} />
    </section>
  );
}
