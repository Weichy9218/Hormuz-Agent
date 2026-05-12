// Shared runtime contract for the local Hormuz forecast agent.
// This mirrors the Galaxy forecast finalization gate while emitting graph-native events.

export const FORECAST_AGENT_SCHEMA_VERSION = "hormuz-forecast-agent-run/v1";

export const agentLaneOrder = [
  "question",
  "source",
  "search",
  "read",
  "evidence",
  "mechanism",
  "judgement",
  "forecast",
  "checkpoint",
];

export const laneLabels = {
  question: "Question",
  source: "Source boundary",
  search: "Search batch",
  read: "Read artifacts",
  evidence: "Evidence",
  mechanism: "Mechanism",
  judgement: "Judgement delta",
  forecast: "Forecast",
  checkpoint: "Checkpoint",
};

export function sanitizeText(value, maxLength = 360) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\b(system prompt|internal prompt|chain-of-thought|scratchpad)\b/gi, "[redacted]")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export function isoNow() {
  return new Date().toISOString();
}

export function toSafeJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function compactArgs(args) {
  const safe = {};
  for (const [key, value] of Object.entries(args || {})) {
    if (typeof value === "string") {
      safe[key] = sanitizeText(value, 220);
    } else if (Array.isArray(value)) {
      safe[key] = value.slice(0, 8).map((item) => sanitizeText(item, 160));
    } else if (value && typeof value === "object") {
      safe[key] = sanitizeText(JSON.stringify(value), 240);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

export function createEvent({
  runId,
  sequence,
  type,
  lane,
  title,
  summary,
  parentIds = [],
  status = "success",
  graphRole,
  toolName,
  toolCallId,
  args,
  result,
  sourceIds,
  sourceObservationIds,
  evidenceIds,
  mechanismTags,
  forecastPayload,
  checkpoint,
  startedAt,
  completedAt,
  current = false,
}) {
  const eventId = `${runId}-evt-${String(sequence).padStart(3, "0")}-${type}`;
  return {
    eventId,
    sequence,
    type,
    lane,
    graphRole: graphRole || type,
    title: sanitizeText(title, 120),
    summary: sanitizeText(summary, 520),
    parentIds,
    status,
    startedAt: startedAt || isoNow(),
    completedAt,
    current,
    toolName,
    toolCallId,
    args: args ? compactArgs(args) : undefined,
    result: result ? toSafeJson(result) : undefined,
    sourceIds,
    sourceObservationIds,
    evidenceIds,
    mechanismTags,
    forecastPayload: forecastPayload ? toSafeJson(forecastPayload) : undefined,
    checkpoint: checkpoint ? toSafeJson(checkpoint) : undefined,
  };
}

export function eventToAction(event, index = event.sequence ?? 0) {
  const kindMap = {
    question_loaded: "question",
    agent_turn: "assistant_note",
    source_selected: "artifact_read",
    tool_call: "tool_call",
    tool_result: "tool_result",
    evidence_added: "artifact_read",
    mechanism_mapped: "evidence_synthesis",
    judgement_updated: "evidence_synthesis",
    final_forecast: "final_forecast",
    checkpoint_written: "checkpoint",
    run_started: "supervisor",
    run_completed: "supervisor",
    run_failed: "supervisor",
  };
  return {
    actionId: event.eventId,
    index,
    kind: kindMap[event.type] || "assistant_note",
    title: event.title,
    summary: event.summary,
    at: event.completedAt || event.startedAt,
    status: event.status,
    toolName: event.toolName,
    toolCallId: event.toolCallId,
    parentActionIds: event.parentIds || [],
    artifactPath: event.result?.artifactPath || event.result?.artifact_path,
    sourceUrl: event.result?.sourceUrl || event.args?.url,
    query: event.args?.query,
    argsSummary: event.args ? sanitizeText(JSON.stringify(event.args), 360) : undefined,
    lane: laneToGalaxyLane(event.lane),
    forecastPayload: event.forecastPayload
      ? {
          prediction: event.forecastPayload.prediction,
          confidence: event.forecastPayload.confidence,
          rationale: event.forecastPayload.rationale,
          keyEvidenceItems: event.forecastPayload.keyEvidenceItems,
          counterEvidenceItems: event.forecastPayload.counterEvidenceItems,
          openConcerns: event.forecastPayload.openConcerns,
          temporalNotes: event.forecastPayload.temporalNotes,
        }
      : undefined,
    evidenceRole: evidenceRole(event),
    rawRole: event.type === "agent_turn" ? "assistant" : event.type === "tool_result" ? "tool" : "user",
  };
}

function laneToGalaxyLane(lane) {
  if (lane === "question") return "question";
  if (lane === "source" || lane === "search") return "search_batch";
  if (lane === "read") return "read_artifacts";
  if (lane === "evidence" || lane === "mechanism" || lane === "judgement") return "evidence_synthesis";
  if (lane === "forecast") return "forecast";
  if (lane === "checkpoint") return "checkpoint";
  return "agent_turn";
}

function evidenceRole(event) {
  if (event.type === "question_loaded") return "question_audit";
  if (event.type === "tool_call" && event.toolName?.includes("search")) return "source_search";
  if (event.type === "tool_call" || event.type === "tool_result" || event.type === "source_selected") return "source_read";
  if (event.type === "evidence_added" || event.type === "mechanism_mapped" || event.type === "judgement_updated") return "evidence_extract";
  if (event.type === "final_forecast") return "forecast_record";
  return "source_read";
}
