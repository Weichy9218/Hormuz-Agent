// Deterministic forecast updater (pure function).
//
//   applyForecastUpdate(input) => output
//
// LLM may produce evidence claims and mechanism tags upstream, but probability
// movement is decided here by deterministic rules + scenario guardrails.
//
// Outputs always include deltaAttribution, appliedGuardrails, sensitivity, and
// a revision reason. Updates without deltaAttribution are not produced.
import type {
  EvidenceClaim,
  ForecastDelta,
  ForecastTarget,
  ForecastUpdateInput,
  ForecastUpdateOutput,
  ScenarioId,
  SensitivityItem,
  TargetForecast,
} from "../../types/forecast";
import { applyScenarioGuardrails } from "./applyScenarioGuardrails";
import { buildDeltaAttribution } from "./buildDeltaAttribution";

// Sensitivity is decided by structural rule against evidence and attribution.
// LLM can draft `statement` upstream but its legality is enforced here.
function buildSensitivity(
  evidenceClaims: EvidenceClaim[],
): SensitivityItem[] {
  const items: SensitivityItem[] = [];

  // Group support evidence by primary target (first hint).
  const supportClaims = evidenceClaims
    .filter((c) => c.polarity === "support" && c.targetHints?.length)
    .sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));

  // Deterministic top-3 support items as sensitivity drivers.
  for (const claim of supportClaims.slice(0, 3)) {
    const primary = claim.targetHints?.[0];
    if (!primary) continue;
    items.push({
      sensitivityId: `sens-${claim.evidenceId}`,
      target: primary.target,
      statement: `如果 ${claim.evidenceId} 被撤回或 counter evidence 变强，${String(primary.target)} 的 update 会削弱。`,
      supportingEvidenceIds: [claim.evidenceId],
      affectedMechanismTags: [...claim.mechanismTags].sort(),
      expectedFailureMode: "weaken_update",
    });
  }

  // Add a reverse-update item for the strongest support if at least one counter exists.
  const counterClaims = evidenceClaims.filter((c) => c.polarity === "counter");
  if (counterClaims.length > 0 && supportClaims.length > 0) {
    const strongest = supportClaims[0];
    const primary = strongest.targetHints?.[0];
    if (primary) {
      items.push({
        sensitivityId: `sens-reverse-${strongest.evidenceId}`,
        target: primary.target,
        statement: `如果 counter evidence (${counterClaims
          .map((c) => c.evidenceId)
          .sort()
          .slice(0, 2)
          .join(", ")}) 明显增强，${String(primary.target)} 的 update 可能反转。`,
        supportingEvidenceIds: [strongest.evidenceId, ...counterClaims.map((c) => c.evidenceId)].sort(),
        affectedMechanismTags: [...strongest.mechanismTags].sort(),
        expectedFailureMode: "reverse_update",
      });
    }
  }

  return items;
}

function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function normalize(distribution: Record<ScenarioId, number>): Record<ScenarioId, number> {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total <= 0) return distribution;
  const out: Record<ScenarioId, number> = { normal: 0, controlled: 0, severe: 0, closure: 0 };
  for (const key of Object.keys(distribution) as ScenarioId[]) {
    out[key] = (distribution[key] / total) * 100;
  }
  return out;
}

// Convert previous distribution (in pp) and signed scenario contributions to a candidate
// distribution. Scenario shifts move probability mass between scenarios proportionally.
function buildCandidateDistribution(
  previous: Record<ScenarioId, number>,
  signedByKey: Map<string, number>,
): Record<ScenarioId, number> {
  const out: Record<ScenarioId, number> = { ...previous };
  // Scaling factor: bound per-scenario shift to ~12 pp magnitude regardless of evidence count.
  const shiftScale = 4;
  for (const id of Object.keys(out) as ScenarioId[]) {
    const signed = signedByKey.get(`scenario:${id}`) ?? 0;
    const shift = Math.max(-12, Math.min(12, signed * shiftScale));
    out[id] = Math.max(0, out[id] + shift);
  }
  return normalize(out);
}

function buildTargetForecasts(
  previousTargets: TargetForecast[],
  sourceObservations: ForecastUpdateInput["sourceObservations"],
  evidenceClaims: EvidenceClaim[],
  signedByKey: Map<string, number>,
): TargetForecast[] {
  const sourceIdByObservationId = new Map(
    sourceObservations.map((observation) => [
      observation.observationId,
      observation.sourceId,
    ]),
  );
  const sourceIdsByTarget = new Map<ForecastTarget, Set<string>>();
  for (const claim of evidenceClaims) {
    for (const hint of claim.targetHints ?? []) {
      if (hint.target === "scenario") continue;
      const set = sourceIdsByTarget.get(hint.target as ForecastTarget) ?? new Set<string>();
      for (const obsId of claim.sourceObservationIds) {
        const sourceId = sourceIdByObservationId.get(obsId);
        if (sourceId) set.add(sourceId);
      }
      sourceIdsByTarget.set(hint.target as ForecastTarget, set);
    }
  }

  return previousTargets.map((forecast) => {
    const signed = signedByKey.get(String(forecast.target)) ?? 0;
    const direction: TargetForecast["direction"] =
      signed > 0.4 ? "up" : signed < -0.4 ? "down" : signed === 0 ? forecast.direction : "uncertain";
    // Confidence is rebuilt deterministically from absolute signed magnitude,
    // capped at 0.85 to leave room for human review.
    const confidence = clampUnit(0.35 + Math.min(0.5, Math.abs(signed) * 0.18));
    const sourceIds = [...(sourceIdsByTarget.get(forecast.target) ?? new Set<string>())].sort();
    return {
      ...forecast,
      direction,
      confidence,
      sourceIds: sourceIds.length > 0 ? sourceIds : forecast.sourceIds,
    };
  });
}

export function applyForecastUpdate(input: ForecastUpdateInput): ForecastUpdateOutput {
  const { previousState, sourceObservations, evidenceClaims, calibrationConfig } = input;

  const attribution = buildDeltaAttribution(evidenceClaims);

  const candidate = buildCandidateDistribution(
    previousState.scenarioDistribution,
    attribution.signedByKey,
  );

  const { clampedDistribution, appliedGuardrails } = applyScenarioGuardrails({
    candidateDistribution: candidate,
    evidenceClaims,
    calibrationConfig,
  });

  const normalized = normalize(clampedDistribution);
  // Round to integer pp to stay friendly to UI; deterministic largest-remainder.
  const rounded = largestRemainderRound(normalized);

  const newTargetForecasts = buildTargetForecasts(
    previousState.targetForecasts,
    sourceObservations,
    evidenceClaims,
    attribution.signedByKey,
  );

  const deltas: ForecastDelta[] = [];
  for (const id of Object.keys(rounded) as ScenarioId[]) {
    deltas.push({
      target: "scenario",
      scenarioId: id,
      previous: previousState.scenarioDistribution[id],
      current: rounded[id],
      direction:
        rounded[id] > previousState.scenarioDistribution[id]
          ? "up"
          : rounded[id] < previousState.scenarioDistribution[id]
            ? "down"
            : "flat",
    });
  }
  for (const target of newTargetForecasts) {
    const previousMatch = previousState.targetForecasts.find((f) => f.target === target.target);
    const prevConf = previousMatch?.confidence ?? 0;
    deltas.push({
      target: target.target,
      previous: prevConf,
      current: target.confidence,
      direction: target.direction === "uncertain" ? "flat" : (target.direction as "up" | "down" | "flat"),
    });
  }

  const sensitivity = buildSensitivity(evidenceClaims);

  const clampedTargets = appliedGuardrails.map((g) => ({
    target: "scenario" as const,
    scenarioId: g.scenarioId,
  }));

  const guardrailReason = appliedGuardrails.length
    ? ` Guardrails capped ${appliedGuardrails
        .map((g) => `${g.scenarioId} ≤ ${(g.cappedTo).toFixed(0)} (${g.reasonCode})`)
        .join("; ")}.`
    : "";

  const revisionReason = `本轮概率变化由 ${evidenceClaims.length} 条 EvidenceClaim 经 deterministic rule 计算；scenario distribution 受 calibrationConfig=${calibrationConfig.configId} 约束。${guardrailReason}`;

  return {
    currentState: {
      scenarioDistribution: rounded,
      targetForecasts: newTargetForecasts,
    },
    deltas,
    deltaAttribution: attribution.attributions,
    appliedGuardrails,
    clampedTargets: clampedTargets.map(() => "scenario"),
    sensitivity,
    revisionReason,
  };
}

// Largest-remainder rounding so the integer distribution still sums to 100.
function largestRemainderRound(
  distribution: Record<ScenarioId, number>,
): Record<ScenarioId, number> {
  const ids = Object.keys(distribution) as ScenarioId[];
  const floors: Record<ScenarioId, number> = { normal: 0, controlled: 0, severe: 0, closure: 0 };
  const remainders: Array<{ id: ScenarioId; r: number }> = [];
  let sum = 0;
  for (const id of ids) {
    const v = distribution[id];
    floors[id] = Math.floor(v);
    sum += floors[id];
    remainders.push({ id, r: v - Math.floor(v) });
  }
  let deficit = Math.round(Object.values(distribution).reduce((a, b) => a + b, 0)) - sum;
  remainders.sort((a, b) => (b.r - a.r) || a.id.localeCompare(b.id));
  let idx = 0;
  while (deficit > 0 && idx < remainders.length) {
    floors[remainders[idx].id] += 1;
    deficit -= 1;
    idx += 1;
  }
  return floors;
}
