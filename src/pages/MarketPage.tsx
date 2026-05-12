// Market page: pricing-pattern evidence surface without direct forecast updates.
import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Database,
  Gauge,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { InfoTitle } from "../components/shared/InfoTitle";
import {
  sourceRegistry,
} from "../data";
import {
  formatMarketDate,
  formatMarketValue,
  getEventWindowChange,
  getMarketChange,
  getMarketWindowSeries,
  getRecentWindowChange,
  stressWindowStart,
} from "../lib/format";
import {
  projectMarketState,
} from "../state/projections";
import type { MarketSeries } from "../types";

const primaryChartIds = [
  "brent-spot",
  "wti-spot",
  "broad-usd",
  "usd-cny",
  "vix",
  "sp500",
  "nasdaq-composite",
  "us-cpi",
];

const marketRangeOptions = [
  { label: "1Y", days: 365 },
  { label: "6M", days: 183 },
  { label: "3M", days: 92 },
  { label: "1M", days: 31 },
] as const;

type MarketRangeDays = (typeof marketRangeOptions)[number]["days"];

const chartWidth = 420;
const chartPadding = {
  top: 14,
  right: 12,
  bottom: 28,
  left: 48,
};

function unique(values: string[]) {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}

function marketTrendClass(
  series: MarketSeries,
  change: ReturnType<typeof getEventWindowChange>,
) {
  if (series.pending || !change.start) return "pending";
  return change.percent >= 0 ? "positive" : "negative";
}

function seriesChineseLabel(series: MarketSeries) {
  const copy: Record<string, string> = {
    "brent-spot": "布伦特现货代理",
    "wti-spot": "WTI 现货代理",
    "broad-usd": "美元广义指数",
    "usd-cny": "美元/人民币",
    vix: "VIX 波动率",
    sp500: "标普 500",
    "nasdaq-composite": "纳斯达克综合",
    "us-cpi": "美国 CPI",
  };
  return copy[series.id] ?? series.label.replace("（pending）", "");
}

function seriesInterpretation(series: MarketSeries, eventChange: ReturnType<typeof getEventWindowChange>) {
  const windowCopy = eventChange.start ? `封锁日起 ${eventChange.display}` : "封锁日起暂无窗口数据";
  const copy: Record<string, string> = {
    "brent-spot": `布伦特反映国际原油风险溢价。${windowCopy}，用来看油价是否持续定价通行风险。`,
    "wti-spot": `WTI 更偏美国油价背景。${windowCopy}，和 Brent 一起判断能源压力是否同步。`,
    "broad-usd": `美元广义指数用于观察避险资金是否推高美元。${windowCopy}。`,
    "usd-cny": `USD/CNY 用于观察人民币在岸汇率压力；不替代 USD/CNH。${windowCopy}。`,
    vix: `VIX 衡量美股隐含波动率。${windowCopy}，若未同步上行，说明冲击尚未扩散为广谱恐慌。`,
    sp500: `标普 500 是风险偏好背景。${windowCopy}，用于检查权益市场是否定价系统性冲击。`,
    "nasdaq-composite": `纳斯达克综合反映成长股风险偏好。${windowCopy}。`,
    "us-cpi": "CPI 是月度滞后指标，只作通胀背景，不作为封锁事件窗口的实时价格信号。",
  };
  return copy[series.id] ?? "该指标用于市场背景展示；具体判断以 source-bound 数据为准。";
}

function pendingReason(sourceId: string) {
  const copy: Record<string, string> = {
    "crude-futures-pending": "原油主连需要可审计的连续期货源；未接入前只展示 FRED 现货代理。",
    "gold-pending": "黄金日频源尚未接入授权或稳定源；不生成虚假金价走势。",
    "silver-pending": "白银日频源尚未接入授权或稳定源；不生成虚假白银走势。",
    "usdcnh-pending": "离岸人民币 USD/CNH 尚未接入稳定源；不生成实时 USD/CNH 走势或高置信判断。",
    "hstech-pending": "恒生科技指数尚未接入稳定源；不生成静态指数走势。",
    "shanghai-composite-pending": "上证指数尚未接入稳定源；不生成静态指数走势。",
  };
  return copy[sourceId] ?? "未接入稳定、授权、可复现的日频源前保持 pending。";
}

function sourceCoverageNote(source: { sourceId: string; caveat: string }) {
  const copy: Record<string, string> = {
    "fred-market": "FRED 本地快照提供 Brent/WTI 现货代理、美元指数、USD/CNY、VIX、美股、10Y 与 CPI 背景；期货主连、贵金属、CNH 和中港指数仍保持待接入。",
  };
  return copy[source.sourceId] ?? source.caveat;
}

function sourceLabel(series: MarketSeries) {
  return `${series.source.split(" ")[0]} · source id: ${series.sourceId}`;
}

const marketGroups: Array<{
  label: string;
  ids: string[];
  icon: LucideIcon;
  note: string;
}> = [
  {
    label: "能源",
    ids: ["brent-spot", "wti-spot", "brent-futures-pending", "wti-futures-pending"],
    icon: Waves,
    note: "现货代理可审计；期货主连等可复现源接入后再启用。",
  },
  {
    label: "避险与汇率",
    ids: ["gold-pending", "silver-pending", "broad-usd", "usd-cny", "usd-cnh-pending"],
    icon: ShieldCheck,
    note: "美元和在岸人民币已接入；贵金属与 CNH 暂不画假走势。",
  },
  {
    label: "权益与宏观",
    ids: ["sp500", "nasdaq-composite", "hstech-pending", "shanghai-composite-pending", "us-cpi"],
    icon: Activity,
    note: "美股和 CPI 作为背景；港股/上证待稳定源。",
  },
  {
    label: "波动率与利率",
    ids: ["vix", "us10y"],
    icon: BarChart3,
    note: "检查油价压力是否扩散到波动率和利率渠道。",
  },
];

function MarketSeriesRow({ series }: { series: MarketSeries }) {
  const oneYear = getMarketChange(series);
  const eventWindow = getEventWindowChange(series);
  const trendClass = marketTrendClass(series, eventWindow);

  return (
    <article className="market-series-row">
      <div>
        <span>{seriesChineseLabel(series)}</span>
        <small>source id: {series.sourceId}</small>
      </div>
      <b>{formatMarketValue(series, oneYear.last.value)}</b>
      <em className={trendClass}>
        {series.pending ? "待接入" : eventWindow.display}
        {eventWindow.start ? eventWindow.percent >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} /> : null}
      </em>
    </article>
  );
}

function MarketGroupCard({
  label,
  ids,
  icon: Icon,
  note,
  series,
}: {
  label: string;
  ids: string[];
  icon: LucideIcon;
  note: string;
  series: MarketSeries[];
}) {
  const groupSeries = series.filter((item) => ids.includes(item.id));
  return (
    <section className="console-card market-group-card">
      <div className="group-card-head">
        <Icon size={23} />
        <div>
          <h3>{label}</h3>
          <p>{note}</p>
        </div>
      </div>
      <div className="market-series-list">
        {groupSeries.map((item) => (
          <MarketSeriesRow key={item.id} series={item} />
        ))}
      </div>
    </section>
  );
}

function sampledRows(series: MarketSeries) {
  if (series.pending || series.points.length === 0) return [];
  const rows = series.points.slice(-10).reverse();
  return rows.map((point, index) => {
    const previous = rows[index + 1];
    const step =
      previous && previous.value !== 0
        ? ((point.value / previous.value - 1) * 100)
        : 0;
    return { point, step, hasPrevious: Boolean(previous) };
  });
}

function chartScale(series: MarketSeries, chartHeight: number) {
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const values = series.points.map((point) => point.value);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const span = max - min || 1;

  return {
    min,
    max,
    mid: min + span / 2,
    plotWidth,
    plotHeight,
    xAt(index: number) {
      if (series.points.length < 2) return chartPadding.left + plotWidth / 2;
      return chartPadding.left + (index / (series.points.length - 1)) * plotWidth;
    },
    yAt(value: number) {
      return chartPadding.top + plotHeight - ((value - min) / span) * plotHeight;
    },
  };
}

function makeChartLinePath(series: MarketSeries, chartHeight: number) {
  if (series.points.length < 2) return "";
  const scale = chartScale(series, chartHeight);
  return series.points
    .map((point, index) => {
      const x = scale.xAt(index);
      const y = scale.yAt(point.value);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function dateTickLabel(date?: string) {
  if (!date) return "";
  return date.slice(5, 10);
}

function MarketSparkCard({
  series,
  fullSeries,
  rangeLabel,
  expanded,
  onToggleExpanded,
}: {
  series: MarketSeries;
  fullSeries: MarketSeries;
  rangeLabel: string;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const change = getMarketChange(series);
  const eventChange = getEventWindowChange(series);
  const recentChange = getRecentWindowChange(series, 30);
  const trendClass = marketTrendClass(series, eventChange);
  const fullYearChange = getMarketChange(fullSeries);
  const eventWindowTitle =
    eventChange.start && eventChange.last
      ? `${eventChange.start.date} -> ${eventChange.last.date}`
      : "pending";
  const chartHeight = expanded ? 220 : 156;
  const scale = chartScale(series, chartHeight);
  const path = makeChartLinePath(series, chartHeight);
  const dataRows = sampledRows(series);
  const eventWindowIndex = series.points.findIndex((point) => point.date >= stressWindowStart);
  const eventWindowX =
    eventWindowIndex === -1
      ? chartPadding.left + scale.plotWidth
      : scale.xAt(eventWindowIndex);
  const eventWindowWidth = Math.max(0, chartPadding.left + scale.plotWidth - eventWindowX);
  const yTicks = [scale.max, scale.mid, scale.min];
  const xTickIndexes = unique([
    0,
    Math.floor((series.points.length - 1) / 2),
    series.points.length - 1,
  ].map(String)).map(Number);

  return (
    <article className={`market-spark-card ${expanded ? "expanded" : ""}`}>
      <div className="spark-card-head">
        <div>
          <span>{sourceLabel(series)}</span>
          <strong>{seriesChineseLabel(series)}</strong>
        </div>
        <div className="spark-head-actions">
          <b>{formatMarketValue(series, change.last.value)}</b>
          <button
            aria-label={expanded ? `收起 ${series.label}` : `展开 ${series.label}`}
            className="spark-expand-button"
            onClick={onToggleExpanded}
            title={expanded ? "收起 panel" : "展开 panel"}
            type="button"
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
      <svg
        className="spark-chart"
        viewBox={`0 0 420 ${chartHeight}`}
        role="img"
        aria-label={`${series.label} ${rangeLabel} sampled trend`}
      >
        {yTicks.map((tick) => {
          const y = scale.yAt(tick);
          return (
            <g className="spark-y-tick" key={`${series.id}-y-${tick.toFixed(3)}`}>
              <line x1={chartPadding.left} x2={chartPadding.left + scale.plotWidth} y1={y} y2={y} />
              <text x={chartPadding.left - 8} y={y + 4}>{formatMarketValue(series, tick)}</text>
            </g>
          );
        })}
        {xTickIndexes.map((index) => {
          const x = scale.xAt(index);
          return (
            <g className="spark-x-tick" key={`${series.id}-x-${index}`}>
              <line x1={x} x2={x} y1={chartPadding.top} y2={chartPadding.top + scale.plotHeight} />
              <text x={x} y={chartPadding.top + scale.plotHeight + 18}>{dateTickLabel(series.points[index]?.date)}</text>
            </g>
          );
        })}
        <rect
          className="spark-window"
          x={eventWindowX}
          y={chartPadding.top}
          width={eventWindowWidth}
          height={scale.plotHeight}
        />
        <line
          className="spark-event-line"
          x1={eventWindowX}
          x2={eventWindowX}
          y1={chartPadding.top}
          y2={chartPadding.top + scale.plotHeight}
        />
        <text className="spark-axis-unit" x={chartPadding.left} y="10">
          {series.unit}
        </text>
        <path className="spark-line" d={path} style={{ stroke: series.color }} />
        {series.points.map((point, index) => {
          const x = scale.xAt(index);
          const y = scale.yAt(point.value);
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
          {rangeLabel} <b>{change.display}</b>
        </span>
        <em className={trendClass} title={eventWindowTitle}>
          封锁日起 {eventChange.display}
        </em>
      </div>
      <div className="market-mini-metrics" aria-label={`${series.label} market changes`}>
        <span>
          <b>近 1 年</b>
          {fullYearChange.display}
        </span>
        <span>
          <b>近 30 天</b>
          {recentChange.display}
        </span>
        <span>
          <b>截至</b>
          {formatMarketDate(series.verifiedAt)}
        </span>
      </div>
      {expanded ? (
        <div className="market-data-table" aria-label={`${series.label} sampled observations`}>
          <div>
            <span>日期</span>
            <span>数值</span>
            <span>环比</span>
          </div>
          {dataRows.map(({ point, step, hasPrevious }) => (
            <div key={`${series.id}-${point.date}`}>
              <span>{formatMarketDate(point.date)}</span>
              <strong>{formatMarketValue(series, point.value)}</strong>
              <em className={hasPrevious ? step >= 0 ? "positive" : "negative" : "pending"}>
                {hasPrevious ? `${step >= 0 ? "+" : ""}${step.toFixed(1)}%` : "n/a"}
              </em>
            </div>
          ))}
        </div>
      ) : null}
      <p>{seriesInterpretation(series, eventChange)}</p>
      <small>
        {series.verifiedAt ? `数据截至 ${series.verifiedAt}` : "数据源待接入；暂无 live as-of"}
      </small>
    </article>
  );
}

function MarketInsightRail({
  brentWindow,
  vixWindow,
  spxWindow,
}: {
  brentWindow: string;
  vixWindow: string;
  spxWindow: string;
}) {
  const insights = [
    {
      label: "原油溢价",
      value: brentWindow,
      body: "先看能源曲线是否持续上行；Brent 是跨资产判断的起点，不是结论。",
    },
    {
      label: "扩散确认",
      value: vixWindow,
      body: "再看 VIX 是否同步升高。若波动率没有放大，封锁冲击的广谱定价不足。",
    },
    {
      label: "风险偏好",
      value: spxWindow,
      body: "权益资产若没有同步承压，说明市场更像在定价局部风险溢价。",
    },
  ];

  return (
    <div className="market-insight-rail" aria-label="Market analysis order">
      {insights.map((item) => (
        <article key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}

function MarketHeroPanel({
  series,
  latestVerifiedAt,
  pendingCount,
  pricingPattern,
}: {
  series: MarketSeries[];
  latestVerifiedAt: string;
  pendingCount: number;
  pricingPattern: string;
}) {
  const brent = series.find((item) => item.id === "brent-spot");
  const vix = series.find((item) => item.id === "vix");
  const sp500 = series.find((item) => item.id === "sp500");
  const brentWindow = brent ? getEventWindowChange(brent).display : "n/a";
  const vixWindow = vix ? getEventWindowChange(vix).display : "n/a";
  const spxWindow = sp500 ? getEventWindowChange(sp500).display : "n/a";
  const sourceIds = unique(series.map((item) => item.sourceId));
  const stableSourceIds = unique(series.filter((item) => !item.pending).map((item) => item.sourceId));

  return (
    <section className="console-card market-hero-panel">
      <div className="market-hero-copy">
        <span className="market-page-kicker">Market background · evidence input only</span>
        <h1>油价仍有风险溢价，但没有形成封锁式跨资产冲击</h1>
        <p>
          从 {stressWindowStart} 封锁日起，Brent {brentWindow}，VIX {vixWindow}，
          S&P 500 {spxWindow}。这一页只展示 source-bound 历史背景，不直接改 forecast state。
        </p>
        <div className="market-hero-tags" aria-label="Market source and status tags">
          <span>pricingPattern: {pricingPattern}</span>
          <span>封锁日 {stressWindowStart}</span>
          <span>数据截至 {latestVerifiedAt}</span>
        </div>
      </div>
      <div className="market-hero-metrics" aria-label="Market headline metrics">
        <article>
          <Gauge size={17} />
          <span>原油事件窗口</span>
          <strong>{brentWindow}</strong>
          <p>风险溢价存在，但还需要跨资产确认。</p>
        </article>
        <article>
          <BarChart3 size={17} />
          <span>波动率确认</span>
          <strong>{vixWindow}</strong>
          <p>VIX 未同步上行，封锁式冲击不足。</p>
        </article>
        <article>
          <Clock3 size={17} />
          <span>数据边界</span>
          <strong>{pendingCount} 待接入</strong>
          <p>期货、贵金属、CNH、中港指数保持 pending。</p>
        </article>
      </div>
      <div className="market-hero-source">
        <Database size={15} />
        <span>
          active source id: {stableSourceIds.join(", ")} · pending source ids:{" "}
          {sourceIds.filter((sourceId) => !stableSourceIds.includes(sourceId)).join(", ")}
        </span>
      </div>
    </section>
  );
}

function MarketSignalBoard({ series }: { series: MarketSeries[] }) {
  const [rangeDays, setRangeDays] = useState<MarketRangeDays>(365);
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const rangeLabel = marketRangeOptions.find((option) => option.days === rangeDays)?.label ?? "1Y";
  const visible = series.filter((item) => primaryChartIds.includes(item.id));
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
          title="市场数据背景"
          subtitle="最多展示近 1 年；阴影区从 2026-02-28 封锁日起计算事件窗口表现"
        />
        <div className="market-chart-controls" aria-label="Market chart controls">
          <div className="market-range-tabs" role="tablist" aria-label="Market chart range">
            {marketRangeOptions.map((option) => (
              <button
                aria-selected={rangeDays === option.days}
                className={rangeDays === option.days ? "selected" : ""}
                key={option.label}
                onClick={() => setRangeDays(option.days)}
                role="tab"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="event-window-badge">封锁日 {stressWindowStart}</span>
        </div>
      </div>
      <p className="market-window-note">
        阅读顺序：先看油价是否持续上行，再看 VIX / 美元 / 权益是否同步确认。
        当前 Brent 近 1 年 {brentFull}，封锁日起 {brentWindow}；VIX 封锁日起 {vixWindow}，
        S&P 500 封锁日起 {spxWindow}，因此 MarketRead.pricingPattern 保持 mixed。
      </p>
      <MarketInsightRail
        brentWindow={brentWindow}
        spxWindow={spxWindow}
        vixWindow={vixWindow}
      />
      <div className="market-spark-grid">
        {visible.map((item) => {
          const windowSeries = getMarketWindowSeries(item, rangeDays);
          const expanded = expandedSeriesId === item.id;
          return (
            <MarketSparkCard
              expanded={expanded}
              fullSeries={item}
              key={item.id}
              onToggleExpanded={() => setExpandedSeriesId(expanded ? null : item.id)}
              rangeLabel={rangeLabel}
              series={windowSeries}
            />
          );
        })}
      </div>
    </section>
  );
}

function MarketCoveragePanel({
  evidence,
  observations,
  pendingSeries,
  providerCoverage,
  sourceCoverage,
}: {
  evidence: ReturnType<typeof projectMarketState>["evidence"];
  observations: ReturnType<typeof projectMarketState>["observations"];
  pendingSeries: MarketSeries[];
  providerCoverage: ReturnType<typeof projectMarketState>["providerCoverage"];
  sourceCoverage: ReturnType<typeof projectMarketState>["sourceCoverage"];
}) {
  const observationSourceIds = observations
    .map((item) => item.sourceId)
    .filter((id, index, ids) => ids.indexOf(id) === index);

  return (
    <section className="console-card market-coverage-panel">
      <div>
        <InfoTitle
          title="数据覆盖与待接入"
          subtitle="pending 表示还没有稳定、授权、可复现的 daily source，不画静态假走势"
        />
        <div className="coverage-facts">
          <article>
            <Database size={18} />
            <span>运行证据</span>
            <strong>{evidence.length} 条 claim</strong>
            <p>{evidence.map((claim) => claim.evidenceId).join(", ")}</p>
          </article>
          <article>
            <CheckCircle2 size={18} />
            <span>来源观测</span>
            <strong>{observations.length} 条关联</strong>
            <p>{observationSourceIds.join(", ")}</p>
          </article>
          <article>
            <CircleHelp size={18} />
            <span>pending 保护</span>
            <strong>{pendingSeries.length} 条待接入</strong>
            <p>这些行只暴露 source boundary；未接入稳定源前不生成虚假走势或高置信判断。</p>
          </article>
        </div>
      </div>
      <div className="coverage-source-list">
        {sourceCoverage.map((source) => (
          <article key={source.sourceId} className={source.pending ? "pending" : ""}>
            <span>source id: {source.sourceId}</span>
            <strong>{source.name}</strong>
            <p>{source.pending ? pendingReason(source.sourceId) : sourceCoverageNote(source)}</p>
          </article>
        ))}
        {providerCoverage.map((provider) => (
          <article
            key={provider.providerId}
            className={provider.providerStatus === "active" ? "" : "pending"}
          >
            <span>
              provider id: {provider.providerId} · {provider.providerStatus}
            </span>
            <strong>{provider.name}</strong>
            <p>{provider.caveat}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function MarketPage() {
  const projection = useMemo(() => projectMarketState(sourceRegistry), []);
  const latestVerifiedAt =
    projection.stableSeries
      .map((series) => series.verifiedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? projection.marketRead.asOf;

  return (
    <section className="page-grid market-page">
      <MarketHeroPanel
        latestVerifiedAt={latestVerifiedAt}
        pendingCount={projection.pendingSeries.length}
        pricingPattern={projection.marketRead.pricingPattern}
        series={projection.series}
      />

      <MarketSignalBoard series={projection.series} />

      <MarketCoveragePanel
        evidence={projection.evidence}
        observations={projection.observations}
        pendingSeries={projection.pendingSeries}
        providerCoverage={projection.providerCoverage}
        sourceCoverage={projection.sourceCoverage}
      />

      <div className="market-groups">
        {marketGroups.map((group) => (
          <MarketGroupCard
            icon={group.icon}
            ids={group.ids}
            key={group.label}
            label={group.label}
            note={group.note}
            series={projection.series}
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
