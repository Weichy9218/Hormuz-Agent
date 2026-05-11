// Displays the auditable checkpoint produced by a forecast run.
import { ShieldAlert } from "lucide-react";
import type { ForecastCheckpoint } from "../../types/forecast";

export function CheckpointCard({ checkpoint }: { checkpoint: ForecastCheckpoint }) {
  return (
    <section className="panel checkpoint-card">
      <div className="panel-title compact">
        <span className="icon-chip">
          <ShieldAlert size={18} />
        </span>
        <div>
          <h2>Checkpoint</h2>
          <p>写回的 revision reason 和下一次观察项</p>
        </div>
      </div>
      <div className="checkpoint-body">
        <span>{checkpoint.checkpointId}</span>
        <strong>{checkpoint.revisionReason}</strong>
        <div className="checkpoint-watch">
          {checkpoint.nextWatch.map((watch) => (
            <p key={watch}>{watch}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
