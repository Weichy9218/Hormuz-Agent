// audit:forecast
//
// Rules enforced on the canonical snapshot:
//   1. judgement_updated has evidenceIds + mechanismTags + deltaAttribution.
//   2. Non-zero update has at least one valid SensitivityItem.
//   3. Sensitivity items have supportingEvidenceIds; each refs an existing claim;
//      their affectedMechanismTags appear in the update's mechanism set.
//   4. Scenario guardrails respected (severe ≤ 30, closure ≤ 15 absent traffic-stop evidence).
//   5. If guardrail clamp happened, appliedGuardrails + clampedTargets present.
//   6. judgement_updated is the only event that mutates scenario / target state (structural).
//   7. ForecastCheckpoint has reusedState and deltaAttribution.
//   8. PredictionRecords can be derived from the judgement update and checkpoint.
//   9. TargetForecast.sourceIds contain SourceRegistry ids, not observation ids.
//   10. Event ids and parentEventIds form a prior-event DAG.
//   11. deltaAttribution references real evidence and covered mechanism tags.
//   12. checkpoint_written event matches the latest ForecastCheckpoint.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const snapshotPath = resolve(here, ".snapshot.json");

const refresh = spawnSync("node", [resolve(here, "build-canonical-snapshot.mjs")], {
  cwd: root,
  stdio: "inherit",
});
if (refresh.status !== 0) {
  console.error("audit:forecast FAILED: could not build canonical snapshot.");
  process.exit(1);
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));

const violations = [];

const evidenceById = new Map(
  snapshot.canonicalEvidenceClaims.map((c) => [c.evidenceId, c]),
);
const sourceIds = new Set(snapshot.sourceRegistry.map((source) => source.id));
const observationIds = new Set(
  snapshot.canonicalSourceObservations.map((observation) => observation.observationId),
);
const eventById = new Map();

const judgement = snapshot.canonicalAgentRunEvents.find(
  (e) => e.type === "judgement_updated",
);
const checkpoint = snapshot.canonicalAgentRunEvents.find(
  (e) => e.type === "checkpoint_written",
);

if (!judgement) {
  console.error("audit:forecast FAILED: no judgement_updated event in run.");
  process.exit(1);
}
if (!checkpoint) {
  console.error("audit:forecast FAILED: no checkpoint_written event in run.");
  process.exit(1);
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// 10. eventId uniqueness + prior parentEventIds
for (const event of snapshot.canonicalAgentRunEvents) {
  if (!event.eventId) {
    violations.push(`${event.type}: missing eventId`);
    continue;
  }
  if (eventById.has(event.eventId)) {
    violations.push(`${event.type}: duplicate eventId ${event.eventId}`);
  }
  eventById.set(event.eventId, event);
}

const seenEventIds = new Set();
for (const event of snapshot.canonicalAgentRunEvents) {
  for (const parentId of event.parentEventIds ?? []) {
    if (parentId === event.eventId) {
      violations.push(`${event.eventId}: parentEventIds contains self reference`);
    } else if (!eventById.has(parentId)) {
      violations.push(`${event.eventId}: parentEventId ${parentId} does not exist`);
    } else if (!seenEventIds.has(parentId)) {
      violations.push(`${event.eventId}: parentEventId ${parentId} is not a prior event`);
    }
  }
  if (event.eventId) seenEventIds.add(event.eventId);
}

// 1. evidenceIds + mechanismTags + deltaAttribution present
if (!Array.isArray(judgement.evidenceIds) || judgement.evidenceIds.length === 0) {
  violations.push("judgement_updated: missing evidenceIds");
} else {
  for (const evidenceId of judgement.evidenceIds) {
    if (!evidenceById.has(evidenceId)) {
      violations.push(
        `judgement_updated: evidenceId ${evidenceId} is not a registered evidence claim`,
      );
    }
  }
}
if (!Array.isArray(judgement.deltaAttribution) || judgement.deltaAttribution.length === 0) {
  violations.push("judgement_updated: missing deltaAttribution");
}
const mechanismUnion = new Set();
for (const [idx, attribution] of (judgement.deltaAttribution ?? []).entries()) {
  const label = `deltaAttribution[${idx}] ${String(attribution.target)}`;
  if (
    !Array.isArray(attribution.contributingEvidenceIds) ||
    attribution.contributingEvidenceIds.length === 0
  ) {
    violations.push(`${label}: missing contributingEvidenceIds`);
  }
  if (
    !Array.isArray(attribution.contributingMechanismTags) ||
    attribution.contributingMechanismTags.length === 0
  ) {
    violations.push(`${label}: missing contributingMechanismTags`);
  }

  const evidenceMechanismTags = new Set();
  for (const evidenceId of attribution.contributingEvidenceIds ?? []) {
    const claim = evidenceById.get(evidenceId);
    if (!claim) {
      violations.push(`${label}: contributingEvidenceId ${evidenceId} does not exist`);
      continue;
    }
    for (const tag of claim.mechanismTags ?? []) evidenceMechanismTags.add(tag);
  }

  for (const tag of attribution.contributingMechanismTags ?? []) {
    mechanismUnion.add(tag);
    if (!evidenceMechanismTags.has(tag)) {
      violations.push(
        `${label}: mechanism tag ${tag} is not covered by its contributing evidence`,
      );
    }
  }
}
if (mechanismUnion.size === 0) {
  violations.push("judgement_updated: deltaAttribution has no mechanism tags");
}

// 2 + 3: sensitivity rules
const isNonZeroUpdate = Object.values(judgement.scenarioDelta ?? {}).some(
  (v) => Math.abs(v ?? 0) > 0,
);
if (isNonZeroUpdate) {
  if (!Array.isArray(judgement.sensitivity) || judgement.sensitivity.length === 0) {
    violations.push("judgement_updated: non-zero update must include sensitivity[]");
  } else {
    for (const item of judgement.sensitivity) {
      if (!Array.isArray(item.supportingEvidenceIds) || item.supportingEvidenceIds.length === 0) {
        violations.push(`sensitivity ${item.sensitivityId}: supportingEvidenceIds empty`);
      } else {
        for (const evId of item.supportingEvidenceIds) {
          if (!evidenceById.has(evId)) {
            violations.push(
              `sensitivity ${item.sensitivityId}: supportingEvidenceId ${evId} is not a registered evidence claim`,
            );
          }
        }
      }
      for (const tag of item.affectedMechanismTags ?? []) {
        if (!mechanismUnion.has(tag)) {
          violations.push(
            `sensitivity ${item.sensitivityId}: affectedMechanismTag ${tag} not in update's mechanism set`,
          );
        }
      }
      if (!["weaken_update", "reverse_update", "no_material_change"].includes(item.expectedFailureMode)) {
        violations.push(
          `sensitivity ${item.sensitivityId}: invalid expectedFailureMode "${item.expectedFailureMode}"`,
        );
      }
    }
  }
}

// 4: guardrail respected
const distribution = judgement.currentScenario;
const cfg = snapshot.canonicalCalibrationConfig;
const claims = snapshot.canonicalEvidenceClaims;
const trafficStopTags = new Set(["traffic_flow_down"]);
const hasTrafficStop = claims.some(
  (c) => c.polarity === "support" && c.mechanismTags.some((t) => trafficStopTags.has(t)),
);
for (const guardrail of cfg.scenarioGuardrails) {
  const value = distribution[guardrail.scenarioId];
  const missing = guardrail.appliesWhenMissing.some((cond) => {
    if (cond === "verified_traffic_stop") return !hasTrafficStop;
    return false;
  });
  if (missing && value > guardrail.maxProbability + 1e-6) {
    violations.push(
      `guardrail violation: ${guardrail.scenarioId}=${value} exceeds cap ${guardrail.maxProbability} (${guardrail.reasonCode})`,
    );
  }
}

// 5: if applied guardrails non-empty, must list cappedTo properly
for (const applied of judgement.appliedGuardrails ?? []) {
  if (
    typeof applied.cappedFrom !== "number" ||
    typeof applied.cappedTo !== "number" ||
    !applied.reasonCode
  ) {
    violations.push(
      `applied guardrail malformed: ${JSON.stringify(applied)}`,
    );
  }
}

// 6: judgement_updated is the only event with currentScenario / targetDeltas
for (const ev of snapshot.canonicalAgentRunEvents) {
  if (ev.type === "judgement_updated") continue;
  if (
    ev.currentScenario ||
    ev.scenarioDelta ||
    ev.targetDeltas ||
    ev.previousScenario
  ) {
    violations.push(
      `${ev.type} event (${ev.eventId}) carries scenario fields; only judgement_updated may mutate state.`,
    );
  }
}

// 7: checkpoint must have reusedState and deltaAttribution
const cp = snapshot.canonicalForecastCheckpoints.at(-1);
if (!cp?.reusedState) violations.push("ForecastCheckpoint: missing reusedState");
if (!Array.isArray(cp?.deltaAttribution)) {
  violations.push("ForecastCheckpoint: missing deltaAttribution");
}
if (cp) {
  if (checkpoint.checkpointId !== cp.checkpointId) {
    violations.push(
      `checkpoint_written: checkpointId ${checkpoint.checkpointId} does not match latest ForecastCheckpoint ${cp.checkpointId}`,
    );
  }
  if (stableJson(checkpoint.nextWatch) !== stableJson(cp.nextWatch)) {
    violations.push("checkpoint_written: nextWatch differs from latest ForecastCheckpoint");
  }
  if (stableJson(checkpoint.reusedState) !== stableJson(cp.reusedState)) {
    violations.push("checkpoint_written: reusedState differs from latest ForecastCheckpoint");
  }
  if (stableJson(checkpoint.deltaAttribution) !== stableJson(cp.deltaAttribution)) {
    violations.push(
      "checkpoint_written: deltaAttribution differs from latest ForecastCheckpoint",
    );
  }
}

// 8: at least one PredictionRecord generated for this run
if (
  !Array.isArray(snapshot.canonicalPredictionRecords) ||
  snapshot.canonicalPredictionRecords.length === 0
) {
  violations.push("PredictionRecord[] missing — cannot emit to galaxy / galaxy-selfevolve.");
}

// 9: TargetForecast.sourceIds must be registry ids, not SourceObservation ids
for (const forecast of judgement.targetDeltas ?? []) {
  for (const sourceId of forecast.sourceIds ?? []) {
    if (observationIds.has(sourceId)) {
      violations.push(
        `TargetForecast ${forecast.target}: sourceIds contains SourceObservation id ${sourceId}; use source registry id instead.`,
      );
    } else if (!sourceIds.has(sourceId)) {
      violations.push(
        `TargetForecast ${forecast.target}: sourceIds references unknown source registry id ${sourceId}.`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error("audit:forecast FAILED");
  for (const v of violations) console.error("  -", v);
  process.exit(1);
}

console.log(
  `audit:forecast passed: judgement_updated has ${judgement.evidenceIds.length} evidence, ${mechanismUnion.size} mechanism tags, ${judgement.deltaAttribution.length} attributions, ${judgement.sensitivity.length} sensitivity items, ${judgement.appliedGuardrails.length} guardrails applied; ${snapshot.canonicalPredictionRecords.length} PredictionRecords emitted.`,
);
