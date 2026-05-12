// News page: candidate evidence timeline and source-boundary handoff into forecasting.
import { useMemo } from "react";
import { InfoTitle } from "../components/shared/InfoTitle";
import {
  narrativeEvents,
  sourceRegistry,
} from "../data";
import {
  eventCategoryLabel,
  sourceStatusCopy,
} from "../lib/forecastCopy";
import {
  scenarioLabel,
  scenarioOrder,
} from "../state/forecastStore";
import {
  projectForecastState,
} from "../state/projections";

export function NewsTimelinePage() {
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
            这里不是新闻 dashboard，也不抓取实时船流；时间线只保留 candidate evidence。
            只有通过 source / evidence / mechanism 校验的内容才会 handoff 到 Forecast。
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
        <p className="news-bridge-note">
          News 页面只显示候选输入与 source boundary；概率只能由 Forecast 事件流里的
          judgement_updated 写入。
        </p>
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
                <small>source id: {source.id}</small>
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
