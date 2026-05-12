// Apply scenario guardrails to a candidate scenario distribution.
// Guardrails clamp by reason code (e.g. severe / closure require traffic-stop-class
// evidence). Clamping is never silent: every clamp is emitted as AppliedGuardrail.
import type {
  AppliedGuardrail,
  CalibrationConfig,
  EvidenceClaim,
  GuardrailReasonCode,
  MechanismTag,
  ScenarioGuardrail,
  ScenarioId,
} from "../../types/forecast";

// Mechanism tags that, when present in support evidence with non-trivial weight,
// count as evidence for the corresponding guardrail-triggering condition.
const trafficStopTags: MechanismTag[] = ["traffic_flow_down"];
const officialAvoidanceTags: MechanismTag[] = ["transit_risk_up", "naval_presence_up"];
const closureMarketShockTags: MechanismTag[] = ["market_pricing_risk_premium"];

function hasSignal(
  evidence: EvidenceClaim[],
  tags: MechanismTag[],
  requireSupport: boolean,
): boolean {
  return evidence.some((claim) => {
    if (requireSupport && claim.polarity !== "support") return false;
    return claim.mechanismTags.some((tag) => tags.includes(tag));
  });
}

interface ConditionAvailability {
  verified_traffic_stop: boolean;
  official_avoidance: boolean;
  closure_style_market_shock: boolean;
}

function detectConditions(evidence: EvidenceClaim[]): ConditionAvailability {
  return {
    verified_traffic_stop: hasSignal(evidence, trafficStopTags, true),
    official_avoidance: hasSignal(evidence, officialAvoidanceTags, true),
    closure_style_market_shock: hasSignal(evidence, closureMarketShockTags, true),
  };
}

function reasonCodeFor(
  guardrail: ScenarioGuardrail,
  conditions: ConditionAvailability,
): GuardrailReasonCode | null {
  for (const condition of guardrail.appliesWhenMissing) {
    if (!conditions[condition]) {
      if (condition === "verified_traffic_stop") return "no_verified_traffic_stop";
      if (condition === "official_avoidance") return "no_official_avoidance";
      if (condition === "closure_style_market_shock") {
        return "no_closure_style_market_shock";
      }
    }
  }
  return null;
}

export interface ApplyGuardrailsInput {
  candidateDistribution: Record<ScenarioId, number>;
  evidenceClaims: EvidenceClaim[];
  calibrationConfig: CalibrationConfig;
}

export interface ApplyGuardrailsOutput {
  clampedDistribution: Record<ScenarioId, number>;
  appliedGuardrails: AppliedGuardrail[];
}

export function applyScenarioGuardrails(
  input: ApplyGuardrailsInput,
): ApplyGuardrailsOutput {
  const { candidateDistribution, evidenceClaims, calibrationConfig } = input;
  const conditions = detectConditions(evidenceClaims);
  const applied: AppliedGuardrail[] = [];
  const clamped: Record<ScenarioId, number> = { ...candidateDistribution };

  const guardrails = [...calibrationConfig.scenarioGuardrails].sort((a, b) =>
    a.scenarioId.localeCompare(b.scenarioId),
  );

  for (const guardrail of guardrails) {
    const code = reasonCodeFor(guardrail, conditions);
    if (!code) continue;
    const current = clamped[guardrail.scenarioId];
    const cap = guardrail.maxProbability;
    if (current > cap) {
      applied.push({
        scenarioId: guardrail.scenarioId,
        reasonCode: code,
        cappedFrom: current,
        cappedTo: cap,
      });
      clamped[guardrail.scenarioId] = cap;
    }
  }

  // After clamping, redistribute any removed probability mass proportionally
  // to non-clamped scenarios so the distribution still sums to its original total.
  const total = Object.values(clamped).reduce((a, b) => a + b, 0);
  const target = Object.values(candidateDistribution).reduce((a, b) => a + b, 0);
  const deficit = target - total;
  if (deficit > 1e-9 && applied.length > 0) {
    const clampedIds = new Set(applied.map((a) => a.scenarioId));
    const recipients = (Object.keys(clamped) as ScenarioId[]).filter(
      (id) => !clampedIds.has(id),
    );
    const recipientTotal = recipients.reduce((acc, id) => acc + clamped[id], 0);
    if (recipientTotal > 0) {
      for (const id of recipients) {
        clamped[id] = clamped[id] + (deficit * clamped[id]) / recipientTotal;
      }
    } else {
      const evenTargets =
        recipients.length > 0 ? recipients : (Object.keys(clamped) as ScenarioId[]);
      const share = deficit / evenTargets.length;
      for (const id of evenTargets) clamped[id] = clamped[id] + share;
    }
  }

  return { clampedDistribution: clamped, appliedGuardrails: applied };
}
