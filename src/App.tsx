// Main reviewer-console interface for the Hormuz forecasting workflow.
// All business state is consumed via projections; no page derives semantics itself.
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bell,
  Box,
  CircleHelp,
  Clock3,
  Gauge,
  Info,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  Ship,
  Sparkles,
  Target,
  UserCircle,
  Waves,
} from "lucide-react";
import { CheckpointCard } from "./components/forecast/CheckpointCard";
import { EvidenceGraph } from "./components/forecast/EvidenceGraph";
import { JudgementDeltaCard } from "./components/forecast/JudgementDeltaCard";
import { ResearchStream } from "./components/forecast/ResearchStream";
import {
  detailPages,
  mapCountries,
  marketSeries,
  narrativeEvents,
  shippingLanes,
  sourceBoundaryFacts,
  sourceGroups,
  sourceRegistry,
} from "./data";
import {
  forecastTargetOptions,
  scenarioColor,
  scenarioLabel,
  scenarioOrder,
  targetLabel,
} from "./state/forecastStore";
import {
  projectForecastState,
  projectMarketState,
  projectOverviewState,
} from "./state/projections";
import type {
  CoordinatePoint,
  DetailPage,
  MarketSeries,
  NarrativeEvent,
} from "./types";
import type {
  ForecastTarget,
  ScenarioId,
  TargetForecast,
} from "./types/forecast";

const pageIcon: Record<DetailPage["id"], typeof Gauge> = {
  overview: Gauge,
  market: BarChart3,
  news: Newspaper,
  forecast: Activity,
};

const pageLabel: Record<DetailPage["id"], string> = {
  overview: "总览",
  market: "市场",
  news: "事件",
  forecast: "预测",
};

const marketGroups: Array<{ label: string; ids: string[]; icon: typeof Gauge }> = [
  { label: "能源", ids: ["brent-spot", "wti-spot"], icon: Waves },
  {
    label: "避险 / FX",
    ids: ["gold-pending", "broad-usd", "usd-cny", "usd-cnh-pending"],
    icon: ShieldCheck,
  },
  { label: "风险 / 利率 / 波动", ids: ["vix", "us10y", "sp500"], icon: Activity },
];

const stressWindowStart = "2026-04-07";

const pricingPatternCopy: Record<string, string> = {
  not_pricing_hormuz: "市场未明显定价 Hormuz-specific risk",
  pricing_controlled_disruption: "市场正在定价可控扰动",
  pricing_severe_disruption: "市场正在定价严重扰动",
  pricing_closure_shock: "市场正在定价封锁冲击",
  mixed: "油价风险溢价仍在，但事件窗口压力回落",
};

const pricingPatternShortCopy: Record<string, string> = {
  not_pricing_hormuz: "未明显定价 Hormuz risk",
  pricing_controlled_disruption: "可控扰动定价",
  pricing_severe_disruption: "严重扰动定价",
  pricing_closure_shock: "封锁冲击定价",
  mixed: "混合信号",
};

const polarityCopy: Record<string, string> = {
  support: "支持",
  counter: "反证",
  uncertain: "不确定",
};

const sourceStatusCopy: Record<string, string> = {
  fresh: "已更新",
  lagging: "滞后",
  stale: "陈旧",
  missing: "缺失",
  pending: "待接入",
};

const eventCategoryLabel: Record<NarrativeEvent["category"], string> = {
  news: "新闻",
  diplomacy: "外交",
  maritime: "海事",
  flow: "通行流量",
  market: "市场",
};

const directionCopy: Record<TargetForecast["direction"], string> = {
  up: "上行",
  down: "下行",
  flat: "持平",
  uncertain: "不确定",
};

const mapBounds = { minLon: 44, maxLon: 64, minLat: 19.5, maxLat: 32 };

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
  if (series.pending) return "待接入";
  const maximumFractionDigits =
    series.unit === "USD/bbl" || series.unit === "%" || series.unit === "CNY" ? 2 : 1;
  const formatted = value.toLocaleString("en-US", { maximumFractionDigits });
  return `${formatted}${series.unit === "%" ? "%" : ""}`;
}

function formatDelta(delta: number) {
  if (delta === 0) return "0 pp";
  return `${delta > 0 ? "+" : ""}${delta} pp`;
}

function formatAbsDelta(delta: number) {
  return `${Math.abs(delta)} pp`;
}

function getMarketChange(series: MarketSeries) {
  if (series.pending || series.points.length === 0) {
    return { first: { date: "pending", value: 0 }, last: { date: "pending", value: 0 }, absolute: 0, percent: 0, display: "待接入" };
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

function getEventWindowChange(series: MarketSeries, eventDate = stressWindowStart) {
  if (series.pending || series.points.length === 0) {
    return { start: undefined, last: undefined, absolute: 0, percent: 0, display: "待接入" };
  }
  const start = series.points.find((point) => point.date >= eventDate) ?? series.points[0];
  const last = series.points.at(-1) ?? start;
  const absolute = last.value - start.value;
  const percent = (last.value / start.value - 1) * 100;
  const display =
    series.unit === "%"
      ? `${absolute >= 0 ? "+" : ""}${(absolute * 100).toFixed(0)} bp`
      : `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
  return { start, last, absolute, percent, display };
}

function makeLinePath(points: MarketSeries["points"], width = 420, height = 156) {
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

function getEventWindowX(points: MarketSeries["points"], eventDate = stressWindowStart, width = 420) {
  if (points.length < 2) return width;
  const index = points.findIndex((point) => point.date >= eventDate);
  const windowIndex = index === -1 ? points.length - 1 : index;
  return (windowIndex / (points.length - 1)) * width;
}

function formatBaseCaseMove(delta: number) {
  if (delta > 0) return `上升 ${formatAbsDelta(delta)}`;
  if (delta < 0) return `下降 ${formatAbsDelta(delta)}`;
  return "保持不变";
}

function directionIcon(direction: TargetForecast["direction"]) {
  if (direction === "up") return <ArrowUp size={15} />;
  if (direction === "down") return <ArrowDown size={15} />;
  return <ArrowRight size={15} />;
}

function InfoTitle({ title, subtitle }: { title: string; subtitle?: string }) {
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
  baseCaseScenarioId,
}: {
  activePage: DetailPage["id"];
  onSelectPage: (page: DetailPage["id"]) => void;
  baseCaseScenarioId: ScenarioId;
}) {
  return (
    <header className="app-header">
      <div className="brand-mark" aria-label="Hormuz Risk Intelligence Agent">
        <span className="logo-cube">
          <Box size={22} />
        </span>
        <strong>Hormuz Risk Intelligence Agent</strong>
      </div>

      <span className="base-case-badge">主情景：{scenarioLabel[baseCaseScenarioId]}</span>

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
              <span>{pageLabel[page.id]}</span>
            </button>
          );
        })}
      </nav>

      <div className="header-actions">
        <button aria-label="刷新" type="button"><RefreshCw size={19} /></button>
        <button aria-label="通知" type="button"><Bell size={20} /></button>
        <button aria-label="帮助" type="button"><CircleHelp size={20} /></button>
        <button aria-label="用户" type="button"><UserCircle size={22} /></button>
      </div>
    </header>
  );
}

function ScenarioProbabilityRail({
  distribution,
  deltas,
}: {
  distribution: Record<ScenarioId, number>;
  deltas?: Partial<Record<ScenarioId, number>>;
}) {
  return (
    <div className="scenario-rail" aria-label="情景概率">
      <div className="scenario-axis" />
      {scenarioOrder.map((id) => {
        const delta = deltas?.[id] ?? 0;
        return (
          <article className="scenario-tick" key={id}>
            <span>{scenarioLabel[id]}</span>
            <i style={{ backgroundColor: scenarioColor[id] }} />
            <strong style={{ color: scenarioColor[id] }}>{distribution[id]}%</strong>
            <em className={delta > 0 ? "positive" : delta < 0 ? "negative" : ""}>
              {formatDelta(delta)}
            </em>
          </article>
        );
      })}
    </div>
  );
}

function ScenarioAuditCard({
  projection,
}: {
  projection: ReturnType<typeof projectOverviewState>;
}) {
  const closureDelta = projection.scenarioDelta.closure ?? 0;
  const closureGuardrail = projection.whyNotClosure.appliedGuardrails.find(
    (guardrail) => guardrail.scenarioId === "closure",
  );
  const counterEvidence = projection.whyNotClosure.counterEvidence[0];

  return (
    <section className="console-card scenario-card">
      <InfoTitle
        title="情景状态"
        subtitle="judgement_updated 之后的 forecast state"
      />
      <ScenarioProbabilityRail
        distribution={projection.scenarioDistribution}
        deltas={projection.scenarioDelta}
      />
      <div className="scenario-audit-row" aria-label="closure audit">
        <article>
          <span>Closure check</span>
          <strong>{projection.scenarioDistribution.closure}%</strong>
          <p>
            {formatDelta(closureDelta)} · 缺少 verified traffic stop / official avoidance。
          </p>
        </article>
        <article>
          <span>Guardrail</span>
          <strong>
            {closureGuardrail
              ? `≤ ${closureGuardrail.cappedTo}%`
              : "未触发 cap"}
          </strong>
          <p>{closureGuardrail?.reasonCode ?? "当前 closure 低于上限。"}</p>
        </article>
        <article>
          <span>Counter evidence</span>
          <strong>{counterEvidence ? counterEvidence.confidence : "none"}</strong>
          <p>
            {counterEvidence
              ? counterEvidence.claim
              : "尚无额外 counter evidence。"}
          </p>
        </article>
      </div>
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

function CaseMap({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`console-card case-map ${compact ? "compact" : ""}`}>
      <div className="map-card-heading">
        <InfoTitle title={compact ? "区域" : "案例边界"} subtitle={compact ? undefined : "Hormuz region"} />
      </div>
      <svg className="clean-map" viewBox="0 0 1000 560" role="img" aria-label="Hormuz region context map">
        <defs>
          <linearGradient id="waterGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#eff7ff" />
            <stop offset="58%" stopColor="#dcefff" />
            <stop offset="100%" stopColor="#eef8ff" />
          </linearGradient>
          <marker id="routeArrow" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="3">
            <path d="M0,0 L0,6 L7,3 z" fill="#0b66f6" />
          </marker>
        </defs>
        <rect width="1000" height="560" fill="url(#waterGradient)" />
        <g>
          {mapCountries.flatMap((country) =>
            country.rings.map((ring, index) => (
              <path className="land-mass" d={toPath(ring, true)} key={`${country.name}-${index}`} />
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
    </section>
  );
}

function HormuzBaselineStrip() {
  return (
    <section className="console-card baseline-strip">
      <InfoTitle title="为什么是 Hormuz" subtitle="结构性锚点，不代表实时 throughput" />
      <ul>
        {sourceBoundaryFacts.map((fact) => (
          <li key={fact.id}>
            <strong>{fact.value}</strong>
            <em>{fact.unit}</em>
            <p>{fact.label}</p>
            <small>{fact.detail}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RevisionBriefCard({
  projection,
}: {
  projection: ReturnType<typeof projectOverviewState>;
}) {
  const brief = projection.updateBrief;
  const largest = brief.largestScenarioDelta;
  const marketEvidence = projection.marketRead;
  const baseCaseChanged =
    brief.previousBaseCaseScenarioId !== brief.currentBaseCaseScenarioId;
  const baseCaseDelta =
    projection.scenarioDelta[brief.currentBaseCaseScenarioId] ?? 0;
  const baseCaseMove = formatBaseCaseMove(baseCaseDelta);
  const currentBaseCase = scenarioLabel[brief.currentBaseCaseScenarioId];

  return (
    <section className="console-card update-brief-card">
      <div className="update-brief-kicker">
        <span>
          <Sparkles size={16} />
          判断修订 · judgement_updated
        </span>
        <b>checkpoint · {projection.currentCheckpoint.checkpointId.toUpperCase()}</b>
      </div>

      <div className={`update-brief-headline ${baseCaseChanged ? "changed" : "unchanged"}`}>
        {baseCaseChanged ? (
          <>
            <span>{scenarioLabel[brief.previousBaseCaseScenarioId]}</span>
            <ArrowRight size={22} />
            <strong>{currentBaseCase}</strong>
          </>
        ) : (
          <>
            <span>主情景未改变</span>
            <strong>{currentBaseCase}</strong>
          </>
        )}
      </div>

      <p>
        {baseCaseChanged
          ? `本次 checkpoint 在应用已登记 evidence 与 guardrails 后，将主情景修订为 ${currentBaseCase}。`
          : `${currentBaseCase}仍是主情景，概率${baseCaseMove}。封锁没有进入中心判断，因为 flow evidence 仍是 pending，且 guardrails 会限制仅由市场信号推动的 closure 判断。`}
      </p>

      <div className="update-metric-row">
        <article>
          <span>主情景概率</span>
          <strong>{brief.currentProbability}%</strong>
          <em>
            上轮 {brief.previousProbability}% ·{" "}
            {formatDelta(
              projection.scenarioDelta[brief.currentBaseCaseScenarioId] ?? 0,
            )}
          </em>
        </article>
        <article>
          <span>最大情景变化</span>
          <strong>{scenarioLabel[largest.scenarioId]}</strong>
          <em className={largest.delta >= 0 ? "positive" : "negative"}>
            {formatDelta(largest.delta)}
          </em>
        </article>
      </div>

      <div className="update-evidence-chain" aria-label="关键修订证据">
        {brief.leadEvidence.slice(0, 2).map((claim) => (
          <article key={claim.evidenceId}>
            <span>{polarityCopy[claim.polarity]}</span>
            <p>{claim.claim}</p>
            <small>{claim.mechanismTags.join(" / ")}</small>
          </article>
        ))}
        <article>
          <span>市场 caveat</span>
          <p>{marketEvidence.caveat}</p>
          <small>{pricingPatternCopy[marketEvidence.pricingPattern]}</small>
        </article>
      </div>
    </section>
  );
}

function CaseRoomFlow() {
  const steps = [
    {
      label: "01",
      title: "态势时间线",
      page: "事件",
      body: "候选事件先进入时间线，保留 source boundary 和 pending caveat。",
    },
    {
      label: "02",
      title: "关键指标面板",
      page: "市场",
      body: "跨资产曲线只解释 pricing pattern，不直接写入 forecast state。",
    },
    {
      label: "03",
      title: "机制解释链",
      page: "预测",
      body: "evidence 映射 mechanism，解释为什么会推动或削弱某个判断。",
    },
    {
      label: "04",
      title: "情景预测卡片",
      page: "总览",
      body: "judgement_updated 后展示 scenario distribution、next watch 与 checkpoint。",
    },
  ];

  return (
    <section className="console-card case-room-flow">
      <InfoTitle
        title="Case room 工作流"
        subtitle="PDF 计划主线：fact tracking -> mechanism explanation -> scenario forecast -> checkpoint update"
      />
      <div className="case-room-flow-grid">
        {steps.map((step) => (
          <article key={step.label}>
            <span>{step.label}</span>
            <strong>{step.title}</strong>
            <b>{step.page}</b>
            <p>{step.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function OverviewPage() {
  const projection = useMemo(
    () => projectOverviewState(sourceBoundaryFacts.map((f) => ({ ...f }))),
    [],
  );

  return (
    <section className="page-grid overview-page">
      <RevisionBriefCard projection={projection} />

      <ScenarioAuditCard projection={projection} />

      <div className="overview-side-stack">
        <section className="console-card compact-list-card">
          <InfoTitle title="为什么还不是封锁？" />
          <ul>
            {projection.whyNotClosure.appliedGuardrails.map((g) => (
              <li key={`${g.scenarioId}-${g.reasonCode}`}>
                <b>{scenarioLabel[g.scenarioId]}</b> capped at {g.cappedTo}% · <em>{g.reasonCode}</em>
              </li>
            ))}
            {projection.whyNotClosure.counterEvidence.map((c) => (
              <li key={c.evidenceId}><em>反证：</em> {c.claim}</li>
            ))}
            {projection.whyNotClosure.appliedGuardrails.length === 0 &&
            projection.whyNotClosure.counterEvidence.length === 0 ? (
              <li>尚无 verified flow stop、official avoidance 或 closure-style shock。</li>
            ) : null}
          </ul>
        </section>
        <section className="console-card compact-list-card">
          <InfoTitle title="下一步观察" />
          <ul>
            {projection.nextWatch.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="console-card compact-list-card overview-checkpoint-card">
          <InfoTitle title="当前 checkpoint" />
          <strong>{projection.currentCheckpoint.checkpointId.toUpperCase()}</strong>
          <p>{projection.currentCheckpoint.revisionReason}</p>
        </section>
      </div>

      <CaseMap />
      <HormuzBaselineStrip />
      <CaseRoomFlow />

      <div className="status-row">
        <StatusCard
          icon={Ship}
          title="海事状态"
          value="偏高风险"
          detail="Advisory 仍是 elevated wording，但没有 avoidance 指令"
        />
        <StatusCard
          icon={ShieldCheck}
          title="跨资产读数"
          value={pricingPatternCopy[projection.marketRead.pricingPattern]}
          detail={projection.marketRead.summary}
        />
        <StatusCard
          icon={RefreshCw}
          title="信源新鲜度"
          value={`${sourceGroups.length} 组 source · ${projection.pendingSourceIds.length} 个 pending`}
          detail={`pending: ${projection.pendingSourceIds.join(", ")}`}
        />
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
        {series.pending ? "待接入" : change.display}
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
        <span>最新</span>
        <span>变化</span>
      </div>
      <div className="market-series-list">
        {groupSeries.map((item) => (
          <MarketSeriesRow key={item.id} series={item} />
        ))}
      </div>
    </section>
  );
}

function MarketSparkCard({ series }: { series: MarketSeries }) {
  const change = getMarketChange(series);
  const eventChange = getEventWindowChange(series);
  const path = makeLinePath(series.points);
  const eventWindowX = getEventWindowX(series.points);
  const eventWindowWidth = Math.max(0, 420 - eventWindowX);
  const trendClass = series.pending ? "pending" : eventChange.percent >= 0 ? "positive" : "negative";
  const eventWindowTitle =
    eventChange.start && eventChange.last
      ? `${eventChange.start.date} -> ${eventChange.last.date}`
      : "pending";

  return (
    <article className="market-spark-card">
      <div className="spark-card-head">
        <div>
          <span>{series.source}</span>
          <strong>{series.label}</strong>
        </div>
        <b>{formatMarketValue(series, change.last.value)}</b>
      </div>
      <svg className="spark-chart" viewBox="0 0 420 156" role="img" aria-label={`${series.label} sampled trend`}>
        <rect className="spark-window" x={eventWindowX} y="0" width={eventWindowWidth} height="156" />
        <line className="spark-event-line" x1={eventWindowX} x2={eventWindowX} y1="0" y2="156" />
        <path className="spark-line" d={path} style={{ stroke: series.color }} />
        {series.points.map((point, index) => {
          const values = series.points.map((p) => p.value);
          const min = Math.min(...values);
          const max = Math.max(...values);
          const span = max - min || 1;
          const x = (index / (series.points.length - 1)) * 420;
          const y = 156 - ((point.value - min) / span) * 156;
          return (
            <circle
              className="spark-dot"
              cx={x}
              cy={y}
              key={`${series.id}-${point.date}`}
              r={index === series.points.length - 1 ? 4.5 : 2.5}
              style={{ fill: series.color }}
            />
          );
        })}
      </svg>
      <div className="spark-card-foot">
        <span>
          区间 <b>{change.first.date}</b> → <b>{change.last.date}</b>
        </span>
        <em className={trendClass} title={eventWindowTitle}>
          分析窗口 {eventChange.display}
        </em>
      </div>
      <p>{series.caveat}</p>
    </article>
  );
}

function MarketSignalBoard({ series }: { series: MarketSeries[] }) {
  const visible = series.filter((item) =>
    ["brent-spot", "wti-spot", "vix", "broad-usd", "us10y", "sp500"].includes(item.id),
  );
  const brent = series.find((item) => item.id === "brent-spot");
  const vix = series.find((item) => item.id === "vix");
  const sp500 = series.find((item) => item.id === "sp500");
  const brentFull = brent ? getMarketChange(brent).display : "n/a";
  const brentWindow = brent ? getEventWindowChange(brent).display : "n/a";
  const vixWindow = vix ? getEventWindowChange(vix).display : "n/a";
  const spxWindow = sp500 ? getEventWindowChange(sp500).display : "n/a";

  return (
    <section className="console-card market-signal-board">
      <div className="chart-card-head">
        <InfoTitle
          title="市场压力窗口"
          subtitle="FRED 抽样序列；阴影区域只是 analysis window，不是已核验的封锁日期"
        />
        <span className="event-window-badge">分析起点 {stressWindowStart}</span>
      </div>
      <p className="market-window-note">
        这里分开读两个信号：level risk premium 与 event-window stress。Brent 全区间 {brentFull}，
        但分析窗口 {brentWindow}；VIX 分析窗口 {vixWindow}，S&P 500 分析窗口 {spxWindow}。
        因此 MarketRead 记为 mixed：risk premium 仍在，但不是 closure-style shock。
      </p>
      <div className="market-read-split" aria-label="market read split">
        <article>
          <span>Level risk premium</span>
          <strong>{brentFull}</strong>
          <p>Brent / WTI 相比 3 月低点仍高，说明 Hormuz premium 没有消失。</p>
        </article>
        <article>
          <span>Event-window stress</span>
          <strong>{brentWindow}</strong>
          <p>4 月 7 日后油价和 VIX 回落，权益上行，不支持 closure shock。</p>
        </article>
      </div>
      <div className="market-spark-grid">
        {visible.map((item) => (
          <MarketSparkCard key={item.id} series={item} />
        ))}
      </div>
    </section>
  );
}

function MarketPage() {
  const projection = useMemo(() => projectMarketState(sourceRegistry), []);

  return (
    <section className="page-grid market-page">
      <StatusCard
        icon={BarChart3}
        title="市场读数"
        value={pricingPatternCopy[projection.marketRead.pricingPattern]}
        detail={projection.marketRead.summary}
      />
      <StatusCard
        icon={Target}
        title="定价模式"
        value={pricingPatternShortCopy[projection.marketRead.pricingPattern]}
        detail={`${projection.marketRead.pricingPattern} · ${projection.marketRead.caveat}`}
      />
      <StatusCard
        icon={Clock3}
        title="截至时间"
        value={projection.marketRead.asOf}
        detail={`跨资产 FRED snapshot · ${projection.pendingSourceIds.length} 个 pending source`}
      />

      <MarketSignalBoard series={marketSeries} />

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
        <strong>如何阅读</strong>
        <p>
          市场信号只是 <b>evidence input</b>，不会直接改 scenario 或 target forecast state。
          只有 Forecast 页里的 <b>judgement_updated</b> 事件可以写入预测状态。
        </p>
      </section>
    </section>
  );
}

function NewsTimelinePage() {
  const forecast = useMemo(() => projectForecastState(), []);
  const sourceCoverage = sourceRegistry.filter((source) =>
    ["news", "maritime", "conflict", "pending"].includes(source.category),
  );
  const activeEvidence = forecast.evidenceClaims.filter((claim) =>
    forecast.checkpoint.reusedState.activeEvidenceIds.includes(claim.evidenceId),
  );
  const currentBaseCase = scenarioOrder.reduce((best, current) =>
    forecast.currentScenario[current] > forecast.currentScenario[best] ? current : best,
  );

  return (
    <section className="page-grid news-page">
      <section className="console-card news-hero-card">
        <div>
          <InfoTitle
            title="事件发展脉络"
            subtitle="News 是 candidate-evidence layer，本身不直接触发 forecast update"
          />
          <strong>事件脉络只解释输入，不直接改判</strong>
          <p>
            参考 ShipXY 这类专题页的“时间线 + 海事态势”阅读方式，但这里不抓取实时船流；
            只有通过 source / evidence / mechanism 校验的内容才会进入 Forecast。
          </p>
        </div>
        <div className="news-hero-metrics">
          <article>
            <span>候选事件</span>
            <b>{narrativeEvents.length}</b>
          </article>
          <article>
            <span>活跃 evidence</span>
            <b>{activeEvidence.length}</b>
          </article>
          <article>
            <span>待确认 source</span>
            <b>{forecast.checkpoint.reusedState.pendingSourceIds.length}</b>
          </article>
        </div>
      </section>

      <section className="console-card news-forecast-bridge">
        <InfoTitle title="预测承接" subtitle="timeline -> forecast bridge：时间线今天改变了什么" />
        <div className="bridge-metrics">
          <article>
            <span>主情景</span>
            <strong>{scenarioLabel[currentBaseCase]}</strong>
            <p>judgement_updated 后为 {forecast.currentScenario[currentBaseCase]}%</p>
          </article>
          <article>
            <span>活跃 evidence ids</span>
            <strong>{activeEvidence.length}</strong>
            <p>{activeEvidence.map((claim) => claim.evidenceId).join(", ")}</p>
          </article>
          <article>
            <span>下一步观察</span>
            <strong>{forecast.checkpoint.nextWatch.length}</strong>
            <p>{forecast.checkpoint.nextWatch[0]}</p>
          </article>
        </div>
      </section>

      <section className="console-card news-timeline-card">
        <InfoTitle title="Hormuz 时间线" subtitle="候选事件 -> forecast relevance" />
        <div className="event-timeline">
          {narrativeEvents.map((event) => (
            <article className={`timeline-event ${event.severity}`} key={event.id}>
              <span>{event.time}</span>
              <div>
                <b>{eventCategoryLabel[event.category]}</b>
                <strong>{event.title}</strong>
                <p>{event.summary}</p>
                <em>{event.effect}</em>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="news-side-stack">
        <section className="console-card news-source-card">
          <InfoTitle title="信源边界" subtitle="哪些内容可以进入 pipeline" />
          <div className="news-source-list">
            {sourceCoverage.map((source) => (
              <article key={source.id}>
                <span className={source.pending ? "pending" : source.status}>
                  {sourceStatusCopy[source.status] ?? source.status}
                </span>
                <strong>{source.name}</strong>
                <p>{source.caveat}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="console-card news-pipeline-card">
          <InfoTitle title="Forecast handoff · 预测交接" subtitle="news 如何变成 judgement" />
          <div className="pipeline-steps">
            {[
              ["candidate", "新闻/通告进入候选池"],
              ["verify", "绑定 sourceObservationIds"],
              ["evidence", "归一化为 EvidenceClaim"],
              ["mechanism", "映射 mechanismTags"],
              ["judgement", "judgement_updated 才能改 state"],
            ].map(([step, text], index) => (
              <article key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}

function ForecastPage({
  selectedTarget,
  onSelectTarget,
}: {
  selectedTarget: ForecastTarget;
  onSelectTarget: (target: ForecastTarget) => void;
}) {
  const projection = useMemo(() => projectForecastState(), []);
  const [mode, setMode] = useState<"story" | "audit">("story");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const activeGraph =
    mode === "story" ? projection.storyGraph : projection.auditGraph;
  const selectedGraphNode =
    activeGraph.nodes.find((node) => node.id === selectedNodeId) ?? null;

  const dominant = scenarioOrder.reduce((best, current) =>
    projection.currentScenario[current] > projection.currentScenario[best] ? current : best,
  );
  const prevDominant = scenarioOrder.reduce((best, current) =>
    projection.previousScenario[current] > projection.previousScenario[best] ? current : best,
  );

  return (
    <section className="page-grid forecast-page">
      <section className="console-card revision-headline">
        <div className="revision-headline-main">
          <InfoTitle
            title="Agent 为什么改判？"
            subtitle="Evidence path、guardrails 与持久化 forecast state"
          />
          <div className="revision-state-pair">
            <span>
              <small>上轮 previous</small>
              {scenarioLabel[prevDominant]} · {projection.previousScenario[prevDominant]}%
            </span>
            <ArrowRight size={18} />
            <strong>
              <small>当前 current</small>
              {scenarioLabel[dominant]} · {projection.currentScenario[dominant]}%
            </strong>
          </div>
        </div>
        <p>{projection.checkpoint.revisionReason}</p>
        <div className="revision-chips">
          {Object.entries(projection.scenarioDelta).map(([id, delta]) => (
            <span key={id}>
              <i style={{ background: scenarioColor[id as ScenarioId] }} />
              {scenarioLabel[id as ScenarioId]}{" "}
              <b className={(delta ?? 0) > 0 ? "positive" : (delta ?? 0) < 0 ? "negative" : ""}>
                {(delta ?? 0) > 0 ? "+" : ""}{delta} pp
              </b>
            </span>
          ))}
        </div>
      </section>

      <section className="forecast-main-grid">
        <main className="forecast-main-column">
          <div className="forecast-mode-tabs" role="tablist" aria-label="Forecast graph mode">
            {(["story", "audit"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? "selected" : ""}
                onClick={() => setMode(m)}
                type="button"
              >
                {m === "story" ? "故事模式" : "审计模式"}
              </button>
            ))}
          </div>

          <EvidenceGraph
            storyGraph={projection.storyGraph}
            auditGraph={projection.auditGraph}
            mode={mode}
            selectedNodeId={selectedNodeId}
            onSelectNodeId={setSelectedNodeId}
            scenarioDelta={projection.scenarioDelta}
            scenarioLabels={scenarioLabel}
          />

          <section className="console-card evidence-shelf">
            <InfoTitle title="Evidence shelf · 旁支证据" subtitle="非主链 evidence、counter 与 pending caveat" />
            <ul>
              {projection.storyPath.shelfEvidenceIds.length === 0 ? (
                <li>(本轮没有旁支 evidence)</li>
              ) : (
                projection.storyPath.shelfEvidenceIds.map((id) => {
                  const claim = projection.evidenceClaims.find((c) => c.evidenceId === id);
                  if (!claim) return null;
                  return (
                    <li key={id}>
                      <b>{polarityCopy[claim.polarity]}</b> · {claim.claim}{" "}
                      <em>[{claim.mechanismTags.join(", ")}]</em>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          <section className="console-card research-panel">
            <InfoTitle title="Research stream · 运行事件" subtitle="AgentRunEvent[] 到达顺序" />
            {selectedGraphNode ? (
              <div className="selected-node-bridge">
                <span>Graph selection</span>
                <strong>{selectedGraphNode.label}</strong>
                <p>
                  {selectedGraphNode.kind}
                  {selectedGraphNode.eventId ? ` · event ${selectedGraphNode.eventId}` : ""}
                  {selectedGraphNode.evidenceId ? ` · evidence ${selectedGraphNode.evidenceId}` : ""}
                  {selectedGraphNode.sourceObservationId ? ` · observation ${selectedGraphNode.sourceObservationId}` : ""}
                </p>
              </div>
            ) : null}
            <div className="forecast-controls">
              <label className="prediction-select">
                <span>预测目标</span>
                <select
                  aria-label="Forecast target"
                  value={selectedTarget}
                  onChange={(event) => onSelectTarget(event.target.value as ForecastTarget)}
                >
                  <optgroup label="资产">
                    {forecastTargetOptions
                      .filter((option) => option.group === "assets")
                      .map((option) => (
                        <option key={option.target} value={option.target}>
                          {option.label}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="风险目标">
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
            </div>
            <div className="research-stream-scroll">
              <ResearchStream
                events={projection.events}
                visibleCount={projection.events.length}
                isRunning={false}
                sourceRegistry={sourceRegistry}
                scenarioLabels={scenarioLabel}
                highlightedEventId={selectedGraphNode?.eventId ?? null}
              />
            </div>
          </section>
        </main>

        <aside className="forecast-side-column">
          <CrossAssetSideCard forecasts={projection.currentTargetForecasts} />
          <JudgementDeltaCard
            events={projection.events}
            scenarioDistribution={projection.currentScenario}
            targetForecasts={projection.currentTargetForecasts}
            selectedTarget={selectedTarget}
            scenarioLabels={scenarioLabel}
          />
          <CheckpointCard checkpoint={projection.checkpoint} />
        </aside>
      </section>

      <ForecastSystemStageCard projection={projection} />
    </section>
  );
}

function CrossAssetSideCard({ forecasts }: { forecasts: TargetForecast[] }) {
  const assets = forecasts.filter((forecast) =>
    ["brent", "gold", "broad_usd", "usd_cny", "vix", "us10y", "sp500"].includes(forecast.target),
  );
  return (
    <section className="console-card side-card asset-side-card">
      <InfoTitle title="跨资产视图" />
      <div className="asset-direction-grid">
        {assets.slice(0, 7).map((forecast) => (
          <article className={forecast.direction} key={forecast.target}>
            <div>
              <span>{targetLabel[forecast.target]}</span>
              <em>{directionCopy[forecast.direction]}</em>
            </div>
            {directionIcon(forecast.direction)}
          </article>
        ))}
      </div>
    </section>
  );
}

function ForecastSystemStageCard({
  projection,
}: {
  projection: ReturnType<typeof projectForecastState>;
}) {
  const stages = [
    {
      label: "Sense",
      title: "source bundle",
      body: `读取 ${projection.observations.length} 条 observations；pending sources 在任何 update 前保持 caveat。`,
    },
    {
      label: "Interpret",
      title: "evidence + mechanism",
      body: `${projection.evidenceClaims.length} 条 EvidenceClaim 映射到 ${new Set(projection.evidenceClaims.flatMap((claim) => claim.mechanismTags)).size} 个 mechanism tags。`,
    },
    {
      label: "Revise",
      title: "judgement_updated",
      body: "只有 judgement_updated 可以写入 scenario distribution 与 target forecasts。",
    },
    {
      label: "Persist",
      title: "checkpoint + records",
      body: `${projection.checkpoint.checkpointId.toUpperCase()} 持久化 state，用于 replay、eval 与 galaxy handoff。`,
    },
  ];

  return (
    <section className="console-card forecast-stage-card">
      <InfoTitle title="Forecast agent 运行阶段" subtitle="galaxy-style contract，面向 reviewer 的可视化" />
      <div className="forecast-stage-grid">
        {stages.map((stage, index) => (
          <article key={stage.label}>
            <span>{String(index + 1).padStart(2, "0")} · {stage.label}</span>
            <strong>{stage.title}</strong>
            <p>{stage.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function App() {
  const [selectedTarget, setSelectedTarget] = useState<ForecastTarget>("brent");
  const [activePage, setActivePage] = useState<DetailPage["id"]>("overview");

  // Compute base case from the canonical projection (single source of truth).
  const baseCaseScenarioId = useMemo(() => {
    const distribution = projectOverviewState(
      sourceBoundaryFacts.map((f) => ({ ...f })),
    ).scenarioDistribution;
    return scenarioOrder.reduce((best, current) =>
      distribution[current] > distribution[best] ? current : best,
    );
  }, []);

  return (
    <main className="app-shell">
      <AppHeader
        activePage={activePage}
        onSelectPage={setActivePage}
        baseCaseScenarioId={baseCaseScenarioId}
      />

      {activePage === "overview" ? <OverviewPage /> : null}
      {activePage === "market" ? <MarketPage /> : null}
      {activePage === "news" ? <NewsTimelinePage /> : null}
      {activePage === "forecast" ? (
        <ForecastPage selectedTarget={selectedTarget} onSelectTarget={setSelectedTarget} />
      ) : null}
    </main>
  );
}

export default App;
