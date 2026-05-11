// Shared identity helpers for linking AgentRunEvent stream cards to graph nodes.
import type { AgentRunEvent, MechanismTag } from "../../types/agentEvents";

export function getAgentEventKey(event: AgentRunEvent) {
  if (event.type === "evidence_added") return `event:evidence:${event.evidenceId}`;
  if (event.type === "checkpoint_written") return `event:checkpoint:${event.checkpointId}`;
  return `event:${event.runId}:${event.type}:${event.at}`;
}

export function getGraphNodeIdForEvent(event: AgentRunEvent) {
  switch (event.type) {
    case "source_read":
      return `source:${getAgentEventKey(event)}`;
    case "evidence_added":
      return `evidence:${event.evidenceId}`;
    case "judgement_updated":
      return `judgement:${getAgentEventKey(event)}`;
    case "checkpoint_written":
      return `checkpoint:${event.checkpointId}`;
    default:
      return null;
  }
}

export function getMechanismNodeId(tag: MechanismTag) {
  return `mechanism:${tag}`;
}

export function toDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
