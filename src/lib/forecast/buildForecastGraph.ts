// Build Forecast page graph nodes and edges from AgentRunEvent[].
// All node ids use stable event/evidence/checkpoint ids; edges are derived
// from parentEventIds + evidenceIds + sourceObservationIds. No hardcoded nodes.
import type { AgentRunEvent } from "../../types/agentEvents";
import type {
  EvidenceClaim,
  MechanismTag,
  ScenarioId,
  SourceObservation,
} from "../../types/forecast";
import type { StoryPath } from "./selectStoryPath";

export type ForecastGraphNodeKind =
  | "source"
  | "evidence"
  | "mechanism"
  | "judgement"
  | "checkpoint";

export interface ForecastGraphNode {
  id: string;
  kind: ForecastGraphNodeKind;
  eventId?: string;
  evidenceId?: string;
  sourceObservationId?: string;
  mechanismTag?: MechanismTag;
  checkpointId?: string;
  label: string;
  detail?: string;
  tone?: "support" | "counter" | "uncertain" | "state" | "checkpoint" | "source";
  inStoryPath: boolean;
}

export type ForecastGraphEdgeKind =
  | "provenance"
  | "support"
  | "counter"
  | "uncertain"
  | "update"
  | "persist";

export interface ForecastGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: ForecastGraphEdgeKind;
  label: string;
  inStoryPath: boolean;
}

export interface ForecastGraph {
  nodes: ForecastGraphNode[];
  edges: ForecastGraphEdge[];
}

export interface BuildForecastGraphInput {
  events: AgentRunEvent[];
  evidenceClaims: EvidenceClaim[];
  sourceObservations: SourceObservation[];
  storyPath: StoryPath;
  mode: "story" | "audit";
}

function sourceObsNodeId(observationId: string) {
  return `source:${observationId}`;
}
function evidenceNodeId(evidenceId: string) {
  return `evidence:${evidenceId}`;
}
function mechanismNodeId(tag: MechanismTag) {
  return `mechanism:${tag}`;
}
function judgementNodeId(eventId: string) {
  return `judgement:${eventId}`;
}
function checkpointNodeId(checkpointId: string) {
  return `checkpoint:${checkpointId}`;
}

export function buildForecastGraph(
  input: BuildForecastGraphInput,
): ForecastGraph {
  const { events, evidenceClaims, sourceObservations, storyPath, mode } = input;

  const nodes: ForecastGraphNode[] = [];
  const edges: ForecastGraphEdge[] = [];
  const seenNodeIds = new Set<string>();

  const primaryEvidenceSet = new Set(storyPath.primaryEvidenceIds);
  const primaryMechanismSet = new Set(storyPath.primaryMechanismTags);
  const primaryObsSet = new Set(storyPath.primarySourceObservationIds);

  const judgement = events.find(
    (e): e is Extract<AgentRunEvent, { type: "judgement_updated" }> =>
      e.type === "judgement_updated",
  );
  const checkpoint = events.find(
    (e): e is Extract<AgentRunEvent, { type: "checkpoint_written" }> =>
      e.type === "checkpoint_written",
  );

  function addNode(node: ForecastGraphNode) {
    if (seenNodeIds.has(node.id)) return;
    seenNodeIds.add(node.id);
    nodes.push(node);
  }

  function addEdge(edge: ForecastGraphEdge) {
    edges.push(edge);
  }

  function shouldInclude(inStory: boolean): boolean {
    return mode === "audit" ? true : inStory;
  }

  // 1. Source observation nodes — only those bound to any evidence used here.
  const observationsById = new Map(sourceObservations.map((o) => [o.observationId, o]));
  const referencedObsIds = new Set<string>();
  for (const claim of evidenceClaims) {
    for (const obsId of claim.sourceObservationIds) referencedObsIds.add(obsId);
  }
  for (const obsId of referencedObsIds) {
    const obs = observationsById.get(obsId);
    if (!obs) continue;
    const inStory = primaryObsSet.has(obsId);
    if (!shouldInclude(inStory)) continue;
    addNode({
      id: sourceObsNodeId(obsId),
      kind: "source",
      sourceObservationId: obsId,
      label: obs.title,
      detail: `${obs.freshness} · ${obs.licenseStatus}`,
      tone: "source",
      inStoryPath: inStory,
    });
  }

  // 2. Evidence nodes.
  for (const claim of evidenceClaims) {
    const inStory = primaryEvidenceSet.has(claim.evidenceId);
    if (!shouldInclude(inStory)) continue;
    addNode({
      id: evidenceNodeId(claim.evidenceId),
      kind: "evidence",
      evidenceId: claim.evidenceId,
      label: claim.claim,
      detail: `${claim.polarity} · ${claim.confidence}`,
      tone: claim.polarity,
      inStoryPath: inStory,
    });

    // provenance edges
    for (const obsId of claim.sourceObservationIds) {
      const obsNode = sourceObsNodeId(obsId);
      if (!seenNodeIds.has(obsNode)) continue;
      const inStoryEdge = inStory && primaryObsSet.has(obsId);
      if (!shouldInclude(inStoryEdge) && mode === "story") continue;
      addEdge({
        id: `${obsNode}->${evidenceNodeId(claim.evidenceId)}`,
        source: obsNode,
        target: evidenceNodeId(claim.evidenceId),
        kind: "provenance",
        label: "observed",
        inStoryPath: inStoryEdge,
      });
    }
  }

  // 3. Mechanism nodes + evidence-> mechanism edges.
  const mechanismFromEvidence = new Map<MechanismTag, Set<string>>();
  for (const claim of evidenceClaims) {
    for (const tag of claim.mechanismTags) {
      const set = mechanismFromEvidence.get(tag) ?? new Set<string>();
      set.add(claim.evidenceId);
      mechanismFromEvidence.set(tag, set);
    }
  }
  for (const [tag, evIds] of mechanismFromEvidence) {
    const inStory = primaryMechanismSet.has(tag);
    if (!shouldInclude(inStory)) continue;
    addNode({
      id: mechanismNodeId(tag),
      kind: "mechanism",
      mechanismTag: tag,
      label: tag,
      detail: `${evIds.size} evidence`,
      tone: "state",
      inStoryPath: inStory,
    });
    for (const evId of evIds) {
      const evNode = evidenceNodeId(evId);
      if (!seenNodeIds.has(evNode)) continue;
      const claim = evidenceClaims.find((c) => c.evidenceId === evId);
      const polarity = claim?.polarity ?? "uncertain";
      const inStoryEdge = inStory && primaryEvidenceSet.has(evId);
      if (!shouldInclude(inStoryEdge) && mode === "story") continue;
      addEdge({
        id: `${evNode}->${mechanismNodeId(tag)}`,
        source: evNode,
        target: mechanismNodeId(tag),
        kind: polarity === "support" ? "support" : polarity === "counter" ? "counter" : "uncertain",
        label: polarity,
        inStoryPath: inStoryEdge,
      });
    }
  }

  // 4. Judgement node.
  if (judgement) {
    const inStory = true;
    addNode({
      id: judgementNodeId(judgement.eventId),
      kind: "judgement",
      eventId: judgement.eventId,
      label: judgement.title,
      detail: judgement.reason,
      tone: "state",
      inStoryPath: inStory,
    });
    for (const tag of mechanismFromEvidence.keys()) {
      const mechNode = mechanismNodeId(tag);
      if (!seenNodeIds.has(mechNode)) continue;
      const inStoryEdge = primaryMechanismSet.has(tag);
      if (!shouldInclude(inStoryEdge) && mode === "story") continue;
      addEdge({
        id: `${mechNode}->${judgementNodeId(judgement.eventId)}`,
        source: mechNode,
        target: judgementNodeId(judgement.eventId),
        kind: "update",
        label: "updates",
        inStoryPath: inStoryEdge,
      });
    }
  }

  // 5. Checkpoint node.
  if (checkpoint) {
    addNode({
      id: checkpointNodeId(checkpoint.checkpointId),
      kind: "checkpoint",
      checkpointId: checkpoint.checkpointId,
      eventId: checkpoint.eventId,
      label: checkpoint.title,
      detail: checkpoint.revisionReason,
      tone: "checkpoint",
      inStoryPath: true,
    });
    if (judgement) {
      addEdge({
        id: `${judgementNodeId(judgement.eventId)}->${checkpointNodeId(checkpoint.checkpointId)}`,
        source: judgementNodeId(judgement.eventId),
        target: checkpointNodeId(checkpoint.checkpointId),
        kind: "persist",
        label: "persists",
        inStoryPath: true,
      });
    }
  }

  // Silence unused symbol warning when checkpoint mode parameter is unused beyond gating.
  void ({} as ScenarioId);

  return { nodes, edges };
}
