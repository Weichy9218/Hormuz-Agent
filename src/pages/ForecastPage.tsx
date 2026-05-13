// Forecast page focused on live galaxy-selfevolve run visualization.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type QuestionPreset = "brent_weekly_high" | "custom";
type SidePanelTab = "result" | "inspector";
type FinalSource = "current run" | "last completed" | "history";
type AgentActionStats = Record<NonNullable<GalaxyActionTraceItem["evidenceRole"]>, number> & {
  calculation: number;
  delegation: number;
};

interface GalaxyRunHistoryItem {
  runId: string;
  taskId: string;
  questionKind: string;
  questionTitle: string;
  status: string;
  finalPrediction: string;
  completedAt: string;
  durationSeconds: number | null;
  artifactPath: string;
  runDir: string;
}

const customQuestionExamples = [
  {
    id: "gold-weekly-high",
    label: "黄金本周最高价",
    text:
      "During the trading week containing 2026-05-13 (UTC+8), from 2026-05-13 through 2026-05-15 inclusive, what will be the highest daily gold spot price, in USD per troy ounce? Use a clearly named public resolution source, report one numeric value, and explain the source boundary.",
  },
  {
    id: "hormuz-traffic-risk",
    label: "Hormuz traffic risk",
    text:
      "By 2026-05-15 23:59 UTC, will public maritime reporting indicate a material disruption to Strait of Hormuz traffic? Answer yes/no, name the resolution sources, and separate direct traffic evidence from market context.",
  },
] as const;

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
  history: "历史记录",
} as const;

function displayStatus(s: string) { return statusZh[s] ?? s; }
function displaySource(s: FinalSource) { return finalSourceZh[s]; }

function displayCriticalReason(action: GalaxyActionTraceItem) {
  const text = String(action.criticalReason ?? "");
  if (!text) return action.kind === "final_forecast" ? "最终预测" : "关键路径";
  if (/forecast question/i.test(text)) return "问题定义";
  if (/record_forecast \/ boxed answer/i.test(text)) return "最终预测";
  if (/checkpoint/i.test(text)) return "运行检查点";
  if (/parent of record_forecast/i.test(text)) return "最终综合";
  if (/fallback/i.test(text)) return "近端证据";
  if (/parent of evidence #/i.test(text)) {
    if (action.kind === "tool_call") return "证据检索";
    if (action.kind === "assistant_note" || action.kind === "evidence_synthesis") return "证据综合";
    return "证据链路";
  }
  if (/ref'd by record_forecast evidence #/i.test(text)) {
    if (action.kind === "tool_call") return "证据检索";
    if (action.kind === "tool_result" || action.kind === "artifact_read") return "证据锚点";
    return "支撑最终预测";
  }
  return text;
}

function boxedAnswerForAction(action: GalaxyActionTraceItem) {
  const prediction = action.forecastPayload?.prediction?.trim();
  if (prediction) return `\\boxed{${prediction}}`;
  return action.rawPreview?.boxedAnswer;
}

function questionSummary(projection: ForecastProjection, customQuestionText?: string) {
  const customText = customQuestionText?.trim();
  if (customText) return customText;
  const q = projection.galaxyRun?.question;
  if (!q) return "尚未加载预测问题。";
  const meta = q.metadata;
  if (meta?.question_kind === "brent_weekly_high") {
    const win = typeof meta.resolution_window === "object" ? meta.resolution_window as { start_date?: string; end_date?: string } : null;
    const dateRange = win ? `${win.start_date ?? ""} → ${win.end_date ?? ""}` : (meta.generated_for_date as string | undefined ?? "");
    return `预测目标：${dateRange} 当周 Brent 原油最高日价，分辨率来源 FRED DCOILBRENTEU，单位 USD/bbl。`;
  }
  if (meta?.question_kind === "custom") {
    const desc = q.task_description ?? "";
    const prefix = "Custom question: ";
    return desc.startsWith(prefix) ? desc.slice(prefix.length).trim() : desc.trim();
  }
  const quoted = q.task_question?.match(/"""([\s\S]*?)"""/)?.[1];
  return (quoted ?? q.task_description ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
}

function inferCustomQuestionTopic(text: string) {
  const lower = text.toLowerCase();
  if (/\bgold\b|黄金|xau/.test(lower)) {
    return {
      title: "黄金周高预测",
      unit: "USD/troy oz",
      sourceBoundary: "需由 agent 在运行中明确 resolution source；本地未接 gold 实测序列。",
    };
  }
  if (/hormuz|traffic|strait|transit|portwatch|通航|霍尔木兹/.test(lower)) {
    return {
      title: "Hormuz traffic 预测",
      unit: "question-defined",
      sourceBoundary: "需区分 PortWatch / official advisory / media context，不能把市场价格当作交通实测。",
    };
  }
  return {
    title: "自定义预测",
    unit: "question-defined",
    sourceBoundary: "自定义问题没有本地 grounding 卡；最终以 record_forecast 载荷和 Inspector 证据为准。",
  };
}

function compactPath(path: string, keepSegments = 2) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= keepSegments + 1) return path;
  return `.../${parts.slice(-keepSegments).join("/")}`;
}

function finalPayload(
  projection: ForecastProjection,
  actions: GalaxyActionTraceItem[],
  source: FinalSource,
  liveRunId?: string,
) {
  const finalAction = [...actions].reverse().find((action) => action.forecastPayload);
  const metaPrediction = projection.galaxyRun?.runMeta.finalPrediction;
  const allowMetaFallback =
    source === "last completed" || source === "history" || projection.galaxyRun?.runMeta.runId === liveRunId;
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
      if (action.toolName === "execute_python_code" || action.toolName === "calculate_technical_indicators") {
        acc.calculation += 1;
      }
      if (action.toolName === "sub_agent_factor" || action.toolName === "sub_agent_access") {
        acc.delegation += 1;
      }
      return acc;
    },
    {
      question_audit: 0,
      source_search: 0,
      source_read: 0,
      evidence_extract: 0,
      calculation: 0,
      delegation: 0,
      forecast_record: 0,
    } as AgentActionStats,
  );
}

function GalaxyRunHeader({
  projection,
  actions,
  liveStatus,
  finalSource,
  runMessage,
  historyRuns,
  selectedHistoryRunId,
  questionPreset,
  customQuestionText,
  onSelectHistoryRun,
  onQuestionPresetChange,
  onCustomQuestionTextChange,
  onRun,
  onRefresh,
}: {
  projection: ForecastProjection;
  actions: GalaxyActionTraceItem[];
  liveStatus: LiveRunStatus | null;
  finalSource: FinalSource;
  runMessage: string;
  historyRuns: GalaxyRunHistoryItem[];
  selectedHistoryRunId: string;
  questionPreset: QuestionPreset;
  customQuestionText: string;
  onSelectHistoryRun: (runId: string) => void;
  onQuestionPresetChange: (preset: QuestionPreset) => void;
  onCustomQuestionTextChange: (text: string) => void;
  onRun: () => void;
  onRefresh: () => void;
}) {
  const galaxy = projection.galaxyRun;
  const meta = galaxy?.runMeta;
  const final = finalPayload(projection, actions, finalSource, liveStatus?.runId);
  const isRunning = liveStatus?.status === "running";
  const elapsed =
    liveStatus?.elapsed ?? (meta?.durationSeconds ? Math.round(meta.durationSeconds) : null);
  const runDir =
    liveStatus?.runDir ?? meta?.runDir ?? meta?.outputDir ?? "not loaded";
  const taskId = liveStatus?.taskId ?? meta?.taskId ?? projection.runId;
  const command = liveStatus?.command ?? meta?.command;
  const isCustomPreset = questionPreset === "custom";
  const customQuestionReady = customQuestionText.trim().length > 0;
  const customTopic = inferCustomQuestionTopic(customQuestionText);
  const canRun = !isRunning && (!isCustomPreset || customQuestionReady);
  const runButtonLabel = isRunning
    ? "运行中..."
    : isCustomPreset
      ? "运行自定义问题"
      : "运行 Brent 预测";
  const finalMetricLabel =
    finalSource === "current run" ? "当前预测" : finalSource === "history" ? "历史预测" : "上次预测";
  const selectedHistoryRun = historyRuns.find((run) => run.runId === selectedHistoryRunId);

  return (
    <section className="console-card galaxy-agent-hero">
      <div className="galaxy-agent-copy">
        <span className="galaxy-kicker">Forecast truth surface</span>
        <h1>预测 Agent 行为查看器</h1>
        <p className="galaxy-agent-lede">
          先锁定问题，再看 agent 如何搜证据、压缩证据链，并最终落到 record_forecast。
        </p>
        <div className="galaxy-question-config">
          <div className="galaxy-question-config-head">
            <span>问题设置</span>
            <div className="galaxy-preset-toggle" role="group" aria-label="问题预设">
              <button
                type="button"
                className={questionPreset === "brent_weekly_high" ? "selected" : ""}
                onClick={() => onQuestionPresetChange("brent_weekly_high")}
              >
                Brent 周高
              </button>
              <button
                type="button"
                className={questionPreset === "custom" ? "selected" : ""}
                onClick={() => onQuestionPresetChange("custom")}
              >
                自定义问题
              </button>
            </div>
          </div>
          {isCustomPreset ? (
            <div className="galaxy-custom-question">
              <label htmlFor="galaxy-custom-question">预测问题</label>
              <div className="galaxy-question-examples" aria-label="自定义问题示例">
                {customQuestionExamples.map((example) => (
                  <button
                    key={example.id}
                    type="button"
                    onClick={() => onCustomQuestionTextChange(example.text)}
                  >
                    {example.label}
                  </button>
                ))}
              </div>
              <textarea
                id="galaxy-custom-question"
                className="galaxy-question-textarea"
                value={customQuestionText}
                onChange={(e) => onCustomQuestionTextChange(e.target.value)}
                placeholder="输入一个可解析的预测问题，最好包含时间窗口、单位或 resolution source。"
                rows={4}
              />
              <small>
                空白时不会启动自定义 run；请写清楚目标和答案格式，agent 会补充 boxed-format instruction。
              </small>
              <p className="galaxy-question-current">
                当前目标 · {customQuestionText.trim()
                  ? `${customTopic.title} · ${questionSummary(projection, customQuestionText)}`
                  : "尚未输入自定义预测问题。"}
              </p>
            </div>
          ) : (
            <div className="galaxy-question-preview">
              <span>当前目标</span>
              <p>{questionSummary(projection)}</p>
            </div>
          )}
        </div>
        <dl className="galaxy-hero-metrics">
          <div>
            <dt>状态</dt>
            <dd className={`status-chip status-${liveStatus?.status ?? meta?.status ?? "idle"}`}>
              {displayStatus(liveStatus?.status ?? meta?.status ?? "last completed")}
            </dd>
          </div>
          <div>
            <dt>{finalMetricLabel}</dt>
            <dd>{final.prediction}</dd>
          </div>
          <div>
            <dt>Run</dt>
            <dd title={taskId}>{taskId ? taskId.replace(/^hormuz-/, "") : "not loaded"}</dd>
          </div>
          <div>
            <dt>耗时</dt>
            <dd>{elapsed != null && elapsed > 0 ? `${elapsed}s` : "pending"}</dd>
          </div>
        </dl>
        {meta?.demo ? <span className="galaxy-demo-note">当前 artifact 是 demo，不应作为真实 forecast truth。</span> : null}
      </div>
      <div className="galaxy-agent-command">
        <InfoTitle title="运行控制" subtitle="galaxy-selfevolve · 启动 / 状态 / 追踪" />
        <div className="galaxy-run-status-card">
          <span>{displaySource(finalSource)}</span>
          <strong>{displayStatus(liveStatus?.status ?? meta?.status ?? "last completed")}</strong>
          <small>{liveStatus?.lastUpdatedAt ?? meta?.completedAt ?? meta?.forecastedAt ?? "未知更新时间"}</small>
        </div>
        <dl className="galaxy-run-kv">
          <div><dt>输出目录</dt><dd title={runDir}>{compactPath(runDir, 2)}</dd></div>
          <div><dt>Task</dt><dd title={taskId}>{taskId ?? "not loaded"}</dd></div>
        </dl>
        <details className="galaxy-command-detail">
          <summary>查看执行命令</summary>
          <code>{command?.join(" ") ?? ".venv/bin/python main.py --run-config hormuz_test.yaml"}</code>
        </details>
        <div className="galaxy-run-actions">
          <button type="button" onClick={onRun} disabled={!canRun} title={!canRun ? "请先输入自定义预测问题" : undefined}>
            {isRunning ? <RefreshCw size={15} className="spin-icon" /> : <Play size={15} />}
            {runButtonLabel}
          </button>
          <button type="button" onClick={onRefresh}>
            <RefreshCw size={15} />
            刷新上次结果
          </button>
        </div>
        <div className="galaxy-history-picker">
          <label htmlFor="galaxy-history-run">历史完成题目</label>
          <select
            id="galaxy-history-run"
            value={selectedHistoryRunId}
            onChange={(event) => onSelectHistoryRun(event.target.value)}
          >
            <option value="">最近完成 artifact</option>
            {historyRuns.map((run) => (
              <option key={run.runId} value={run.runId}>
                {run.taskId.replace(/^hormuz-/, "")} · {run.finalPrediction || "no prediction"}
              </option>
            ))}
          </select>
          <small>
            {selectedHistoryRun
              ? `${displayStatus(selectedHistoryRun.status)} · ${selectedHistoryRun.completedAt || "未知完成时间"}`
              : historyRuns.length > 0
                ? `${historyRuns.length} 个本地 run-artifact 可查看`
                : "暂无历史 run-artifact"}
          </small>
        </div>
        {isCustomPreset ? (
          <p className={`galaxy-run-hint ${customQuestionReady ? "ready" : ""}`}>
            <FileText size={14} />
            {customQuestionReady
              ? "将以自定义问题启动新的 galaxy run；运行完成前右侧仍显示上次完成结果。"
              : "输入自定义问题后才能启动；当前结果仍来自上次完成 run。"}
          </p>
        ) : null}
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
  finalSource: FinalSource;
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
        <span><b>{stats.calculation}</b> 计算</span>
        <span><b>{stats.delegation}</b> 委派</span>
        <span><b>{stats.evidence_extract}</b> 提取</span>
      </div>
    </section>
  );
}

function CustomForecastCard({
  projection,
  actions,
  finalSource,
}: {
  projection: ForecastProjection;
  actions: GalaxyActionTraceItem[];
  finalSource: FinalSource;
}) {
  const final = finalPayload(projection, actions, finalSource);
  const payload = final.payload;
  const displayedQuestion = questionSummary(projection);
  const topic = inferCustomQuestionTopic(displayedQuestion);
  const evidenceCount =
    (payload?.keyEvidenceItems?.length ?? 0) +
    (payload?.counterEvidenceItems?.length ?? 0) +
    (payload?.openConcerns?.length ?? 0);

  return (
    <section className="console-card custom-forecast-card">
      <InfoTitle title={topic.title} subtitle={`${displaySource(finalSource)} · custom question`} />
      <p className="custom-question-caption">{displayedQuestion}</p>
      <div className="custom-forecast-answer">
        <span>预测值</span>
        <strong>{final.prediction}</strong>
        <p>单位 {topic.unit} · 置信度 {final.confidence} · 终止原因 {final.terminal}</p>
      </div>
      <div className="custom-source-boundary">
        <b>Source boundary</b>
        <p>{topic.sourceBoundary}</p>
      </div>
      <details className="galaxy-final-lists compact">
        <summary>record_forecast evidence · {evidenceCount || "pending"}</summary>
        <strong>关键证据</strong>
        {(payload?.keyEvidenceItems?.length ? payload.keyEvidenceItems : ["等待 record_forecast 载荷"]).map((item) => (
          <p key={item}>{item}</p>
        ))}
        {payload?.counterEvidenceItems?.length ? <strong>反向证据</strong> : null}
        {payload?.counterEvidenceItems?.map((item) => <p key={item}>{item}</p>)}
        {payload?.openConcerns?.length ? <strong>待观察风险</strong> : null}
        {payload?.openConcerns?.map((item) => <p key={item}>{item}</p>)}
      </details>
      <p className="numeric-forecast-rationale">
        {payload?.rationale ?? final.action?.summary ?? "自定义 run 尚未记录最终预测。运行完成后这里显示 record_forecast rationale。"}
      </p>
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
  onSelectAction: (actionId: string | null) => void;
}) {
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!selectedActionId) return;
    const node = itemRefs.current.get(selectedActionId);
    if (!node) return;
    const container = node.closest(".galaxy-action-list");
    if (!(container instanceof HTMLElement)) return;
    const targetTop =
      node.offsetTop - Math.max(0, (container.clientHeight - node.clientHeight) / 2);
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [selectedActionId]);

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
            ref={(node) => {
              if (node) {
                itemRefs.current.set(action.actionId, node);
              } else {
                itemRefs.current.delete(action.actionId);
              }
            }}
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
            {action.criticalPath ? <small>{displayCriticalReason(action)}</small> : null}
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
              {boxedAnswerForAction(action) ? (
                <p className="galaxy-boxed-answer">{boxedAnswerForAction(action)}</p>
              ) : null}
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
  const [historyRuns, setHistoryRuns] = useState<GalaxyRunHistoryItem[]>([]);
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState("");
  const [liveArtifact, setLiveArtifact] = useState<GalaxyHormuzRunArtifact | null>(null);
  const [liveTrace, setLiveTrace] = useState<GalaxyActionTrace | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveRunStatus | null>(null);
  const [galaxyRunMessage, setGalaxyRunMessage] = useState("");
  const [graphMode, setGraphMode] = useState<"summary" | "full">("summary");
  const [questionPreset, setQuestionPreset] = useState<QuestionPreset>(
    () => (sessionStorage.getItem("galaxyQuestionPreset") as QuestionPreset | null) ?? "brent_weekly_high",
  );
  const [customQuestionText, setCustomQuestionText] = useState(
    () => sessionStorage.getItem("galaxyCustomQuestion") ?? "",
  );
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>("result");

  const handleQuestionPresetChange = useCallback((preset: QuestionPreset) => {
    setQuestionPreset(preset);
    sessionStorage.setItem("galaxyQuestionPreset", preset);
  }, []);

  const handleCustomQuestionTextChange = useCallback((text: string) => {
    setCustomQuestionText(text);
    sessionStorage.setItem("galaxyCustomQuestion", text);
  }, []);

  const refreshGalaxyHistory = useCallback(async () => {
    const response = await fetch("/api/galaxy-hormuz/history");
    if (!response.ok) throw new Error(`history request failed: ${response.status}`);
    const payload = (await response.json()) as { runs?: GalaxyRunHistoryItem[] };
    setHistoryRuns(Array.isArray(payload.runs) ? payload.runs : []);
  }, []);

  const runtimeLiveStatus = liveStatus;
  const historyArtifactSelected = selectedHistoryRunId.length > 0 && latestCompletedArtifact != null;
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
      : historyArtifactSelected
        ? "history"
        : "last completed";
  const final = finalPayload(projection, actions, finalSource, runtimeLiveStatus?.runId);
  const artifactQuestionKind = projection.galaxyRun?.question?.metadata?.question_kind;
  const showCustomForecast = artifactQuestionKind
    ? artifactQuestionKind === "custom"
    : questionPreset === "custom";
  const showNumericForecast = !showCustomForecast && isNumericForecastQuestion(projection.galaxyRun?.question, final.prediction);
  const handleSelectAction = useCallback((actionId: string | null) => {
    setSelectedActionId(actionId);
    if (actionId) setSidePanelTab("inspector");
  }, []);

  const refreshGalaxyArtifact = useCallback(async (message = "已加载最新 artifact。") => {
    const galaxyResponse = await fetch("/api/galaxy-hormuz/latest");
    if (!galaxyResponse.ok) {
      throw new Error(`latest artifact request failed: ${galaxyResponse.status}`);
    }
    setLatestCompletedArtifact(await galaxyResponse.json());
    setSelectedHistoryRunId("");
    if (!liveStatus || liveStatus.status !== "running") {
      setLiveArtifact(null);
      setLiveTrace(null);
      setLiveStatus(null);
    }
    setGalaxyRunMessage(message);
  }, [liveStatus]);

  const handleSelectHistoryRun = useCallback(async (runId: string) => {
    if (!runId) {
      setSelectedHistoryRunId("");
      setSelectedActionId(null);
      await refreshGalaxyArtifact("已切回最近完成 artifact。");
      return;
    }
    const response = await fetch(`/api/galaxy-hormuz/artifact?runId=${encodeURIComponent(runId)}`);
    if (!response.ok) {
      setGalaxyRunMessage(`历史 artifact 读取失败：${response.status}`);
      return;
    }
    const artifact = (await response.json()) as GalaxyHormuzRunArtifact;
    setLatestCompletedArtifact(artifact);
    setSelectedHistoryRunId(runId);
    setSelectedActionId(null);
    setLiveArtifact(null);
    setLiveTrace(null);
    setLiveStatus(null);
    setGalaxyRunMessage("已加载历史完成题目。");
  }, [refreshGalaxyArtifact]);

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
      await refreshGalaxyHistory();
    } else if (statusPayload.status === "failed") {
      setGalaxyRunMessage(statusPayload.error ?? "galaxy 运行失败，保留上次有效追踪。");
    } else {
      setGalaxyRunMessage(`运行中 ${statusPayload.runId} · 已耗时 ${statusPayload.elapsed}s`);
    }
  }, [liveStatus?.runId, liveTrace?.actions, mergeTrace, refreshGalaxyArtifact, refreshGalaxyHistory]);

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

  useEffect(() => {
    void refreshGalaxyHistory().catch((error) => {
      setGalaxyRunMessage(error instanceof Error ? error.message : "历史 run 列表加载失败。");
    });
  }, [refreshGalaxyHistory]);

  // On mount: reconnect to any in-progress galaxy run that survived page navigation.
  // The vite server keeps the runs Map alive; status endpoint returns the latest
  // in-memory record even after the component was unmounted and remounted.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/galaxy-hormuz/run/status");
        if (!res.ok) return;
        const status = (await res.json()) as LiveRunStatus;
        if (status.status === "running" && status.runId) {
          setLiveStatus(status);
          setGalaxyRunMessage(`已重连运行中的任务 · ${status.runId.slice(0, 36)}`);
        }
      } catch {
        // Reconnect failure is non-fatal; last completed artifact already loaded above.
      }
    })();
  }, []);

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
      const body: Record<string, string> = {};
      if (questionPreset === "custom" && customQuestionText.trim()) {
        body.questionText = customQuestionText.trim();
      }
      const response = await fetch(config.startPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
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
      setSelectedHistoryRunId("");
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
        historyRuns={historyRuns}
        selectedHistoryRunId={selectedHistoryRunId}
        questionPreset={questionPreset}
        customQuestionText={customQuestionText}
        onSelectHistoryRun={(runId) => {
          void handleSelectHistoryRun(runId);
        }}
        onQuestionPresetChange={handleQuestionPresetChange}
        onCustomQuestionTextChange={handleCustomQuestionTextChange}
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
            onSelectAction={handleSelectAction}
          />
          <ActionTimeline
            actions={actions}
            selectedActionId={selectedActionId}
            onSelectAction={handleSelectAction}
          />
        </main>
        <aside className="galaxy-agent-side">
          <div className="galaxy-side-tabs" role="tablist" aria-label="右侧面板">
            <button
              type="button"
              role="tab"
              aria-selected={sidePanelTab === "result"}
              className={sidePanelTab === "result" ? "selected" : ""}
              onClick={() => setSidePanelTab("result")}
            >
              Result
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sidePanelTab === "inspector"}
              className={sidePanelTab === "inspector" ? "selected" : ""}
              onClick={() => setSidePanelTab("inspector")}
            >
              Inspector
            </button>
          </div>
          {sidePanelTab === "result" ? (
            showNumericForecast ? (
              <NumericForecastCard
                question={projection.galaxyRun?.question}
                final={final}
                brentSeries={brentDailySeries}
                finalSource={finalSource}
                runtime="galaxy"
              />
            ) : showCustomForecast ? (
              <CustomForecastCard
                projection={projection}
                actions={actions}
                finalSource={finalSource}
              />
            ) : (
              <FinalForecastCard
                projection={projection}
                actions={actions}
                finalSource={finalSource}
              />
            )
          ) : (
            <ActionInspector action={selectedAction} />
          )}
        </aside>
      </section>
    </section>
  );
}
