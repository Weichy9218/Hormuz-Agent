// Quality weighting used by the deterministic updater and Story-mode path selection.
import type {
  EvidenceClaim,
  EvidenceQuality,
  MechanismTag,
  ScenarioId,
  ForecastTarget,
} from "../../types/forecast";

export const sourceReliabilityWeight: Record<EvidenceQuality["sourceReliability"], number> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

export const freshnessWeight: Record<EvidenceQuality["freshness"], number> = {
  fresh: 1.0,
  lagging: 0.7,
  stale: 0.3,
};

export const directnessWeight: Record<EvidenceQuality["directness"], number> = {
  direct: 1.0,
  proxy: 0.7,
  context: 0.4,
};

export const corroborationWeight: Record<EvidenceQuality["corroboration"], number> = {
  multi_source: 1.0,
  single_source: 0.75,
  conflicting: 0.4,
};

export const confidenceWeight: Record<EvidenceClaim["confidence"], number> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

export const polaritySign: Record<EvidenceClaim["polarity"], number> = {
  support: 1,
  counter: -1,
  uncertain: 0.25,
};

export function evidenceQualityScore(claim: EvidenceClaim): number {
  const q = claim.quality;
  return (
    sourceReliabilityWeight[q.sourceReliability] *
    freshnessWeight[q.freshness] *
    directnessWeight[q.directness] *
    corroborationWeight[q.corroboration] *
    confidenceWeight[claim.confidence]
  );
}

export function targetKey(target: "scenario" | ForecastTarget, scenarioId?: ScenarioId): string {
  if (target === "scenario" && scenarioId) return `scenario:${scenarioId}`;
  return String(target);
}

export function tagSetEqual(a: MechanismTag[], b: MechanismTag[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((tag, idx) => tag === sortedB[idx]);
}
