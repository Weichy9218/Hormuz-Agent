// Main case-room interface for the Hormuz forecasting workflow.
import { useState } from "react";
import {
  Anchor,
  BarChart3,
  Database,
  FileText,
  Gauge,
  Landmark,
  Radar,
  RefreshCw,
  Route,
  ShieldAlert,
  Ship,
  Sparkles,
  SquareActivity,
  Waves,
} from "lucide-react";
import { CheckpointCard } from "./components/forecast/CheckpointCard";
import { getRunEventTitle } from "./components/forecast/eventLabels";
import { JudgementDeltaCard } from "./components/forecast/JudgementDeltaCard";
import { ResearchStream } from "./components/forecast/ResearchStream";
import {
  baseScenarios,
  dailyBriefs,
  checkpoints,
  detailPages,
  events,
  flowMetrics,
  mapCountries,
  marketSeries,
  shippingLanes,
  sourceRegistry,
  sourceGroups,
} from "./data";
import { runForecast } from "./forecastClient";
import {
  forecastTargetOptions,
  initialForecastRun,
  scenarioLabel as forecastScenarioLabel,
  targetLabel,
} from "./state/forecastStore";
import type {
  Checkpoint,
  CoordinatePoint,
  DailyBrief,
  DetailPage,
  FlowMetric,
  MarketSeries,
  Scenario,
  SourceRegistryEntry,
} from "./types";
import type { ForecastRunResponse, ForecastTarget } from "./types/forecast";

const categoryIcon = {
  news: FileText,
  diplomacy: Landmark,
  maritime: Ship,
  flow: Waves,
  market: BarChart3,
};

const pageIcon: Record<DetailPage["id"], typeof Gauge> = {
  overview: Gauge,
  map: Route,
  market: BarChart3,
  forecast: SquareActivity,
};

const riskLevelLabel: Record<DailyBrief["riskLevel"], string> = {
  normal: "正常",
  elevated: "升温",
  critical: "高危",
};

const confidenceLabel: Record<Checkpoint["confidence"], string> = {
  low: "低",
  med: "中",
  high: "高",
};

const scenarioDisplayLabel: Record<Scenario["id"], string> = forecastScenarioLabel;

const sourceStatusLabel: Record<SourceRegistryEntry["status"], string> = {
  fresh: "已更新",
  lagging: "滞后",
  missing: "缺失",
};

const sourceReliabilityLabel: Record<SourceRegistryEntry["reliability"], string> = {
  "source-of-truth": "真实源",
  proxy: "代理指标",
  placeholder: "占位",
  reference: "参考",
};

const sourceBoundaryLabel: Record<SourceRegistryEntry["boundary"], string> = {
  structural_baseline: "structural baseline",
  live_operational: "live operational",
  market_benchmark: "market benchmark",
  historical_backtest: "historical/backtest",
  pending: "pending",
};

const marketGroups: Array<{ label: string; ids: string[] }> = [
  { label: "能源", ids: ["brent-spot", "wti-spot"] },
  { label: "避险 / 波动", ids: ["vix", "broad-usd"] },
  { label: "利率 / 风险资产", ids: ["us10y", "sp500"] },
];

interface AgentRunState {
  visibleEventCount: number;
  liveSummary: string;
  running: boolean;
  completed: boolean;
}

type ScenarioView = Scenario & {
  probability: number;
};

const mapBounds = {
  minLon: 44,
  maxLon: 64,
  minLat: 19.5,
  maxLat: 32,
};

function buildScenarioViews(
  scenarios: Scenario[],
  probabilities: Checkpoint["probabilities"],
): ScenarioView[] {
  return scenarios.map((scenario) => ({
    ...scenario,
    probability: probabilities[scenario.id],
  }));
}

function projectPoint(point: CoordinatePoint) {
  const x = ((point.lon - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon)) * 1000;
  const y = (1 - (point.lat - mapBounds.minLat) / (mapBounds.maxLat - mapBounds.minLat)) * 560;
  return [x, y] as const;
}

function toPath(points: CoordinatePoint[], closed = false) {
  if (!points.length) return "";
  return points
    .map((point, index) => {
      const [x, y] = projectPoint(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ")
    .concat(closed ? " Z" : "");
}

function formatMarketValue(series: MarketSeries, value: number) {
  const maximumFractionDigits =
    series.unit === "USD/bbl" || series.unit === "%" ? 2 : 1;
  const formatted = value.toLocaleString("en-US", { maximumFractionDigits });
  return `${formatted}${series.unit === "%" ? "%" : ""}`;
}

function getMarketChange(series: MarketSeries) {
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

function MarketComparisonChart({ series }: { series: MarketSeries[] }) {
  const chartWidth = 980;
  const chartHeight = 360;
  const plotLeft = 64;
  const plotRight = 24;
  const plotTop = 30;
  const plotBottom = 48;
  const plotWidth = chartWidth - plotLeft - plotRight;
  const plotHeight = chartHeight - plotTop - plotBottom;
  const normalized = series.map((item) => ({
    ...item,
    normalizedPoints: item.points.map((point, index) => {
      const baseline = item.points[0].value;
      return {
        date: point.date,
        value: ((point.value / baseline) - 1) * 100,
        index,
      };
    }),
  }));
  const allValues = normalized.flatMap((item) =>
    item.normalizedPoints.map((point) => point.value),
  );
  const maxAbsChange = Math.max(...allValues.map((value) => Math.abs(value)), 10);
  const yLimit = Math.ceil((maxAbsChange * 1.16) / 10) * 10;
  const yMin = -yLimit;
  const yMax = yLimit;
  const yTicks = [-yLimit, -yLimit / 2, 0, yLimit / 2, yLimit];
  const anchorSeries = series[0];
  const anchorDates = [
    anchorSeries.points[0],
    anchorSeries.points[Math.floor((anchorSeries.points.length - 1) / 2)],
    anchorSeries.points.at(-1) ?? anchorSeries.points[0],
  ];

  const getX = (index: number, length: number) =>
    plotLeft + (index / Math.max(length - 1, 1)) * plotWidth;
  const getY = (value: number) =>
    plotTop + (1 - (value - yMin) / Math.max(yMax - yMin, 1)) * plotHeight;

  return (
    <section className="market-chart-shell" aria-label="市场归一化对比曲线">
      <div className="market-chart-copy">
        <div>
          <span>Cross-asset normalized view</span>
          <h3>统一时间轴看风险重新定价</h3>
        </div>
        <p>
          所有线条以首个观测点为 0%，纵向空间放大到同一 chart 内比较方向和斜率；收益率序列仅用于形态参考，原始值见下方摘要。
        </p>
      </div>
      <svg
        className="market-comparison-chart"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="Brent、WTI、VIX、美元指数、美债收益率与标普 500 的归一化变化"
      >
        <defs>
          <linearGradient id="marketChartShade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(116, 221, 214, 0.10)" />
            <stop offset="100%" stopColor="rgba(116, 221, 214, 0)" />
          </linearGradient>
        </defs>
        <rect
          className="market-plot-bg"
          x={plotLeft}
          y={plotTop}
          width={plotWidth}
          height={plotHeight}
          rx="8"
        />
        {yTicks.map((tick) => {
          const y = getY(tick);
          return (
            <g className="market-y-tick" key={tick}>
              <line x1={plotLeft} x2={chartWidth - plotRight} y1={y} y2={y} />
              <text x={plotLeft - 12} y={y + 4}>
                {tick > 0 ? "+" : ""}
                {tick.toFixed(0)}%
              </text>
            </g>
          );
        })}
        <line
          className="market-zero-line"
          x1={plotLeft}
          x2={chartWidth - plotRight}
          y1={getY(0)}
          y2={getY(0)}
        />
        {anchorDates.map((point, index) => {
          const x = getX(
            index === 0
              ? 0
              : index === 1
                ? Math.floor((anchorSeries.points.length - 1) / 2)
                : anchorSeries.points.length - 1,
            anchorSeries.points.length,
          );
          return (
            <g className="market-x-tick" key={`${point.date}-${index}`}>
              <line x1={x} x2={x} y1={plotTop} y2={plotTop + plotHeight} />
              <text x={x} y={chartHeight - 18}>
                {point.date.slice(5)}
              </text>
            </g>
          );
        })}
        {normalized.map((item) => {
          const path = item.normalizedPoints
            .map((point, index) => {
              const x = getX(index, item.normalizedPoints.length);
              const y = getY(point.value);
              return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join(" ");
          const lastPoint = item.normalizedPoints.at(-1) ?? item.normalizedPoints[0];
          const lastX = getX(item.normalizedPoints.length - 1, item.normalizedPoints.length);
          const lastY = getY(lastPoint.value);
          return (
            <g className="market-series-path" key={item.id}>
              <path d={path} style={{ stroke: item.color }} />
              <circle cx={lastX} cy={lastY} r="4.5" style={{ fill: item.color }} />
            </g>
          );
        })}
      </svg>
      <div className="market-legend">
        {series.map((item) => {
          const change = getMarketChange(item);
          return (
            <span key={item.id}>
              <i style={{ background: item.color }} />
              {item.label}
              <b className={change.percent >= 0 ? "positive" : "negative"}>
                {change.percent >= 0 ? "+" : ""}
                {change.percent.toFixed(1)}%
              </b>
            </span>
          );
        })}
      </div>
    </section>
  );
}

function MarketSeriesCard({ series }: { series: MarketSeries }) {
  const change = getMarketChange(series);
  const trendClass = change.percent >= 0 ? "positive" : "negative";

  return (
    <article className="market-series-card">
      <div className="market-card-heading">
        <span className="market-color-dot" style={{ background: series.color }} />
        <div>
          <strong>{series.label}</strong>
          <small>{series.unit}</small>
        </div>
      </div>
      <div className="market-card-value">
        <b>{formatMarketValue(series, change.last.value)}</b>
        <span className={trendClass}>{change.display}</span>
      </div>
      <p>
        相对 {change.first.date}
        {series.verifiedAt ? ` · 核验 ${series.verifiedAt}` : ""}
      </p>
    </article>
  );
}

function CommandBar({
  brief,
  checkpoint,
  onRefresh,
  isRunning,
  refreshing,
  lastRunNote,
}: {
  brief: DailyBrief;
  checkpoint: Checkpoint;
  onRefresh: () => void;
  isRunning: boolean;
  refreshing: boolean;
  lastRunNote: string;
}) {
  return (
    <header className="command-bar">
      <div className="brand-block">
        <span className="product-kicker">Hormuz Risk Intelligence</span>
        <h1>受控扰动（controlled disruption）是当前风险主线</h1>
        <p className="brief-headline">{brief.headline}</p>
        <p className="brief-anomaly">{brief.anomalies[0]}</p>
        <div className="command-status">
          <article>
            <span>风险等级</span>
            <strong className={`risk-text ${brief.riskLevel}`}>{riskLevelLabel[brief.riskLevel]}</strong>
          </article>
          <article>
            <span>主情景</span>
            <strong className="forecast-text">{scenarioDisplayLabel[checkpoint.forecast]}</strong>
          </article>
          <article>
            <span>置信度</span>
            <strong>{confidenceLabel[checkpoint.confidence]}</strong>
          </article>
        </div>
      </div>

      <div className="command-actions">
        <div className="header-contract">
          <span>系统问题</span>
          <strong>新证据是否改变 Hormuz 风险判断？</strong>
          <p>Forecast 页负责展示 old → new；总览只保留当前结论。</p>
        </div>
        <div className="action-row">
          <button
            className="secondary-action"
            type="button"
            onClick={onRefresh}
            disabled={refreshing || isRunning}
          >
            <RefreshCw className={refreshing ? "spin" : ""} size={17} />
            日度刷新
          </button>
        </div>
        <p>{lastRunNote || brief.analystNote}</p>
      </div>
    </header>
  );
}

function SourceRail() {
  return (
    <section className="source-rail" aria-label="固定信源">
      {sourceGroups.map((source) => (
        <span key={source.id} title={source.detail}>
          <i className={`status-dot ${source.status}`} />
          {source.name}
          <small>{sourceStatusLabel[source.status]}</small>
        </span>
      ))}
    </section>
  );
}

function SourceRegistryPanel({
  group,
}: {
  group?: SourceRegistryEntry["group"];
}) {
  const filteredSources = group
    ? sourceRegistry.filter((source) => source.group === group)
    : sourceRegistry;

  return (
    <section className="panel source-registry-panel">
      <div className="panel-title compact">
        <span className="icon-chip">
          <Database size={18} />
        </span>
        <div>
          <h2>信源登记</h2>
          <p>每条数据标注来源、刷新频率与适用边界</p>
        </div>
      </div>
      <div className="source-registry-list">
        {filteredSources.map((source) => (
          <article className={source.reliability} key={source.id}>
            <div>
              <strong>{source.name}</strong>
            <span>
              <i className={`status-dot ${source.status}`} />
                {sourceStatusLabel[source.status]} · {sourceReliabilityLabel[source.reliability]} · {sourceBoundaryLabel[source.boundary]}
              </span>
            </div>
            <p>{source.usage}</p>
            <small>{source.refreshCadence} · {source.caveat}</small>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer">
                打开来源
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function PageTabs({
  activePage,
  onSelectPage,
}: {
  activePage: DetailPage["id"];
  onSelectPage: (page: DetailPage["id"]) => void;
}) {
  return (
    <nav className="page-tabs" aria-label="工作区分栏">
      {detailPages.map((page) => {
        const Icon = pageIcon[page.id];
        return (
          <button
            className={page.id === activePage ? "selected" : ""}
            key={page.id}
            onClick={() => onSelectPage(page.id)}
            type="button"
          >
            <Icon size={16} />
            <span>{page.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function FlowMetrics() {
  return (
    <section className="flow-metrics" aria-label="流量与约束指标">
      {flowMetrics.map((metric) => (
        <FlowMetricCard metric={metric} key={metric.id} />
      ))}
    </section>
  );
}

function FlowMetricCard({ metric }: { metric: FlowMetric }) {
  return (
    <article className={`flow-card ${metric.tone}`}>
      <small>{metric.label}</small>
      <strong>{metric.value}</strong>
      <span>{metric.unit}</span>
      <p>{metric.detail}</p>
    </article>
  );
}

function Timeline({
  selectedEventId,
  onSelectEvent,
  compact = false,
}: {
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  compact?: boolean;
}) {
  const visibleEvents = compact ? events.slice(0, 2) : events;
  return (
    <section className={`panel timeline-panel ${compact ? "compact" : ""}`}>
      <div className="panel-title">
        <span className="step-badge">1</span>
        <div>
          <h2>态势时间线</h2>
          <p>离散信号收敛为 checkpoint 证据</p>
        </div>
      </div>
      <div className="timeline-list">
        {visibleEvents.map((event) => {
          const Icon = categoryIcon[event.category];
          const selected = event.id === selectedEventId;
          return (
            <button
              className={`timeline-item ${event.severity} ${selected ? "selected" : ""}`}
              key={event.id}
              onClick={() => onSelectEvent(event.id)}
              type="button"
            >
              <span className="timeline-time">{event.time}</span>
              <span className="timeline-icon">
                <Icon size={18} />
              </span>
              <span className="timeline-copy">
                <strong>{event.title}</strong>
                <small>{event.effect}</small>
              </span>
            </button>
          );
        })}
      </div>
      {compact ? <div className="panel-footer-note">完整时间线已放入「预测」分页。</div> : null}
    </section>
  );
}

function MarketDataPanel({ compact = false }: { compact?: boolean }) {
  const visibleSeries = compact ? marketSeries.slice(0, 2) : marketSeries;
  return (
    <section className={`panel market-panel ${compact ? "compact" : ""}`}>
      <div className="panel-title">
        <span className="step-badge">2</span>
        <div>
          <h2>市场数据</h2>
          <p>FRED 日频源抽样快照，以 2026-03-02 为 0% 对齐比较</p>
        </div>
      </div>
      {compact ? null : <MarketComparisonChart series={visibleSeries} />}
      {compact ? null : (
        <div className="market-read">
          <span>market read</span>
          <strong>Oil/VIX 的同步上行支持 risk premium；SPX 和 Broad USD 尚未显示 closure base-case。</strong>
          <p>结论口径：市场页只回答“是否已定价风险”，不生成新的 scenario judgement。</p>
        </div>
      )}
      {compact ? (
        <div className="market-summary-grid">
          {visibleSeries.map((series) => (
            <MarketSeriesCard key={series.id} series={series} />
          ))}
        </div>
      ) : (
        <div className="market-group-grid">
          {marketGroups.map((group) => (
            <section className="market-group" key={group.label}>
              <h3>{group.label}</h3>
              <div className="market-summary-grid grouped">
                {visibleSeries
                  .filter((series) => group.ids.includes(series.id))
                  .map((series) => (
                    <MarketSeriesCard key={series.id} series={series} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <div className="panel-footer-note">
        数据源：FRED（DCOILBRENTEU、DCOILWTICO、VIXCLS、DTWEXBGS、DGS10、SP500）。大图显示相对变化，不改变各序列原始单位；Gold 与 AIS 船数处于“待接入”状态，不参与结论判断。
      </div>
    </section>
  );
}

function CaseMap({
  selectedEventId,
  selectedScenario,
  detail = false,
}: {
  selectedEventId: string;
  selectedScenario: Scenario;
  detail?: boolean;
}) {
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0];
  return (
    <section className={`case-map ${detail ? "detail" : ""}`}>
      <svg className="clean-map" viewBox="0 0 1000 560" role="img" aria-label="霍尔木兹态势示意图">
        <defs>
          <linearGradient id="waterGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#0d3e50" />
            <stop offset="58%" stopColor="#092335" />
            <stop offset="100%" stopColor="#06111b" />
          </linearGradient>
          <linearGradient id="landGradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#243846" />
            <stop offset="100%" stopColor="#182633" />
          </linearGradient>
        </defs>
        <rect width="1000" height="560" fill="url(#waterGradient)" />
        <g className="map-grid-lines">
          {Array.from({ length: 13 }).map((_, index) => (
            <line key={`v-${index}`} x1={index * 84} x2={index * 84} y1="0" y2="560" />
          ))}
          {Array.from({ length: 8 }).map((_, index) => (
            <line key={`h-${index}`} x1="0" x2="1000" y1={index * 80} y2={index * 80} />
          ))}
        </g>
        <g>
          {mapCountries.flatMap((country) =>
            country.rings.map((ring, index) => (
              <path
                className="land-mass"
                d={toPath(ring, true)}
                key={`${country.name}-${index}`}
              />
            )),
          )}
        </g>
        <g>
          {shippingLanes.map((lane) => (
            <path
              className={`traffic-route ${lane.laneClass}`}
              d={toPath(lane.coordinates)}
              key={lane.id}
            />
          ))}
        </g>
        <circle className="route-node" cx={projectPoint({ lon: 56.7, lat: 26.37 })[0]} cy={projectPoint({ lon: 56.7, lat: 26.37 })[1]} r="9" />
        <circle className="route-node alert" cx={projectPoint({ lon: 57.46, lat: 25.46 })[0]} cy={projectPoint({ lon: 57.46, lat: 25.46 })[1]} r="10" />
        <text className="map-label" x="98" y="115">波斯湾</text>
        <text className="map-label small" x="616" y="278">霍尔木兹海峡</text>
        <text className="map-label small" x="710" y="430">阿曼湾</text>
      </svg>
      <div className="map-pin gulf">
        <Anchor size={16} />
      </div>
      <div className="map-pin hormuz">
        <Radar size={16} />
      </div>
      <div className="map-pin oman">
        <Ship size={16} />
      </div>
      <div className="map-overlay top-left">
        <span>案例工作台（case room）</span>
        <strong>霍尔木兹海峡</strong>
        <p>Natural Earth 边界 + Global Shipping Lanes 航线子集。</p>
      </div>
      <div className="map-overlay bottom-left">
        <small>选中信号</small>
        <strong>{selectedEvent.title}</strong>
        <p>{selectedEvent.summary}</p>
      </div>
      <div className="map-overlay bottom-right">
        <small>主情景</small>
        <strong>{selectedScenario.label}</strong>
        <p>{selectedScenario.posture}</p>
      </div>
      {detail ? (
        <div className="map-source-card">
          <strong>数据来源</strong>
          <p>国家边界来自 Natural Earth 110m；航线来自 Global Shipping Lanes v1 public GeoJSON，并裁剪到 Hormuz 周边。</p>
        </div>
      ) : null}
    </section>
  );
}

function ExecutiveBriefPanel({
  brief,
  checkpoint,
  selectedScenario,
  scenarios,
}: {
  brief: DailyBrief;
  checkpoint: Checkpoint;
  selectedScenario: Scenario;
  scenarios: ScenarioView[];
}) {
  const visibleScenarios = [...scenarios].sort(
    (left, right) => right.probability - left.probability,
  );
  const nextWatch = checkpoint.unresolvedConcerns[0] ?? brief.anomalies[1];

  return (
    <section className="panel executive-panel">
      <div className="panel-title compact">
        <span className="icon-chip">
          <ShieldAlert size={18} />
        </span>
        <div>
          <h2>当前评估</h2>
          <p>结论、概率和证据放在同一屏判断</p>
        </div>
      </div>
      <div className="executive-main">
        <span>风险态势</span>
        <strong>{selectedScenario.label}</strong>
        <p>{selectedScenario.posture}</p>
      </div>
      <div className="probability-stack" aria-label="情景概率分布">
        {visibleScenarios.map((scenario) => (
          <div className="probability-row" key={scenario.id}>
            <span>{scenario.label}</span>
            <b>{scenario.probability}%</b>
            <i>
              <em style={{ width: `${scenario.probability}%`, background: scenario.color }} />
            </i>
          </div>
        ))}
      </div>
      <div className="evidence-brief">
        <h3>关键证据</h3>
        <ul>
          {checkpoint.keyEvidence.slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="next-watch">
        <span>下一步观察</span>
        <p>{nextWatch}</p>
      </div>
    </section>
  );
}

function OverviewPage({
  brief,
  selectedEventId,
  selectedScenario,
  scenarios,
  selectedCheckpoint,
  onSelectEvent,
}: {
  brief: DailyBrief;
  selectedEventId: string;
  selectedScenario: Scenario;
  scenarios: ScenarioView[];
  selectedCheckpoint: Checkpoint;
  onSelectEvent: (eventId: string) => void;
}) {
  return (
    <>
      <section className="decision-grid overview-decision-grid">
        <section className="map-column">
          <CaseMap
            selectedEventId={selectedEventId}
            selectedScenario={selectedScenario}
          />
          <FlowMetrics />
          <Timeline
            compact
            selectedEventId={selectedEventId}
            onSelectEvent={onSelectEvent}
          />
        </section>

        <aside className="forecast-column">
          <ExecutiveBriefPanel
            brief={brief}
            checkpoint={selectedCheckpoint}
            scenarios={scenarios}
            selectedScenario={selectedScenario}
          />
        </aside>
      </section>
    </>
  );
}

function MapPage({
  selectedEventId,
  selectedScenario,
}: {
  selectedEventId: string;
  selectedScenario: Scenario;
}) {
  return (
    <section className="detail-layout">
      <CaseMap detail selectedEventId={selectedEventId} selectedScenario={selectedScenario} />
      <section className="panel route-detail-panel">
        <div className="panel-title">
          <span className="step-badge">R</span>
          <div>
            <h2>航线数据层</h2>
            <p>公开航线数据不是实时 AIS，但比手绘路径更可复现</p>
          </div>
        </div>
        <div className="route-detail-list">
          {shippingLanes.map((lane) => (
            <article key={lane.id}>
              <strong>{lane.label}</strong>
              <span>{lane.coordinates.length} points · {lane.source}</span>
            </article>
          ))}
        </div>
      </section>
      <SourceRegistryPanel group="map" />
      <SourceRegistryPanel group="flow" />
    </section>
  );
}

function MarketPage() {
  return (
    <section className="detail-layout">
      <MarketDataPanel />
    </section>
  );
}

function ForecastPage({
  agentRunState,
  forecastRun,
  selectedTarget,
  onSelectTarget,
  onRunForecast,
  isRunning,
}: {
  agentRunState: AgentRunState;
  forecastRun: ForecastRunResponse;
  selectedTarget: ForecastTarget;
  onSelectTarget: (target: ForecastTarget) => void;
  onRunForecast: () => void;
  isRunning: boolean;
}) {
  const completionPercent = Math.min(
    100,
    (agentRunState.visibleEventCount / Math.max(forecastRun.events.length, 1)) * 100,
  );

  return (
    <section className="forecast-workspace">
      <section className="panel research-panel">
        <div className="research-head">
          <div>
            <span>event-driven research stream</span>
            <h2>Forecast revision</h2>
            <p>Forecast 页只消费 AgentRunEvent[]：source、evidence、judgement、checkpoint 都来自同一 run。</p>
          </div>
          <div className="forecast-controls">
            <label className="prediction-select">
              <span>预测目标</span>
              <select
                aria-label="Forecast target"
                value={selectedTarget}
                onChange={(event) => onSelectTarget(event.target.value as ForecastTarget)}
              >
                <optgroup label="Assets">
                  {forecastTargetOptions
                    .filter((option) => option.group === "assets")
                    .map((option) => (
                      <option key={option.target} value={option.target}>
                        {option.label}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="War trend">
                  {forecastTargetOptions
                    .filter((option) => option.group === "war_trend")
                    .map((option) => (
                      <option key={option.target} value={option.target}>
                        {option.label}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
            <button
              className="primary-action research-run"
              type="button"
              onClick={onRunForecast}
              disabled={isRunning}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="spin" size={17} />
                  运行中
                </>
              ) : (
                <>
                  <Sparkles size={17} />
                  运行研究
                </>
              )}
            </button>
          </div>
        </div>
        <div className="research-progress">
          <span className={`live-dot ${agentRunState.running ? "running" : ""}`} />
          <strong>
            {agentRunState.running
              ? agentRunState.liveSummary
              : agentRunState.completed
                ? "本轮研究完成"
                : "等待开始"}
          </strong>
          <i>
            <em style={{ width: `${completionPercent}%` }} />
          </i>
        </div>
        <ResearchStream
          events={forecastRun.events}
          visibleCount={agentRunState.visibleEventCount}
          isRunning={isRunning}
          sourceRegistry={sourceRegistry}
          scenarioLabels={forecastScenarioLabel}
        />
        <div className="research-latest-log">
          <span>live state</span>
          <p>{agentRunState.liveSummary}</p>
        </div>
      </section>
      <section className="research-layout">
        <JudgementDeltaCard
          forecastRun={forecastRun}
          selectedTarget={selectedTarget}
          scenarioLabels={forecastScenarioLabel}
        />
        <CheckpointCard checkpoint={forecastRun.checkpoint} />
      </section>
    </section>
  );
}

function App() {
  const [selectedEventId, setSelectedEventId] = useState(events[0].id);
  const [selectedTarget, setSelectedTarget] = useState<ForecastTarget>("brent");
  const [forecastRun, setForecastRun] = useState<ForecastRunResponse>(initialForecastRun);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState(checkpoints[1].id);
  const [lastRunNote, setLastRunNote] = useState("");
  const [dailyIndex, setDailyIndex] = useState(dailyBriefs.length - 1);
  const [refreshingDaily, setRefreshingDaily] = useState(false);
  const [activePage, setActivePage] = useState<DetailPage["id"]>("overview");
  const [agentRunState, setAgentRunState] = useState<AgentRunState>({
    visibleEventCount: 0,
    liveSummary: "就绪：等待 Agent 运行。",
    running: false,
    completed: false,
  });

  const selectedCheckpoint =
    checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ??
    checkpoints[1];
  const scenarios = buildScenarioViews(baseScenarios, selectedCheckpoint.probabilities);
  const selectedScenario =
    scenarios.find((scenario) => scenario.id === selectedCheckpoint.forecast) ?? scenarios[1];
  const currentBrief = dailyBriefs[dailyIndex];

  const handleRunForecast = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setAgentRunState({
      visibleEventCount: 0,
      liveSummary: `Agent 启动：检查 ${targetLabel[selectedTarget]} 与时间窗口。`,
      running: true,
      completed: false,
    });

    const result = await runForecast(selectedTarget);
    setForecastRun(result);

    for (let index = 0; index < result.events.length; index += 1) {
      const event = result.events[index];
      setAgentRunState({
        visibleEventCount: index + 1,
        liveSummary: `${getRunEventTitle(event.type)}：${event.title}`,
        running: true,
        completed: false,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 520));
    }
    setSelectedCheckpointId(
      checkpoints.find((checkpoint) => checkpoint.id === result.checkpoint.checkpointId)?.id ??
        checkpoints[1].id,
    );
    setLastRunNote(result.checkpoint.revisionReason);
    setAgentRunState({
      visibleEventCount: result.events.length,
      liveSummary: "已写入 checkpoint：情景概率、证据轨迹和下一步观察已更新。",
      running: false,
      completed: true,
    });
    setIsRunning(false);
  };

  const handleDailyRefresh = () => {
    if (refreshingDaily || isRunning) return;
    setRefreshingDaily(true);
    setAgentRunState({
      visibleEventCount: 1,
      liveSummary: "每日刷新开始：检查 fixed-source bundle。",
      running: true,
      completed: false,
    });
    window.setTimeout(() => {
      setDailyIndex(dailyBriefs.length - 1);
      setSelectedCheckpointId(checkpoints[1].id);
      setForecastRun(initialForecastRun);
      setLastRunNote(
        "每日刷新：已检查固定信源 bundle，并保留当前预测轨迹。",
      );
      setAgentRunState({
        visibleEventCount: 3,
        liveSummary: "未发现新的封锁级别证据；保留可控扰动作为主情景。",
        running: false,
        completed: false,
      });
      setRefreshingDaily(false);
    }, 650);
  };

  return (
    <main className="app-shell">
      <CommandBar
        brief={currentBrief}
        checkpoint={selectedCheckpoint}
        onRefresh={handleDailyRefresh}
        isRunning={isRunning}
        refreshing={refreshingDaily}
        lastRunNote={lastRunNote}
      />

      <section className="workspace-toolbar" aria-label="工作区控制">
        <SourceRail />
        <PageTabs activePage={activePage} onSelectPage={setActivePage} />
      </section>

      {activePage === "overview" ? (
        <OverviewPage
          brief={currentBrief}
          selectedEventId={selectedEventId}
          selectedScenario={selectedScenario}
          scenarios={scenarios}
          selectedCheckpoint={selectedCheckpoint}
          onSelectEvent={setSelectedEventId}
        />
      ) : null}

      {activePage === "map" ? (
        <MapPage
          selectedEventId={selectedEventId}
          selectedScenario={selectedScenario}
        />
      ) : null}

      {activePage === "market" ? <MarketPage /> : null}

      {activePage === "forecast" ? (
        <ForecastPage
          agentRunState={agentRunState}
          forecastRun={forecastRun}
          selectedTarget={selectedTarget}
          onSelectTarget={setSelectedTarget}
          onRunForecast={handleRunForecast}
          isRunning={isRunning}
        />
      ) : null}
    </main>
  );
}

export default App;
