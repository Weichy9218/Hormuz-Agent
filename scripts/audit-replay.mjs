// audit:replay
//
// Replays the deterministic forecast updater from the same canonical inputs
// at least twice and compares only replay-semantic outputs.
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const snapshotPath = resolve(here, ".snapshot.json");

const refresh = spawnSync("node", [resolve(here, "build-canonical-snapshot.mjs")], {
  cwd: root,
  stdio: "inherit",
});
if (refresh.status !== 0) {
  console.error("audit:replay FAILED: could not build canonical snapshot.");
  process.exit(1);
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));

const result = await build({
  stdin: {
    contents: `
      export { applyForecastUpdate } from "./src/lib/forecast/applyForecastUpdate";
      export { buildPredictionRecords } from "./src/lib/forecast/buildPredictionRecords";
    `,
    resolveDir: root,
    sourcefile: "audit-replay-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  write: false,
  external: [],
});

const replayBundle = result.outputFiles[0].text;
const dataUrl = `data:text/javascript;base64,${Buffer.from(replayBundle).toString("base64")}`;
const { applyForecastUpdate, buildPredictionRecords } = await import(dataUrl);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeReplayInput() {
  return {
    previousState: clone(snapshot.canonicalRun.previousState),
    sourceObservations: clone(snapshot.canonicalSourceObservations),
    evidenceClaims: clone(snapshot.canonicalEvidenceClaims),
    marketRead: clone(snapshot.canonicalMarketRead),
    scenarioDefinitions: clone(snapshot.canonicalScenarioDefinitions),
    calibrationConfig: clone(snapshot.canonicalCalibrationConfig),
  };
}

function buildReplayCheckpoint(input, updateOutput) {
  const canonicalCheckpoint = snapshot.canonicalRun.checkpoint;
  return {
    checkpointId: canonicalCheckpoint.checkpointId,
    runId: snapshot.canonicalRun.runId,
    writtenAt: snapshot.canonicalRun.forecastedAt,
    revisionReason: updateOutput.revisionReason,
    previousScenario: input.previousState.scenarioDistribution,
    currentScenario: updateOutput.currentState.scenarioDistribution,
    reusedState: clone(canonicalCheckpoint.reusedState),
    deltaAttribution: updateOutput.deltaAttribution,
    nextWatch: clone(canonicalCheckpoint.nextWatch),
  };
}

function runReplay() {
  const input = makeReplayInput();
  const updateOutput = applyForecastUpdate(input);
  const checkpoint = buildReplayCheckpoint(input, updateOutput);
  const predictionRecords = buildPredictionRecords({
    runId: snapshot.canonicalRun.runId,
    checkpoint,
    currentScenario: updateOutput.currentState.scenarioDistribution,
    targetForecasts: updateOutput.currentState.targetForecasts,
    evidenceClaims: input.evidenceClaims,
    forecastedAt: snapshot.canonicalRun.forecastedAt,
  });

  return {
    currentState: {
      scenarioDistribution: updateOutput.currentState.scenarioDistribution,
      targetForecasts: updateOutput.currentState.targetForecasts,
    },
    deltas: updateOutput.deltas,
    deltaAttribution: updateOutput.deltaAttribution,
    appliedGuardrails: updateOutput.appliedGuardrails,
    sensitivity: updateOutput.sensitivity,
    predictionRecords,
  };
}

function canonicalReplayOutput() {
  const judgement = snapshot.canonicalAgentRunEvents.find(
    (event) => event.type === "judgement_updated",
  );
  if (!judgement) {
    throw new Error("canonical snapshot has no judgement_updated event");
  }
  return {
    currentState: {
      scenarioDistribution: snapshot.canonicalRun.currentState.scenarioDistribution,
      targetForecasts: snapshot.canonicalRun.currentState.targetForecasts,
    },
    deltas: judgement.scenarioDelta
      ? [
          ...Object.entries(judgement.scenarioDelta).map(([scenarioId, delta]) => ({
            target: "scenario",
            scenarioId,
            previous: judgement.previousScenario[scenarioId],
            current: judgement.currentScenario[scenarioId],
            direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
          })),
          ...judgement.targetDeltas.map((target) => {
            const previousMatch = snapshot.canonicalRun.previousState.targetForecasts.find(
              (forecast) => forecast.target === target.target,
            );
            return {
              target: target.target,
              previous: previousMatch?.confidence ?? 0,
              current: target.confidence,
              direction:
                target.direction === "uncertain" ? "flat" : target.direction,
            };
          }),
        ]
      : [],
    deltaAttribution: judgement.deltaAttribution,
    appliedGuardrails: judgement.appliedGuardrails,
    sensitivity: judgement.sensitivity,
    predictionRecords: snapshot.canonicalPredictionRecords,
  };
}

function describe(value) {
  const text = JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

function firstDiff(a, b, path = "$") {
  if (Object.is(a, b)) return null;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return { path, left: a, right: b, reason: "type mismatch" };
    }
    if (a.length !== b.length) {
      return { path: `${path}.length`, left: a.length, right: b.length, reason: "array length" };
    }
    for (let i = 0; i < a.length; i += 1) {
      const diff = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    const keyDiff = firstDiff(aKeys, bKeys, `${path}{keys}`);
    if (keyDiff) return keyDiff;
    for (const key of aKeys) {
      const diff = firstDiff(a[key], b[key], `${path}.${key}`);
      if (diff) return diff;
    }
    return null;
  }
  return { path, left: a, right: b, reason: "value mismatch" };
}

function assertEqual(label, left, right) {
  const diff = firstDiff(left, right);
  if (!diff) return;
  console.error(`audit:replay FAILED: ${label}`);
  console.error(`  path: ${diff.path}`);
  console.error(`  reason: ${diff.reason}`);
  console.error(`  left: ${describe(diff.left)}`);
  console.error(`  right: ${describe(diff.right)}`);
  process.exit(1);
}

const replayA = runReplay();
const replayB = runReplay();
assertEqual("first replay differs from second replay", replayA, replayB);
assertEqual("canonical published output differs from replay output", canonicalReplayOutput(), replayA);

console.log(
  `audit:replay passed: deterministic replay matched currentState, deltas, deltaAttribution, appliedGuardrails, sensitivity, and ${replayA.predictionRecords.length} PredictionRecords across 2 runs.`,
);
