// audit:galaxy
//
// Validates the daily Hormuz question and normalized galaxy run artifact before
// the Forecast page consumes it.
import { readFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const questionPath = resolve(root, "data/galaxy/hormuz-daily-question.jsonl");
const artifactPath = resolve(root, "data/galaxy/latest-run.json");

const questionRows = (await readFile(questionPath, "utf8"))
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
const violations = [];
const isDemoArtifact = artifact.runMeta?.demo === true;
const rawPreviewLeakPattern =
  /"role"\s*:\s*"system"|# Role|Working rhythm|chain-of-thought|system prompt|internal prompt/i;

function storyActionIdsForAudit(actions) {
  const ids = new Set();
  for (const action of actions) {
    if (action.kind === "question" || action.criticalPath || action.kind === "final_forecast" || action.kind === "checkpoint") {
      ids.add(action.actionId);
    }
  }
  const hasEvidenceSource = actions.some(
    (action) => ids.has(action.actionId) && (action.kind === "tool_result" || action.kind === "artifact_read"),
  );
  if (!hasEvidenceSource) {
    for (const action of [...actions].reverse()) {
      if (
        action.toolName !== "record_forecast" &&
        (action.kind === "tool_result" || action.kind === "artifact_read" || action.kind === "tool_call")
      ) {
        ids.add(action.actionId);
      }
      if (ids.size >= 8) break;
    }
  }
  return ids;
}

function parseFinalPrediction(artifact, recordForecast) {
  return Number.parseFloat(String(
    artifact.runMeta?.finalPrediction ??
    recordForecast?.forecastPayload?.prediction ??
    artifact.finalForecast?.prediction ??
    "",
  ).replace(/[^\d.-]/g, ""));
}

if (questionRows.length !== 1) {
  violations.push(`daily question file must contain exactly one row, found ${questionRows.length}`);
}
const question = questionRows[0];
const questionKind = question?.metadata?.question_kind || "hormuz_traffic_risk";
const isBrentWeeklyHigh = questionKind === "brent_weekly_high";
const isCustomQuestion = questionKind === "custom";
const isNumericQuestion =
  isBrentWeeklyHigh ||
  (isCustomQuestion &&
    !/\\boxed\{letter\}|single letter|scenario|A\.\s|B\.\s|C\.\s|D\.\s/i.test(
      `${question?.task_question ?? ""} ${question?.task_description ?? ""}`,
    ));
const validTaskId = isDemoArtifact
  ? question?.task_id === "hormuz-brent-weekly-high-demo"
  : /^hormuz-(traffic-risk|brent-weekly-high)-\d{4}-\d{2}-\d{2}$/.test(question?.task_id ?? "") ||
    /^hormuz-custom-\d{4}-\d{2}-\d{2}$/.test(question?.task_id ?? "");
if (!validTaskId) {
  violations.push("question.task_id must use a dated Hormuz task id, except explicit hormuz-brent-weekly-high-demo fixtures");
}
if (!question?.task_question?.includes(isNumericQuestion ? "\\boxed{number}" : "\\boxed{letter}") && !isCustomQuestion) {
  violations.push("question must preserve boxed final answer format");
}
if (isCustomQuestion && !question?.task_question?.includes("\\boxed{your answer}")) {
  violations.push("custom question must preserve generic boxed final answer format");
}
if (
  isBrentWeeklyHigh &&
  question?.metadata?.target_series !== "DCOILBRENTEU" &&
  question?.metadata?.target_series_id !== "DCOILBRENTEU"
) {
  violations.push("Brent weekly-high question must declare FRED DCOILBRENTEU as target_series or target_series_id");
}
if (isBrentWeeklyHigh) {
  if (question?.metadata?.target !== "brent") {
    violations.push("Brent weekly-high question must declare metadata.target = brent");
  }
  if (question?.metadata?.unit !== "USD/bbl") {
    violations.push("Brent weekly-high question must declare metadata.unit = USD/bbl");
  }
  const window =
    typeof question?.metadata?.resolution_window === "object"
      ? question.metadata.resolution_window
      : question?.metadata?.resolution_window_detail;
  if (!isDemoArtifact && (!window?.start_date || !window?.end_date || !window?.timezone)) {
    violations.push("Brent weekly-high question must declare resolution_window start_date/end_date/timezone");
  }
  if (isDemoArtifact && question?.metadata?.resolution_window !== "weekly") {
    violations.push("demo Brent weekly-high question must declare metadata.resolution_window = weekly");
  }
}
if (!isCustomQuestion && !question?.task_description?.includes("Market data is evidence input only")) {
  violations.push("question description must state market-data boundary");
}
if (artifact.schemaVersion !== "hormuz-galaxy-run/v1") {
  violations.push("latest-run.json has wrong schemaVersion");
}
if (artifact.question?.task_id !== question?.task_id) {
  violations.push("latest-run.json question.task_id must match daily question row");
}
if (artifact.runMeta?.runner !== "galaxy-selfevolve") {
  violations.push("runMeta.runner must be galaxy-selfevolve");
}
if (!artifact.runMeta?.questionDate || !artifact.runMeta?.forecastedAt) {
  violations.push("runMeta must include questionDate and forecastedAt");
}
if (!artifact.runMeta?.runDir) {
  violations.push("runMeta must include the task-specific runDir");
} else {
  const runDirParent = basename(dirname(String(artifact.runMeta.runDir)));
  if (runDirParent === artifact.runMeta.questionDate) {
    violations.push("runMeta.runDir must be unique per run, not the date/task-id reusable directory");
  }
}
if (artifact.runMeta?.status === "success") {
  if (!isDemoArtifact && !artifact.runMeta?.venvPath?.endsWith("galaxy-selfevolve/.venv")) {
    violations.push("successful runMeta must record the reused galaxy-selfevolve/.venv path");
  }
  if (!isDemoArtifact && !artifact.runMeta?.pythonPath?.endsWith("galaxy-selfevolve/.venv/bin/python")) {
    violations.push("successful runMeta must execute through galaxy-selfevolve/.venv/bin/python");
  }
  const commandHead = artifact.runMeta?.command?.[0] ?? "";
  const validDemoCommand = isDemoArtifact && artifact.runMeta?.command?.join(" ") === "node scripts/build-demo-artifact.mjs --demo";
  if (!validDemoCommand && !commandHead.endsWith("galaxy-selfevolve/.venv/bin/python")) {
    violations.push("successful runMeta.command must start with the reused .venv python");
  }
}
if (!Array.isArray(artifact.sourceObservations) || artifact.sourceObservations.length === 0) {
  violations.push("artifact must include SourceObservation[]");
}
if (!Array.isArray(artifact.evidenceClaims) || artifact.evidenceClaims.length === 0) {
  violations.push("artifact must include EvidenceClaim[]");
}
if (artifact.marketRead?.pricingPattern == null) {
  violations.push("artifact.marketRead must use pricingPattern");
}
if (!artifact.actionTrace || !Array.isArray(artifact.actionTrace.actions)) {
  violations.push("artifact must include actionTrace.actions generated from Galaxy main_agent.jsonl");
} else {
  const actionIds = new Set();
  for (const action of artifact.actionTrace.actions) {
    if (!action.actionId) violations.push("actionTrace action missing actionId");
    if (actionIds.has(action.actionId)) violations.push(`duplicate actionId ${action.actionId}`);
    actionIds.add(action.actionId);
    if (!action.kind || !action.title || !action.summary) {
      violations.push(`${action.actionId}: action must include kind/title/summary`);
    }
    if (action.rawPreview?.text && rawPreviewLeakPattern.test(action.rawPreview.text)) {
      violations.push(`${action.actionId}: rawPreview must not expose system/internal prompt content`);
    }
  }
  if (!artifact.actionTrace.actions.some((action) => action.kind === "tool_call")) {
    violations.push("actionTrace must include tool_call actions");
  }
  if (!artifact.actionTrace.actions.some((action) => action.kind === "final_forecast")) {
    violations.push("actionTrace must include final_forecast action");
  }
  if (JSON.stringify(artifact.actionTrace.actions).includes("# Role")) {
    violations.push("actionTrace must not expose raw system prompt content");
  }
  if (/Working rhythm|chain-of-thought|system prompt|internal prompt/i.test(JSON.stringify(artifact.actionTrace.actions))) {
    violations.push("actionTrace must not expose prompt internals or chain-of-thought labels");
  }
  if (artifact.actionTrace.actions.some((action) => Object.hasOwn(action, "hiddenReason"))) {
    violations.push("actionTrace must not include hiddenReason fields");
  }
  const recordForecast = artifact.actionTrace.actions.find(
    (action) => action.kind === "final_forecast" && action.toolName === "record_forecast",
  );
  if (!recordForecast) {
    violations.push("Story/action trace must include record_forecast final_forecast action");
  } else if (!storyActionIdsForAudit(artifact.actionTrace.actions).has(recordForecast.actionId)) {
    violations.push("Story view selection must retain the record_forecast node");
  }
  if (isBrentWeeklyHigh && !Number.isFinite(parseFinalPrediction(artifact, recordForecast))) {
    violations.push("Brent weekly-high final prediction must parse as a finite number");
  }
  if (isNumericQuestion && recordForecast?.rawPreview?.boxedAnswer) {
    const boxed = String(recordForecast.rawPreview.boxedAnswer);
    if (/\\boxed\{[A-D]\}/i.test(boxed)) {
      violations.push("numeric record_forecast boxedAnswer must not be collapsed to a scenario letter");
    }
  }
  const graph = artifact.actionTrace.graph;
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    violations.push("actionTrace.graph must include graph nodes for the Forecast viewer");
  }
  if (!graph || !Array.isArray(graph.edges)) {
    violations.push("actionTrace.graph must include graph edges for the Forecast viewer");
  } else {
    const graphNodeIds = new Set((graph.nodes ?? []).map((node) => node.id));
    for (const edge of graph.edges) {
      if (!graphNodeIds.has(edge.source) || !graphNodeIds.has(edge.target)) {
        violations.push(`actionTrace.graph edge ${edge.id} must connect existing nodes`);
      }
    }
  }
  if (!artifact.actionTrace.actions.some((action) => action.kind === "tool_call" && action.rawPreview?.text)) {
    violations.push("tool_call actions must include rawPreview argument payloads");
  }
  if (!artifact.actionTrace.actions.some((action) => action.kind === "tool_result" && action.rawPreview?.text)) {
    violations.push("tool_result actions must include rawPreview result content");
  }
  if (!artifact.actionTrace.actions.some((action) => action.kind === "final_forecast" && action.rawPreview?.text)) {
    violations.push("final_forecast actions must include rawPreview payloads");
  }
  const actionsById = new Map(artifact.actionTrace.actions.map((action) => [action.actionId, action]));
  const toolCallsByTurn = new Map();
  for (const action of artifact.actionTrace.actions) {
    if (action.kind === "tool_call" && action.parentActionIds?.length === 1) {
      const parentId = action.parentActionIds[0];
      const parent = actionsById.get(parentId);
      if (parent?.kind === "assistant_note" || parent?.kind === "evidence_synthesis") {
        const calls = toolCallsByTurn.get(parentId) ?? [];
        calls.push(action);
        toolCallsByTurn.set(parentId, calls);
      }
    }
    if (action.kind === "tool_result") {
      const parentId = action.parentActionIds?.[0];
      const parent = parentId ? actionsById.get(parentId) : null;
      const validParent =
        parent &&
        (parent.kind === "tool_call" || parent.kind === "final_forecast") &&
        parent.toolCallId === action.toolCallId;
      if (!validParent) {
        violations.push(`${action.actionId}: tool_result must parent back to its matching tool_call`);
      }
    }
  }
  if (![...toolCallsByTurn.values()].some((calls) => calls.length > 1)) {
    violations.push("actionTrace must preserve parallel tool calls under a shared assistant turn");
  }
}

const observationIds = new Set(
  (artifact.sourceObservations ?? []).map((observation) => observation.observationId),
);
for (const claim of artifact.evidenceClaims ?? []) {
  if (!claim.evidenceId) violations.push("evidence claim missing evidenceId");
  if (!Array.isArray(claim.sourceObservationIds) || claim.sourceObservationIds.length === 0) {
    violations.push(`${claim.evidenceId}: missing sourceObservationIds`);
  }
  for (const obsId of claim.sourceObservationIds ?? []) {
    if (!observationIds.has(obsId)) {
      violations.push(`${claim.evidenceId}: sourceObservationId ${obsId} missing`);
    }
  }
  if (claim.confidence === "high") {
    const hasPendingSource = (claim.sourceObservationIds ?? []).some((obsId) => {
      const observation = artifact.sourceObservations.find((item) => item.observationId === obsId);
      return observation?.freshness === "pending" || observation?.licenseStatus === "pending";
    });
    if (hasPendingSource) {
      violations.push(`${claim.evidenceId}: high confidence cannot depend on pending source`);
    }
  }
}

const pendingObservations = artifact.sourceObservations.filter(
  (observation) => observation.freshness === "pending",
);
if (
  pendingObservations.length > 0 &&
  !JSON.stringify(artifact.nextWatch ?? []).includes("AIS")
) {
  violations.push("pending flow source must remain visible in nextWatch");
}

if (violations.length > 0) {
  console.error("audit:galaxy FAILED");
  for (const violation of violations) console.error("  -", violation);
  process.exit(1);
}

console.log(
  `audit:galaxy passed: ${question.task_id} -> ${artifact.runMeta.status}, ${artifact.sourceObservations.length} observations, ${artifact.evidenceClaims.length} evidence claims.`,
);
