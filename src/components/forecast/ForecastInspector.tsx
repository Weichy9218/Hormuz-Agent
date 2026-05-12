// Forecast inspector resolves selected graph/stream anchors to auditable
// provenance without reading canonical state directly.
import type { AgentRunEvent } from "../../types/agentEvents";
import type {
  EvidenceClaim,
  ForecastCheckpoint,
  SourceObservation,
} from "../../types/forecast";
import type { SourceRegistryEntry } from "../../types";
import { targetLabel } from "../../state/forecastStore";

export interface ForecastSelectionAnchor {
  eventId?: string;
  evidenceId?: string;
  sourceObservationId?: string;
  checkpointId?: string;
}

interface ForecastInspectorProps {
  anchor: ForecastSelectionAnchor | null;
  events: AgentRunEvent[];
  evidenceClaims: EvidenceClaim[];
  observations: SourceObservation[];
  checkpoint: ForecastCheckpoint;
  sourceRegistry: SourceRegistryEntry[];
}

function sourceName(sourceRegistry: SourceRegistryEntry[], sourceId: string) {
  return sourceRegistry.find((source) => source.id === sourceId)?.name ?? sourceId;
}

function sourceByObservation(
  observations: SourceObservation[],
  sourceRegistry: SourceRegistryEntry[],
  observation?: SourceObservation,
) {
  if (!observation) return null;
  return sourceRegistry.find((source) => source.id === observation.sourceId) ?? null;
}

function findEvent(events: AgentRunEvent[], anchor: ForecastSelectionAnchor) {
  if (anchor.eventId) {
    return events.find((event) => event.eventId === anchor.eventId) ?? null;
  }
  if (anchor.evidenceId) {
    return (
      events.find((event) => event.evidenceIds?.includes(anchor.evidenceId ?? "")) ??
      events.find(
        (event): event is Extract<AgentRunEvent, { type: "evidence_added" }> =>
          event.type === "evidence_added" && event.evidenceId === anchor.evidenceId,
      ) ??
      null
    );
  }
  if (anchor.sourceObservationId) {
    return (
      events.find((event) =>
        event.sourceObservationIds?.includes(anchor.sourceObservationId ?? ""),
      ) ?? null
    );
  }
  if (anchor.checkpointId) {
    return (
      events.find(
        (event): event is Extract<AgentRunEvent, { type: "checkpoint_written" }> =>
          event.type === "checkpoint_written" && event.checkpointId === anchor.checkpointId,
      ) ?? null
    );
  }
  return null;
}

function eventEvidenceId(event: AgentRunEvent | null) {
  if (!event) return undefined;
  if (event.type === "evidence_added") return event.evidenceId;
  return event.evidenceIds?.[0];
}

function eventCheckpointId(event: AgentRunEvent | null) {
  if (!event || event.type !== "checkpoint_written") return undefined;
  return event.checkpointId;
}

function anchorSummary(anchor: ForecastSelectionAnchor | null) {
  if (!anchor) return "No anchor selected";
  if (anchor.checkpointId) return `checkpoint ${anchor.checkpointId}`;
  if (anchor.evidenceId) return `evidence ${anchor.evidenceId}`;
  if (anchor.sourceObservationId) return `observation ${anchor.sourceObservationId}`;
  if (anchor.eventId) return `event ${anchor.eventId}`;
  return "anchor selected";
}

export function ForecastInspector({
  anchor,
  events,
  evidenceClaims,
  observations,
  checkpoint,
  sourceRegistry,
}: ForecastInspectorProps) {
  const event = anchor ? findEvent(events, anchor) : null;
  const evidenceId = anchor?.evidenceId ?? eventEvidenceId(event);
  const evidence = evidenceClaims.find((claim) => claim.evidenceId === evidenceId) ?? null;
  const observationId =
    anchor?.sourceObservationId ??
    event?.sourceObservationIds?.[0] ??
    evidence?.sourceObservationIds[0];
  const observation =
    observations.find((item) => item.observationId === observationId) ?? null;
  const source = sourceByObservation(observations, sourceRegistry, observation ?? undefined);
  const checkpointId = anchor?.checkpointId ?? eventCheckpointId(event);
  const selectedCheckpoint =
    checkpointId && checkpointId === checkpoint.checkpointId ? checkpoint : null;

  return (
    <section className={`panel forecast-inspector ${anchor ? "has-anchor" : "is-empty"}`}>
      <div className="panel-title compact forecast-inspector-title">
        <span className="icon-chip">ID</span>
        <div>
          <h2>Inspector</h2>
          <p>{anchorSummary(anchor)}</p>
        </div>
      </div>

      {!anchor ? (
        <div className="forecast-inspector-empty">
          <strong>选择 graph node 或 stream card</strong>
          <p>
            Inspector 会按 stable id 反查 provenance、evidence quality、retrievedAt、
            license status 和 pending caveat。
          </p>
          <div className="stream-chips subdued">
            <span>eventId</span>
            <span>evidenceId</span>
            <span>sourceObservationId</span>
            <span>checkpointId</span>
          </div>
        </div>
      ) : null}

      {event ? (
        <div className="stream-detail-block inspector-section">
          <span>Event anchor</span>
          <strong>{event.title}</strong>
          <div className="stream-chips subdued">
            <span>eventId: {event.eventId}</span>
            <span>type: {event.type}</span>
            <span>at: {event.at}</span>
            {event.parentEventIds?.map((id) => (
              <span key={id}>parent: {id}</span>
            ))}
          </div>
        </div>
      ) : null}

      {evidence ? (
        <div className="stream-detail-block evidence-detail inspector-section">
          <span>Evidence claim</span>
          <strong>{evidence.claim}</strong>
          <div className="evidence-row">
            <span className={`polarity ${evidence.polarity}`}>{evidence.polarity}</span>
            <em>confidence {evidence.confidence}</em>
            <em>{evidence.affects.join(" / ")}</em>
          </div>
          <div className="stream-chips">
            {evidence.mechanismTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="target-delta-panel">
            <span>Evidence quality</span>
            <p>
              <b>reliability</b>
              {evidence.quality.sourceReliability}
            </p>
            <p>
              <b>freshness</b>
              {evidence.quality.freshness}
            </p>
            <p>
              <b>corroboration</b>
              {evidence.quality.corroboration}
            </p>
            <p>
              <b>directness</b>
              {evidence.quality.directness}
            </p>
          </div>
          <div className="stream-chips subdued">
            <span>evidenceId: {evidence.evidenceId}</span>
            {evidence.sourceObservationIds.map((id) => (
              <span key={id}>observation: {id}</span>
            ))}
          </div>
        </div>
      ) : null}

      {observation ? (
        <div className="stream-detail-block source-list inspector-section">
          <span>Source observation</span>
          <strong>{observation.title}</strong>
          <p>{observation.summary}</p>
          <div className="stream-chips">
            <span>{sourceName(sourceRegistry, observation.sourceId)}</span>
            <span>retrievedAt: {observation.retrievedAt}</span>
            <span>freshness: {observation.freshness}</span>
            <span>license: {observation.licenseStatus}</span>
            {observation.publishedAt ? <span>publishedAt: {observation.publishedAt}</span> : null}
            {observation.observedAt ? <span>observedAt: {observation.observedAt}</span> : null}
            {observation.sourceHash ? <span>sourceHash: {observation.sourceHash}</span> : null}
          </div>
          {source?.caveat ? (
            <div className="stream-chips subdued">
              <span>{source.pending ? "pending caveat" : "source caveat"}: {source.caveat}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedCheckpoint ? (
        <div className="stream-detail-block checkpoint-note inspector-section">
          <span>Checkpoint anchor</span>
          <strong>{selectedCheckpoint.revisionReason}</strong>
          <div className="stream-chips subdued">
            <span>checkpointId: {selectedCheckpoint.checkpointId}</span>
            <span>writtenAt: {selectedCheckpoint.writtenAt}</span>
          </div>
          <div className="stream-chips">
            {selectedCheckpoint.reusedState.activeEvidenceIds.map((id) => (
              <span key={`active-${id}`}>active: {id}</span>
            ))}
            {selectedCheckpoint.reusedState.staleEvidenceIds.map((id) => (
              <span key={`stale-${id}`}>stale: {id}</span>
            ))}
            {selectedCheckpoint.reusedState.pendingSourceIds.map((id) => (
              <span key={`pending-${id}`}>pending: {id}</span>
            ))}
          </div>
          <div className="target-delta-panel">
            <span>Delta attribution</span>
            {selectedCheckpoint.deltaAttribution.map((item, index) => (
              <p
                key={`${String(item.target)}-${item.magnitudeLabel ?? index}-${item.contributingEvidenceIds.join(",")}`}
              >
                <b>{item.target === "scenario" ? "scenario" : targetLabel[item.target]}</b>
                {item.direction} · evidence {item.contributingEvidenceIds.join(", ") || "-"} ·
                mechanisms {item.contributingMechanismTags.join(", ") || "-"}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
