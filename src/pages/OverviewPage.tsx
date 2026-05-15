// Overview is the reviewer entry page: static product framing plus dynamic, sourced previews.
import { lazy, Suspense } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Newspaper,
} from "lucide-react";
import { InfoTitle } from "../components/shared/InfoTitle";
import snapshotJson from "../../data/generated/overview_snapshot.json";
import type { OverviewSnapshot } from "../types/marketChart";
import type { TimelineEvent } from "../types/timeline";

const snapshot = snapshotJson as OverviewSnapshot;
const HormuzInteractiveMap = lazy(() =>
  import("../components/map/HormuzInteractiveMap").then((module) => ({
    default: module.HormuzInteractiveMap,
  })),
);

const pageLinks = [
  {
    href: "/forecast",
    icon: Activity,
    label: "进入 Forecast Agent",
    meta: "动态推理链",
    title: "看 agent 怎样形成预测",
    body: "从 target、resolution source、证据检索到 record_forecast，Forecast 是唯一的预测结果页面。",
  },
  {
    href: "/market",
    icon: BarChart3,
    label: "查看市场背景",
    meta: "动态市场数据",
    title: "看市场是否已经有反应",
    body: "Brent / WTI / VIX / Broad USD 与 traffic snapshot 只展示原始背景，不替 agent 下判断。",
  },
  {
    href: "/news",
    icon: Newspaper,
    label: "打开事件时间线",
    meta: "人工整理时间线",
    title: "追溯事件如何走到这里",
    body: "官方 advisory 与 curated media events 按来源、严重度和 topic 组织，保留 source_url 和 retrieved_at。",
  },
];

const exampleQuestions = [
  "未来 7 天，霍尔木兹通航状态是否已经恢复到正常窗口？",
  "未来 5 个交易日，Brent 会不会出现超过 5% 的上行？",
  "同一条官方 advisory 如何在事件时间线、市场曲线和 agent evidence 中被交叉复核？",
];

const staticDynamicRows = [
  {
    label: "静态",
    title: "问题边界",
    body: "网站定位、结构性 baseline、页面导航和解释文字，不代表实时证据。",
  },
  {
    label: "动态",
    title: "本地快照",
    body: "Traffic、market rows、events timeline 来自 data/generated，必须显示 built_at / retrieved_at。",
  },
  {
    label: "外部",
    title: "外部参考",
    body: "第三方新闻和 AIS 参考站只作对照；没有稳定入库的数据不在主界面出数。",
  },
];

function parseDate(value?: string | null) {
  if (!value) return null;
  const input = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
  }).format(date);
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(digits, 2),
  }).format(value);
}

function formatDelta(value: number | null | undefined, unit = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 2)}${unit}`;
}

function deltaDirection(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "positive" : "negative";
}

function uniqueSourceIds(snapshot: OverviewSnapshot) {
  return [
    ...snapshot.baseline.map((fact) => fact.source_id),
    snapshot.traffic_snapshot?.source_id,
    ...snapshot.market_snapshot.map((item) => item.source_id),
    ...snapshot.latest_events.map((event) => event.source_id),
  ]
    .filter((value): value is string => Boolean(value))
    .filter((value) => !value.endsWith("-pending"))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" · ");
}

function staticTrafficSummary(snapshot: OverviewSnapshot) {
  const traffic = snapshot.traffic_snapshot;
  if (!traffic) return "通航快照 pending";
  return `${formatNumber(traffic.latest_value, 0)} 次日通航记录 · 较 1y 均值 ${formatDelta(traffic.delta_vs_baseline_pct, "%")}`;
}

function HeroPanel({ snapshot }: { snapshot: OverviewSnapshot }) {
  return (
    <section className="console-card overview-product-hero">
      <div className="overview-hero-copy">
        <span className="overview-page-kicker">单案例预测工作台</span>
        <h1>霍尔木兹风险复核台</h1>
        <p>
          以霍尔木兹为深度案例，把事件时间线、市场背景和 Forecast Agent 放到同一张复核桌上。
          Overview 只负责建立语境；真正的预测过程在 Forecast Agent。
        </p>
        <div className="overview-hero-actions" aria-label="primary overview links">
          <a href="/forecast">
            打开 Forecast Agent <ArrowRight size={15} />
          </a>
          <a href="/market">市场背景</a>
          <a href="/news">事件时间线</a>
        </div>
      </div>
      <aside className="overview-hero-status" aria-label="static and dynamic data boundary">
        <div>
          <span>静态说明</span>
          <strong>网站定位 + 案例边界</strong>
        </div>
        <div>
          <span>动态快照</span>
          <strong>{staticTrafficSummary(snapshot)}</strong>
        </div>
        <div>
          <span>数据构建时间</span>
          <strong>{formatDateTime(snapshot.built_at)}</strong>
        </div>
      </aside>
    </section>
  );
}

function NavigationCards() {
  return (
    <section className="overview-navigation-grid" aria-label="overview page destinations">
      {pageLinks.map((item) => {
        const Icon = item.icon;
        return (
          <a className="console-card overview-nav-card" href={item.href} key={item.href}>
            <span className="overview-nav-icon">
              <Icon size={18} />
            </span>
            <span className="overview-nav-meta">{item.meta}</span>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
            <span className="overview-nav-link">
              {item.label} <ArrowRight size={14} />
            </span>
          </a>
        );
      })}
    </section>
  );
}

function ExampleQuestions() {
  return (
    <section className="console-card overview-questions-card">
      <InfoTitle title="可以问什么" subtitle="这个 demo 适合复核的问题类型" />
      <ol>
        {exampleQuestions.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ol>
    </section>
  );
}

function StaticDynamicCard({ snapshot }: { snapshot: OverviewSnapshot }) {
  const sourceIds = uniqueSourceIds(snapshot);

  return (
    <section className="console-card overview-boundary-card">
      <InfoTitle title="静态信息 vs 动态信息" subtitle="不要把解释层误当成实时证据" />
      <div className="overview-boundary-list">
        {staticDynamicRows.map((row) => (
          <article key={row.label}>
            <span>{row.label}</span>
            <strong>{row.title}</strong>
            <p>{row.body}</p>
          </article>
        ))}
      </div>
      <p className="overview-card-caveat">
        当前本地快照：构建 {formatDateTime(snapshot.built_at)} · data as-of {formatDateTime(snapshot.data_as_of)} · source ids {sourceIds}.
      </p>
    </section>
  );
}

function ContextMapCard() {
  return (
    <div className="overview-context-map">
      <Suspense fallback={<InteractiveMapFallback />}>
        <HormuzInteractiveMap events={snapshot.latest_events} traffic={snapshot.traffic_snapshot} />
      </Suspense>
    </div>
  );
}

function InteractiveMapFallback() {
  return (
    <section className="console-card interactive-map-card interactive-map-fallback" aria-label="map loading">
      <div className="interactive-map-header">
        <div>
          <span className="overview-page-kicker">Interactive map</span>
          <h3>Hormuz shipping context</h3>
        </div>
        <span className="interactive-map-status">loading</span>
      </div>
      <div className="interactive-map-frame" />
      <p className="overview-card-caveat">
        MapLibre chunk is loading separately from the first page bundle.
      </p>
    </section>
  );
}

function LatestEventsPreview({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="console-card overview-preview-card">
      <InfoTitle title="最新事件" subtitle="动态 · 来自 generated news_timeline" />
      <ul className="overview-event-preview-list">
        {events.slice(0, 3).map((event) => (
          <li key={event.event_id}>
            <a href={`/news#${event.event_id}`} title={event.description}>
              <span data-severity={event.severity_hint}>{event.severity_hint.toUpperCase()}</span>
              <strong>{event.title}</strong>
              <small>
                {event.source_name} · {formatDate(event.event_at)}
              </small>
            </a>
          </li>
        ))}
      </ul>
      <a className="overview-inline-link" href="/news">
        查看完整时间线 <ArrowRight size={14} />
      </a>
    </section>
  );
}

function MarketPreview({ snapshot }: { snapshot: OverviewSnapshot }) {
  const traffic = snapshot.traffic_snapshot;
  const marketRows = snapshot.market_snapshot
    .filter((item) => ["brent", "wti", "vix", "broad_usd", "gold"].includes(item.target))
    .slice(0, 5);

  return (
    <section className="console-card overview-preview-card">
      <InfoTitle title="市场与通航预览" subtitle="动态 · 本地 generated 快照" />
      <div className="overview-traffic-preview">
        <span>通航</span>
        <strong>{traffic ? formatNumber(traffic.latest_value, 0) : "—"}</strong>
        <small>
          日通航记录
          {traffic ? ` · ${formatDate(traffic.latest_date)}` : ""}
        </small>
        {traffic ? (
          <b data-direction={deltaDirection(traffic.delta_vs_baseline_pct)}>
            较 1y 均值 {formatDelta(traffic.delta_vs_baseline_pct, "%")}
          </b>
        ) : null}
      </div>
      <ul className="overview-market-preview-list">
        {marketRows.map((item) => (
          <li key={item.target}>
            <span>{item.label.replace(" spot proxy", "")}</span>
            <strong>
              {formatNumber(item.value, 2)} {item.unit}
            </strong>
            <b data-direction={deltaDirection(item.delta_1d)}>
              {item.delta_1d === null || item.delta_1d === undefined
                ? item.source_id
                : `${formatDelta(item.delta_1d)} 1d`}
            </b>
          </li>
        ))}
      </ul>
      <p className="overview-card-caveat">
        Gold 使用 Stooq XAU/USD Close proxy；offshore RMB FX 仍缺少 source-bound provider，因此 pending 不出数。
      </p>
      <a className="overview-inline-link" href="/market">
        查看市场背景 <ArrowRight size={14} />
      </a>
    </section>
  );
}

function ProjectPurposeCard() {
  return (
    <section className="console-card overview-purpose-card">
      <div>
        <InfoTitle title="这个网站的初衷" subtitle="把预测 agent 放入具体场景，观察、复核、再迭代" />
        <p>
          本项目选择霍尔木兹海峡作为单一深度 case，是因为它同时牵涉能源供给、航运安全、战争风险、
          通胀预期、避险资产、美元和风险资产。方向可能互相冲突，正适合观察 agent 怎样处理真实世界里的信息噪声。
        </p>
        <p>
          因此这个界面重点不是“直接给结论”，而是把事件时间线、市场背景和通航数据组织成可复核材料，
          再让 Forecast 页展示一次真实 agent run 如何搜证据、调用工具、形成判断并落到 forecast。
          后续迭代会继续改进 agent 行为可视化和 reviewer 体验。
        </p>
      </div>
      <div className="overview-purpose-points" aria-label="project goals">
        <article>
          <span>01</span>
          <strong>让 agent 行为可见</strong>
        </article>
        <article>
          <span>02</span>
          <strong>把场景信息结构化</strong>
        </article>
        <article>
          <span>03</span>
          <strong>持续迭代复核界面</strong>
        </article>
      </div>
    </section>
  );
}

export function OverviewPage() {
  return (
    <section className="page-grid overview-page">
      <div className="overview-guide-layout">
        <HeroPanel snapshot={snapshot} />

        <div className="overview-guide-main">
          <div className="overview-guide-left">
            <NavigationCards />
            <ExampleQuestions />
            <ContextMapCard />
          </div>

          <aside className="overview-guide-right">
            <StaticDynamicCard snapshot={snapshot} />
            <MarketPreview snapshot={snapshot} />
            <LatestEventsPreview events={snapshot.latest_events} />
          </aside>
        </div>

        <ProjectPurposeCard />
      </div>
    </section>
  );
}
