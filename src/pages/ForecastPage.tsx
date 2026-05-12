// Forecast page: reviewer-facing explanation graph and auditable judgement update.
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Play,
  RefreshCw,
} from "lucide-react";
import { CheckpointCard } from "../components/forecast/CheckpointCard";
import { EvidenceGraph } from "../components/forecast/EvidenceGraph";
import {
  ForecastInspector,
  type ForecastSelectionAnchor,
} from "../components/forecast/ForecastInspector";
import { JudgementDeltaCard } from "../components/forecast/JudgementDeltaCard";
import { ResearchStream } from "../components/forecast/ResearchStream";
import { ReplayControls } from "../components/forecast/ReplayControls";
import { InfoTitle } from "../components/shared/InfoTitle";
import {
  sourceRegistry,
} from "../data";
import {
  directionCopy,
  polarityCopy,
} from "../lib/forecastCopy";
import {
  forecastTargetOptions,
  scenarioColor,
  scenarioLabel,
  scenarioOrder,
  targetLabel,
} from "../state/forecastStore";
import {
  projectForecastState,
} from "../state/projections";
import type { AgentRunEvent } from "../types/agentEvents";
import type {
  ForecastTarget,
  ScenarioId,
  TargetForecast,
} from "../types/forecast";

type ForecastProjection = ReturnType<typeof projectForecastState>;

function directionIcon(direction: TargetForecast["direction"]) {
  if (direction === "up") return <ArrowUp size={15} />;
  if (direction === "down") return <ArrowDown size={15} />;
  return <ArrowRight size={15} />;
}

function CrossAssetSideCard({ forecasts }: { forecasts: TargetForecast[] }) {
  const assets = forecasts.filter((forecast) =>
    ["brent", "gold", "broad_usd", "usd_cny", "vix", "us10y", "sp500"].includes(forecast.target),
  );
  return (
    <section className="console-card side-card asset-side-card">
      <InfoTitle title="跨资产视图" />
      <div className="asset-direction-grid">
        {assets.slice(0, 7).map((forecast) => (
          <article className={forecast.direction} key={forecast.target}>
            <div>
              <span>{targetLabel[forecast.target]}</span>
              <em>{directionCopy[forecast.direction]}</em>
            </div>
            {directionIcon(forecast.direction)}
          </article>
        ))}
      </div>
    </section>
  );
}

function eventAnchor(event: AgentRunEvent | null): ForecastSelectionAnchor | null {
  if (!event) return null;
  return {
    eventId: event.eventId,
    evidenceId: event.type === "evidence_added" ? event.evidenceId : event.evidenceIds?.[0],
    sourceObservationId: event.sourceObservationIds?.[0],
    checkpointId: event.type === "checkpoint_written" ? event.checkpointId : undefined,
  };
}

function hasJudgementUpdate(events: AgentRunEvent[]) {
  return events.some((event) => event.type === "judgement_updated");
}

function hasCheckpoint(events: AgentRunEvent[]) {
  return events.some((event) => event.type === "checkpoint_written");
}

function graphModeCopy(mode: "story" | "audit" | "replay") {
  if (mode === "story") return "Story graph highlights the primary revision path.";
  if (mode === "audit") return "Audit graph expands provenance, evidence, mechanism, and checkpoint nodes.";
  return "Replay reveals events in order and holds current state until judgement_updated.";
}

function GalaxyRunCard({
  projection,
  isRunning,
  runMessage,
  onRun,
  onRefresh,
}: {
  projection: ForecastProjection;
  isRunning: boolean;
  runMessage: string;
  onRun: () => void;
  onRefresh: () => void;
}) {
  const galaxy = projection.galaxyRun;
  const meta = galaxy?.runMeta;

  return (
    <section className="console-card galaxy-run-card">
      <div className="galaxy-run-main">
        <InfoTitle
          title="Galaxy daily run"
          subtitle="daily question -> galaxy-selfevolve -> normalized AgentRunEvent[]"
        />
        <div className="galaxy-run-meta">
          <span>{meta?.status ?? "canonical fallback"}</span>
          <strong>{meta?.taskId ?? projection.runId}</strong>
          <p>
            {meta
              ? `${meta.questionDate} · ${meta.outputDir}`
              : "No Galaxy artifact loaded; using canonical fallback fixture."}
          </p>
        </div>
      </div>
      <div className="galaxy-question-preview">
        <span>Question</span>
        <p>
          {galaxy?.question.task_question
            .split('"""')[1]
            ?.trim()
            .replace(/\s+/g, " ") ??
            "Run artifact will expose the daily Hormuz question here."}
        </p>
      </div>
      <div className="galaxy-run-actions">
        <button type="button" onClick={onRun} disabled={isRunning}>
          {isRunning ? <RefreshCw size={15} className="spin-icon" /> : <Play size={15} />}
          {isRunning ? "Running" : "Run galaxy"}
        </button>
        <button type="button" onClick={onRefresh} disabled={isRunning}>
          <RefreshCw size={15} />
          Refresh artifact
        </button>
      </div>
      {runMessage ? <p className="galaxy-run-message">{runMessage}</p> : null}
    </section>
  );
}

function ForecastSystemStageCard({
  projection,
}: {
  projection: ForecastProjection;
}) {
  const stages = [
    {
      label: "Sense",
      title: "source bundle",
      body: `读取 ${projection.observations.length} 条 observations；pending sources 在任何 update 前保持 caveat。`,
    },
    {
      label: "Interpret",
      title: "evidence + mechanism",
      body: `${projection.evidenceClaims.length} 条 EvidenceClaim 映射到 ${new Set(projection.evidenceClaims.flatMap((claim) => claim.mechanismTags)).size} 个 mechanism tags。`,
    },
    {
      label: "Revise",
      title: "judgement_updated",
      body: "只有 judgement_updated 可以写入 scenario distribution 与 target forecasts。",
    },
    {
      label: "Persist",
      title: "checkpoint + records",
      body: `${projection.checkpoint.checkpointId.toUpperCase()} 持久化 state，用于 replay、eval 与 galaxy handoff。`,
    },
  ];

  return (
    <section className="console-card forecast-stage-card">
      <InfoTitle title="Forecast agent 运行阶段" subtitle="galaxy-style contract，面向 reviewer 的可视化" />
      <div className="forecast-stage-grid">
        {stages.map((stage, index) => (
          <article key={stage.label}>
            <span>{String(index + 1).padStart(2, "0")} · {stage.label}</span>
            <strong>{stage.title}</strong>
            <p>{stage.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ForecastPage({
  selectedTarget,
  onSelectTarget,
}: {
  selectedTarget: ForecastTarget;
  onSelectTarget: (target: ForecastTarget) => void;
}) {
  const [runtimeGalaxyArtifact, setRuntimeGalaxyArtifact] = useState<unknown | null>(null);
  const [isGalaxyRunning, setIsGalaxyRunning] = useState(false);
  const [galaxyRunMessage, setGalaxyRunMessage] = useState("");
  const projection = useMemo(
    () => projectForecastState(runtimeGalaxyArtifact ?? undefined),
    [runtimeGalaxyArtifact],
  );
  const [mode, setMode] = useState<"story" | "audit" | "replay">("story");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [replayStep, setReplayStep] = useState(0);
  const replayEnabled = mode === "replay";
  const visibleEvents = replayEnabled
    ? projection.events.slice(0, replayStep)
    : projection.events;
  const visibleEventIds = useMemo(
    () => new Set(visibleEvents.map((event) => event.eventId)),
    [visibleEvents],
  );
  const visibleEvidenceIds = useMemo(
    () =>
      new Set(
        visibleEvents
          .filter(
            (event): event is Extract<AgentRunEvent, { type: "evidence_added" }> =>
              event.type === "evidence_added",
          )
          .map((event) => event.evidenceId),
      ),
    [visibleEvents],
  );
  const replayStoryGraph = useMemo(() => {
    if (!replayEnabled) return projection.storyGraph;
    const nodes = projection.storyGraph.nodes.filter(
      (node) => !node.eventId || visibleEventIds.has(node.eventId),
    );
    const nodeIds = new Set(nodes.map((node) => node.id));
    return {
      nodes,
      edges: projection.storyGraph.edges.filter(
        (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
      ),
    };
  }, [projection.storyGraph, replayEnabled, visibleEventIds]);
  const replayStateRevealed = !replayEnabled || hasJudgementUpdate(visibleEvents);
  const replayCheckpointRevealed = !replayEnabled || hasCheckpoint(visibleEvents);
  const scenarioForState = replayStateRevealed
    ? projection.currentScenario
    : projection.previousScenario;
  const targetForecastsForState = replayStateRevealed
    ? projection.currentTargetForecasts
    : projection.previousTargetForecasts;
  const displayedStoryGraph = replayEnabled ? replayStoryGraph : projection.storyGraph;
  const displayedAuditGraph = replayEnabled ? replayStoryGraph : projection.auditGraph;
  const activeGraph = mode === "audit" ? displayedAuditGraph : displayedStoryGraph;
  const selectedGraphNode =
    activeGraph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEvent =
    projection.events.find((event) => event.eventId === selectedEventId) ?? null;
  const selectedAnchor: ForecastSelectionAnchor | null = selectedGraphNode
    ? {
        eventId: selectedGraphNode.eventId,
        evidenceId: selectedGraphNode.evidenceId,
        sourceObservationId: selectedGraphNode.sourceObservationId,
        checkpointId: selectedGraphNode.checkpointId,
      }
    : eventAnchor(selectedEvent);

  function handleSelectGraphNode(nodeId: string | null) {
    setSelectedNodeId(nodeId);
    const node = activeGraph.nodes.find((item) => item.id === nodeId);
    setSelectedEventId(node?.eventId ?? null);
  }

  function handleSelectEvent(eventId: string) {
    setSelectedEventId(eventId);
    const event = projection.events.find((item) => item.eventId === eventId) ?? null;
    const anchor = eventAnchor(event);
    const matchingNode =
      activeGraph.nodes.find((node) => node.eventId === eventId) ??
      activeGraph.nodes.find((node) => anchor?.evidenceId && node.evidenceId === anchor.evidenceId) ??
      activeGraph.nodes.find((node) =>
        anchor?.sourceObservationId &&
        node.sourceObservationId === anchor.sourceObservationId,
      ) ??
      activeGraph.nodes.find((node) =>
        anchor?.checkpointId && node.checkpointId === anchor.checkpointId,
      ) ??
      null;
    setSelectedNodeId(matchingNode?.id ?? null);
  }

  function handleReplayStep(nextStep: number) {
    const boundedStep = Math.max(0, Math.min(projection.events.length, nextStep));
    setReplayStep(boundedStep);
    const event = projection.events[boundedStep - 1] ?? null;
    if (event) handleSelectEvent(event.eventId);
  }

  function handleModeChange(nextMode: "story" | "audit" | "replay") {
    setMode(nextMode);
    setSelectedNodeId(null);
    setSelectedEventId(null);
    if (nextMode === "replay") setReplayStep(0);
  }

  async function refreshGalaxyArtifact(message = "Artifact refreshed.") {
    const response = await fetch("/api/galaxy-hormuz/latest");
    if (!response.ok) {
      throw new Error(`latest artifact request failed: ${response.status}`);
    }
    setRuntimeGalaxyArtifact(await response.json());
    setGalaxyRunMessage(message);
  }

  async function handleRefreshGalaxyArtifact() {
    try {
      await refreshGalaxyArtifact();
    } catch (error) {
      setGalaxyRunMessage(error instanceof Error ? error.message : "Artifact refresh failed.");
    }
  }

  async function handleRunGalaxy() {
    setIsGalaxyRunning(true);
    setGalaxyRunMessage("Starting galaxy-selfevolve run...");
    try {
      const response = await fetch("/api/galaxy-hormuz/run", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        output?: string;
        error?: string;
      };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || payload.output || `galaxy run failed: ${response.status}`);
      }
      await refreshGalaxyArtifact("Galaxy run completed; graph rebuilt from latest artifact.");
    } catch (error) {
      setGalaxyRunMessage(error instanceof Error ? error.message : "Galaxy run failed.");
    } finally {
      setIsGalaxyRunning(false);
    }
  }

  const dominant = scenarioOrder.reduce((best, current) =>
    scenarioForState[current] > scenarioForState[best] ? current : best,
  );
  const prevDominant = scenarioOrder.reduce((best, current) =>
    projection.previousScenario[current] > projection.previousScenario[best] ? current : best,
  );

  return (
    <section className="page-grid forecast-page">
      <section className="console-card revision-headline">
        <div className="revision-headline-main">
          <InfoTitle
            title="Agent 为什么改判？"
            subtitle="Evidence path、guardrails 与持久化 forecast state"
          />
          <div className="revision-state-pair">
            <span>
              <small>上轮 previous</small>
              {scenarioLabel[prevDominant]} · {projection.previousScenario[prevDominant]}%
            </span>
            <ArrowRight size={18} />
            <strong>
              <small>{replayStateRevealed ? "当前 current" : "回放中 holding previous"}</small>
              {scenarioLabel[dominant]} · {scenarioForState[dominant]}%
            </strong>
          </div>
        </div>
        <p>
          {replayStateRevealed
            ? `${projection.checkpoint.revisionReason} ${
                projection.galaxyRun
                  ? `Galaxy task ${projection.galaxyRun.runMeta.taskId} generated at ${projection.galaxyRun.runMeta.questionDate}; final prediction ${projection.galaxyRun.runMeta.finalPrediction ?? "pending"}.`
                  : ""
              }`
            : "Replay 尚未到 judgement_updated：当前状态保持 previous，只追加 source/evidence 事件。"}
        </p>
        {replayStateRevealed ? (
          <div className="revision-chips">
            {Object.entries(projection.scenarioDelta).map(([id, delta]) => (
              <span key={id}>
                <i style={{ background: scenarioColor[id as ScenarioId] }} />
                {scenarioLabel[id as ScenarioId]}{" "}
                <b className={(delta ?? 0) > 0 ? "positive" : (delta ?? 0) < 0 ? "negative" : ""}>
                  {(delta ?? 0) > 0 ? "+" : ""}{delta} pp
                </b>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="forecast-main-grid">
        <main className="forecast-main-column">
          <GalaxyRunCard
            projection={projection}
            isRunning={isGalaxyRunning}
            runMessage={galaxyRunMessage}
            onRun={handleRunGalaxy}
            onRefresh={handleRefreshGalaxyArtifact}
          />

          <section className="forecast-workbench console-card">
            <div className="forecast-workbench-header">
              <InfoTitle
                title="解释工作台"
                subtitle="Graph 选中节点会联动 stream 与 inspector；Replay 只做 UI 回放"
              />
              <div className="forecast-mode-tabs" role="tablist" aria-label="Forecast graph mode">
                {(["story", "audit", "replay"] as const).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    className={mode === m ? "selected" : ""}
                    onClick={() => handleModeChange(m)}
                    type="button"
                  >
                    {m === "story" ? "故事模式" : m === "audit" ? "审计模式" : "回放模式"}
                  </button>
                ))}
              </div>
            </div>
            <p className="forecast-mode-note">{graphModeCopy(mode)}</p>
            <ReplayControls
              events={projection.events}
              step={replayStep}
              enabled={replayEnabled}
              stateRevealed={replayStateRevealed}
              onToggle={() => handleModeChange(replayEnabled ? "story" : "replay")}
              onStepChange={handleReplayStep}
            />
          </section>

          <EvidenceGraph
            storyGraph={displayedStoryGraph}
            auditGraph={displayedAuditGraph}
            mode={mode === "audit" ? "audit" : "story"}
            selectedNodeId={selectedNodeId}
            onSelectNodeId={handleSelectGraphNode}
            scenarioDelta={replayStateRevealed ? projection.scenarioDelta : {}}
            scenarioLabels={scenarioLabel}
          />

          <section className="console-card evidence-shelf">
            <InfoTitle title="Evidence shelf · 旁支证据" subtitle="非主链 evidence、counter 与 pending caveat" />
            <ul>
              {projection.storyPath.shelfEvidenceIds.length === 0 ? (
                <li>(本轮没有旁支 evidence)</li>
              ) : (
                projection.storyPath.shelfEvidenceIds
                  .filter((id) => !replayEnabled || visibleEvidenceIds.has(id))
                  .map((id) => {
                    const claim = projection.evidenceClaims.find((c) => c.evidenceId === id);
                    if (!claim) return null;
                    return (
                      <li key={id}>
                        <b>{polarityCopy[claim.polarity]}</b> · {claim.claim}{" "}
                        <em>[{claim.mechanismTags.join(", ")}]</em>
                      </li>
                    );
                  })
              )}
            </ul>
          </section>

          <section className="console-card research-panel forecast-stream-panel">
            <InfoTitle title="Research stream · 运行事件" subtitle="选择一个事件，右侧 inspector 会显示对应 provenance" />
            {selectedAnchor ? (
              <div className="selected-node-bridge">
                <span>Selected anchor</span>
                <strong>{selectedGraphNode?.label ?? selectedEvent?.title ?? "event anchor"}</strong>
                <p>
                  {selectedGraphNode?.kind ?? selectedEvent?.type}
                  {selectedAnchor.eventId ? ` · event ${selectedAnchor.eventId}` : ""}
                  {selectedAnchor.evidenceId ? ` · evidence ${selectedAnchor.evidenceId}` : ""}
                  {selectedAnchor.sourceObservationId ? ` · observation ${selectedAnchor.sourceObservationId}` : ""}
                  {selectedAnchor.checkpointId ? ` · checkpoint ${selectedAnchor.checkpointId}` : ""}
                </p>
              </div>
            ) : null}
            <div className="forecast-controls">
              <label className="prediction-select">
                <span>预测目标</span>
                <select
                  aria-label="Forecast target"
                  value={selectedTarget}
                  onChange={(event) => onSelectTarget(event.target.value as ForecastTarget)}
                >
                  <optgroup label="资产">
                    {forecastTargetOptions
                      .filter((option) => option.group === "assets")
                      .map((option) => (
                        <option key={option.target} value={option.target}>
                          {option.label}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="风险目标">
                    {forecastTargetOptions
                      .filter((option) => option.group === "risk_targets")
                      .map((option) => (
                        <option key={option.target} value={option.target}>
                          {option.label}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </label>
            </div>
            <div className="research-stream-scroll">
              <ResearchStream
                events={projection.events}
                visibleCount={visibleEvents.length}
                isRunning={replayEnabled && replayStep < projection.events.length}
                sourceRegistry={sourceRegistry}
                scenarioLabels={scenarioLabel}
                highlightedEventId={selectedGraphNode?.eventId ?? null}
                selectedEventId={selectedEventId}
                onSelectEventId={handleSelectEvent}
              />
            </div>
          </section>
        </main>

        <aside className="forecast-side-column">
          <section className="forecast-state-stack">
            <CrossAssetSideCard forecasts={targetForecastsForState} />
            <JudgementDeltaCard
              events={visibleEvents}
              scenarioDistribution={scenarioForState}
              targetForecasts={targetForecastsForState}
              selectedTarget={selectedTarget}
              scenarioLabels={scenarioLabel}
            />
          </section>
          <section className="forecast-inspector-stack">
            <ForecastInspector
              anchor={selectedAnchor}
              events={projection.events}
              evidenceClaims={projection.evidenceClaims}
              observations={projection.observations}
              checkpoint={projection.checkpoint}
              sourceRegistry={sourceRegistry}
            />
          </section>
          {replayCheckpointRevealed ? <CheckpointCard checkpoint={projection.checkpoint} /> : null}
        </aside>
      </section>

      <ForecastSystemStageCard projection={projection} />
    </section>
  );
}
