// Displays the auditable checkpoint produced by a forecast run.
// Surfaces revisionReason, reusedState, deltaAttribution, nextWatch.
import { ShieldAlert } from "lucide-react";
import type { ForecastCheckpoint, ForecastDirection } from "../../types/forecast";
import { targetLabel } from "../../state/forecastStore";

const directionLabel: Record<ForecastDirection, string> = {
  up: "上行",
  down: "下行",
  flat: "持平",
  uncertain: "不确定",
};

export function CheckpointCard({ checkpoint }: { checkpoint: ForecastCheckpoint }) {
  return (
    <section className="panel checkpoint-card">
      <div className="panel-title compact">
        <span className="icon-chip">
          <ShieldAlert size={18} />
        </span>
        <div>
          <h2>Checkpoint 状态</h2>
          <p>revision reason、reused state、delta attribution 与 next watch</p>
        </div>
      </div>
      <div className="checkpoint-body">
        <span>{checkpoint.checkpointId}</span>
        <strong>{checkpoint.revisionReason}</strong>

        <div className="checkpoint-row">
          <span>复用状态 · reused state</span>
          <ul>
            {checkpoint.reusedState.activeEvidenceIds.length === 0 ? (
              <li>(没有复用 active evidence)</li>
            ) : (
              checkpoint.reusedState.activeEvidenceIds.map((id) => (
                <li key={`active-${id}`}>active: {id}</li>
              ))
            )}
            {checkpoint.reusedState.staleEvidenceIds.map((id) => (
              <li key={`stale-${id}`}>stale: {id}</li>
            ))}
            {checkpoint.reusedState.pendingSourceIds.map((id) => (
              <li key={`pending-${id}`}>pending source: {id}</li>
            ))}
          </ul>
        </div>

        <div className="checkpoint-row">
          <span>变化归因 · delta attribution</span>
          <ul>
            {checkpoint.deltaAttribution.length === 0 ? (
              <li>(没有记录 attribution)</li>
            ) : (
              checkpoint.deltaAttribution.map((a, index) => (
                <li
                  key={`${String(a.target)}-${a.magnitudeLabel ?? index}-${a.contributingEvidenceIds.join(",")}`}
                >
                  <b>{a.target === "scenario" ? "情景" : targetLabel[a.target]}</b>{" "}
                  {directionLabel[a.direction]} · evidence{" "}
                  {a.contributingEvidenceIds.join(", ") || "—"} · mechanisms{" "}
                  {a.contributingMechanismTags.join(", ") || "—"}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="checkpoint-watch">
          {checkpoint.nextWatch.map((watch) => (
            <p key={watch}>{watch}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
