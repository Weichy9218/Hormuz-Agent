// Forecast page focused on live galaxy-selfevolve run visualization.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
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
import { NumericForecastCard } from "../components/forecast/NumericForecastCard";
import { InfoTitle } from "../components/shared/InfoTitle";
import { isNumericForecastQuestion } from "../lib/forecast/numericForecast";
import { projectBrentDailySeries, projectForecastState } from "../state/projections";
import type { ForecastTarget } from "../types/forecast";
import type {
  GalaxyActionKind,
  GalaxyActionTrace,
  GalaxyActionTraceItem,
  GalaxyHormuzRunArtifact,
} from "../types/galaxy";

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
  artifact: GalaxyHormuzRunArtifact | null;
}

const runtimeConfig: Record<"galaxy", {
  label: string;
  detail: string;
  startPath: string;
  statusPath: string;
  tracePath: string;
}> = {
  galaxy: {
    label: "galaxy (.venv)",
    detail: "real galaxy-selfevolve run",
    startPath: "/api/galaxy-hormuz/run/start",
    statusPath: "/api/galaxy-hormuz/run/status",
    tracePath: "/api/galaxy-hormuz/run/trace",
  },
};

const kindLabel: Record<GalaxyActionKind, string> = {
  question: "问题定义",
  assistant_note: "Agent 思考",
  tool_call: "工具调用",
  tool_result: "工具返回",
  artifact_read: "读取证据",
  evidence_synthesis: "证据综合",
  final_forecast: "最终预测",
  checkpoint: "检查点",
  supervisor: "运行时",
};

const statusZh: Record<string, string> = {
  running: "运行中",
  completed: "已完成",
  failed: "运行失败",
  idle: "空闲",
  success: "已完成",
};

const finalSourceZh = {
  "current run": "当前运行",
  "last completed": "上次完成",
} as const;

function displayStatus(s: string) { return statusZh[s] ?? s; }
function displaySource(s: "current run" | "last completed") { return finalSourceZh[s]; }

function questionSummary(projection: ForecastProjection) {
  const q = projection.galaxyRun?.question;
  if (!q) return "尚未加载预测问题。";
  const meta = q.metadata;
  if (meta?.question_kind === "brent_weekly_high") {
    const win = typeof meta.resolution_window === "object" ? meta.resolution_window as { start_date?: string; end_date?: string } : null;
    const dateRange = win ? `${win.start_date ?? ""} → ${win.end_date ?? ""}` : (meta.generated_for_date as string | undefined ?? "");
    return `预测目标：${dateRange} 当周 Brent 原油最高日价，分辨率来源 FRED DCOILBRENTEU，单位 USD/bbl。`;
  }
  const quoted = q.task_question?.match(/"""([\s\S]*?)"""/)?.[1];
  return (quoted ?? q.task_description ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
}

function compactPath(path: string, keepSegments = 2) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= keepSegments + 1) return path;
  return `.../${parts.slice(-keepSegments).join("/")}`;
}

function finalPayload(
  projection: ForecastProjection,
  actions: GalaxyActionTraceItem[],
  source: "current run" | "last completed",
  liveRunId?: string,
) {
  const finalAction = [...actions].reverse().find((action) => action.forecastPayload);
  const metaPrediction = projection.galaxyRun?.runMeta.finalPrediction;
  const allowMetaFallback =
    source === "last completed" || projection.galaxyRun?.runMeta.runId === liveRunId;
  return {
    prediction:
      finalAction?.forecastPayload?.prediction ??
      (allowMetaFallback ? metaPrediction : undefined) ??
      "pending",
    confidence:
      finalAction?.forecastPayload?.confidence ??
      projection.galaxyRun?.runMeta.confidence ??
      "unknown",
    terminal:
      projection.galaxyRun?.runMeta.terminalReason ??
      "record_forecast",
    payload: finalAction?.forecastPayload,
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
  runMessage,
  onRun,
  onRefresh,
}: {
  projection: ForecastProjection;
  actions: GalaxyActionTraceItem[];
  liveStatus: LiveRunStatus | null;
  finalSource: "current run" | "last completed";
  runMessage: string;
  onRun: () => void;
  onRefresh: () => void;
}) {
  const galaxy = projection.galaxyRun;
  const meta = galaxy?.runMeta;
  const final = finalPayload(projection, actions, finalSource, liveStatus?.runId);
  const isRunning = liveStatus?.status === "running";
  const runtimeInfo = runtimeConfig.galaxy;
  const status = liveStatus?.status ?? meta?.status ?? "last completed";
  const pid = liveStatus?.pid ?? null;
  const elapsed =
    liveStatus?.elapsed ?? (meta?.durationSeconds ? Math.round(meta.durationSeconds) : null);
  const runDir =
    liveStatus?.runDir ?? meta?.runDir ?? meta?.outputDir ?? "not loaded";
  const taskId = liveStatus?.taskId ?? meta?.taskId ?? projection.runId;
  const command = liveStatus?.command ?? meta?.command;

  return (
    <section className="console-card galaxy-agent-hero">
      <div className="galaxy-agent-copy">
        <h1>预测 Agent 行为查看器</h1>
        <p>{questionSummary(projection)}</p>
        <div className="galaxy-run-chips">
          <span className={`status-chip status-${liveStatus?.status ?? meta?.status ?? "idle"}`}>
            {displayStatus(liveStatus?.status ?? meta?.status ?? "last completed")}
          </span>
          {meta?.demo ? <span className="demo">[DEMO]</span> : null}
          {elapsed != null && elapsed > 0 ? <span>耗时 {elapsed}s</span> : null}
          {taskId ? <span title={taskId}>{taskId.slice(0, 36)}</span> : null}
          <span className="prediction-chip">预测值 {final.prediction}</span>
        </div>
      </div>
      <div className="galaxy-agent-command">
        <InfoTitle title="运行控制" subtitle="galaxy-selfevolve · 启动 / 状态 / 追踪" />
        <dl className="galaxy-run-kv">
          <div><dt>输出目录</dt><dd title={runDir}>{compactPath(runDir, 2)}</dd></div>
          <div><dt>最后更新</dt><dd>{liveStatus?.lastUpdatedAt ?? meta?.completedAt ?? meta?.forecastedAt ?? "未知"}</dd></div>
          <div><dt>来源</dt><dd>{displaySource(finalSource)}</dd></div>
        </dl>
        <details className="galaxy-command-detail">
          <summary>查看执行命令</summary>
          <code>{command?.join(" ") ?? ".venv/bin/python main.py --run-config hormuz_test.yaml"}</code>
        </details>
        <div className="galaxy-run-actions">
          <button type="button" onClick={onRun} disabled={isRunning}>
            {isRunning ? <RefreshCw size={15} className="spin-icon" /> : <Play size={15} />}
            {isRunning ? "运行中..." : "运行 Galaxy"}
          </button>
          <button type="button" onClick={onRefresh}>
            <RefreshCw size={15} />
            刷新上次结果
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
}: {
  projection: ForecastProjection;
  actions: GalaxyActionTraceItem[];
  finalSource: "current run" | "last completed";
}) {
  const final = finalPayload(projection, actions, finalSource);
  const stats = roleCounts(actions);
  const payload = final.payload;

  return (
    <section className="console-card galaxy-final-card">
      <InfoTitle title="最终预测" subtitle={`record_forecast 载荷 · ${displaySource(finalSource)}`} />
      <div className="galaxy-final-answer">
        <span>预测值</span>
        <strong>{final.prediction}</strong>
        <p>置信度 {final.confidence} · 终止原因 {final.terminal}</p>
      </div>
      <p>{payload?.rationale ?? final.action?.summary ?? "当前运行尚未记录最终预测。"}</p>
      <div className="galaxy-final-lists">
        <strong>关键证据</strong>
        {(payload?.keyEvidenceItems?.length ? payload.keyEvidenceItems : ["等待 record_forecast 载荷"]).map((item) => (
          <p key={item}>{item}</p>
        ))}
        {payload?.counterEvidenceItems?.length ? <strong>反向证据</strong> : null}
        {payload?.counterEvidenceItems?.map((item) => <p key={item}>{item}</p>)}
        {payload?.openConcerns?.length ? <strong>待观察风险</strong> : null}
        {payload?.openConcerns?.map((item) => <p key={item}>{item}</p>)}
      </div>
      <div className="galaxy-stats-grid">
        <span><b>{stats.question_audit}</b> 审计</span>
        <span><b>{stats.source_search}</b> 检索</span>
        <span><b>{stats.source_read}</b> 读取</span>
        <span><b>{stats.evidence_extract}</b> 提取</span>
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
      <InfoTitle title="动作时间线" subtitle={`events.jsonl → 脱敏动作追踪（共 ${actions.length} 步）`} />
      <div className="galaxy-action-list">
        {actions.map((action) => (
          <button
            className={[
              selectedActionId === action.actionId ? "selected" : "",
              action.criticalPath ? "critical-path" : "",
            ].filter(Boolean).join(" ")}
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
  const [showFullRaw, setShowFullRaw] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  useEffect(() => {
    setShowFullRaw(false);
    setCopyMessage("");
  }, [action?.actionId]);
  const raw = action?.rawPreview;
  const rawText = raw?.text ?? "";
  const rawDisplay = showFullRaw ? rawText : rawText.slice(0, 1200);
  const rawPath = raw?.rawFilePath ? `${raw.rawFilePath}${raw.rawLine ? `:${raw.rawLine}` : ""}` : "";
  function copyWithFallback(value: string) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
  async function handleCopyRawPath() {
    if (!rawPath) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(rawPath);
      } else if (!copyWithFallback(rawPath)) {
        throw new Error("clipboard unavailable");
      }
      setCopyMessage("已复制");
    } catch {
      setCopyMessage(copyWithFallback(rawPath) ? "已复制" : "复制失败");
    }
  }
  return (
    <section className={`console-card galaxy-action-inspector ${action ? "has-action" : ""}`}>
      <InfoTitle title="检查器" subtitle="选中动作 · 来源溯源" />
      {action ? (
        <div className="galaxy-inspector-body">
          <span>{kindLabel[action.kind]} · {action.status}</span>
          <div className={`galaxy-critical-badge ${action.criticalPath ? "yes" : "no"}`}>
            <b>关键路径</b>
            <strong>{action.criticalPath ? "是" : "否"}</strong>
            {action.criticalReason ? <small>{action.criticalReason}</small> : null}
          </div>
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
                <dd>{action.forecastPayload.prediction} · {action.forecastPayload.confidence ?? "未知"}</dd>
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
          {raw ? (
            <div className="galaxy-raw-preview">
              <div>
                <span>原始载荷</span>
                <strong>{raw.title}</strong>
                <small>
                  {raw.rawFilePath ?? "生成追踪"}
                  {raw.rawLine ? `:${raw.rawLine}` : ""} · {raw.fullLength} 字符
                </small>
              </div>
              {raw.boxedAnswer ? <p className="galaxy-boxed-answer">{raw.boxedAnswer}</p> : null}
              {raw.toolCalls?.length ? (
                <div className="galaxy-tool-call-list">
                  {raw.toolCalls.map((call) => (
                    <p key={`${call.id ?? call.name}-${call.arguments.slice(0, 20)}`}>
                      <b>{call.name}</b>
                      <code>{call.arguments}</code>
                    </p>
                  ))}
                </div>
              ) : null}
              <pre>{rawDisplay}{!showFullRaw && rawText.length > rawDisplay.length ? "\n..." : ""}</pre>
              {rawText.length > 1200 ? (
                <button type="button" onClick={() => setShowFullRaw((value) => !value)}>
                  {showFullRaw ? "收起" : "展开完整载荷"}
                </button>
              ) : null}
              {rawPath ? (
                <div className="galaxy-raw-actions">
                  <button type="button" onClick={handleCopyRawPath}>
                    <Copy size={13} />
                    复制文件路径
                  </button>
                  {copyMessage ? <small>{copyMessage}</small> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="galaxy-inspector-empty">
          <ShieldAlert size={22} />
          <strong>点击图节点或时间线步骤</strong>
          <p>展示工具名称、来源链接、查询词、证据路径及行动角色。</p>
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
  const [liveArtifact, setLiveArtifact] = useState<GalaxyHormuzRunArtifact | null>(null);
  const [liveTrace, setLiveTrace] = useState<GalaxyActionTrace | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveRunStatus | null>(null);
  const [galaxyRunMessage, setGalaxyRunMessage] = useState("");
  const [graphMode, setGraphMode] = useState<"summary" | "full">("summary");
  const runtimeLiveStatus = liveStatus;
  const runtimeGalaxyArtifact = liveArtifact ?? latestCompletedArtifact ?? undefined;
  const projection = useMemo(
    () => projectForecastState(runtimeGalaxyArtifact ?? undefined),
    [runtimeGalaxyArtifact],
  );
  const brentDailySeries = useMemo(() => projectBrentDailySeries(30), []);
  const agentTrace = liveTrace ?? projection.galaxyRun?.actionTrace ?? null;
  const traceKey =
    agentTrace?.runDir ??
    runtimeLiveStatus?.runDir ??
    projection.galaxyRun?.runMeta.runDir ??
    "latest";
  const actions = agentTrace?.actions ?? projection.galaxyRun?.actionTrace?.actions ?? [];
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const selectedAction =
    actions.find((action) => action.actionId === selectedActionId) ?? actions.at(-2) ?? null;
  const finalSource =
    runtimeLiveStatus?.status === "running" ||
    liveArtifact
      ? "current run"
      : "last completed";
  const final = finalPayload(projection, actions, finalSource, runtimeLiveStatus?.runId);
  const showNumericForecast = isNumericForecastQuestion(projection.galaxyRun?.question, final.prediction);

  const refreshGalaxyArtifact = useCallback(async (message = "已加载最新 artifact。") => {
    const galaxyResponse = await fetch("/api/galaxy-hormuz/latest");
    if (!galaxyResponse.ok) {
      throw new Error(`latest artifact request failed: ${galaxyResponse.status}`);
    }
    setLatestCompletedArtifact(await galaxyResponse.json());
    if (!liveStatus || liveStatus.status !== "running") {
      setLiveArtifact(null);
      setLiveTrace(null);
      setLiveStatus(null);
    }
    setGalaxyRunMessage(message);
  }, [liveStatus]);

  const mergeTrace = useCallback((incoming: GalaxyActionTrace) => {
    setLiveTrace((previous) => {
      if (!incoming.isDelta || !previous) return incoming;
      const actionMap = new Map(previous.actions.map((action) => [action.actionId, action]));
      for (const action of incoming.actions) actionMap.set(action.actionId, action);
      const actions = [...actionMap.values()].sort((a, b) => a.index - b.index);
      const nodeMap = new Map((previous.graph?.nodes ?? []).map((node) => [node.id, node]));
      for (const node of incoming.graph?.nodes ?? []) nodeMap.set(node.id, node);
      const edgeMap = new Map((previous.graph?.edges ?? []).map((edge) => [edge.id, edge]));
      for (const edge of incoming.graph?.edges ?? []) edgeMap.set(edge.id, edge);
      return {
        ...previous,
        ...incoming,
        actions,
        graph: {
          nodes: [...nodeMap.values()],
          edges: [...edgeMap.values()],
        },
      };
    });
  }, []);

  const pollLiveRun = useCallback(async (runId: string, forceFullTrace = false) => {
    const config = runtimeConfig.galaxy;
    const canRequestDelta =
      !forceFullTrace &&
      liveStatus?.runId === runId &&
      liveTrace?.actions.length;
    const afterIndex = canRequestDelta ? Math.max(...liveTrace.actions.map((action) => action.index)) : -1;
    const [statusResponse, traceResponse] = await Promise.all([
      fetch(`${config.statusPath}?runId=${encodeURIComponent(runId)}`),
      fetch(`${config.tracePath}?runId=${encodeURIComponent(runId)}&afterIndex=${afterIndex}`),
    ]);
    if (!statusResponse.ok) {
      throw new Error(`status request failed: ${statusResponse.status}`);
    }
    const statusPayload = (await statusResponse.json()) as LiveRunStatus;
    setLiveStatus(statusPayload);
    if (traceResponse.ok) {
      const tracePayload = (await traceResponse.json()) as TraceResponse;
      mergeTrace(tracePayload.trace);
      if (tracePayload.artifact) {
        setLiveArtifact(tracePayload.artifact);
      }
    }
    if (statusPayload.status === "completed") {
      setGalaxyRunMessage("galaxy 运行完成，artifact 已更新至当前运行。");
      await refreshGalaxyArtifact("galaxy 运行完成，预测结果来自当前运行。");
    } else if (statusPayload.status === "failed") {
      setGalaxyRunMessage(statusPayload.error ?? "galaxy 运行失败，保留上次有效追踪。");
    } else {
      setGalaxyRunMessage(`运行中 ${statusPayload.runId} · 已耗时 ${statusPayload.elapsed}s`);
    }
  }, [liveStatus?.runId, liveTrace?.actions, mergeTrace, refreshGalaxyArtifact]);

  useEffect(() => {
    if (!liveStatus?.runId || liveStatus.status !== "running") return;
    let cancelled = false;
    const tick = async () => {
      try {
        await pollLiveRun(liveStatus.runId);
      } catch (error) {
        if (!cancelled) {
          setGalaxyRunMessage(error instanceof Error ? error.message : "追踪轮询失败。");
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
      void refreshGalaxyArtifact("已加载最近完成的 galaxy artifact。");
    }
  }, [latestCompletedArtifact, refreshGalaxyArtifact]);

  async function handleRefreshGalaxyArtifact() {
    try {
      await refreshGalaxyArtifact();
    } catch (error) {
      setGalaxyRunMessage(error instanceof Error ? error.message : "刷新失败。");
    }
  }

  async function handleRunGalaxy() {
    const config = runtimeConfig.galaxy;
    setGalaxyRunMessage("正在启动 galaxy 运行...");
    try {
      const response = await fetch(config.startPath, { method: "POST" });
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
        throw new Error(payload.error || `${config.label} run failed: ${response.status}`);
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
        runConfig: payload.runConfig ?? config.label,
        exitCode: null,
      };
      setLiveStatus(status);
      setLiveArtifact(null);
      setLiveTrace(null);
      setSelectedActionId(null);
      setGalaxyRunMessage(`已启动 ${status.runId}，等待 main_agent.jsonl 追踪数据。`);
      if (status.runId) await pollLiveRun(status.runId, true);
    } catch (error) {
      setGalaxyRunMessage(error instanceof Error ? error.message : "galaxy 运行启动失败。");
    }
  }

  return (
    <section className="page-grid forecast-page galaxy-agent-page">
      <GalaxyRunHeader
        projection={projection}
        actions={actions}
        liveStatus={runtimeLiveStatus}
        finalSource={finalSource}
        runMessage={galaxyRunMessage}
        onRun={handleRunGalaxy}
        onRefresh={handleRefreshGalaxyArtifact}
      />

      <section className="galaxy-agent-workbench">
        <main className="galaxy-agent-main">
          <GalaxyActionGraph
            actions={actions}
            graph={agentTrace?.graph}
            mode={graphMode}
            onSetMode={setGraphMode}
            traceKey={traceKey}
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
          {showNumericForecast ? (
            <NumericForecastCard
              question={projection.galaxyRun?.question}
              final={final}
              brentSeries={brentDailySeries}
              finalSource={finalSource}
              runtime="galaxy"
            />
          ) : (
            <FinalForecastCard
              projection={projection}
              actions={actions}
              finalSource={finalSource}
            />
          )}
          <ActionInspector action={selectedAction} />
        </aside>
      </section>
    </section>
  );
}
