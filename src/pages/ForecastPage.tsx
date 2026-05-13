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
  GalaxyQuestionRow,
} from "../types/galaxy";

type ForecastProjection = ReturnType<typeof projectForecastState>;
type RunStatus = "idle" | "running" | "completed" | "failed";
type QuestionPreset = "brent_weekly_high" | "gold_weekly_high" | "hormuz_traffic" | "custom";
type GalaxyQuestionKind = NonNullable<GalaxyQuestionRow["metadata"]>["question_kind"];
type TimelineFilter = "all" | "critical";
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

interface PresetExample {
  id: Exclude<QuestionPreset, "custom">;
  runId: string;
  label: string;
  prediction: string;
  confidence: string;
  blurb: string;
  unitHint: string;
}

const presetExamples: readonly PresetExample[] = [
  {
    id: "brent_weekly_high",
    runId: "2026-05-13-20260513042113__hormuz-brent-weekly-high-2026-05-13",
    label: "Brent 周高",
    prediction: "109.50 USD/bbl",
    confidence: "low confidence",
    blurb: "FRED DCOILBRENTEU 价格锚 + Hormuz risk premium 证据链。",
    unitHint: "本周最高日价 · USD/bbl",
  },
  {
    id: "gold_weekly_high",
    runId: "2026-05-13-20260513002954__hormuz-custom-2026-05-13",
    label: "黄金周高",
    prediction: "4742 USD/troy oz",
    confidence: "medium",
    blurb: "Safe-haven proxy；custom 问题 schema 的示例 run。",
    unitHint: "本周最高现货价 · USD/troy oz",
  },
  {
    id: "hormuz_traffic",
    runId: "2026-05-12-20260512094335__hormuz-traffic-risk-2026-05-12",
    label: "Hormuz 通行风险",
    prediction: "D 类（明显但短暂）",
    confidence: "medium",
    blurb: "多类别 ABCD 判断；PortWatch + advisory + market context。",
    unitHint: "类别 · ABCD",
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
  "last completed": "最近完成",
  history: "历史记录",
} as const;

function displayStatus(s: string) { return statusZh[s] ?? s; }
function displaySource(s: FinalSource) { return finalSourceZh[s]; }
function hasRecordedForecast(final: ReturnType<typeof finalPayload>) {
  return final.prediction !== "pending" && final.terminal !== "pending";
}

function displayRunOutcome(status: string, final: ReturnType<typeof finalPayload>) {
  if (status === "failed" && hasRecordedForecast(final)) return "预测已记录 · 运行失败";
  return displayStatus(status);
}

function runOutcomeClass(status: string, final: ReturnType<typeof finalPayload>) {
  if (status === "failed" && hasRecordedForecast(final)) return "failed-recorded";
  return status;
}

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

function tradingWeekEnd(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysUntilFriday = (5 - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + daysUntilFriday);
  return date.toISOString().slice(0, 10);
}

function brentQuestionPreview(dateText: string): GalaxyQuestionRow {
  const endDate = tradingWeekEnd(dateText);
  return {
    task_id: `hormuz-brent-weekly-high-${dateText}`,
    task_question:
      `During the trading week containing ${dateText} (UTC+8), from ${dateText} through ${endDate} inclusive, ` +
      "what will be the highest daily Brent crude oil spot price, in USD per barrel, reported by FRED series DCOILBRENTEU?",
    task_description:
      `Scope: Resolution source is FRED series DCOILBRENTEU; target is the highest daily Brent crude oil spot price from ${dateText} through ${endDate}.`,
    metadata: {
      case_id: "hormuz",
      question_kind: "brent_weekly_high",
      generated_for_date: dateText,
      timezone: "UTC+8",
      horizon: "this_week",
      target: "brent",
      target_series: "DCOILBRENTEU",
      unit: "USD/bbl",
      resolution_window: {
        start_date: dateText,
        end_date: endDate,
        timezone: "UTC+8",
      },
      source_boundary: ["fred-market", "official-advisory", "public-news-context", "ais-flow-pending"],
    },
  };
}

function customQuestionPreview(text: string): GalaxyQuestionRow {
  const questionText = text.trim();
  return {
    task_id: "hormuz-custom-live",
    task_question: questionText,
    task_description: questionText ? `Custom question: ${questionText}` : "Custom question pending.",
    metadata: {
      case_id: "hormuz",
      question_kind: "custom",
      generated_for_date: new Date().toISOString().slice(0, 10),
      timezone: "UTC+8",
    },
  };
}

function questionKindFromTaskId(taskId?: string): GalaxyQuestionKind | undefined {
  if (!taskId) return undefined;
  if (taskId.includes("brent-weekly-high")) return "brent_weekly_high";
  if (taskId.includes("custom")) return "custom";
  if (taskId.includes("traffic-risk")) return "hormuz_traffic_risk";
  return undefined;
}

function dateFromTaskId(taskId?: string) {
  return taskId?.match(/(\d{4}-\d{2}-\d{2})$/)?.[1];
}

function localDateText() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function questionSummaryFromQuestion(question?: GalaxyQuestionRow | null, customQuestionText?: string) {
  const customText = customQuestionText?.trim();
  if (customText) return customText;
  const q = question;
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
      (allowMetaFallback ? projection.galaxyRun?.runMeta.confidence : undefined) ??
      "unknown",
    terminal:
      finalAction?.toolName ??
      (allowMetaFallback ? projection.galaxyRun?.runMeta.terminalReason : undefined) ??
      (source === "current run" ? "pending" : undefined) ??
      "record_forecast",
    payload: finalAction?.forecastPayload,
    action: finalAction,
  };
}

function textForDiscipline(action: GalaxyActionTraceItem) {
  return [
    action.title,
    action.summary,
    action.query,
    action.argsSummary,
    action.rawPreview?.text.slice(0, 1600),
  ]
    .filter(Boolean)
    .join(" ");
}

function sourceDisciplineItems(
  question: GalaxyQuestionRow | null,
  actions: GalaxyActionTraceItem[],
  final: ReturnType<typeof finalPayload>,
) {
  const questionYear =
    question?.metadata?.generated_for_date?.slice(0, 4) ??
    dateFromTaskId(question?.task_id)?.slice(0, 4) ??
    localDateText().slice(0, 4);
  const fredActions = actions.filter((action) => /FRED|DCOILBRENTEU/i.test(textForDiscipline(action)));
  const fredAnchorEvidence = fredActions.find((action) =>
    action.kind === "final_forecast" ||
    action.kind === "artifact_read" ||
    action.kind === "evidence_synthesis" ||
    ((action.kind === "tool_result" || action.kind === "tool_call") &&
      action.toolName !== "search_web" &&
      /fred\.stlouisfed\.org|eia\.gov|DCOILBRENTEU/i.test(textForDiscipline(action))),
  );
  const fredReadCall = fredActions.find((action) => action.kind === "tool_call" && action.toolName !== "search_web");
  const fredQuery = fredReadCall ?? fredActions.find((action) => action.kind === "tool_call");
  const proxyActions = actions.filter((action) => {
    const text = textForDiscipline(action);
    return /ICE|future|futures|news|analyst|TradingEconomics|countryeconomy|spot price today|market/i.test(text) &&
      !/FRED|DCOILBRENTEU/i.test(text);
  });
  const wrongYearQueries = actions.filter((action) => {
    if (action.kind !== "tool_call") return false;
    const years = action.query?.match(/\b20\d{2}\b/g) ?? [];
    return years.some((year) => year !== questionYear);
  });
  const proxyBeforeAnchor = proxyActions.length > 0 && !fredAnchorEvidence;
  return [
    {
      id: "fred-anchor",
      label: "FRED resolution anchor",
      status: fredAnchorEvidence ? "good" : fredReadCall ? "pending" : "pending",
      value: fredAnchorEvidence ? "已读到 resolution source" : fredReadCall ? "正在读取 FRED/EIA" : fredQuery ? "已开始检索 FRED" : "等待 FRED anchor",
      detail: fredAnchorEvidence?.summary ?? fredReadCall?.summary ?? fredQuery?.query ?? "应先确认 DCOILBRENTEU 最新发布观察值与 release lag。",
    },
    {
      id: "proxy-context",
      label: "Proxy context boundary",
      status: proxyBeforeAnchor ? "warn" : proxyActions.length ? "good" : "pending",
      value: proxyActions.length ? `${proxyActions.length} 条 proxy 行为` : "尚未读取 proxy",
      detail: proxyBeforeAnchor
        ? "proxy 已出现，但 FRED anchor 尚未落地；reviewer 需盯住 source boundary。"
        : "ICE futures / news / analyst 只能解释 risk premium，不能替代 FRED observation。",
    },
    {
      id: "date-discipline",
      label: "Date discipline",
      status: wrongYearQueries.length ? "warn" : actions.length > 1 ? "good" : "pending",
      value: wrongYearQueries.length ? `发现 ${wrongYearQueries.length} 条年份漂移 query` : `目标年份 ${questionYear}`,
      detail: wrongYearQueries[0]?.query ?? "搜索和推理应保持在当前题目年份，避免把旧年份数据误作当前市场。",
    },
    {
      id: "forecast-readiness",
      label: "record_forecast readiness",
      status: final.action ? "good" : "pending",
      value: final.action ? final.prediction : "pending",
      detail: final.action?.summary ?? "写入 record_forecast 前，viewer 保持当前预测为 pending。",
    },
  ] as const;
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

type TimelinePhase = "problem" | "evidence" | "thinking" | "synthesis" | "final";

const timelinePhaseMeta: Record<TimelinePhase, { label: string; detail: string }> = {
  problem: {
    label: "问题定义",
    detail: "锁定 target、单位和 resolution boundary",
  },
  evidence: {
    label: "证据收集",
    detail: "工具调用、网页读取和 artifact 证据返回",
  },
  thinking: {
    label: "规划与思考",
    detail: "agent 在工具调用之间整理下一步计划",
  },
  synthesis: {
    label: "证据综合",
    detail: "把证据压缩为可用于最终预测的判断",
  },
  final: {
    label: "最终预测",
    detail: "record_forecast 与 checkpoint",
  },
};

function timelinePhaseForAction(action: GalaxyActionTraceItem, firstToolIndex: number): TimelinePhase {
  if (action.index < firstToolIndex || action.kind === "question") return "problem";
  if (action.kind === "assistant_note") return "thinking";
  if (action.kind === "evidence_synthesis") return "synthesis";
  if (action.kind === "final_forecast" || action.kind === "checkpoint") return "final";
  return "evidence";
}

function actionKindClass(kind: GalaxyActionKind) {
  return `kind-${kind.replace(/_/g, "-")}`;
}

function timelineRows(actions: GalaxyActionTraceItem[]) {
  const firstToolIndex = actions.find((action) => action.kind === "tool_call")?.index ?? Number.POSITIVE_INFINITY;
  const rows: Array<
    | { type: "phase"; phase: TimelinePhase; key: string }
    | { type: "action"; action: GalaxyActionTraceItem }
  > = [];
  let previousPhase: TimelinePhase | null = null;
  for (const action of actions) {
    const phase = timelinePhaseForAction(action, firstToolIndex);
    if (phase !== previousPhase) {
      rows.push({ type: "phase", phase, key: `${phase}-${action.actionId}` });
      previousPhase = phase;
    }
    rows.push({ type: "action", action });
  }
  return rows;
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
  activeQuestion,
  activeQuestionKind,
  customQuestionText,
  onSelectHistoryRun,
  onSelectPreset,
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
  activeQuestion: GalaxyQuestionRow | null;
  activeQuestionKind?: GalaxyQuestionKind;
  customQuestionText: string;
  onSelectHistoryRun: (runId: string) => void;
  onSelectPreset: (preset: PresetExample) => void;
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
  const activePreset: QuestionPreset =
    isRunning && activeQuestionKind === "brent_weekly_high"
      ? "brent_weekly_high"
      : isRunning && activeQuestionKind === "custom"
        ? "custom"
        : questionPreset;
  const isCustomPreset = activePreset === "custom";
  const isRunnablePreset = activePreset === "brent_weekly_high" || activePreset === "custom";
  const customQuestionReady = customQuestionText.trim().length > 0;
  const customTopic = inferCustomQuestionTopic(customQuestionText);
  const canRun = !isRunning && isRunnablePreset && (!isCustomPreset || customQuestionReady);
  const lastAction = actions.at(-1);
  const runButtonLabel = isRunning
    ? "运行中..."
    : isCustomPreset
      ? "运行自定义问题"
      : "运行 Brent 预测";
  const activePresetExample = presetExamples.find((preset) => preset.id === activePreset) ?? null;
  const finalMetricLabel =
    finalSource === "current run" ? "当前预测" : finalSource === "history" ? "历史预测" : "最新预测";
  const selectedHistoryRun = historyRuns.find((run) => run.runId === selectedHistoryRunId);
  const disciplineItems = sourceDisciplineItems(activeQuestion, actions, final);
  const rawStatus = liveStatus?.status ?? meta?.status ?? "idle";
  const statusLabel = displayRunOutcome(rawStatus, final);
  const statusClass = runOutcomeClass(rawStatus, final);
  const failedWithRecordedForecast = rawStatus === "failed" && hasRecordedForecast(final);

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
            <small>前三项为本地已跑完的示例 artifact，点击即载入。</small>
          </div>
          <div className="galaxy-preset-card-grid" role="group" aria-label="问题预设">
            {presetExamples.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`galaxy-preset-card ${activePreset === preset.id ? "selected" : ""}`}
                disabled={isRunning}
                onClick={() => onSelectPreset(preset)}
              >
                <span>{preset.label}</span>
                <strong>{preset.prediction}</strong>
                <em>{preset.confidence}</em>
                <small>{preset.blurb}</small>
                <b>{preset.unitHint}</b>
              </button>
            ))}
            <button
              type="button"
              className={`galaxy-preset-card custom ${activePreset === "custom" ? "selected" : ""}`}
              disabled={isRunning}
              onClick={() => onQuestionPresetChange("custom")}
            >
              <span>自定义问题</span>
              <strong>自由输入</strong>
              <em>需 agent 运行</em>
              <small>写清楚时间窗口、单位、resolution source 后点击运行。</small>
              <b>question-defined</b>
            </button>
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
                  ? `${customTopic.title} · ${questionSummaryFromQuestion(activeQuestion, customQuestionText)}`
                  : "尚未输入自定义预测问题。"}
              </p>
            </div>
          ) : (
            <div className="galaxy-question-preview">
              <span>当前目标</span>
              <p>
                {activePresetExample
                  ? `${activePresetExample.label} · ${activePresetExample.blurb}`
                  : questionSummaryFromQuestion(activeQuestion)}
              </p>
            </div>
          )}
        </div>
        <dl className="galaxy-hero-metrics">
          <div>
            <dt>状态</dt>
            <dd className={`status-chip status-${statusClass}`}>
              {statusLabel}
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
        <details className="galaxy-discipline-panel" aria-label="Source discipline">
          <summary className="galaxy-discipline-head">
            <span>Source discipline</span>
            <strong>FRED anchor → proxy context → record_forecast</strong>
          </summary>
          <div className="galaxy-discipline-grid">
            {disciplineItems.map((item) => (
              <div className={`galaxy-discipline-item ${item.status}`} key={item.id}>
                <i>
                  {item.status === "good" ? <CheckCircle2 size={14} /> : item.status === "warn" ? <ShieldAlert size={14} /> : <Clock3 size={14} />}
                </i>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </details>
        {meta?.demo ? <span className="galaxy-demo-note">当前 artifact 是 demo，不应作为真实 forecast truth。</span> : null}
      </div>
      <div className="galaxy-agent-command">
        <InfoTitle title="运行控制" subtitle="galaxy-selfevolve · 启动 / 状态 / 追踪" />
        <div className="galaxy-run-status-card">
          <span>{displaySource(finalSource)}</span>
          <strong>{statusLabel}</strong>
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
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            title={
              !isRunnablePreset
                ? "该预设为只读演示；如需 rerun 请用 npm run galaxy:hormuz"
                : !canRun ? "请先输入自定义预测问题" : undefined
            }
          >
            {isRunning ? <RefreshCw size={15} className="spin-icon" /> : <Play size={15} />}
            {runButtonLabel}
          </button>
          <button type="button" onClick={onRefresh}>
            <RefreshCw size={15} />
            刷新最新结果
          </button>
        </div>
        {!isRunnablePreset && !isRunning ? (
          <p className="galaxy-run-hint">
            <FileText size={14} />
            当前预设为本地已跑完的演示 artifact，不重复消耗 LLM。如需新一次 rerun 请用 `npm run galaxy:hormuz`。
          </p>
        ) : null}
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
            {isRunning
              ? "当前 live run 使用自定义问题；运行完成前预测值保持 pending。"
              : customQuestionReady
              ? "将以自定义问题启动新的 galaxy run；运行完成前右侧仍显示最近完成结果。"
              : "输入自定义问题后才能启动；当前结果仍来自最近完成 run。"}
          </p>
        ) : null}
        {isRunning ? (
          <p className="galaxy-run-hint ready">
            <RefreshCw size={14} className="spin-icon" />
            当前 live run 尚未写入 record_forecast 时，预测值保持 pending；viewer 不会用历史 artifact 冒充当前结果。
            {lastAction ? ` 最新动作：${lastAction.title}` : ""}
          </p>
        ) : null}
        {failedWithRecordedForecast ? (
          <p className="galaxy-run-hint warning">
            <ShieldAlert size={14} />
            record_forecast 已写入，但 galaxy wrapper 没有完整完成 summary/export，因此保留 failed 状态。
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
  question,
  actions,
  finalSource,
  customQuestionText,
}: {
  projection: ForecastProjection;
  question: GalaxyQuestionRow | null;
  actions: GalaxyActionTraceItem[];
  finalSource: FinalSource;
  customQuestionText?: string;
}) {
  const final = finalPayload(projection, actions, finalSource);
  const payload = final.payload;
  const displayedQuestion = questionSummaryFromQuestion(question ?? projection.galaxyRun?.question, customQuestionText);
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
  timelineFilter,
  onTimelineFilterChange,
}: {
  actions: GalaxyActionTraceItem[];
  selectedActionId: string | null;
  onSelectAction: (actionId: string | null) => void;
  timelineFilter: TimelineFilter;
  onTimelineFilterChange: (filter: TimelineFilter) => void;
}) {
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const criticalCount = actions.filter((action) => action.criticalPath).length;
  const visibleActions = useMemo(
    () => timelineFilter === "critical" ? actions.filter((action) => action.criticalPath) : actions,
    [actions, timelineFilter],
  );
  const rows = useMemo(() => timelineRows(visibleActions), [visibleActions]);
  const filterLabel = timelineFilter === "critical" ? "显示全部" : "只看关键路径";
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
      <div className="galaxy-timeline-head">
        <InfoTitle
          title="审计时间线"
          subtitle={`动作级追踪 · 可回放每一步工具与思考（${visibleActions.length}/${actions.length} 步）`}
        />
        <button
          type="button"
          className={timelineFilter === "critical" ? "selected" : ""}
          onClick={() => onTimelineFilterChange(timelineFilter === "critical" ? "all" : "critical")}
          disabled={criticalCount === 0}
        >
          {filterLabel}
          <span>{criticalCount}</span>
        </button>
      </div>
      <ol className="galaxy-action-list">
        {rows.length ? rows.map((row) => {
          if (row.type === "phase") {
            const phase = timelinePhaseMeta[row.phase];
            return (
              <li className={`phase-label phase-${row.phase}`} key={row.key}>
                <span>{phase.label}</span>
                <small>{phase.detail}</small>
              </li>
            );
          }
          const action = row.action;
          return (
            <li key={action.actionId}>
              <button
                className={[
                  selectedActionId === action.actionId ? "selected" : "",
                  action.criticalPath ? "critical-path" : "",
                  actionKindClass(action.kind),
                ].filter(Boolean).join(" ")}
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
            </li>
          );
        }) : (
          <li className="timeline-empty">
            <strong>{timelineFilter === "critical" ? "暂无关键路径动作" : "等待 agent 开始行动"}</strong>
            <small>{timelineFilter === "critical" ? "切回全部时间线可查看非 critical-path 动作。" : "运行开始后，动作会按阶段进入这里。"}</small>
          </li>
        )}
      </ol>
    </section>
  );
}

function ResultPendingCard({
  finalSource,
  actions,
}: {
  finalSource: FinalSource;
  actions: GalaxyActionTraceItem[];
}) {
  return (
    <section className="console-card forecast-result-empty">
      <InfoTitle title="预测结果" subtitle={`${displaySource(finalSource)} · 等待 record_forecast`} />
      <strong>尚未形成可展示的结果卡</strong>
      <p>
        当前 trace 有 {actions.length} 步；如果问题不是 Brent 数值预测或自定义问题，结果会在 record_forecast 写入后显示为通用最终预测卡。
      </p>
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
  const [graphMode, setGraphMode] = useState<"summary" | "critical" | "full">("summary");
  const [questionPreset, setQuestionPreset] = useState<QuestionPreset>(
    () => (sessionStorage.getItem("galaxyQuestionPreset") as QuestionPreset | null) ?? "brent_weekly_high",
  );
  const [customQuestionText, setCustomQuestionText] = useState(
    () => sessionStorage.getItem("galaxyCustomQuestion") ?? "",
  );
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");

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
  const artifactQuestion = projection.galaxyRun?.question ?? null;
  const liveQuestionKind = questionKindFromTaskId(runtimeLiveStatus?.taskId ?? runtimeLiveStatus?.runId);
  const presetQuestionKind: GalaxyQuestionKind | undefined =
    questionPreset === "brent_weekly_high"
      ? "brent_weekly_high"
      : questionPreset === "hormuz_traffic"
        ? "hormuz_traffic_risk"
        : questionPreset === "gold_weekly_high"
          ? "custom"
          : "custom";
  const activeQuestionKind: GalaxyQuestionKind | undefined =
    runtimeLiveStatus?.status === "running" && liveQuestionKind
      ? liveQuestionKind
      : artifactQuestion?.metadata?.question_kind ?? presetQuestionKind;
  const liveQuestionText =
    actions.find((action) => action.kind === "question")?.rawPreview?.text ??
    actions.find((action) => action.kind === "question")?.summary ??
    customQuestionText;
  const activeQuestion =
    runtimeLiveStatus?.status === "running" && activeQuestionKind === "brent_weekly_high"
      ? brentQuestionPreview(
        dateFromTaskId(runtimeLiveStatus.taskId) ??
        dateFromTaskId(runtimeLiveStatus.runId) ??
        localDateText(),
      )
      : runtimeLiveStatus?.status === "running" && activeQuestionKind === "custom"
        ? customQuestionPreview(liveQuestionText)
        : artifactQuestion ?? (questionPreset === "custom"
          ? customQuestionPreview(customQuestionText)
          : brentQuestionPreview(localDateText()));
  const showCustomForecast = activeQuestionKind === "custom";
  const showNumericForecast = !showCustomForecast && isNumericForecastQuestion(activeQuestion, final.prediction);
  const handleSelectAction = useCallback((actionId: string | null) => {
    setSelectedActionId(actionId);
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

  const handleSelectPreset = useCallback(async (preset: PresetExample) => {
    setQuestionPreset(preset.id);
    sessionStorage.setItem("galaxyQuestionPreset", preset.id);
    setSelectedActionId(null);
    await handleSelectHistoryRun(preset.runId);
    setGalaxyRunMessage(`已加载预设示例 · ${preset.label} · ${preset.prediction}`);
  }, [handleSelectHistoryRun]);

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
    if (liveStatus?.status === "running") return;
    let cancelled = false;
    const reconnect = async () => {
      try {
        const res = await fetch("/api/galaxy-hormuz/run/status");
        if (!res.ok) return;
        const status = (await res.json()) as LiveRunStatus;
        if (cancelled || status.status !== "running" || !status.runId) return;
        setLiveArtifact(null);
        setLiveTrace(null);
        setSelectedHistoryRunId("");
        setSelectedActionId(null);
        setLiveStatus(status);
        setGalaxyRunMessage(`自动接入运行中的 galaxy run · ${status.runId.slice(0, 48)}`);
        await pollLiveRun(status.runId, true);
      } catch {
        // A missed reconnect should not disturb the latest completed artifact.
      }
    };
    void reconnect();
    const interval = window.setInterval(() => {
      void reconnect();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [liveStatus?.status, pollLiveRun]);

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
        activeQuestion={activeQuestion}
        activeQuestionKind={activeQuestionKind}
        customQuestionText={customQuestionText}
        onSelectHistoryRun={(runId) => {
          void handleSelectHistoryRun(runId);
        }}
        onSelectPreset={(preset) => {
          void handleSelectPreset(preset);
        }}
        onQuestionPresetChange={handleQuestionPresetChange}
        onCustomQuestionTextChange={handleCustomQuestionTextChange}
        onRun={handleRunGalaxy}
        onRefresh={handleRefreshGalaxyArtifact}
      />

      <section className="galaxy-result-row" aria-label="预测结果">
        {showNumericForecast ? (
          <NumericForecastCard
            question={activeQuestion}
            final={final}
            brentSeries={brentDailySeries}
            finalSource={finalSource}
            runtime="galaxy"
          />
        ) : showCustomForecast ? (
          <CustomForecastCard
            projection={projection}
            question={activeQuestion}
            actions={actions}
            finalSource={finalSource}
            customQuestionText={runtimeLiveStatus?.status === "running" ? liveQuestionText : customQuestionText}
          />
        ) : final.prediction === "pending" && actions.length === 0 ? (
          <ResultPendingCard finalSource={finalSource} actions={actions} />
        ) : (
          <FinalForecastCard
            projection={projection}
            actions={actions}
            finalSource={finalSource}
          />
        )}
      </section>

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
            timelineFilter={timelineFilter}
            onTimelineFilterChange={setTimelineFilter}
          />
        </main>
        <aside className="galaxy-agent-side">
          <ActionInspector action={selectedAction} />
        </aside>
      </section>
    </section>
  );
}
