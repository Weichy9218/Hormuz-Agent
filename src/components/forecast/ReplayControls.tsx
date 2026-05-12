// Lightweight presentation-only replay controls for AgentRunEvent[].
import type { AgentRunEvent } from "../../types/agentEvents";

interface ReplayControlsProps {
  events: AgentRunEvent[];
  step: number;
  enabled: boolean;
  stateRevealed: boolean;
  onToggle: () => void;
  onStepChange: (step: number) => void;
}

export function ReplayControls({
  events,
  step,
  enabled,
  stateRevealed,
  onToggle,
  onStepChange,
}: ReplayControlsProps) {
  const currentEvent = events[Math.max(0, step - 1)] ?? null;

  return (
    <div className={`stream-detail-block replay-control-panel ${enabled ? "is-replaying" : ""}`}>
      <div className="replay-control-head">
        <span>Replay mode</span>
        <strong>{enabled ? "逐事件回放中" : "从事件流审计状态变化"}</strong>
      </div>
      <div className="replay-command-row" role="group" aria-label="Replay controls">
        <button className={enabled ? "selected" : ""} onClick={onToggle} type="button">
          {enabled ? "退出回放" : "进入回放"}
        </button>
        <button
          disabled={!enabled || step <= 0}
          onClick={() => onStepChange(Math.max(0, step - 1))}
          type="button"
        >
          上一步
        </button>
        <button
          disabled={!enabled || step >= events.length}
          onClick={() => onStepChange(Math.min(events.length, step + 1))}
          type="button"
        >
          下一步
        </button>
        <button disabled={!enabled} onClick={() => onStepChange(events.length)} type="button">
          完成
        </button>
      </div>
      <div className="replay-progress" aria-label="Replay progress">
        <i style={{ width: `${events.length ? ((enabled ? step : events.length) / events.length) * 100 : 0}%` }} />
      </div>
      <div className="stream-chips subdued">
        <span>
          visible events: {enabled ? step : events.length}/{events.length}
        </span>
        <span>
          current state: {stateRevealed ? "revealed after judgement_updated" : "holding previous state"}
        </span>
        {currentEvent ? (
          <span>
            anchor: {currentEvent.eventId} · {currentEvent.type}
          </span>
        ) : null}
      </div>
      <p>
        source_read / evidence_added 只追加事件；scenario distribution 与 target forecast
        只在 judgement_updated 后显示 current state。
      </p>
    </div>
  );
}
