// Forecast page focused on live forecast-agent run visualization.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  Flag,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { GalaxyActionGraph } from "../components/forecast/GalaxyActionGraph";
import { InfoTitle } from "../components/shared/InfoTitle";
import { projectForecastState } from "../state/projections";
import type { ForecastTarget } from "../types/forecast";
import type {
  GalaxyActionKind,
  GalaxyActionTrace,
  GalaxyActionTraceItem,
  GalaxyHormuzRunArtifact,
} from "../types/galaxy";
import type { ForecastAgentRunArtifact } from "../types/forecastAgent";

type ForecastProjection = ReturnType<typeof projectForecastState>;
type RunStatus = "idle" | "running" | "completed" | "failed";

interface LiveRunStatus {
  runId: string;
  taskId: string;
  status: RunStatus;
  pid: number | null;
  elapsed: number;
  startedAt: string;
  lastUpdatedAt: string;
  runDir: string;
  outputDir: string;
  runConfig: string;
  exitCode: number | null;
  command?: string[];
  outputTail?: string;
  error?: string;
}

interface TraceResponse {
  runId: string;
  status: RunStatus;
  pid: number | null;
  elapsed: number;
  lastUpdatedAt: string;
  runDir: string;
  outputDir: string;
  trace: GalaxyActionTrace;
  artifact: GalaxyHormuzRunArtifact | ForecastAgentRunArtifact | null;
}

const kindLabel: Record<GalaxyActionKind, string> = {
  question: "question",
  assistant_note: "agent note",
  tool_call: "tool call",
  tool_result: "tool result",
  artifact_read: "artifact",
  evidence_synthesis: "synthesis",
  final_forecast: "forecast",
  checkpoint: "checkpoint",
  supervisor: "runtime",
};

function questionText(projection: ForecastProjection) {
  return (
    projection.galaxyRun?.question.task_question
      .split('"""')[1]
      ?.trim()
      .replace(/\s+/g, " ") ?? "No forecast question artifact loaded."
  );
}

function finalPayload(
  projection: ForecastProjection,
  actions: GalaxyActionTraceItem[],
  source: "current run" | "last completed",
  liveRunId?: string,
  agentArtifact?: ForecastAgentRunArtifact | null,
) {
  const finalAction = [...actions].reverse().find((action) => action.forecastPayload);
  const agentFinal = agentArtifact?.finalForecast;
  const metaPrediction = projection.galaxyRun?.runMeta.finalPrediction;
  const allowMetaFallback =
    source === "last completed" || projection.galaxyRun?.runMeta.runId === liveRunId;
  return {
    prediction:
      finalAction?.forecastPayload?.prediction ??
      agentFinal?.prediction ??
      (allowMetaFallback ? metaPrediction : undefined) ??
      "pending",
    confidence:
      finalAction?.forecastPayload?.confidence ??
      agentFinal?.confidence ??
      projection.galaxyRun?.runMeta.confidence ??
      "unknown",
    terminal:
      agentArtifact?.runMeta.runner ??
      projection.galaxyRun?.runMeta.terminalReason ??
      "record_forecast",
    payload: finalAction?.forecastPayload ?? agentFinal,
    action: finalAction,
  };
}

function actionIcon(kind: GalaxyActionKind, toolName?: string) {
  if (kind === "question") return <FileText size={15} />;
  if (kind === "tool_call" && toolName === "search_web") return <Search size={15} />;
  if (kind === "tool_call") return <Wrench size={15} />;
  if (kind === "tool_result" || kind === "artifact_read") return <Database size={15} />;
  if (kind === "final_forecast") return <Flag size={15} />;
  if (kind === "checkpoint") return <CheckCircle2 size={15} />;
  return <Clock3 size={15} />;
}

function roleCounts(actions: GalaxyActionTraceItem[]) {
  return actions.reduce(
    (acc, action) => {
      acc[action.evidenceRole ?? "source_read"] += 1;
      return acc;
    },
    {
      question_audit: 0,
      source_search: 0,
      source_read: 0,
      evidence_extract: 0,
      forecast_record: 0,
    } as Record<NonNullable<GalaxyActionTraceItem["evidenceRole"]>, number>,
  );
}

function GalaxyRunHeader({
  projection,
  actions,
  liveStatus,
  finalSource,
  agentArtifact,
  runMessage,
  onRun,
  onRefresh,
}: {
  projection: ForecastProjection;
  actions: GalaxyActionTraceItem[];
  liveStatus: LiveRunStatus | null;
  finalSource: "current run" | "last completed";
  agentArtifact?: ForecastAgentRunArtifact | null;
  runMessage: string;
  onRun: () => void;
  onRefresh: () => void;
}) {
  const galaxy = projection.galaxyRun;
  const meta = galaxy?.runMeta;
  const final = finalPayload(projection, actions, finalSource, liveStatus?.runId, agentArtifact);
  const isRunning = liveStatus?.status === "running";
  const status = liveStatus?.status ?? agentArtifact?.runMeta.status ?? meta?.status ?? "last completed";
  const pid = liveStatus?.pid ?? null;
  const elapsed =
    liveStatus?.elapsed ?? (meta?.durationSeconds ? Math.round(meta.durationSeconds) : null);
  const runDir =
    liveStatus?.runDir ?? agentArtifact?.runMeta.runDir ?? meta?.runDir ?? meta?.outputDir ?? "not loaded";
  const taskId = liveStatus?.taskId ?? agentArtifact?.runMeta.taskId ?? meta?.taskId ?? projection.runId;
  const command = liveStatus?.command ?? meta?.command;

  return (
    <section className="console-card galaxy-agent-hero">
      <div className="galaxy-agent-copy">
        <span className="galaxy-kicker">Forecast agent primary surface</span>
        <h1>Forecast Agent Behavior Viewer</h1>
        <p>{questionText(projection)}</p>
        <div className="galaxy-run-chips">
          <span>status {status}</span>
          <span>pid {pid ?? "none"}</span>
          <span>elapsed {elapsed != null ? `${elapsed}s` : "pending"}</span>
          <span>{taskId}</span>
          <span>final {final.prediction} · {finalSource}</span>
        </div>
      </div>
      <div className="galaxy-agent-command">
        <InfoTitle
          title="Run control"
          subtitle="local start/status/trace live execution"
        />
        <dl className="galaxy-run-kv">
          <div><dt>runtime</dt><dd>{liveStatus?.runConfig ?? agentArtifact?.runMeta.runner ?? "local-forecast-agent"}</dd></div>
          <div><dt>runDir</dt><dd>{runDir}</dd></div>
          <div><dt>last updated</dt><dd>{liveStatus?.lastUpdatedAt ?? agentArtifact?.runMeta.lastUpdatedAt ?? meta?.completedAt ?? meta?.forecastedAt ?? "unknown"}</dd></div>
        </dl>
        <code>{command?.join(" ") ?? "node scripts/forecast-agent/runner.mjs"}</code>
        <div className="galaxy-run-actions">
          <button type="button" onClick={onRun} disabled={isRunning}>
            {isRunning ? <RefreshCw size={15} className="spin-icon" /> : <Play size={15} />}
            {isRunning ? "Running live" : "Run local agent"}
          </button>
          <button type="button" onClick={onRefresh}>
            <RefreshCw size={15} />
            Refresh last completed
          </button>
        </div>
        {runMessage ? <p className="galaxy-run-message">{runMessage}</p> : null}
      </div>
    </section>
  );
}

function FinalForecastCard({
  projection,
  actions,
  finalSource,
  agentArtifact,
}: {
  projection: ForecastProjection;
  actions: GalaxyActionTraceItem[];
  finalSource: "current run" | "last completed";
  agentArtifact?: ForecastAgentRunArtifact | null;
}) {
  const final = finalPayload(projection, actions, finalSource, undefined, agentArtifact);
  const stats = roleCounts(actions);
  const payload = final.payload;

  return (
    <section className="console-card galaxy-final-card">
      <InfoTitle title="Final forecast" subtitle={`record_forecast payload · ${finalSource}`} />
      <div className="galaxy-final-answer">
        <span>prediction</span>
        <strong>{final.prediction}</strong>
        <p>confidence {final.confidence} · terminal {final.terminal}</p>
      </div>
      <p>{payload?.rationale ?? final.action?.summary ?? "Current run has not recorded a final forecast yet."}</p>
      <div className="galaxy-final-lists">
        <strong>key evidence</strong>
        {(payload?.keyEvidenceItems?.length ? payload.keyEvidenceItems : ["pending record_forecast payload"]).map((item) => (
          <p key={item}>{item}</p>
        ))}
        {payload?.counterEvidenceItems?.length ? <strong>counter evidence</strong> : null}
        {payload?.counterEvidenceItems?.map((item) => <p key={item}>{item}</p>)}
        {payload?.openConcerns?.length ? <strong>open concerns</strong> : null}
        {payload?.openConcerns?.map((item) => <p key={item}>{item}</p>)}
      </div>
      <div className="galaxy-stats-grid">
        <span><b>{stats.question_audit}</b> audit</span>
        <span><b>{stats.source_search}</b> search</span>
        <span><b>{stats.source_read}</b> read</span>
        <span><b>{stats.evidence_extract}</b> extract</span>
      </div>
    </section>
  );
}

function ActionTimeline({
  actions,
  selectedActionId,
  onSelectAction,
}: {
  actions: GalaxyActionTraceItem[];
  selectedActionId: string | null;
  onSelectAction: (actionId: string) => void;
}) {
  return (
    <section className="console-card galaxy-action-timeline">
      <InfoTitle title="Action timeline" subtitle="events.jsonl -> reviewer-safe action trace" />
      <div className="galaxy-action-list">
        {actions.map((action) => (
          <button
            className={selectedActionId === action.actionId ? "selected" : ""}
            key={action.actionId}
            onClick={() => onSelectAction(action.actionId)}
            type="button"
          >
            <i>{actionIcon(action.kind, action.toolName)}</i>
            <span>
              <em>{String(action.index + 1).padStart(2, "0")} · {action.at} · {kindLabel[action.kind]}</em>
              <strong>{action.title}</strong>
              <small>{action.summary}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ActionInspector({ action }: { action: GalaxyActionTraceItem | null }) {
  return (
    <section className={`console-card galaxy-action-inspector ${action ? "has-action" : ""}`}>
      <InfoTitle title="Inspector" subtitle="selected action provenance" />
      {action ? (
        <div className="galaxy-inspector-body">
          <span>{kindLabel[action.kind]} · {action.status}</span>
          <strong>{action.title}</strong>
          <p>{action.summary}</p>
          <dl>
            <div>
              <dt>actionId</dt>
              <dd>{action.actionId}</dd>
            </div>
            {action.toolName ? (
              <div>
                <dt>tool</dt>
                <dd>{action.toolName}</dd>
              </div>
            ) : null}
            {action.query ? (
              <div>
                <dt>query</dt>
                <dd>{action.query}</dd>
              </div>
            ) : null}
            {action.sourceUrl ? (
              <div>
                <dt>sourceUrl</dt>
                <dd>{action.sourceUrl}</dd>
              </div>
            ) : null}
            {action.artifactPath ? (
              <div>
                <dt>artifact</dt>
                <dd>{action.artifactPath}</dd>
              </div>
            ) : null}
            {action.argsSummary ? (
              <div>
                <dt>args</dt>
                <dd>{action.argsSummary}</dd>
              </div>
            ) : null}
            {action.forecastPayload?.prediction ? (
              <div>
                <dt>forecast</dt>
                <dd>{action.forecastPayload.prediction} · {action.forecastPayload.confidence ?? "unknown"}</dd>
              </div>
            ) : null}
            {action.lane ? (
              <div>
                <dt>lane</dt>
                <dd>{action.lane}</dd>
              </div>
            ) : null}
            <div>
              <dt>trace role</dt>
              <dd>{action.evidenceRole ?? "source_read"}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="galaxy-inspector-empty">
          <ShieldAlert size={22} />
          <strong>Select a graph node or timeline step</strong>
          <p>Inspector shows safe provenance: tool name, source URL, query, artifact path, and trace role.</p>
        </div>
      )}
    </section>
  );
}

export function ForecastPage({
  selectedTarget: _selectedTarget,
  onSelectTarget: _onSelectTarget,
}: {
  selectedTarget: ForecastTarget;
  onSelectTarget: (target: ForecastTarget) => void;
}) {
  const [latestCompletedArtifact, setLatestCompletedArtifact] = useState<unknown | null>(null);
  const [latestAgentArtifact, setLatestAgentArtifact] = useState<ForecastAgentRunArtifact | null>(null);
  const [liveArtifact, setLiveArtifact] = useState<GalaxyHormuzRunArtifact | null>(null);
  const [liveAgentArtifact, setLiveAgentArtifact] = useState<ForecastAgentRunArtifact | null>(null);
  const [liveTrace, setLiveTrace] = useState<GalaxyActionTrace | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveRunStatus | null>(null);
  const [galaxyRunMessage, setGalaxyRunMessage] = useState("");
  const [graphMode, setGraphMode] = useState<"summary" | "full">("summary");
  const runtimeGalaxyArtifact = liveArtifact ?? latestCompletedArtifact ?? undefined;
  const projection = useMemo(
    () => projectForecastState(runtimeGalaxyArtifact ?? undefined),
    [runtimeGalaxyArtifact],
  );
  const agentArtifact = liveAgentArtifact ?? latestAgentArtifact;
  const agentTrace = liveTrace ?? agentArtifact?.trace ?? null;
  const actions = agentTrace?.actions ?? projection.galaxyRun?.actionTrace?.actions ?? [];
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const selectedAction =
    actions.find((action) => action.actionId === selectedActionId) ?? actions.at(-2) ?? null;
  const finalSource = liveArtifact || liveStatus?.status === "running" ? "current run" : "last completed";

  const refreshGalaxyArtifact = useCallback(async (message = "Artifact refreshed.") => {
    const [agentResponse, galaxyResponse] = await Promise.all([
      fetch("/api/forecast-agent/latest").catch(() => null),
      fetch("/api/galaxy-hormuz/latest"),
    ]);
    if (agentResponse?.ok) {
      setLatestAgentArtifact(await agentResponse.json());
    }
    if (!galaxyResponse.ok) {
      throw new Error(`latest artifact request failed: ${galaxyResponse.status}`);
    }
    setLatestCompletedArtifact(await galaxyResponse.json());
    if (!liveStatus || liveStatus.status !== "running") {
      setLiveArtifact(null);
      setLiveAgentArtifact(null);
      setLiveTrace(null);
      setLiveStatus(null);
    }
    setGalaxyRunMessage(message);
  }, [liveStatus]);

  const pollLiveRun = useCallback(async (runId: string) => {
    const [statusResponse, traceResponse] = await Promise.all([
      fetch(`/api/forecast-agent/run/status?runId=${encodeURIComponent(runId)}`),
      fetch(`/api/forecast-agent/run/trace?runId=${encodeURIComponent(runId)}`),
    ]);
    if (!statusResponse.ok) {
      throw new Error(`status request failed: ${statusResponse.status}`);
    }
    const statusPayload = (await statusResponse.json()) as LiveRunStatus;
    setLiveStatus(statusPayload);
    if (traceResponse.ok) {
      const tracePayload = (await traceResponse.json()) as TraceResponse;
      setLiveTrace(tracePayload.trace);
      if (tracePayload.artifact?.schemaVersion === "hormuz-forecast-agent-run/v1") {
        setLiveAgentArtifact(tracePayload.artifact);
      } else if (tracePayload.artifact) {
        setLiveArtifact(tracePayload.artifact);
      }
    }
    if (statusPayload.status === "completed") {
      setGalaxyRunMessage("Local forecast-agent run completed; latest artifact now points to this run.");
      await refreshGalaxyArtifact("Local forecast-agent completed; final forecast is from the current run.");
    } else if (statusPayload.status === "failed") {
      setGalaxyRunMessage(statusPayload.error ?? "Local forecast-agent run failed; keeping the last valid trace.");
    } else {
      setGalaxyRunMessage(`Live run ${statusPayload.runId} · ${statusPayload.elapsed}s · ${statusPayload.runDir}`);
    }
  }, [refreshGalaxyArtifact]);

  useEffect(() => {
    if (!liveStatus?.runId || liveStatus.status !== "running") return;
    let cancelled = false;
    const tick = async () => {
      try {
        await pollLiveRun(liveStatus.runId);
      } catch (error) {
        if (!cancelled) {
          setGalaxyRunMessage(error instanceof Error ? error.message : "Live trace polling failed.");
        }
      }
    };
    const interval = window.setInterval(() => {
      void tick();
    }, 1500);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [liveStatus?.runId, liveStatus?.status, pollLiveRun]);

  useEffect(() => {
    if (!latestCompletedArtifact) {
      void refreshGalaxyArtifact("Loaded last completed forecast-agent artifact.");
    }
  }, [latestCompletedArtifact, refreshGalaxyArtifact]);

  async function handleRefreshGalaxyArtifact() {
    try {
      await refreshGalaxyArtifact();
    } catch (error) {
      setGalaxyRunMessage(error instanceof Error ? error.message : "Artifact refresh failed.");
    }
  }

  async function handleRunGalaxy() {
    setGalaxyRunMessage("Starting local forecast-agent runtime...");
    try {
      const response = await fetch("/api/forecast-agent/run/start", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        runId?: string;
        pid?: number;
        runDir?: string;
        outputDir?: string;
        taskId?: string;
        startedAt?: string;
        runConfig?: string;
        error?: string;
      };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `local forecast-agent run failed: ${response.status}`);
      }
      const status: LiveRunStatus = {
        runId: payload.runId ?? "",
        taskId: payload.taskId ?? "",
        status: "running",
        pid: payload.pid ?? null,
        elapsed: 0,
        startedAt: payload.startedAt ?? new Date().toISOString(),
        lastUpdatedAt: payload.startedAt ?? new Date().toISOString(),
        runDir: payload.runDir ?? "",
        outputDir: payload.outputDir ?? "",
        runConfig: payload.runConfig ?? "local-forecast-agent",
        exitCode: null,
      };
      setLiveStatus(status);
      setLiveArtifact(null);
      setLiveAgentArtifact(null);
      setLiveTrace(null);
      setSelectedActionId(null);
      setGalaxyRunMessage(`Started ${status.runId}; waiting for events.jsonl live trace.`);
      if (status.runId) await pollLiveRun(status.runId);
    } catch (error) {
      setGalaxyRunMessage(error instanceof Error ? error.message : "Local forecast-agent run failed.");
    }
  }

  return (
    <section className="page-grid forecast-page galaxy-agent-page">
      <GalaxyRunHeader
        projection={projection}
        actions={actions}
        liveStatus={liveStatus}
        finalSource={finalSource}
        agentArtifact={agentArtifact}
        runMessage={galaxyRunMessage}
        onRun={handleRunGalaxy}
        onRefresh={handleRefreshGalaxyArtifact}
      />

      <section className="galaxy-agent-workbench">
        <main className="galaxy-agent-main">
          <section className="console-card galaxy-view-mode">
            <InfoTitle
              title="Visualization mode"
              subtitle="Summary keeps only decision-relevant actions; full expands tool results."
            />
            <div className="forecast-mode-tabs" role="tablist" aria-label="Galaxy graph mode">
              {(["summary", "full"] as const).map((mode) => (
                <button
                  aria-selected={graphMode === mode}
                  className={graphMode === mode ? "selected" : ""}
                  key={mode}
                  onClick={() => setGraphMode(mode)}
                  role="tab"
                  type="button"
                >
                  {mode === "summary" ? "核心动作" : "完整 trace"}
                </button>
              ))}
            </div>
          </section>
          <GalaxyActionGraph
            actions={actions}
            graph={agentTrace?.graph}
            mode={graphMode}
            selectedActionId={selectedActionId}
            onSelectAction={setSelectedActionId}
          />
          <ActionTimeline
            actions={actions}
            selectedActionId={selectedActionId}
            onSelectAction={setSelectedActionId}
          />
        </main>
        <aside className="galaxy-agent-side">
          <FinalForecastCard
            projection={projection}
            actions={actions}
            finalSource={finalSource}
            agentArtifact={agentArtifact}
          />
          <ActionInspector action={selectedAction} />
        </aside>
      </section>
    </section>
  );
}
