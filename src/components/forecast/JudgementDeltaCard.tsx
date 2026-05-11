// Shows the core old -> new scenario revision and target forecast state.
import { TrendingUp } from "lucide-react";
import type { AgentRunEvent } from "../../types/agentEvents";
import type { ForecastRunResponse, ForecastTarget, ScenarioKey } from "../../types/forecast";
import { scenarioColor, scenarioOrder, targetLabel } from "../../state/forecastStore";

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

export function JudgementDeltaCard({
  forecastRun,
  selectedTarget,
  scenarioLabels,
}: {
  forecastRun: ForecastRunResponse;
  selectedTarget: ForecastTarget;
  scenarioLabels: Record<ScenarioKey, string>;
}) {
  const judgementEvent = findJudgementEvent(forecastRun.events);
  const selectedForecast =
    forecastRun.targetForecasts.find((forecast) => forecast.target === selectedTarget) ??
    forecastRun.targetForecasts[0];
  const targetDeltas = judgementEvent?.targetDeltas ?? [];

  return (
    <section className="panel judgement-panel">
      <div className="panel-title compact">
        <span className="icon-chip">
          <TrendingUp size={18} />
        </span>
        <div>
          <h2>Forecast state</h2>
          <p>只展示本轮 scenario distribution 与目标预测，不复写事件流</p>
        </div>
      </div>

      {judgementEvent ? (
        <div className="judgement-delta-callout">
          <span>
            <TrendingUp size={15} />
            old → new
          </span>
          <strong>{judgementEvent.reason}</strong>
        </div>
      ) : null}

      <div className="judgement-probabilities">
        {scenarioOrder.map((scenario) => {
          const probability = forecastRun.scenarioDistribution[scenario];
          const delta = judgementEvent?.scenarioDelta[scenario] ?? 0;

          return (
            <article key={scenario}>
              <div>
                <span>{scenarioLabels[scenario]}</span>
                <strong>
                  {probability}% <b className={delta > 0 ? "positive" : delta < 0 ? "negative" : ""}>{formatDelta(delta)}</b>
                </strong>
              </div>
              <i>
                <em style={{ width: `${probability}%`, background: scenarioColor[scenario] }} />
              </i>
            </article>
          );
        })}
      </div>

      {selectedForecast ? (
        <div className="target-forecast-card">
          <span>selected target</span>
          <strong>{targetLabel[selectedForecast.target]}</strong>
          <p>
            {selectedForecast.horizon} · {selectedForecast.direction} · confidence{" "}
            {(selectedForecast.confidence * 100).toFixed(0)}%
          </p>
          <em>{selectedForecast.deltaLabel}</em>
          <small>{selectedForecast.rationale}</small>
        </div>
      ) : null}

      <div className="target-delta-panel">
        <span>target deltas</span>
        {targetDeltas.map((delta) => (
          <p key={`${delta.target}-${delta.horizon}`}>
            <b>{targetLabel[delta.target]}</b>
            {delta.horizon}: {delta.direction} · confidence{" "}
            {(delta.confidence * 100).toFixed(0)}%
            <em>{delta.deltaLabel}</em>
          </p>
        ))}
      </div>
    </section>
  );
}
