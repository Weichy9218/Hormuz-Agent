// Displays numeric galaxy forecasts with local market grounding.
import { Activity, ArrowDownRight, ArrowUpRight, Minus, Target } from "lucide-react";
import { InfoTitle } from "../shared/InfoTitle";
import type { BrentDailySeriesProjection } from "../../state/projections";
import type { GalaxyActionTraceItem, GalaxyQuestionRow } from "../../types/galaxy";
import type { ForecastAgentRunArtifact } from "../../types/forecastAgent";
import { parseForecastNumber } from "../../lib/forecast/numericForecast";

type FinalSource = "current run" | "last completed";

interface NumericFinalPayload {
  prediction: string;
  confidence: string;
  terminal: string;
  payload?: GalaxyActionTraceItem["forecastPayload"] | ForecastAgentRunArtifact["finalForecast"];
  action?: GalaxyActionTraceItem;
}

interface NumericForecastCardProps {
  question?: GalaxyQuestionRow | null;
  final: NumericFinalPayload;
  brentSeries: BrentDailySeriesProjection;
  finalSource: FinalSource;
  runtime: "galaxy" | "local";
}

function formatPrice(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "pending" : value.toFixed(2);
}

function formatDelta(delta: number | null) {
  if (delta == null || !Number.isFinite(delta)) return "pending";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}`;
}

function sparklinePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function Sparkline({
  points,
  prediction,
}: {
  points: BrentDailySeriesProjection["points"];
  prediction: number | null;
}) {
  const width = 320;
  const height = 128;
  const padding = 18;
  const values = points.map((point) => point.value);
  if (prediction != null) values.push(prediction);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(1, maxValue - minValue);
  const toX = (index: number) =>
    padding + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (width - padding * 2));
  const toY = (value: number) =>
    height - padding - ((value - minValue) / range) * (height - padding * 2);
  const linePoints = points.map((point, index) => ({ x: toX(index), y: toY(point.value) }));
  const predictedX = width - padding;
  const predictedY = prediction == null ? null : toY(prediction);
  const latest = points.at(-1);

  return (
    <svg className="numeric-forecast-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Brent daily spot sparkline with forecast point">
      <line className="spark-grid" x1={padding} x2={width - padding} y1={toY(maxValue)} y2={toY(maxValue)} />
      <line className="spark-grid" x1={padding} x2={width - padding} y1={toY(minValue)} y2={toY(minValue)} />
      {linePoints.length > 0 ? <path className="spark-line" d={sparklinePath(linePoints)} /> : null}
      {linePoints.map((point, index) => (
        <circle
          className={index === linePoints.length - 1 ? "spark-dot latest" : "spark-dot"}
          cx={point.x}
          cy={point.y}
          key={`${points[index].date}-${points[index].value}`}
          r={index === linePoints.length - 1 ? 3.6 : 2.2}
        />
      ))}
      {predictedY != null ? (
        <>
          <line className="spark-prediction-line" x1={predictedX} x2={predictedX} y1={padding} y2={height - padding} />
          <circle className="spark-prediction-dot" cx={predictedX} cy={predictedY} r={5.2} />
        </>
      ) : null}
      <text x={padding} y={14}>{formatPrice(maxValue)}</text>
      <text x={padding} y={height - 4}>{formatPrice(minValue)}</text>
      {latest ? <text className="spark-date" x={width - padding} y={height - 4}>{latest.date}</text> : null}
    </svg>
  );
}

export function NumericForecastCard({
  question,
  final,
  brentSeries,
  finalSource,
  runtime,
}: NumericForecastCardProps) {
  const prediction = parseForecastNumber(final.prediction);
  const latest = brentSeries.points.at(-1) ?? null;
  const window =
    typeof question?.metadata?.resolution_window === "object"
      ? question.metadata.resolution_window
      : question?.metadata?.resolution_window_detail;
  const windowPoints = window
    ? brentSeries.points.filter((point) => point.date >= window.start_date && point.date <= window.end_date)
    : [];
  const observedWindowHigh = windowPoints.reduce<number | null>(
    (max, point) => max == null || point.value > max ? point.value : max,
    null,
  );
  const delta = prediction != null && latest ? prediction - latest.value : null;
  const deltaPct = delta != null && latest ? (delta / latest.value) * 100 : null;
  const direction = delta == null ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const DirectionIcon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const payload = final.payload;
  const runtimeLabel = runtime === "galaxy" ? "真实 galaxy 运行" : "离线 Demo";
  const finalSourceZh = finalSource === "current run" ? "当前运行" : "上次完成";

  return (
    <section className="console-card numeric-forecast-card">
      <InfoTitle title="数值预测" subtitle={`${finalSourceZh} · ${final.terminal}`} />
      <div className="numeric-forecast-answer">
        <span>Brent weekly high · USD/bbl · FRED DCOILBRENTEU</span>
        <em>{runtimeLabel}</em>
        <strong>{formatPrice(prediction)} <small>USD/bbl</small></strong>
        <p>FRED DCOILBRENTEU · {window ? `${window.start_date} → ${window.end_date}` : "目标窗口待定"}</p>
      </div>
      <div className="numeric-forecast-chart">
        <Sparkline points={brentSeries.points} prediction={prediction} />
        <div className="numeric-forecast-metrics">
          <span>
            <b>最新现货</b>
            <strong>{formatPrice(latest?.value)}</strong>
            <small>{latest?.date ?? "待定"}</small>
          </span>
          <span>
            <b>区间最高</b>
            <strong>{formatPrice(observedWindowHigh)}</strong>
            <small>{windowPoints.length ? `${windowPoints.length} 个观测日` : "待 FRED 收盘"}</small>
          </span>
          <span className={direction}>
            <b>vs 现价</b>
            <strong><DirectionIcon size={15} /> {formatDelta(delta)}</strong>
            <small>{deltaPct == null ? "待定" : `${formatDelta(deltaPct)}%`}</small>
          </span>
        </div>
      </div>
      <div className="numeric-forecast-source">
        <span><Target size={14} /> 目标序列 {brentSeries.seriesId}</span>
        <span><Activity size={14} /> 数据获取 {brentSeries.retrievedAt || "待定"}</span>
      </div>
      <p>{payload?.rationale ?? final.action?.summary ?? "当前运行尚未记录数值预测。"}</p>
      <div className="galaxy-final-lists">
        <strong>关键证据</strong>
        {(payload?.keyEvidenceItems?.length ? payload.keyEvidenceItems : ["等待 record_forecast 载荷"]).map((item) => (
          <p key={item}>{item}</p>
        ))}
        {payload?.counterEvidenceItems?.length ? <strong>反向证据</strong> : null}
        {payload?.counterEvidenceItems?.map((item) => <p key={item}>{item}</p>)}
        {payload?.openConcerns?.length ? <strong>待观察风险</strong> : null}
        {payload?.openConcerns?.map((item) => <p key={item}>{item}</p>)}
      </div>
    </section>
  );
}
