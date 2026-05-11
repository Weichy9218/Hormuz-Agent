// Main reviewer-console interface for the Hormuz forecasting workflow.
import { useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bell,
  Box,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Gauge,
  Info,
  LineChart,
  RefreshCw,
  ShieldCheck,
  Ship,
  Target,
  TrendingUp,
  UserCircle,
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
  mapCountries,
  marketRead,
  marketSeries,
  shippingLanes,
  sourceRegistry,
  sourceGroups,
} from "./data";
import { runForecast } from "./forecastClient";
import {
  forecastTargetOptions,
  initialForecastRun,
  scenarioColor,
  scenarioLabel as forecastScenarioLabel,
  scenarioOrder,
  targetLabel,
} from "./state/forecastStore";
import type {
  Checkpoint,
  CoordinatePoint,
  DailyBrief,
  DetailPage,
  MarketSeries,
  Scenario,
} from "./types";
import type {
  ForecastRunResponse,
  ForecastTarget,
  ScenarioKey,
  TargetForecast,
} from "./types/forecast";
import type { AgentRunEvent } from "./types/agentEvents";

const pageIcon: Record<DetailPage["id"], typeof Gauge> = {
  overview: Gauge,
  market: BarChart3,
  forecast: Activity,
};

const riskLevelLabel: Record<DailyBrief["riskLevel"], string> = {
  normal: "Normal",
  elevated: "Elevated",
  critical: "Critical",
};

const scenarioEnglishLabel: Record<ScenarioKey, string> = {
  normal: "Normal",
  controlled: "Controlled disruption",
  severe: "Severe disruption",
  closure: "Closure",
};

const marketGroups: Array<{ label: string; ids: string[]; icon: typeof Gauge }> = [
  { label: "Energy", ids: ["brent-spot", "wti-spot"], icon: Waves },
  {
    label: "Safe haven / FX",
    ids: ["gold-pending", "broad-usd", "usd-cny", "usd-cnh-pending"],
    icon: ShieldCheck,
  },
  { label: "Risk / rates / vol", ids: ["vix", "us10y", "sp500"], icon: Activity },
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

function findJudgementEvent(eventsList: AgentRunEvent[]) {
  return eventsList.find(
    (event): event is Extract<AgentRunEvent, { type: "judgement_updated" }> =>
      event.type === "judgement_updated",
  );
}

function getScenarioProbability(scenarios: ScenarioView[], scenarioId: ScenarioKey) {
  return scenarios.find((scenario) => scenario.id === scenarioId)?.probability ?? 0;
}

function formatMarketValue(series: MarketSeries, value: number) {
  if (series.pending) return "Pending";
  const maximumFractionDigits =
    series.unit === "USD/bbl" || series.unit === "%" || series.unit === "CNY"
      ? 2
      : 1;
  const formatted = value.toLocaleString("en-US", { maximumFractionDigits });
  return `${formatted}${series.unit === "%" ? "%" : ""}`;
}

function getMarketChange(series: MarketSeries) {
  if (series.pending || series.points.length === 0) {
    return {
      first: { date: "pending", value: 0 },
      last: { date: "pending", value: 0 },
      absolute: 0,
      percent: 0,
      display: "pending",
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

function directionIcon(direction: TargetForecast["direction"]) {
  if (direction === "up") return <ArrowUp size={15} />;
  if (direction === "down") return <ArrowDown size={15} />;
  return <ArrowRight size={15} />;
}

function InfoTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="info-title">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <Info size={15} />
    </div>
  );
}

function AppHeader({
  activePage,
  onSelectPage,
  checkpoint,
  onRefresh,
  refreshing,
  isRunning,
}: {
  activePage: DetailPage["id"];
  onSelectPage: (page: DetailPage["id"]) => void;
  checkpoint: Checkpoint;
  onRefresh: () => void;
  refreshing: boolean;
  isRunning: boolean;
}) {
  return (
    <header className="app-header">
      <div className="brand-mark" aria-label="Hormuz Risk Intelligence Interface">
        <span className="logo-cube">
          <Box size={22} />
        </span>
        <strong>Hormuz Risk Intelligence Interface</strong>
      </div>

      <span className="base-case-badge">Base case: {scenarioEnglishLabel[checkpoint.forecast]}</span>

      <nav className="page-tabs" aria-label="Workspace pages">
        {detailPages.map((page) => {
          const Icon = pageIcon[page.id];
          return (
            <button
              className={page.id === activePage ? "selected" : ""}
              key={page.id}
              onClick={() => onSelectPage(page.id)}
              type="button"
            >
              <Icon size={15} />
              <span>{page.label === "概览" ? "Overview" : page.label === "市场" ? "Market" : "Forecast"}</span>
            </button>
          );
        })}
      </nav>

      <div className="header-actions">
        <button
          aria-label="Refresh daily bundle"
          disabled={refreshing || isRunning}
          onClick={onRefresh}
          title="Refresh daily bundle"
          type="button"
        >
          <RefreshCw className={refreshing ? "spin" : ""} size={19} />
        </button>
        <button aria-label="Notifications" type="button">
          <Bell size={20} />
        </button>
        <button aria-label="Help" type="button">
          <CircleHelp size={20} />
        </button>
        <button aria-label="User" type="button">
          <UserCircle size={22} />
        </button>
      </div>
    </header>
  );
}

function ScenarioProbabilityRail({ scenarios }: { scenarios: ScenarioView[] }) {
  const orderedScenarios = scenarioOrder.map(
    (scenarioId) => scenarios.find((scenario) => scenario.id === scenarioId)!,
  );

  return (
    <div className="scenario-rail" aria-label="Scenario probabilities">
      <div className="scenario-axis" />
      {orderedScenarios.map((scenario) => (
        <article className="scenario-tick" key={scenario.id}>
          <span>{scenarioEnglishLabel[scenario.id]}</span>
          <i style={{ backgroundColor: scenario.color }} />
          <strong style={{ color: scenario.color }}>{scenario.probability}%</strong>
        </article>
      ))}
    </div>
  );
}

function DonutGauge({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="donut-gauge"
      aria-label={`${value}%`}
      style={{
        background: `conic-gradient(${color} ${value * 3.6}deg, #d8dee8 0deg)`,
      }}
    >
      <span />
    </div>
  );
}

function MiniBars({ activeIndex = 5 }: { activeIndex?: number }) {
  return (
    <div className="mini-bars" aria-hidden="true">
      {[20, 38, 40, 58, 86].map((height, index) => (
        <span
          className={index === activeIndex - 1 ? "active" : ""}
          key={`${height}-${index}`}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

function ScenarioSideCard({ scenarios }: { scenarios: ScenarioView[] }) {
  return (
    <section className="console-card side-card scenario-side-card">
      <InfoTitle title="Current scenario" />
      <div className="side-scenario-list">
        {scenarioOrder.map((scenarioId) => {
          const scenario = scenarios.find((item) => item.id === scenarioId)!;
          return (
            <article key={scenarioId}>
              <span>
                <i style={{ backgroundColor: scenario.color }} />
                {scenarioEnglishLabel[scenarioId]}
              </span>
              <b>{scenario.probability}%</b>
              <em>
                <small style={{ width: `${scenario.probability}%`, backgroundColor: scenario.color }} />
              </em>
            </article>
          );
        })}
      </div>
      <div className="side-total">
        <span>Total</span>
        <b>100%</b>
      </div>
    </section>
  );
}

function CrossAssetSideCard({ forecasts }: { forecasts: TargetForecast[] }) {
  const assets = forecasts.filter((forecast) =>
    ["brent", "gold", "broad_usd", "usd_cny", "vix", "us10y", "sp500"].includes(forecast.target),
  );

  return (
    <section className="console-card side-card asset-side-card">
      <InfoTitle title="Cross-asset view" />
      <div className="asset-direction-grid">
        {assets.slice(0, 7).map((forecast) => (
          <article className={forecast.direction} key={forecast.target}>
            <span>{targetLabel[forecast.target]}</span>
            {directionIcon(forecast.direction)}
          </article>
        ))}
      </div>
    </section>
  );
}

function WatchCard({ nextWatch }: { nextWatch: string[] }) {
  return (
    <section className="console-card side-card watch-card">
      <InfoTitle title="Next watch" />
      <ul>
        {nextWatch.slice(0, 3).map((watch) => (
          <li key={watch}>{watch}</li>
        ))}
      </ul>
    </section>
  );
}

function StatusCard({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: typeof Gauge;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="console-card status-card">
      <span className="icon-well">
        <Icon size={27} />
      </span>
      <div>
        <InfoTitle title={title} />
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function CaseMap({
  selectedEventId,
  selectedScenario,
  compact = false,
}: {
  selectedEventId: string;
  selectedScenario: Scenario;
  compact?: boolean;
}) {
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0];

  return (
    <section className={`console-card case-map ${compact ? "compact" : ""}`}>
      <div className="map-card-heading">
        <InfoTitle title={compact ? "Region" : "Case boundary"} subtitle={compact ? undefined : "Hormuz region"} />
      </div>
      <svg className="clean-map" viewBox="0 0 1000 560" role="img" aria-label="Hormuz region context map">
        <defs>
          <linearGradient id="waterGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#eff7ff" />
            <stop offset="58%" stopColor="#dcefff" />
            <stop offset="100%" stopColor="#eef8ff" />
          </linearGradient>
          <linearGradient id="landGradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#fbfaf7" />
            <stop offset="100%" stopColor="#f2f5f8" />
          </linearGradient>
          <marker id="routeArrow" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="3">
            <path d="M0,0 L0,6 L7,3 z" fill="#0b66f6" />
          </marker>
        </defs>
        <rect width="1000" height="560" fill="url(#waterGradient)" />
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
              markerEnd="url(#routeArrow)"
            />
          ))}
        </g>
        <text className="map-label country" x="458" y="116">Iran</text>
        <text className="map-label country" x="300" y="506">UAE</text>
        <text className="map-label country" x="646" y="500">Oman</text>
        <text className="map-label strait" x="508" y="340">Strait of</text>
        <text className="map-label strait" x="508" y="388">Hormuz</text>
      </svg>
      {compact ? null : (
        <p className="map-caption">
          {selectedScenario.label}: {selectedEvent.effect}
        </p>
      )}
    </section>
  );
}

function MarketComparisonChart({ series }: { series: MarketSeries[] }) {
  const chartSeries = series.filter((item) => !item.pending && item.points.length > 0);
  const chartWidth = 1050;
  const chartHeight = 340;
  const plotLeft = 64;
  const plotRight = 28;
  const plotTop = 26;
  const plotBottom = 46;
  const plotWidth = chartWidth - plotLeft - plotRight;
  const plotHeight = chartHeight - plotTop - plotBottom;
  const normalized = chartSeries.map((item) => ({
    ...item,
    normalizedPoints: item.points.map((point, index) => {
      const baseline = item.points[0].value;
      return {
        date: point.date,
        value: (point.value / baseline - 1) * 100,
        index,
      };
    }),
  }));
  const allValues = normalized.flatMap((item) =>
    item.normalizedPoints.map((point) => point.value),
  );
  const maxAbsChange = Math.max(...allValues.map((value) => Math.abs(value)), 10);
  const yLimit = Math.ceil((maxAbsChange * 1.12) / 10) * 10;
  const yMin = -yLimit;
  const yMax = yLimit;
  const yTicks = [-yLimit, -yLimit / 2, 0, yLimit / 2, yLimit];
  const anchorSeries = chartSeries[0];
  const anchorDates = anchorSeries
    ? [
        anchorSeries.points[0],
        anchorSeries.points[Math.floor((anchorSeries.points.length - 1) / 2)],
        anchorSeries.points.at(-1) ?? anchorSeries.points[0],
      ]
    : [];

  const getX = (index: number, length: number) =>
    plotLeft + (index / Math.max(length - 1, 1)) * plotWidth;
  const getY = (value: number) =>
    plotTop + (1 - (value - yMin) / Math.max(yMax - yMin, 1)) * plotHeight;

  return (
    <section className="console-card market-chart-card" aria-label="Normalized cross-asset move">
      <div className="chart-card-head">
        <InfoTitle title="Normalized cross-asset move" subtitle="Relative to first observation" />
        <div className="range-tabs" aria-label="Time range">
          {["1D", "5D", "1M", "YTD"].map((range) => (
            <button className={range === "1D" ? "selected" : ""} key={range} type="button">
              {range}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-layout">
        <svg
          className="market-comparison-chart"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-label="Brent, WTI, VIX, dollar, rates, and S&P 500 normalized move"
        >
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
                  ? Math.floor((anchorSeries!.points.length - 1) / 2)
                  : anchorSeries!.points.length - 1,
              anchorSeries!.points.length,
            );
            return (
              <g className="market-x-tick" key={`${point.date}-${index}`}>
                <text x={x} y={chartHeight - 14}>
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
            return (
              <path
                className="market-line"
                d={path}
                key={item.id}
                style={{ stroke: item.color }}
              />
            );
          })}
        </svg>
        <div className="market-legend">
          {series.map((item) => {
            const change = getMarketChange(item);
            const trendClass = item.pending
              ? "pending"
              : change.percent >= 0
                ? "positive"
                : "negative";
            return (
              <span key={item.id}>
                <i style={{ background: item.color }} />
                {item.label}
                <b className={trendClass}>
                  {item.pending
                    ? "pending"
                    : `${change.percent >= 0 ? "+" : ""}${change.percent.toFixed(1)}%`}
                </b>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MarketSeriesRow({ series }: { series: MarketSeries }) {
  const change = getMarketChange(series);
  const trendClass = series.pending ? "pending" : change.percent >= 0 ? "positive" : "negative";

  return (
    <article className="market-series-row">
      <span>{series.label}</span>
      <b>{formatMarketValue(series, change.last.value)}</b>
      <em className={trendClass}>
        {series.pending ? "pending" : change.display}
        {series.pending ? null : change.percent >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
      </em>
    </article>
  );
}

function MarketGroupCard({
  label,
  ids,
  icon: Icon,
  series,
}: {
  label: string;
  ids: string[];
  icon: typeof Gauge;
  series: MarketSeries[];
}) {
  const groupSeries = series.filter((item) => ids.includes(item.id));

  return (
    <section className="console-card market-group-card">
      <div className="group-card-head">
        <Icon size={23} />
        <h3>{label}</h3>
        <span>Last</span>
        <span>Move</span>
      </div>
      <div className="market-series-list">
        {groupSeries.map((item) => (
          <MarketSeriesRow key={item.id} series={item} />
        ))}
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
}: {
  brief: DailyBrief;
  selectedEventId: string;
  selectedScenario: Scenario;
  scenarios: ScenarioView[];
  selectedCheckpoint: Checkpoint;
}) {
  const selectedProbability = getScenarioProbability(scenarios, selectedCheckpoint.forecast);
  const pendingSources = sourceGroups.filter((source) => source.status === "pending").length;

  return (
    <section className="page-grid overview-page">
      <section className="console-card judgement-hero-card">
        <InfoTitle title="Current judgement" />
        <strong>{scenarioEnglishLabel[selectedCheckpoint.forecast]}</strong>
        <b>{selectedProbability}%</b>
        <p>Base case remains disruption, not full closure.</p>
      </section>

      <section className="console-card scenario-card">
        <InfoTitle title="Scenario probabilities" />
        <ScenarioProbabilityRail scenarios={scenarios} />
      </section>

      <div className="overview-side-stack">
        <section className="console-card compact-list-card">
          <InfoTitle title="Why not closure?" />
          <ul>
            {selectedCheckpoint.counterevidence.slice(0, 1).map((item) => (
              <li key={item}>{item}</li>
            ))}
            <li>No confirmed sustained blockade or verified flow stop.</li>
            <li>Market pricing shows risk premium, not panic.</li>
          </ul>
        </section>
        <section className="console-card compact-list-card">
          <InfoTitle title="Next watch" />
          <ul>
            {selectedCheckpoint.unresolvedConcerns.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <CaseMap selectedEventId={selectedEventId} selectedScenario={selectedScenario} />

      <div className="status-row">
        <StatusCard
          icon={Ship}
          title="Maritime status"
          value={riskLevelLabel[brief.riskLevel]}
          detail="Increased caution in the region"
        />
        <StatusCard
          icon={ShieldCheck}
          title="Cross-asset read"
          value="Supports risk premium"
          detail={marketRead.summary}
        />
        <StatusCard
          icon={RefreshCw}
          title="Source freshness"
          value={`Fresh bundle, ${pendingSources} pending`}
          detail="Official, energy, and FRED market sources checked"
        />
      </div>

      <section className="console-card checkpoint-strip">
        <span className="icon-well">
          <ClipboardCheck size={25} />
        </span>
        <div>
          <InfoTitle title="Current checkpoint" />
          <p>{selectedCheckpoint.revision}</p>
        </div>
        <b>Checkpoint ID: {selectedCheckpoint.id.toUpperCase()}</b>
      </section>
    </section>
  );
}

function MarketPage() {
  const liveSeries = marketSeries.filter((series) => !series.pending && series.points.length > 0);

  return (
    <section className="page-grid market-page">
      <StatusCard
        icon={BarChart3}
        title="Market read"
        value="Controlled disruption premium"
        detail={marketRead.summary}
      />
      <StatusCard
        icon={Target}
        title="Signal strength"
        value="Moderate support"
        detail="Supports disruption risk, not closure base case"
      />
      <StatusCard
        icon={Clock3}
        title="As of"
        value="2026-05-10"
        detail="Cross-asset FRED snapshot"
      />

      <MarketComparisonChart series={liveSeries} />

      <div className="market-groups">
        {marketGroups.map((group) => (
          <MarketGroupCard
            icon={group.icon}
            ids={group.ids}
            key={group.label}
            label={group.label}
            series={marketSeries}
          />
        ))}
      </div>

      <section className="console-card how-read-card">
        <span className="icon-well">
          <CircleHelp size={25} />
        </span>
        <strong>How to read this</strong>
        <p>{marketRead.summary}</p>
      </section>
    </section>
  );
}

function ReasoningGraph() {
  const nodes = [
    { label: "Maritime advisory", icon: Ship },
    { label: "Transit risk up", icon: ShieldCheck },
    { label: "Scenario update", icon: BarChart3 },
    { label: "Asset view", icon: LineChart },
  ];

  return (
    <section className="console-card reasoning-graph-card">
      <InfoTitle title="Agent reasoning graph" subtitle="Product explanation graph" />
      <div className="reasoning-graph">
        {nodes.map((node, index) => {
          const Icon = node.icon;
          return (
            <div className="reasoning-node-wrap" key={node.label}>
              <article className="reasoning-node">
                <Icon size={27} />
                <strong>{node.label}</strong>
              </article>
              {index < nodes.length - 1 ? <ArrowRight className="reasoning-arrow" size={32} /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ForecastSummaryCards({
  forecastRun,
  scenarios,
  selectedCheckpoint,
  selectedEventId,
  selectedScenario,
}: {
  forecastRun: ForecastRunResponse;
  scenarios: ScenarioView[];
  selectedCheckpoint: Checkpoint;
  selectedEventId: string;
  selectedScenario: Scenario;
}) {
  const selectedProbability = getScenarioProbability(scenarios, selectedCheckpoint.forecast);
  const judgementEvent = findJudgementEvent(forecastRun.events);
  const largestDelta = judgementEvent
    ? Object.entries(judgementEvent.scenarioDelta).reduce(
        (best, [scenario, delta]) =>
          Math.abs(delta ?? 0) > Math.abs(best.delta)
            ? { scenario: scenario as ScenarioKey, delta: delta ?? 0 }
            : best,
        { scenario: "controlled" as ScenarioKey, delta: 0 },
      )
    : { scenario: "controlled" as ScenarioKey, delta: 0 };

  return (
    <section className="forecast-summary-grid">
      <section className="console-card forecast-summary-card judgement">
        <InfoTitle title="Current judgement" />
        <div>
          <strong>{scenarioEnglishLabel[selectedCheckpoint.forecast]}</strong>
          <b>{selectedProbability}%</b>
          <p>Updated after fixed-source bundle review</p>
        </div>
        <DonutGauge value={selectedProbability} color={scenarioColor[selectedCheckpoint.forecast]} />
      </section>

      <section className="console-card forecast-summary-card">
        <InfoTitle title="Largest delta" />
        <strong>{largestDelta.delta > 0 ? "+" : ""}{largestDelta.delta} pp</strong>
        <p>{scenarioEnglishLabel[largestDelta.scenario]} vs prior</p>
        <MiniBars />
      </section>

      <section className="console-card forecast-summary-card">
        <InfoTitle title="Market read" />
        <p>{marketRead.summary}</p>
        <small>Cross-asset read · fixed source snapshot</small>
      </section>

      <CaseMap compact selectedEventId={selectedEventId} selectedScenario={selectedScenario} />
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
  selectedCheckpoint,
  selectedEventId,
  selectedScenario,
  scenarios,
}: {
  agentRunState: AgentRunState;
  forecastRun: ForecastRunResponse;
  selectedTarget: ForecastTarget;
  onSelectTarget: (target: ForecastTarget) => void;
  onRunForecast: () => void;
  isRunning: boolean;
  selectedCheckpoint: Checkpoint;
  selectedEventId: string;
  selectedScenario: Scenario;
  scenarios: ScenarioView[];
}) {
  const completionPercent = Math.min(
    100,
    (agentRunState.visibleEventCount / Math.max(forecastRun.events.length, 1)) * 100,
  );

  return (
    <section className="page-grid forecast-page">
      <ForecastSummaryCards
        forecastRun={forecastRun}
        scenarios={scenarios}
        selectedCheckpoint={selectedCheckpoint}
        selectedEventId={selectedEventId}
        selectedScenario={selectedScenario}
      />

      <section className="forecast-main-grid">
        <main className="forecast-main-column">
          <ReasoningGraph />

          <section className="console-card research-panel">
            <div className="research-head">
              <div>
                <InfoTitle
                  title="Why did the agent revise its judgement?"
                  subtitle="Event-driven research stream"
                />
                <p>{agentRunState.liveSummary}</p>
              </div>
              <div className="forecast-controls">
                <label className="prediction-select">
                  <span>Forecast target</span>
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
                    <optgroup label="Risk targets">
                      {forecastTargetOptions
                        .filter((option) => option.group === "risk_targets")
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
                      Running
                    </>
                  ) : (
                    <>
                      <TrendingUp size={17} />
                      Run update
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
                    ? "Run complete"
                    : "Ready"}
              </strong>
              <i>
                <em style={{ width: `${completionPercent}%` }} />
              </i>
            </div>
            <div className="research-stream-scroll">
              <ResearchStream
                events={forecastRun.events}
                visibleCount={agentRunState.visibleEventCount}
                isRunning={isRunning}
                sourceRegistry={sourceRegistry}
                scenarioLabels={forecastScenarioLabel}
              />
            </div>
          </section>
        </main>

        <aside className="forecast-side-column">
          <ScenarioSideCard scenarios={scenarios} />
          <CrossAssetSideCard forecasts={forecastRun.targetForecasts} />
          <WatchCard nextWatch={forecastRun.checkpoint.nextWatch} />
          <JudgementDeltaCard
            forecastRun={forecastRun}
            selectedTarget={selectedTarget}
            scenarioLabels={forecastScenarioLabel}
          />
          <CheckpointCard checkpoint={forecastRun.checkpoint} />
        </aside>
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
  const [dailyIndex, setDailyIndex] = useState(dailyBriefs.length - 1);
  const [refreshingDaily, setRefreshingDaily] = useState(false);
  const [activePage, setActivePage] = useState<DetailPage["id"]>("overview");
  const [agentRunState, setAgentRunState] = useState<AgentRunState>({
    visibleEventCount: initialForecastRun.events.length,
    liveSummary: "Latest checkpoint loaded from fixed-source bundle.",
    running: false,
    completed: true,
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
      liveSummary: `Agent started: checking ${targetLabel[selectedTarget]} and fixed source bundle.`,
      running: true,
      completed: false,
    });

    const result = await runForecast(selectedTarget);
    setForecastRun(result);

    for (let index = 0; index < result.events.length; index += 1) {
      const event = result.events[index];
      setAgentRunState({
        visibleEventCount: index + 1,
        liveSummary: `${getRunEventTitle(event.type)}: ${event.title}`,
        running: true,
        completed: false,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 520));
    }
    setSelectedCheckpointId(
      checkpoints.find((checkpoint) => checkpoint.id === result.checkpoint.checkpointId)?.id ??
        checkpoints[1].id,
    );
    setAgentRunState({
      visibleEventCount: result.events.length,
      liveSummary: "Checkpoint saved with scenario probabilities, target deltas, and next watch.",
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
      liveSummary: "Daily refresh started: checking fixed-source bundle.",
      running: true,
      completed: false,
    });
    window.setTimeout(() => {
      setDailyIndex(dailyBriefs.length - 1);
      setSelectedCheckpointId(checkpoints[1].id);
      setForecastRun(initialForecastRun);
      setSelectedEventId(events[0].id);
      setAgentRunState({
        visibleEventCount: initialForecastRun.events.length,
        liveSummary: "No closure-level evidence found; controlled disruption remains base case.",
        running: false,
        completed: true,
      });
      setRefreshingDaily(false);
    }, 650);
  };

  return (
    <main className="app-shell">
      <AppHeader
        activePage={activePage}
        checkpoint={selectedCheckpoint}
        isRunning={isRunning}
        onRefresh={handleDailyRefresh}
        onSelectPage={setActivePage}
        refreshing={refreshingDaily}
      />

      {activePage === "overview" ? (
        <OverviewPage
          brief={currentBrief}
          selectedEventId={selectedEventId}
          selectedScenario={selectedScenario}
          scenarios={scenarios}
          selectedCheckpoint={selectedCheckpoint}
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
          selectedCheckpoint={selectedCheckpoint}
          selectedEventId={selectedEventId}
          selectedScenario={selectedScenario}
          scenarios={scenarios}
        />
      ) : null}
    </main>
  );
}

export default App;
