// Presentation-only formatting helpers shared by pages and cards.
import type { MarketSeries } from "../types";

export const stressWindowStart = "2026-02-28";

export function formatMarketValue(series: MarketSeries, value: number) {
  if (series.pending) return "待接入";
  const maximumFractionDigits =
    series.unit === "USD/bbl" || series.unit === "%" || series.unit === "CNY" ? 2 : 1;
  const formatted = value.toLocaleString("en-US", { maximumFractionDigits });
  return `${formatted}${series.unit === "%" ? "%" : ""}`;
}

export function formatMarketDate(date?: string) {
  if (!date || date === "pending") return "pending";
  return date.slice(0, 10);
}

export function formatDelta(delta: number) {
  if (delta === 0) return "0 pp";
  return `${delta > 0 ? "+" : ""}${delta} pp`;
}

export function formatAbsDelta(delta: number) {
  return `${Math.abs(delta)} pp`;
}

export function getMarketChange(series: MarketSeries) {
  if (series.pending || series.points.length === 0) {
    return {
      first: { date: "pending", value: 0 },
      last: { date: "pending", value: 0 },
      absolute: 0,
      percent: 0,
      display: "待接入",
    };
  }
  const first = series.points[0];
  const last = series.points.at(-1) ?? first;
  const absolute = last.value - first.value;
  const percent = (last.value / first.value - 1) * 100;
  const display =
    series.unit === "%"
      ? `${absolute >= 0 ? "+" : ""}${(absolute * 100).toFixed(0)} bp`
      : `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
  return { first, last, absolute, percent, display };
}

export function getRecentWindowChange(series: MarketSeries, days: number) {
  if (series.pending || series.points.length === 0) {
    return {
      start: undefined,
      last: undefined,
      absolute: 0,
      percent: 0,
      display: "待接入",
    };
  }
  const last = series.points.at(-1) ?? series.points[0];
  const threshold = addDays(last.date, -days);
  const start =
    series.points.find((point) => point.date >= threshold) ??
    series.points[0];
  return marketChangeFromPoints(series, start, last);
}

export function getMarketWindowSeries(series: MarketSeries, days: number) {
  if (series.pending || series.points.length === 0) return series;
  const last = series.points.at(-1) ?? series.points[0];
  const threshold = addDays(last.date, -days);
  const points = series.points.filter((point) => point.date >= threshold);
  return {
    ...series,
    points: points.length > 0 ? points : series.points,
  };
}

export function getEventWindowChange(
  series: MarketSeries,
  eventDate = stressWindowStart,
) {
  if (series.pending || series.points.length === 0) {
    return {
      start: undefined,
      last: undefined,
      absolute: 0,
      percent: 0,
      display: "待接入",
    };
  }
  const start = series.points.find((point) => point.date >= eventDate);
  if (!start) {
    return {
      start: undefined,
      last: series.points.at(-1),
      absolute: 0,
      percent: 0,
      display: "no window data",
    };
  }
  const last = series.points.at(-1) ?? start;
  return marketChangeFromPoints(series, start, last);
}

export function makeLinePath(
  points: MarketSeries["points"],
  width = 420,
  height = 156,
) {
  if (points.length < 2) return "";
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point.value - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function getEventWindowX(
  points: MarketSeries["points"],
  eventDate = stressWindowStart,
  width = 420,
) {
  if (points.length < 2) return width;
  const index = points.findIndex((point) => point.date >= eventDate);
  const windowIndex = index === -1 ? points.length - 1 : index;
  return (windowIndex / (points.length - 1)) * width;
}

export function formatBaseCaseMove(delta: number) {
  if (delta > 0) return `上升 ${formatAbsDelta(delta)}`;
  if (delta < 0) return `下降 ${formatAbsDelta(delta)}`;
  return "保持不变";
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function marketChangeFromPoints(
  series: MarketSeries,
  start: MarketSeries["points"][number],
  last: MarketSeries["points"][number],
) {
  const absolute = last.value - start.value;
  const percent = (last.value / start.value - 1) * 100;
  const display =
    series.unit === "%"
      ? `${absolute >= 0 ? "+" : ""}${(absolute * 100).toFixed(0)} bp`
      : `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
  return { start, last, absolute, percent, display };
}
