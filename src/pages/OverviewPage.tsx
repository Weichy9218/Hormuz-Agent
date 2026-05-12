// Overview page: judgement-first case summary for 10-second reviewer scan.
import { useMemo } from "react";
import {
  CheckCircle2,
  FileCheck2,
  Gauge,
  RadioTower,
  Ship,
} from "lucide-react";
import { HormuzBaselineStrip } from "../components/HormuzBaselineStrip";
import { CaseMap } from "../components/map/CaseMap";
import { ScenarioProbabilityRail } from "../components/ScenarioProbabilityRail";
import { InfoTitle } from "../components/shared/InfoTitle";
import { sourceBoundaryFacts } from "../data";
import { pricingPatternCopy } from "../lib/forecastCopy";
import { formatDelta } from "../lib/format";
import { scenarioLabel } from "../state/forecastStore";
import { projectOverviewState } from "../state/projections";

const overviewBaselineFactIds = new Set([
  "oil-flow",
  "bypass-capacity",
  "asia-exposure",
  "lng-relevance",
]);
const overviewBaselineFacts = sourceBoundaryFacts.filter((fact) =>
  overviewBaselineFactIds.has(fact.id),
);

function uniqueSourceIds(facts: Array<{ sourceId: string }>) {
  return [...new Set(facts.map((fact) => fact.sourceId))];
}

function RevisionBriefCard({
  projection,
}: {
  projection: ReturnType<typeof projectOverviewState>;
}) {
  const brief = projection.updateBrief;
  const currentBaseCase = scenarioLabel[brief.currentBaseCaseScenarioId];
  const previousBaseCase = scenarioLabel[brief.previousBaseCaseScenarioId];
  const baseCaseDelta =
    projection.scenarioDelta[brief.currentBaseCaseScenarioId] ?? 0;
  const largestDelta = brief.largestScenarioDelta;
  const largestDeltaLabel = scenarioLabel[largestDelta.scenarioId];
  const baselineSourceIds = uniqueSourceIds(projection.baselineFacts);
  const closureProbability = projection.scenarioDistribution.closure;

  return (
    <section className="console-card update-brief-card overview-brief-card">
      <div className="update-brief-kicker">
        <span>
          <FileCheck2 size={16} />
          judgement_updated
        </span>
        <b>checkpoint · {projection.currentCheckpoint.checkpointId.toUpperCase()}</b>
      </div>

      <div className="update-brief-headline unchanged">
        <span>主情景未改变</span>
        <strong>{currentBaseCase}</strong>
      </div>

      <p>
        结论：{currentBaseCase} 仍是主情景。油价 risk premium 与官方
        advisory 支持扰动上修；但 flow evidence 仍 pending，closure 维持
        {closureProbability}%。
      </p>

      <div className="update-metric-row">
        <article>
          <span>主情景概率</span>
          <strong>{brief.currentProbability}%</strong>
          <em>
            上轮 {previousBaseCase} {brief.previousProbability}% · {formatDelta(baseCaseDelta)}
          </em>
        </article>
        <article>
          <span>最大情景变化</span>
          <strong>{largestDeltaLabel}</strong>
          <em>{formatDelta(largestDelta.delta)}</em>
        </article>
      </div>

      <div className="overview-brief-meta" aria-label="overview source boundary">
        <span>as-of {projection.marketRead.asOf}</span>
        <span>source ids: {baselineSourceIds.join(", ")}</span>
      </div>
    </section>
  );
}

function ScenarioStateCard({
  projection,
}: {
  projection: ReturnType<typeof projectOverviewState>;
}) {
  const closureDelta = projection.scenarioDelta.closure ?? 0;
  const guardrail = projection.whyNotClosure.appliedGuardrails[0];

  return (
    <section className="console-card scenario-card overview-scenario-card">
      <InfoTitle
        title="情景状态"
        subtitle="judgement_updated 之后的 forecast state"
      />
      <ScenarioProbabilityRail
        distribution={projection.scenarioDistribution}
        deltas={projection.scenarioDelta}
      />
      <div className="scenario-audit-row">
        <article>
          <span>base case</span>
          <strong>{scenarioLabel[projection.baseCaseScenarioId]}</strong>
          <p>当前最高概率情景，用于首页判断而非完整解释链。</p>
        </article>
        <article>
          <span>closure check</span>
          <strong>{projection.scenarioDistribution.closure}% · {formatDelta(closureDelta)}</strong>
          <p>仍低于中心判断，需要 verified flow stop / official avoidance 才能上修。</p>
        </article>
        <article>
          <span>guardrail</span>
          <strong>{guardrail ? "cap active" : "未触发 cap"}</strong>
          <p>
            {guardrail
              ? `${scenarioLabel[guardrail.scenarioId]} 上限 ${guardrail.cappedTo}%。`
              : "当前没有新的 closure guardrail。"}
          </p>
        </article>
      </div>
    </section>
  );
}

function WhyNotClosureCard({
  projection,
}: {
  projection: ReturnType<typeof projectOverviewState>;
}) {
  const counterEvidence = projection.whyNotClosure.counterEvidence[0];
  const guardrail = projection.whyNotClosure.appliedGuardrails[0];

  return (
    <section className="console-card compact-list-card overview-decision-card">
      <InfoTitle
        title="为什么还不是封锁？"
        subtitle="缺的是能改变中心判断的证据"
      />
      <p>
        {counterEvidence?.claim ??
          "尚无 verified traffic stop 或 official avoidance，因此 closure 不能成为主情景。"}
      </p>
      <ul>
        <li>missing: verified traffic stop / official avoidance</li>
        <li>
          guardrail:{" "}
          {guardrail
            ? `${scenarioLabel[guardrail.scenarioId]} capped at ${guardrail.cappedTo}%`
            : "no active closure cap"}
        </li>
        <li>pending caveat: {projection.pendingSourceIds.join(", ")}</li>
      </ul>
    </section>
  );
}

function NextWatchCard({
  projection,
}: {
  projection: ReturnType<typeof projectOverviewState>;
}) {
  return (
    <section className="console-card compact-list-card overview-decision-card">
      <InfoTitle title="下一步观察" subtitle="会让判断真正移动的触发器" />
      <ul>
        {projection.nextWatch.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function KeySignalsRow({
  projection,
}: {
  projection: ReturnType<typeof projectOverviewState>;
}) {
  return (
    <div className="overview-signal-row">
      <article className="console-card">
        <Ship size={19} />
        <span>Maritime advisory</span>
        <strong>elevated, no avoidance wording</strong>
        <p>官方措辞支持 transit risk premium，但不足以单独触发 closure。</p>
      </article>
      <article className="console-card">
        <RadioTower size={19} />
        <span>Flow evidence</span>
        <strong>pending caveat visible</strong>
        <p>授权 AIS / tanker / LNG flow 仍待接入，不能渲染为实时船数。</p>
      </article>
      <article className="console-card">
        <Gauge size={19} />
        <span>Market read · as-of {projection.marketRead.asOf}</span>
        <strong>{pricingPatternCopy[projection.marketRead.pricingPattern]}</strong>
        <p>{projection.marketRead.caveat}</p>
      </article>
    </div>
  );
}

function CurrentCheckpointCard({
  projection,
}: {
  projection: ReturnType<typeof projectOverviewState>;
}) {
  const checkpoint = projection.currentCheckpoint;

  return (
    <section className="console-card checkpoint-strip overview-checkpoint-strip">
      <div>
        <InfoTitle
          title="当前 checkpoint"
          subtitle={`${checkpoint.checkpointId.toUpperCase()} · ${checkpoint.writtenAt}`}
        />
        <span className="checkpoint-state-chip">
          <CheckCircle2 size={15} />
          state change source: judgement_updated
        </span>
      </div>
      <div className="overview-checkpoint-grid">
        <article>
          <span>revision reason</span>
          <p>{checkpoint.revisionReason}</p>
        </article>
        <article>
          <span>active evidence</span>
          <strong>{checkpoint.reusedState.activeEvidenceIds.join(", ")}</strong>
        </article>
        <article>
          <span>pending sources</span>
          <strong>{checkpoint.reusedState.pendingSourceIds.join(", ")}</strong>
        </article>
      </div>
    </section>
  );
}

export function OverviewPage() {
  const projection = useMemo(
    () =>
      projectOverviewState(
        overviewBaselineFacts.map(({ label, value, unit, sourceId, detail }) => ({
          label,
          value,
          unit,
          sourceId,
          detail,
        })),
      ),
    [],
  );

  return (
    <section className="page-grid overview-page">
      <div className="overview-main-layout">
        <div className="overview-left-column">
          <div className="overview-top-row">
            <RevisionBriefCard projection={projection} />
            <ScenarioStateCard projection={projection} />
          </div>

          <div className="overview-map-row">
            <CaseMap />
          </div>
        </div>

        <aside className="overview-side-column">
          <WhyNotClosureCard projection={projection} />
          <NextWatchCard projection={projection} />
          <HormuzBaselineStrip />
        </aside>
      </div>

      <KeySignalsRow projection={projection} />

      <CurrentCheckpointCard projection={projection} />
    </section>
  );
}
