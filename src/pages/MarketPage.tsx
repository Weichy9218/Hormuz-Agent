// Market page: pricing-pattern evidence surface without direct forecast updates.
import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CircleHelp,
  Clock3,
  ShieldCheck,
  Target,
  Waves,
} from "lucide-react";
import { InfoTitle } from "../components/shared/InfoTitle";
import { StatusCard } from "../components/shared/StatusCard";
import {
  marketSeries,
  sourceRegistry,
} from "../data";
import {
  pricingPatternCopy,
  pricingPatternShortCopy,
} from "../lib/forecastCopy";
import {
  formatMarketValue,
  getEventWindowChange,
  getEventWindowX,
  getMarketChange,
  makeLinePath,
  stressWindowStart,
} from "../lib/format";
import {
  projectMarketState,
} from "../state/projections";
import type { MarketSeries } from "../types";

const marketGroups: Array<{ label: string; ids: string[]; icon: LucideIcon }> = [
  { label: "能源", ids: ["brent-spot", "wti-spot"], icon: Waves },
  {
    label: "避险 / FX",
    ids: ["gold-pending", "broad-usd", "usd-cny", "usd-cnh-pending"],
    icon: ShieldCheck,
  },
  { label: "风险 / 利率 / 波动", ids: ["vix", "us10y", "sp500"], icon: Activity },
];

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
  icon: LucideIcon;
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
          <span>{series.source} · source id: {series.sourceId}</span>
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
      <small>
        {series.verifiedAt ? `verifiedAt ${series.verifiedAt}` : "source pending; no live as-of"}
      </small>
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
        Reviewer 先分开读两个信号：level risk premium 说明风险溢价仍在；event-window stress
        检查这次事件窗口有没有 closure-style shock。Brent 全区间 {brentFull}，但分析窗口
        {brentWindow}；VIX 分析窗口 {vixWindow}，S&P 500 分析窗口 {spxWindow}。因此
        MarketRead.pricingPattern 记为 mixed。
      </p>
      <div className="market-read-split" aria-label="market read split">
        <article>
          <span>Level risk premium</span>
          <strong>{brentFull}</strong>
          <p>Brent / WTI 相比 3 月低点仍高，说明 Hormuz premium 没有消失；这是 evidence input。</p>
        </article>
        <article>
          <span>Event-window stress</span>
          <strong>{brentWindow}</strong>
          <p>4 月 7 日后油价和 VIX 回落，权益上行，不支持 closure shock 或直接改判。</p>
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

export function MarketPage() {
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

      <section className="console-card market-boundary-strip">
        <article>
          <span>pricingPattern</span>
          <strong>{projection.marketRead.pricingPattern}</strong>
          <p>{pricingPatternCopy[projection.marketRead.pricingPattern]}</p>
        </article>
        <article>
          <span>source / as-of</span>
          <strong>{projection.marketRead.asOf}</strong>
          <p>FRED market source ids stay visible on each series card.</p>
        </article>
        <article>
          <span>pending caveat</span>
          <strong>{projection.pendingSourceIds.length} pending</strong>
          <p>{projection.pendingSourceIds.join(", ")}</p>
        </article>
      </section>

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
