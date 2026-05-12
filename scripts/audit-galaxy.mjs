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

if (questionRows.length !== 1) {
  violations.push(`daily question file must contain exactly one row, found ${questionRows.length}`);
}
const question = questionRows[0];
if (!question?.task_id?.startsWith("hormuz-traffic-risk-")) {
  violations.push("question.task_id must use hormuz-traffic-risk-<date>");
}
if (!question?.task_question?.includes("\\boxed{letter}")) {
  violations.push("question must preserve FutureWorld-style boxed answer format");
}
if (!question?.task_description?.includes("Market data is evidence input only")) {
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
  if (!artifact.runMeta?.venvPath?.endsWith("galaxy-selfevolve/.venv")) {
    violations.push("successful runMeta must record the reused galaxy-selfevolve/.venv path");
  }
  if (!artifact.runMeta?.pythonPath?.endsWith("galaxy-selfevolve/.venv/bin/python")) {
    violations.push("successful runMeta must execute through galaxy-selfevolve/.venv/bin/python");
  }
  const commandHead = artifact.runMeta?.command?.[0] ?? "";
  if (!commandHead.endsWith("galaxy-selfevolve/.venv/bin/python")) {
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
