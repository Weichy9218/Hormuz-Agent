// Build deltaAttribution by aggregating evidence target hints per target.
// Deterministic and pure: given the same inputs, identical output.
import type {
  DeltaAttribution,
  EvidenceClaim,
  ForecastTarget,
  MechanismTag,
  ScenarioId,
} from "../../types/forecast";
import { evidenceQualityScore, polaritySign } from "./weights";

interface TargetAccumulator {
  target: "scenario" | ForecastTarget;
  scenarioId?: ScenarioId;
  signed: number;
  evidenceIds: Set<string>;
  mechanismTags: Set<MechanismTag>;
}

function accKey(target: "scenario" | ForecastTarget, scenarioId?: ScenarioId): string {
  if (target === "scenario") return `scenario:${scenarioId}`;
  return String(target);
}

export interface BuildAttributionOutput {
  attributions: DeltaAttribution[];
  signedByKey: Map<string, number>; // raw signed magnitude, used by updater
  attributionByKey: Map<string, DeltaAttribution>;
}

export function buildDeltaAttribution(
  evidenceClaims: EvidenceClaim[],
): BuildAttributionOutput {
  const acc = new Map<string, TargetAccumulator>();

  for (const claim of evidenceClaims) {
    const qualityScore = evidenceQualityScore(claim);
    const sign = polaritySign[claim.polarity];
    if (!claim.targetHints?.length) continue;

    for (const hint of claim.targetHints) {
      const isScenario = hint.target === "scenario";
      // Scenario hints in EvidenceClaim must include scenarioId; rely on hint.target
      // being a ForecastTarget OR being "scenario" together with explicit per-scenario hints.
      // For simplicity in this build we require target to be a concrete ForecastTarget OR
      // we encode scenario hints as separate per-scenario entries via target = "scenario"
      // with the scenario id encoded inside hint.weight magnitude semantics.
      // To stay schema-clean: scenario hints are encoded with target = ForecastTarget OR
      // we use a convention: scenario-level hints use mechanismTags + polarity only.
      // Per-scenario fine-grain hints would need extending the hint schema; keeping current.
      const scenarioId = undefined; // Scenario-level attribution is built separately below.
      if (isScenario) continue; // handled via mechanism aggregation later

      const key = accKey(hint.target as ForecastTarget, scenarioId);
      const directionSign =
        hint.direction === "up" ? 1 : hint.direction === "down" ? -1 : 0;
      const contribution = sign * directionSign * hint.weight * qualityScore;
      const slot =
        acc.get(key) ??
        ({
          target: hint.target as ForecastTarget,
          signed: 0,
          evidenceIds: new Set<string>(),
          mechanismTags: new Set<MechanismTag>(),
        } as TargetAccumulator);
      slot.signed += contribution;
      slot.evidenceIds.add(claim.evidenceId);
      for (const tag of claim.mechanismTags) slot.mechanismTags.add(tag);
      acc.set(key, slot);
    }
  }

  // Scenario-level attribution: aggregate by ScenarioId based on mechanism semantics.
  // Mapping is conservative and deterministic.
  const scenarioMechanismMap: Record<ScenarioId, MechanismTag[]> = {
    normal: ["diplomatic_deescalation", "market_not_pricing_closure"],
    controlled: [
      "market_pricing_risk_premium",
      "insurance_cost_up",
      "transit_risk_up",
    ],
    severe: ["traffic_flow_down", "energy_supply_risk_up", "naval_presence_up"],
    closure: ["traffic_flow_down", "mine_or_swarm_risk_up", "gnss_or_ais_interference"],
  };

  for (const scenarioId of Object.keys(scenarioMechanismMap) as ScenarioId[]) {
    const relevantTags = scenarioMechanismMap[scenarioId];
    let signed = 0;
    const evIds = new Set<string>();
    const tags = new Set<MechanismTag>();
    for (const claim of evidenceClaims) {
      const overlap = claim.mechanismTags.filter((tag) => relevantTags.includes(tag));
      if (overlap.length === 0) continue;
      const qualityScore = evidenceQualityScore(claim);
      const sign = polaritySign[claim.polarity];
      // Each matching mechanism contributes a unit weight; scenario shift uses
      // overlap count as a proxy for mechanism alignment strength.
      signed += sign * qualityScore * overlap.length;
      evIds.add(claim.evidenceId);
      for (const tag of overlap) tags.add(tag);
    }
    if (signed !== 0 || evIds.size > 0) {
      acc.set(`scenario:${scenarioId}`, {
        target: "scenario",
        scenarioId,
        signed,
        evidenceIds: evIds,
        mechanismTags: tags,
      });
    }
  }

  const attributions: DeltaAttribution[] = [];
  const signedByKey = new Map<string, number>();
  const attributionByKey = new Map<string, DeltaAttribution>();

  // Deterministic order: scenario keys first (sorted), then target keys (sorted).
  const sortedKeys = [...acc.keys()].sort();
  for (const key of sortedKeys) {
    const slot = acc.get(key);
    if (!slot) continue;
    const direction: "up" | "down" | "flat" =
      slot.signed > 1e-9 ? "up" : slot.signed < -1e-9 ? "down" : "flat";
    const attribution: DeltaAttribution = {
      target: slot.target,
      contributingEvidenceIds: [...slot.evidenceIds].sort(),
      contributingMechanismTags: [...slot.mechanismTags].sort() as MechanismTag[],
      direction,
      magnitudeLabel: slot.scenarioId
        ? `scenario:${slot.scenarioId} signed=${slot.signed.toFixed(3)}`
        : `signed=${slot.signed.toFixed(3)}`,
    };
    attributions.push(attribution);
    signedByKey.set(key, slot.signed);
    attributionByKey.set(key, attribution);
  }

  return { attributions, signedByKey, attributionByKey };
}
