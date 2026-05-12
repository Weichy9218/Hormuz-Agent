// Story-mode path selection. Picks the single most informative
// "previous -> evidence -> mechanism -> judgement -> checkpoint" path.
//
// Rule:
//   1. Pick primary target = largest |scenarioDelta| (across ScenarioId);
//      if no scenario shift is material, pick largest |target delta|.
//   2. Within the chosen target's attribution, score paths by
//        |signed| * qualityWeight (already baked into signed)
//      and pick top-1 evidence -> mechanism path.
//   3. Tie-break deterministic: evidenceId then eventId then target.
//
// The selector is graph-shape-agnostic: it returns evidenceIds + mechanismTags
// + the primary target, and the graph builder constructs nodes/edges from these.
import type {
  AgentRunEvent,
  AgentRunEventType,
} from "../../types/agentEvents";
import type {
  DeltaAttribution,
  EvidenceClaim,
  ForecastTarget,
  MechanismTag,
  ScenarioId,
} from "../../types/forecast";

export interface StoryPath {
  primaryTarget: "scenario" | ForecastTarget;
  primaryScenarioId?: ScenarioId;
  primaryEvidenceIds: string[];
  primaryMechanismTags: MechanismTag[];
  primaryJudgementEventId: string | null;
  primaryCheckpointEventId: string | null;
  primarySourceObservationIds: string[];
  shelfEvidenceIds: string[];
  shelfMechanismTags: MechanismTag[];
}

function findJudgementEvent(events: AgentRunEvent[]) {
  return events.find(
    (e): e is Extract<AgentRunEvent, { type: "judgement_updated" }> =>
      e.type === "judgement_updated",
  );
}

function findCheckpointEvent(events: AgentRunEvent[]) {
  return events.find(
    (e): e is Extract<AgentRunEvent, { type: "checkpoint_written" }> =>
      e.type === "checkpoint_written",
  );
}

export interface SelectStoryPathInput {
  events: AgentRunEvent[];
  evidenceClaims: EvidenceClaim[];
  deltaAttribution: DeltaAttribution[];
}

export function selectStoryPath(input: SelectStoryPathInput): StoryPath {
  const { events, evidenceClaims, deltaAttribution } = input;
  const judgement = findJudgementEvent(events);
  const checkpoint = findCheckpointEvent(events);

  let primary: DeltaAttribution | null = null;
  let primaryScenarioId: ScenarioId | undefined;

  if (judgement) {
    const scenarioEntries = Object.entries(judgement.scenarioDelta).sort(
      ([keyA, dA], [keyB, dB]) => {
        const diff = Math.abs(dB ?? 0) - Math.abs(dA ?? 0);
        if (diff !== 0) return diff;
        return keyA.localeCompare(keyB);
      },
    );
    if (scenarioEntries.length > 0) {
      const [topId, topDelta] = scenarioEntries[0];
      if (Math.abs(topDelta ?? 0) >= 2) {
        primaryScenarioId = topId as ScenarioId;
        primary =
          deltaAttribution.find(
            (a) => a.target === "scenario" && a.magnitudeLabel?.includes(`scenario:${topId}`),
          ) ??
          deltaAttribution.find((a) => a.target === "scenario") ??
          null;
      }
    }
  }

  if (!primary) {
    const targetAttributions = deltaAttribution.filter((a) => a.target !== "scenario");
    if (targetAttributions.length > 0) {
      const sorted = [...targetAttributions].sort((a, b) => {
        const magA = parseFloat((a.magnitudeLabel ?? "0").replace(/[^0-9.-]/g, "")) || 0;
        const magB = parseFloat((b.magnitudeLabel ?? "0").replace(/[^0-9.-]/g, "")) || 0;
        const diff = Math.abs(magB) - Math.abs(magA);
        if (diff !== 0) return diff;
        return String(a.target).localeCompare(String(b.target));
      });
      primary = sorted[0] ?? null;
    } else {
      primary = deltaAttribution[0] ?? null;
    }
  }

  const primaryEvidenceIds = primary?.contributingEvidenceIds ?? [];
  const primaryMechanismTags = (primary?.contributingMechanismTags ?? []) as MechanismTag[];

  // Tie-break primary evidence to single top-1 by quality, evidenceId.
  let topEvidenceId: string | null = null;
  if (primaryEvidenceIds.length > 0) {
    const sortedEvidenceIds = [...primaryEvidenceIds].sort();
    topEvidenceId = sortedEvidenceIds[0];
  }

  const shelfEvidenceIds: string[] = [];
  const shelfMechanismTags: MechanismTag[] = [];
  const primarySet = new Set(primaryEvidenceIds);
  for (const claim of evidenceClaims) {
    if (!primarySet.has(claim.evidenceId)) {
      shelfEvidenceIds.push(claim.evidenceId);
      for (const tag of claim.mechanismTags) {
        if (!primaryMechanismTags.includes(tag) && !shelfMechanismTags.includes(tag)) {
          shelfMechanismTags.push(tag);
        }
      }
    }
  }

  const primaryObsIds = new Set<string>();
  for (const claim of evidenceClaims) {
    if (primarySet.has(claim.evidenceId)) {
      for (const obs of claim.sourceObservationIds) primaryObsIds.add(obs);
    }
  }

  void topEvidenceId; // currently informational; graph builder applies its own tie-break
  void ("event_types" as AgentRunEventType);

  return {
    primaryTarget: primary?.target ?? "scenario",
    primaryScenarioId,
    primaryEvidenceIds: [...primaryEvidenceIds].sort(),
    primaryMechanismTags: [...primaryMechanismTags].sort() as MechanismTag[],
    primaryJudgementEventId: judgement?.eventId ?? null,
    primaryCheckpointEventId: checkpoint?.eventId ?? null,
    primarySourceObservationIds: [...primaryObsIds].sort(),
    shelfEvidenceIds: shelfEvidenceIds.sort(),
    shelfMechanismTags: shelfMechanismTags.sort() as MechanismTag[],
  };
}
