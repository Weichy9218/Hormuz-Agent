// audit:forecast-agent
//
// Validates the local forecast-agent runtime artifact and graph-native trace.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const artifactPath = resolve(root, "data/forecast-agent/latest-run.json");
const violations = [];

if (!existsSync(artifactPath)) {
  violations.push("data/forecast-agent/latest-run.json must exist after a local forecast-agent run");
} else {
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  if (artifact.schemaVersion !== "hormuz-forecast-agent-run/v1") {
    violations.push("latest local agent artifact has wrong schemaVersion");
  }
  if (artifact.runMeta?.runner !== "hormuz-local-forecast-agent") {
    violations.push("runMeta.runner must be hormuz-local-forecast-agent");
  }
  const runDir = artifact.runMeta?.runDir
    ? resolve(root, artifact.runMeta.runDir)
    : "";
  if (!artifact.runMeta?.runDir || !existsSync(runDir)) {
    violations.push("runMeta.runDir must exist");
  }
  if (!artifact.trace?.events?.length) {
    violations.push("trace.events must be non-empty");
  }
  if (!artifact.trace?.graph?.nodes?.length || !artifact.trace?.graph?.edges?.length) {
    violations.push("trace.graph must include React Flow nodes and edges");
  }
  if (!artifact.finalForecast?.prediction) {
    violations.push("finalForecast.prediction must be present");
  }
  if (!artifact.checkpoint?.checkpointId || !artifact.checkpoint?.nextWatch?.length) {
    violations.push("checkpoint must include checkpointId and nextWatch");
  }

  const events = artifact.trace?.events ?? [];
  const eventIds = new Set(events.map((event) => event.eventId));
  if (eventIds.size !== events.length) {
    violations.push("event ids must be unique");
  }
  for (const event of events) {
    if (!event.lane || !event.title || !event.summary) {
      violations.push(`${event.eventId}: event must include lane/title/summary`);
    }
    for (const parentId of event.parentIds ?? []) {
      if (!eventIds.has(parentId)) {
        violations.push(`${event.eventId}: missing parent ${parentId}`);
      }
    }
  }

  const firstAgentTurn = events.find((event) => event.type === "agent_turn");
  const parallelToolCalls = events.filter(
    (event) => event.type === "tool_call" && event.parentIds?.includes(firstAgentTurn?.eventId),
  );
  if (parallelToolCalls.length < 2) {
    violations.push("one agent turn must parent multiple parallel tool calls");
  }

  const toolCallsById = new Set(
    events.filter((event) => event.type === "tool_call").map((event) => event.toolCallId),
  );
  for (const result of events.filter((event) => event.type === "tool_result")) {
    if (!toolCallsById.has(result.toolCallId)) {
      violations.push(`${result.eventId}: tool_result must reference a known tool_call`);
    }
  }

  const graphNodeIds = new Set(artifact.trace.graph.nodes.map((node) => node.id));
  for (const edge of artifact.trace.graph.edges) {
    if (!graphNodeIds.has(edge.source) || !graphNodeIds.has(edge.target)) {
      violations.push(`${edge.id}: graph edge endpoint missing`);
    }
  }

  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    /system prompt/i,
    /internal prompt/i,
    /chain-of-thought/i,
    /scratchpad/i,
    /raw debug/i,
  ]) {
    if (forbidden.test(serialized)) {
      violations.push(`artifact contains forbidden reviewer-unsafe text: ${forbidden}`);
    }
  }
}

if (violations.length > 0) {
  console.error("audit:forecast-agent FAILED");
  for (const violation of violations) console.error("  -", violation);
  process.exit(1);
}

console.log("audit:forecast-agent passed: local forecast-agent artifact, DAG, final forecast, and checkpoint are valid.");
