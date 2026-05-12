// Shows the core old -> new scenario revision and target forecast state.
import { TrendingUp } from "lucide-react";
import type { AgentRunEvent } from "../../types/agentEvents";
import type {
  ForecastTarget,
  ScenarioId,
  TargetForecast,
} from "../../types/forecast";
import { scenarioColor, scenarioOrder, targetLabel } from "../../state/forecastStore";

const directionLabel: Record<TargetForecast["direction"], string> = {
  up: "上行",
  down: "下行",
  flat: "持平",
  uncertain: "不确定",
};

function formatDelta(delta: number) {
  if (delta === 0) return "0 pp";
  return `${delta > 0 ? "+" : ""}${delta} pp`;
}

function findJudgementEvent(events: AgentRunEvent[]) {
  return events.find(
    (event): event is Extract<AgentRunEvent, { type: "judgement_updated" }> =>
      event.type === "judgement_updated",
  );
}

export interface JudgementDeltaCardProps {
  events: AgentRunEvent[];
  scenarioDistribution: Record<ScenarioId, number>;
  targetForecasts: TargetForecast[];
  selectedTarget: ForecastTarget;
  scenarioLabels: Record<ScenarioId, string>;
}

export function JudgementDeltaCard({
  events,
  scenarioDistribution,
  targetForecasts,
  selectedTarget,
  scenarioLabels,
}: JudgementDeltaCardProps) {
  const judgementEvent = findJudgementEvent(events);
  const selectedForecast =
    targetForecasts.find((forecast) => forecast.target === selectedTarget) ??
    targetForecasts[0];
  const targetDeltas = judgementEvent?.targetDeltas ?? [];

  return (
    <section className="panel judgement-panel">
      <div className="panel-title compact">
        <span className="icon-chip">
          <TrendingUp size={18} />
        </span>
        <div>
          <h2>当前预测状态</h2>
          <p>只展示本轮 scenario distribution 与目标预测，不复写事件流</p>
        </div>
      </div>

      {judgementEvent ? (
        <div className="judgement-delta-callout">
          <span>
            <TrendingUp size={15} />
            old → new 修订
          </span>
          <strong>{judgementEvent.reason}</strong>
        </div>
      ) : null}

      <div className="judgement-probabilities">
        {scenarioOrder.map((scenario) => {
          const probability = scenarioDistribution[scenario];
          const delta = judgementEvent?.scenarioDelta[scenario] ?? 0;

          return (
            <article key={scenario}>
              <div>
                <span>{scenarioLabels[scenario]}</span>
                <strong>
                  {probability}%{" "}
                  <b className={delta > 0 ? "positive" : delta < 0 ? "negative" : ""}>
                    {formatDelta(delta)}
                  </b>
                </strong>
              </div>
              <i>
                <em style={{ width: `${probability}%`, background: scenarioColor[scenario] }} />
              </i>
            </article>
          );
        })}
      </div>

      {judgementEvent?.appliedGuardrails.length ? (
        <div className="judgement-guardrails">
          <span>已应用 guardrails</span>
          <ul>
            {judgementEvent.appliedGuardrails.map((g) => (
              <li key={`${g.scenarioId}-${g.reasonCode}`}>
                <b>{g.scenarioId}</b> capped {g.cappedFrom.toFixed(0)}% → {g.cappedTo}% ·{" "}
                <em>{g.reasonCode}</em>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {judgementEvent?.sensitivity.length ? (
        <div className="judgement-sensitivity">
          <span>Sensitivity（结构性）</span>
          <ul>
            {judgementEvent.sensitivity.map((s, index) => (
              <li key={`${s.sensitivityId}-${String(s.target)}-${index}`}>
                <b>{String(s.target)}</b>: {s.statement}{" "}
                <em>[{s.expectedFailureMode}]</em>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selectedForecast ? (
        <div className="target-forecast-card">
          <span>当前预测目标</span>
          <strong>{targetLabel[selectedForecast.target]}</strong>
          <p>
            {selectedForecast.horizon} · {directionLabel[selectedForecast.direction]} · confidence{" "}
            {(selectedForecast.confidence * 100).toFixed(0)}%
          </p>
          <em>{selectedForecast.deltaLabel}</em>
          <small>{selectedForecast.rationale}</small>
        </div>
      ) : null}

      <div className="target-delta-panel">
        <span>目标变化 · target deltas</span>
        {targetDeltas.map((delta) => (
          <p key={`${delta.target}-${delta.horizon}`}>
            <b>{targetLabel[delta.target]}</b>
            {delta.horizon}: {directionLabel[delta.direction]} · confidence{" "}
            {(delta.confidence * 100).toFixed(0)}%
            <em>{delta.deltaLabel}</em>
          </p>
        ))}
      </div>
    </section>
  );
}
