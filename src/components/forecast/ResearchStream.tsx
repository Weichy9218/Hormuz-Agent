// Renders the agent run as an auditable evidence stream.
import { CheckCircle2 } from "lucide-react";
import type { AgentRunEvent } from "../../types/agentEvents";
import type { SourceRegistryEntry } from "../../types";
import { eventTypeTitle } from "./eventLabels";

const eventTypeLabel: Record<AgentRunEvent["type"], string> = {
  run_started: "run",
  source_read: "source",
  evidence_added: "evidence",
  judgement_updated: "judgement",
  checkpoint_written: "checkpoint",
  run_completed: "complete",
};

const polarityLabel = {
  support: "支持",
  counter: "反证",
  uncertain: "不确定",
};

const affectsLabel = {
  scenario: "情景",
  market: "市场",
  war_trend: "战争趋势",
  watchlist: "观察项",
};

const mechanismLabel = {
  transit_risk_up: "transit risk up",
  insurance_cost_up: "insurance cost up",
  naval_presence_up: "naval presence up",
  mine_or_swarm_risk_up: "mine / swarm risk up",
  energy_supply_risk_up: "energy supply risk up",
  diplomatic_deescalation: "diplomatic de-escalation",
  oil_flow_resilient: "oil flow resilient",
  market_not_pricing_closure: "market not pricing closure",
  market_pricing_risk_premium: "market pricing risk premium",
};

function eventSummary(event: AgentRunEvent) {
  switch (event.type) {
    case "judgement_updated":
      return event.reason;
    case "checkpoint_written":
      return event.revisionReason;
    default:
      return event.summary;
  }
}

function sourceName(sourceRegistry: SourceRegistryEntry[], sourceId: string) {
  const source = sourceRegistry.find((entry) => entry.id === sourceId);
  return source?.name ?? sourceId;
}

function formatDelta(delta: number) {
  if (delta === 0) return "0 pp";
  return `${delta > 0 ? "+" : ""}${delta} pp`;
}

interface ResearchStreamProps {
  events: AgentRunEvent[];
  visibleCount: number;
  isRunning: boolean;
  sourceRegistry: SourceRegistryEntry[];
  scenarioLabels: Record<string, string>;
}

export function ResearchStream({
  events,
  visibleCount,
  isRunning,
  sourceRegistry,
  scenarioLabels,
}: ResearchStreamProps) {
  const visibleEvents = events.slice(0, visibleCount);

  return (
    <div className="research-stream" aria-label="Agent 事件流">
      {visibleEvents.length === 0 ? (
        <article className="stream-empty">
          <span className="stream-step">0</span>
          <div className="stream-body">
            <div className="stream-title-row">
              <span>ready</span>
              <strong>等待 Agent 运行</strong>
            </div>
            <p>运行后将只按 AgentRunEvent[] 展示 source、evidence、judgement 与 checkpoint。</p>
          </div>
        </article>
      ) : null}

      {visibleEvents.map((event, index) => {
        const active = isRunning && index === visibleEvents.length - 1;
        const done = !active;
        const eventKey =
          event.type === "evidence_added"
            ? event.evidenceId
            : `${event.runId}-${event.type}-${event.at}`;

        return (
          <article
            className={`${event.type} ${active ? "active" : ""} ${done ? "done" : ""}`}
            key={eventKey}
          >
            <span className="stream-step">
              {done ? <CheckCircle2 size={16} /> : index + 1}
            </span>
            <div className="stream-body">
              <div className="stream-title-row">
                <span>{eventTypeLabel[event.type]} · {event.at}</span>
                <strong>{event.title}</strong>
              </div>
              <p>{eventSummary(event)}</p>
              <AgentEventDetails
                event={event}
                scenarioLabels={scenarioLabels}
                sourceRegistry={sourceRegistry}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function AgentEventDetails({
  event,
  sourceRegistry,
  scenarioLabels,
}: {
  event: AgentRunEvent;
  sourceRegistry: SourceRegistryEntry[];
  scenarioLabels: Record<string, string>;
}) {
  if (event.type === "run_started" || event.type === "run_completed") {
    return null;
  }

  if (event.type === "source_read") {
    return (
      <div className="stream-detail-block source-list">
        <span>{eventTypeTitle[event.type]}</span>
        <div className="stream-chips">
          {event.sourceIds.map((sourceId) => (
            <span key={sourceId}>{sourceName(sourceRegistry, sourceId)}</span>
          ))}
        </div>
      </div>
    );
  }

  if (event.type === "evidence_added") {
    return (
      <div className="stream-detail-block evidence-detail">
        <div className="evidence-row">
          <span className={`polarity ${event.polarity}`}>{polarityLabel[event.polarity]}</span>
          <strong>{event.affects.map((target) => affectsLabel[target]).join(" / ")}</strong>
        </div>
        <div className="stream-chips">
          {event.mechanismTags.map((tag) => (
            <span key={tag}>{mechanismLabel[tag]}</span>
          ))}
        </div>
        <div className="stream-chips subdued">
          {event.sourceIds.map((sourceId) => (
            <span key={sourceId}>{sourceName(sourceRegistry, sourceId)}</span>
          ))}
        </div>
      </div>
    );
  }

  if (event.type === "judgement_updated") {
    return (
      <>
        <div className="probability-delta-grid" aria-label="概率修订">
          {Object.entries(event.currentScenario).map(([scenarioKey, current]) => {
            const key = scenarioKey as keyof typeof event.currentScenario;
            const delta = event.scenarioDelta[key];
            const previous = event.previousScenario[key];

            return (
              <div className={delta > 0 ? "up" : delta < 0 ? "down" : "flat"} key={key}>
                <span>{scenarioLabels[key] ?? key}</span>
                <strong>
                  {previous}% → {current}%
                </strong>
                <b>{formatDelta(delta)}</b>
              </div>
            );
          })}
        </div>
        <div className="target-delta-list">
          {event.targetDeltas.map((delta) => (
            <span key={`${delta.target}-${delta.horizon}`}>
              <b>{delta.target}</b>
              {delta.horizon}: {delta.previous} → {delta.current}
              <em>{delta.deltaLabel}</em>
            </span>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="stream-detail-block checkpoint-note">
      <span>{event.checkpointId}</span>
      <strong>{event.summary}</strong>
      <div className="watch-list-inline">
        {event.nextWatch.map((watch) => (
          <p key={watch}>{watch}</p>
        ))}
      </div>
    </div>
  );
}
