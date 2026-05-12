// Scenario probability rail for current forecast distributions.
import {
  scenarioColor,
  scenarioLabel,
  scenarioOrder,
} from "../state/forecastStore";
import type { ScenarioId } from "../types/forecast";
import { formatDelta } from "../lib/format";

export function ScenarioProbabilityRail({
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
