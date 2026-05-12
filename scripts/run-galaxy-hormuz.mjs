#!/usr/bin/env node
// Generate the daily Hormuz FutureWorld-style question and optionally execute
// it through the neighboring galaxy-selfevolve runner. The browser consumes
// only the normalized artifact written to data/galaxy/latest-run.json.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter } from "node:path";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const galaxyRepo =
  process.env.GALAXY_REPO ||
  "/Users/weichy/Desktop/Doing-Right-Things/FutureX/papers/galaxy-selfevolve";
const questionPath = resolve(root, "data/galaxy/hormuz-daily-question.jsonl");
const latestArtifactPath = resolve(root, "data/galaxy/latest-run.json");
const defaultOutputRoot = resolve(root, "data/galaxy/runs");
const defaultQuestionKind = "brent-weekly-high";
const supportedQuestionKinds = new Set(["brent-weekly-high", "hormuz-traffic-risk"]);

function galaxyVenvPath() {
  return process.env.GALAXY_VENV || resolve(galaxyRepo, ".venv");
}

function galaxyPythonPath() {
  return process.env.GALAXY_PYTHON || resolve(galaxyVenvPath(), "bin/python");
}

function buildGalaxyCommand(args, question, outputDir) {
  const pythonPath = galaxyPythonPath();
  const venvPath = galaxyVenvPath();
  const useExistingVenv = existsSync(pythonPath);
  const command = [
    useExistingVenv ? pythonPath : "uv",
    ...(useExistingVenv ? [] : ["run", "python"]),
    "main.py",
    "--run-config",
    args.runConfig,
    "--input-data",
    questionPath,
    "--output-dir",
    outputDir,
    "--task-id",
    question.task_id,
    "--max-concurrent",
    "1",
    "--agent-name",
    args.agentName,
    "--agent-profile",
    args.agentProfile,
    "--agent-llm",
    args.agentLlm,
    "--agent-tool",
    args.agentTool,
  ];
  const env = useExistingVenv
    ? {
        ...process.env,
        VIRTUAL_ENV: venvPath,
        PATH: `${resolve(venvPath, "bin")}${delimiter}${process.env.PATH || ""}`,
      }
    : process.env;
  return { command, env };
}

function parseArgs(argv) {
  const args = {
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    execute: false,
    outputDir: "",
    runConfig: "hormuz_test.yaml",
    runId: "",
    startedAt: "",
    traceOnly: false,
    agentName: "forecast_noskill",
    agentProfile: "forecast",
    agentLlm: "codex_sub2api",
    agentTool: "default",
    questionKind: defaultQuestionKind,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") {
      args.execute = true;
    } else if (arg === "--trace") {
      args.traceOnly = true;
    } else if (arg === "--date") {
      args.date = argv[index + 1] ?? args.date;
      index += 1;
    } else if (arg === "--output-dir") {
      args.outputDir = argv[index + 1] ?? args.outputDir;
      index += 1;
    } else if (arg === "--run-config") {
      args.runConfig = argv[index + 1] ?? args.runConfig;
      index += 1;
    } else if (arg === "--run-id") {
      args.runId = argv[index + 1] ?? args.runId;
      index += 1;
    } else if (arg === "--started-at") {
      args.startedAt = argv[index + 1] ?? args.startedAt;
      index += 1;
    } else if (arg === "--agent-llm") {
      args.agentLlm = argv[index + 1] ?? args.agentLlm;
      index += 1;
    } else if (arg === "--agent-name") {
      args.agentName = argv[index + 1] ?? args.agentName;
      index += 1;
    } else if (arg === "--agent-profile") {
      args.agentProfile = argv[index + 1] ?? args.agentProfile;
      index += 1;
    } else if (arg === "--agent-tool") {
      args.agentTool = argv[index + 1] ?? args.agentTool;
      index += 1;
    } else if (arg === "--question-kind") {
      args.questionKind = argv[index + 1] ?? args.questionKind;
      index += 1;
    }
  }
  if (!supportedQuestionKinds.has(args.questionKind)) args.questionKind = defaultQuestionKind;
  return args;
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function tradingWeekEnd(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const utcDay = calendarDate.getUTCDay();
  const daysUntilFriday = (5 - utcDay + 7) % 7;
  return addDays(dateText, daysUntilFriday);
}

export function buildQuestion(dateText, questionKind = defaultQuestionKind) {
  if (questionKind === "brent-weekly-high") {
    const targetDate = tradingWeekEnd(dateText);
    return {
      task_id: `hormuz-brent-weekly-high-${dateText}`,
      task_question:
        `You are an agent that can predict future numeric market outcomes. The event to be predicted:\n` +
        `\"\"\"\n` +
        `During the trading week containing ${dateText} (UTC+8), from ${dateText} through ${targetDate} inclusive, ` +
        `what will be the highest daily Brent crude oil spot price, in USD per barrel, reported by FRED series DCOILBRENTEU?\n` +
        `\"\"\"\n\n` +
        `Resolve this by taking the maximum released FRED DCOILBRENTEU daily observation whose observation date falls inside that window. ` +
        `Ignore weekends or holidays with no released observation.\n\n` +
        `Your goal is to make a numeric prediction.\n\n` +
        `IMPORTANT: Your final answer MUST end with this exact format:\n` +
        `\\boxed{number}\n\n` +
        `The number must be USD/bbl rounded to two decimals. Do not use any other final format. ` +
        `Do not refuse to make a prediction. You must make a clear prediction based on the best data currently available.`,
      task_description:
        `Scope: This is the Hormuz case-room numeric market question generated for ${dateText} (UTC+8). ` +
        `Resolution source is FRED series DCOILBRENTEU; the target is the highest daily Brent crude oil spot price from ${dateText} through ${targetDate}. ` +
        `Hormuz maritime/news evidence may inform risk premium, but the resolved target is numeric Brent price, not a scenario label. ` +
        `Market data is evidence input only and must be clearly separated from unresolved maritime-flow claims. ` +
        `The answer must be one numeric USD/bbl value rounded to two decimals.`,
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
          end_date: targetDate,
          timezone: "UTC+8",
        },
        source_boundary: [
          "fred-market",
          "official-advisory",
          "public-news-context",
          "ais-flow-pending",
        ],
      },
    };
  }
  const targetDate = addDays(dateText, 7);
  return {
    task_id: `hormuz-traffic-risk-${dateText}`,
    task_question:
      `You are an agent that can predict future events. The event to be predicted:\n` +
      `\"\"\"\n` +
      `On ${targetDate} (UTC+8), which Hormuz transit-risk scenario will best describe the Strait of Hormuz case state?\n` +
      `A. normal: transit and cross-asset pricing remain close to normal.\n` +
      `B. controlled: maritime/security risk is elevated, but there is no sustained closure-class traffic stop.\n` +
      `C. severe: repeated incidents or official restrictions materially disrupt transit.\n` +
      `D. closure: sustained closure-class traffic stop is verified by multiple sources.\n` +
      `\"\"\"\n\n` +
      `Your goal is to make a categorical prediction.\n\n` +
      `IMPORTANT: Your final answer MUST end with this exact format:\n` +
      `\\boxed{letter}\n\n` +
      `Do not use any other format. Do not refuse to make a prediction. ` +
      `You must make a clear prediction based on the best data currently available.`,
    task_description:
      `Scope: This is the daily Hormuz reviewer-console question generated for ${dateText} (UTC+8). ` +
      `The scenario definitions are those used by Hormuz Risk Intelligence Agent: normal, controlled, severe, closure. ` +
      `Resolution should prefer official maritime advisory sources (UKMTO/JMIC/MARAD), public traffic-flow proxies such as IMF PortWatch when available, and audited market evidence as supporting context. ` +
      `Market data is evidence input only and does not directly decide the scenario. ` +
      `The answer must be a single letter among A/B/C/D. The forecast horizon is 7 days from the generated date.`,
    metadata: {
      case_id: "hormuz",
      generated_for_date: dateText,
      timezone: "UTC+8",
      horizon: "7d",
      scenario_options: {
        A: "normal",
        B: "controlled",
        C: "severe",
        D: "closure",
      },
      source_boundary: [
        "official-advisory",
        "imf-portwatch-hormuz",
        "fred-market",
        "ais-flow-pending",
      ],
    },
  };
}

function compact(text, maxLength = 260) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function truncateText(text, maxLength = 4096) {
  const value = String(text ?? "");
  return {
    text: value.length > maxLength ? value.slice(0, maxLength) : value,
    isTruncated: value.length > maxLength,
    fullLength: value.length,
  };
}

function prettyJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function parseJsonMaybe(text) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toolCalls(row) {
  return Array.isArray(row?.tool_calls) ? row.tool_calls : [];
}

function toolCallName(call) {
  return call?.function?.name || call?.name || call?.tool_name || "tool_call";
}

function toolCallArguments(call) {
  const args = call?.function?.arguments || call?.arguments;
  if (typeof args === "string") return parseJsonMaybe(args) || {};
  return args && typeof args === "object" ? args : {};
}

function toolCallArgumentsText(call) {
  const args = call?.function?.arguments || call?.arguments;
  if (typeof args === "string") return args;
  return args && typeof args === "object" ? prettyJson(args) : "{}";
}

function evidenceRoleForTool(toolName) {
  if (toolName === "search_web") return "source_search";
  if (toolName === "read_webpage" || toolName === "read_webpage_with_query") return "source_read";
  if (toolName === "read_artifact" || toolName === "browser_snapshot") return "evidence_extract";
  if (toolName === "record_forecast") return "forecast_record";
  return "source_read";
}

function toolTitle(toolName) {
  if (toolName === "search_web") return "Search web";
  if (toolName === "read_webpage") return "Read webpage";
  if (toolName === "read_webpage_with_query") return "Read webpage with query";
  if (toolName === "browser_snapshot") return "Browser snapshot";
  if (toolName === "read_artifact") return "Read artifact";
  if (toolName === "record_forecast") return "Record forecast";
  return toolName;
}

function extractToolSummary(toolName, args, result) {
  if (toolName === "search_web") {
    return compact(args.query || result?.data?.summary || "Search query executed.", 360);
  }
  if (toolName === "read_webpage" || toolName === "read_webpage_with_query") {
    return compact(args.query || result?.data?.content || args.url || "Webpage read.", 360);
  }
  if (toolName === "browser_snapshot") {
    return compact(result?.data?.title || result?.data?.content || args.url || "Browser page snapshot captured.");
  }
  if (toolName === "read_artifact") {
    return compact(args.path || result?.artifact?.path || "Artifact read.");
  }
  if (toolName === "record_forecast") {
    return compact(args.rationale || `Forecast recorded: ${args.prediction ?? "unknown"}`);
  }
  return compact(result?.data?.summary || result?.content || `${toolName} executed.`);
}

function extractArtifactPath(result) {
  return result?.data?.artifact_path || result?.artifact?.path || result?.data?.artifact?.path;
}

function extractSourceUrl(result, args) {
  return result?.data?.url || result?.url || args?.url;
}

function normalizeForecastPayload(value) {
  if (!value || typeof value !== "object") return undefined;
  const payload = value;
  const counterEvidencePayload = payload[["counter", "evidence"].join("")];
  return {
    prediction: payload.prediction,
    confidence: confidence(payload.confidence),
    rationale: compact(payload.rationale, 900),
    keyEvidenceItems: Array.isArray(payload.key_evidence)
      ? payload.key_evidence.map((item) => compact(item, 360)).filter(Boolean)
      : [],
    counterEvidenceItems: Array.isArray(counterEvidencePayload)
      ? counterEvidencePayload.map((item) => compact(item, 360)).filter(Boolean)
      : [],
    openConcerns: Array.isArray(payload.unresolved_concerns)
      ? payload.unresolved_concerns.map((item) => compact(item, 360)).filter(Boolean)
      : [],
    temporalNotes: Array.isArray(payload.temporal_notes)
      ? payload.temporal_notes.map((item) => compact(item, 360)).filter(Boolean)
      : [],
  };
}

function argsSummaryForTool(toolName, args) {
  if (!args || typeof args !== "object") return undefined;
  if (toolName === "search_web") {
    const domains = Array.isArray(args.domains) && args.domains.length > 0
      ? `domains=${args.domains.join(", ")}`
      : "";
    return compact([args.query, domains].filter(Boolean).join(" · "), 420);
  }
  if (toolName === "read_webpage" || toolName === "read_webpage_with_query") {
    return compact([args.url, args.query].filter(Boolean).join(" · "), 420);
  }
  if (toolName === "read_artifact") return compact(args.path, 420);
  if (toolName === "record_forecast") {
    const payload = normalizeForecastPayload(args);
    return compact(
      [`prediction=${payload?.prediction ?? "unknown"}`, `confidence=${payload?.confidence ?? "unknown"}`].join(" · "),
      260,
    );
  }
  const keys = Object.keys(args).filter((key) => !/prompt|system|message|content|scratch/i.test(key));
  return keys.length > 0 ? compact(keys.map((key) => `${key}=${JSON.stringify(args[key])}`).join(" · "), 420) : undefined;
}

function safeAssistantSummary(content, hasToolCalls) {
  const text = String(content ?? "").replace(/\s+/g, " ").trim();
  if (hasToolCalls) {
    if (/question audit/i.test(text)) return "Question audit completed; the agent is launching a parallel evidence batch.";
    if (/这一步|evidence|source|confirm|verify|检查|补足/i.test(text)) {
      return compact(text, 240);
    }
    return "Agent turn prepared tool calls; raw reasoning is hidden.";
  }
  if (!text) return "Agent turn completed; no reviewer-safe prose was emitted.";
  if (/question audit/i.test(text)) {
    return "Question audit and plan summarized: answer space, constraints, and resolution rule identified.";
  }
  if (/running inventory|what is settled|still missing|next step/i.test(text)) {
    return "Running inventory updated: settled evidence, remaining gaps, and next action were checked.";
  }
  if (/boxed|record_forecast/i.test(text)) {
    return "Final forecast prose prepared before record_forecast.";
  }
  if (/这一步|证据|source|evidence|synthesis|traffic|closure|standstill|通行|停摆/i.test(text)) {
    return compact(text, 260);
  }
  return "Evidence synthesis step recorded; raw assistant prose is summarized for reviewer safety.";
}

function actionLaneFor(kind, toolName) {
  if (kind === "question") return "question";
  if (kind === "assistant_note" || kind === "supervisor") return "agent_turn";
  if (kind === "tool_call" && toolName === "search_web") return "search_batch";
  if (kind === "tool_call") return "read_artifacts";
  if (kind === "tool_result" || kind === "artifact_read") return "read_artifacts";
  if (kind === "evidence_synthesis") return "evidence_synthesis";
  if (kind === "final_forecast") return "forecast";
  if (kind === "checkpoint") return "checkpoint";
  return "agent_turn";
}

function graphLaneForAction(action) {
  if (action.kind === "question") return "question";
  if (action.kind === "tool_call" && action.toolName === "search_web") return "search";
  if (action.kind === "tool_call") return "read";
  if (action.kind === "tool_result" && action.toolName === "search_web") return "search";
  if (action.kind === "tool_result" || action.kind === "artifact_read") return "read";
  if (action.kind === "evidence_synthesis") return "judgement";
  if (action.kind === "final_forecast") return "forecast";
  if (action.kind === "checkpoint") return "checkpoint";
  return "evidence";
}

function eventTypeForAction(action) {
  if (action.kind === "question") return "question_loaded";
  if (action.kind === "tool_call") return "tool_call";
  if (action.kind === "tool_result" || action.kind === "artifact_read") return "tool_result";
  if (action.kind === "evidence_synthesis") return "judgement_updated";
  if (action.kind === "final_forecast") return "final_forecast";
  if (action.kind === "checkpoint") return "checkpoint_written";
  return "agent_turn";
}

function edgeLabelForAction(action) {
  if (action.kind === "tool_result" || action.kind === "artifact_read") return "returns";
  if (action.kind === "tool_call") return "calls";
  if (action.kind === "evidence_synthesis") return "synthesizes";
  if (action.kind === "final_forecast") return "records";
  if (action.kind === "checkpoint") return "persists";
  return "continues";
}

function buildActionGraph(actions) {
  const actionIds = new Set(actions.map((action) => action.actionId));
  const nodes = actions.map((action) => ({
    id: action.actionId,
    type: "forecastAgentAction",
    lane: graphLaneForAction(action),
    data: {
      eventType: eventTypeForAction(action),
      graphRole: action.evidenceRole || action.kind,
      title: action.title,
      summary: action.summary,
      status: action.status,
      toolName: action.toolName,
      current: action.status === "running",
      terminal: action.kind === "final_forecast",
    },
  }));
  const edges = [];
  for (const action of actions) {
    for (const parentId of action.parentActionIds ?? []) {
      if (!actionIds.has(parentId)) continue;
      edges.push({
        id: `${parentId}->${action.actionId}`,
        source: parentId,
        target: action.actionId,
        label: edgeLabelForAction(action),
      });
    }
  }
  return { nodes, edges };
}

function rawFileRef(taskDir, rowIndex) {
  return {
    rawFilePath: relative(root, resolve(taskDir, "main_agent.jsonl")),
    rawLine: rowIndex + 1,
  };
}

function makeRawPreview(kind, title, value, taskDir, rowIndex, extra = {}) {
  const truncated = truncateText(value, 4096);
  return {
    kind,
    title,
    ...truncated,
    ...rawFileRef(taskDir, rowIndex),
    ...extra,
  };
}

async function ensureHormuzRunConfig(args, question, outputDir) {
  if (args.runConfig !== "hormuz_test.yaml") return;
  const configPath = resolve(galaxyRepo, "config/run/hormuz_test.yaml");
  if (existsSync(configPath)) return;
  const relQuestion = relative(galaxyRepo, questionPath);
  const relOutput = relative(galaxyRepo, outputDir);
  const body = [
    "agent:",
    `  name: ${args.agentName}`,
    `  profile: ${args.agentProfile}`,
    `  llm: ${args.agentLlm}`,
    `  tool: ${args.agentTool}`,
    "",
    "run:",
    `  input_data: ${relQuestion}`,
    `  output_dir: ${relOutput}`,
    "  max_concurrent: 1",
    "",
  ].join("\n");
  await writeFile(configPath, body, "utf8");
  void question;
}

async function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function readJsonlRows(path) {
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  const rows = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      const isLastLine = index === lines.length - 1;
      if (!isLastLine) throw error;
    }
  });
  return rows;
}

export async function buildActionTrace({
  taskDir,
  question,
  summaryRecord,
  finalize,
  stats,
  includeTerminal = true,
}) {
  const rows = await readJsonlRows(resolve(taskDir, "main_agent.jsonl"));
  const effectiveFinalize = finalize ?? lastFinalizeFromMessages(rows) ?? undefined;
  const actions = [];
  const toolCallById = new Map();
  let lastSynthesisActionId = "";
  let lastBatchResultIds = [];
  let assistantTurnCount = 0;
  let toolResultCount = 0;

  function addAction(partial) {
    const index = actions.length;
    const action = {
      actionId: partial.actionId || `ga-${String(index + 1).padStart(3, "0")}`,
      index,
      at: `T+${String(Math.floor(index / 2)).padStart(2, "0")}:${String((index * 7) % 60).padStart(2, "0")}`,
      parentActionIds: [],
      lane: actionLaneFor(partial.kind, partial.toolName),
      ...partial,
    };
    action.lane = partial.lane || actionLaneFor(action.kind, action.toolName);
    actions.push(action);
    return action;
  }

  const questionAction = addAction({
    actionId: "ga-question",
    kind: "question",
    title: "Question loaded",
    summary: compact(question.task_question.split('"""')[1] || question.task_question, 360),
    status: "success",
    evidenceRole: "question_audit",
    rawRole: "user",
    rawPreview: {
      kind: "question",
      title: "Forecast question",
      ...truncateText(question.task_question, 4096),
      rawFilePath: relative(root, questionPath),
    },
  });
  lastSynthesisActionId = questionAction.actionId;

  for (const [rowIndex, row] of rows.entries()) {
    if (row.type === "finalize") continue;
    if (row.role === "system") continue;
    if (row.role === "user") {
      const content = compact(row.content, 280);
      if (!content || /Tool budget is running low/i.test(content)) continue;
      if (content.includes("You are an agent that can predict future events")) continue;
      if (content.includes("This is a forecasting task")) continue;
      addAction({
        kind: "supervisor",
        title: "Runtime instruction",
        summary: content,
        status: "success",
        parentActionIds: [lastSynthesisActionId],
        rawRole: "user",
        rawPreview: makeRawPreview("user", "Runtime instruction", row.content, taskDir, rowIndex),
      });
      continue;
    }
    if (row.role === "assistant") {
      const calls = toolCalls(row);
      assistantTurnCount += 1;
      const turnParents = lastBatchResultIds.length > 0 ? lastBatchResultIds : [lastSynthesisActionId];
      const isForecastTurn = calls.some((call) => toolCallName(call) === "record_forecast");
      const turnAction = addAction({
        actionId: `ga-turn-${String(assistantTurnCount).padStart(2, "0")}`,
        kind: isForecastTurn ? "evidence_synthesis" : "assistant_note",
        title:
          assistantTurnCount === 1
            ? "Question audit and plan"
            : isForecastTurn
              ? "Evidence synthesis"
              : calls.length > 0
                ? `Agent turn ${assistantTurnCount}: ${calls.length} tool calls`
                : "Synthesis note",
        summary: safeAssistantSummary(row.content, calls.length > 0),
        status: "success",
        evidenceRole: assistantTurnCount === 1 ? "question_audit" : "evidence_extract",
        rawRole: "assistant",
        parentActionIds: turnParents.filter(Boolean),
        rawPreview: makeRawPreview(
          "assistant",
          "Assistant turn",
          row.content || "(empty assistant content)",
          taskDir,
          rowIndex,
          {
            toolCalls: calls.map((call) => ({
              id: call.id,
              name: toolCallName(call),
              arguments: toolCallArgumentsText(call),
            })),
          },
        ),
      });
      lastSynthesisActionId = turnAction.actionId;
      lastBatchResultIds = [];

      if (calls.length > 0) {
        for (const call of calls) {
          const toolName = toolCallName(call);
          const args = toolCallArguments(call);
          const argsText = toolCallArgumentsText(call);
          const rawPreview =
            toolName === "record_forecast"
              ? makeRawPreview("record_forecast", "record_forecast payload", prettyJson(args), taskDir, rowIndex, {
                  boxedAnswer: args.prediction ? `\\boxed{${String(args.prediction).trim().match(/[A-D]/i)?.[0] ?? args.prediction}}` : undefined,
                })
              : makeRawPreview("tool_call", `${toolName} arguments`, argsText, taskDir, rowIndex);
          const action = addAction({
            actionId: `ga-call-${call.id || actions.length}`,
            kind: toolName === "record_forecast" ? "final_forecast" : "tool_call",
            title: toolTitle(toolName),
            summary: extractToolSummary(toolName, args, null),
            status: "running",
            toolName,
            toolCallId: call.id,
            query: args.query,
            sourceUrl: args.url,
            artifactPath: args.path,
            argsSummary: argsSummaryForTool(toolName, args),
            forecastPayload: toolName === "record_forecast" ? normalizeForecastPayload(args) : undefined,
            evidenceRole: evidenceRoleForTool(toolName),
            rawRole: "assistant",
            parentActionIds: [turnAction.actionId],
            rawPreview,
          });
          if (call.id) toolCallById.set(call.id, { action, toolName, args });
        }
      }
      continue;
    }
    if (row.role === "tool") {
      const linked = toolCallById.get(row.tool_call_id);
      const result = parseJsonMaybe(row.content);
      const toolName = linked?.toolName || row.name || "tool_result";
      const artifactPath = extractArtifactPath(result) || linked?.args?.path;
      if (linked?.action) linked.action.status = "success";
      toolResultCount += 1;
      const resultAction = addAction({
        actionId: `ga-result-${row.tool_call_id || toolResultCount}`,
        kind: toolName === "read_artifact" ? "artifact_read" : "tool_result",
        title: `${toolTitle(toolName)} result`,
        summary: extractToolSummary(toolName, linked?.args || {}, result) || compact(row.content, 260),
        status: result?.success === false || /failed|error/i.test(row.content || "") ? "failed" : "success",
        toolName,
        toolCallId: row.tool_call_id,
        artifactPath,
        sourceUrl: extractSourceUrl(result, linked?.args || {}),
        query: linked?.args?.query,
        argsSummary: argsSummaryForTool(toolName, linked?.args || {}),
        evidenceRole: evidenceRoleForTool(toolName),
        rawRole: "tool",
        parentActionIds: linked?.action ? [linked.action.actionId] : [lastSynthesisActionId],
        rawPreview: makeRawPreview("tool_result", `${toolName} result content`, row.content, taskDir, rowIndex, {
          toolName,
        }),
      });
      lastBatchResultIds.push(resultAction.actionId);
    }
  }

  const finalPayload = effectiveFinalize || {};
  const hasRecordForecast = actions.some((action) => action.toolName === "record_forecast");
  const shouldAddTerminalForecast = includeTerminal && (!hasRecordForecast || effectiveFinalize || summaryRecord?.prediction);
  if (shouldAddTerminalForecast) {
    addAction({
      actionId: hasRecordForecast ? "ga-finalize-payload" : "ga-finalize",
      kind: "final_forecast",
      title: `Final forecast: ${finalPayload.prediction || summaryRecord?.prediction || "pending"}`,
      summary: compact(finalPayload.rationale || "Forecast finalized.", 420),
      status: summaryRecord?.status === "failed" ? "failed" : "success",
      toolName: "record_forecast",
      forecastPayload: normalizeForecastPayload(finalPayload),
      evidenceRole: "forecast_record",
      parentActionIds: lastBatchResultIds.length > 0 ? lastBatchResultIds : [lastSynthesisActionId],
      rawPreview: {
        kind: "record_forecast",
        title: "finalize payload",
        ...truncateText(prettyJson(finalPayload), 4096),
        rawFilePath: relative(root, resolve(taskDir, "main_agent.jsonl")),
        boxedAnswer: finalPayload.prediction
          ? `\\boxed{${String(finalPayload.prediction).trim().match(/[A-D]/i)?.[0] ?? finalPayload.prediction}}`
          : undefined,
      },
    });
  }

  const checkpointPath = resolve(taskDir, "checkpoint_note.json");
  if (includeTerminal || existsSync(checkpointPath)) {
    addAction({
      actionId: "ga-checkpoint",
      kind: "checkpoint",
      title: "Checkpoint note",
      summary: "Checkpoint and run stats persisted for reviewer replay.",
      status: existsSync(checkpointPath) ? "success" : "pending",
      artifactPath: relative(root, checkpointPath),
      evidenceRole: "forecast_record",
      parentActionIds: [
        [...actions].reverse().find((action) => action.kind === "final_forecast")?.actionId ||
          lastSynthesisActionId,
      ],
      rawPreview: {
        kind: "checkpoint",
        title: "checkpoint_note.json",
        ...truncateText(existsSync(checkpointPath) ? await readFile(checkpointPath, "utf8") : "checkpoint pending", 4096),
        rawFilePath: relative(root, checkpointPath),
      },
    });
  }

  return {
    traceId: `trace-${question.task_id}`,
    runDir: relative(root, taskDir),
    generatedAt: summaryRecord?.ended_at ?? new Date().toISOString(),
    actions,
    graph: buildActionGraph(actions),
    stats: stats || {},
  };
}

function lastFinalizeFromMessages(rows) {
  for (const row of [...rows].reverse()) {
    if (row.type === "finalize") return row.payload ?? null;
  }
  return null;
}

function confidence(value) {
  if (value === "med") return "medium";
  if (value === "medium" || value === "low" || value === "high") return value;
  return undefined;
}

function scenarioFromPrediction(prediction) {
  const letter = String(prediction || "").trim().match(/[A-D]/i)?.[0]?.toUpperCase();
  if (letter === "A") return "normal";
  if (letter === "B") return "controlled";
  if (letter === "C") return "severe";
  if (letter === "D") return "closure";
  return "controlled";
}

function isBrentWeeklyHighQuestion(question) {
  return question?.metadata?.question_kind === "brent_weekly_high";
}

function sourceObservationId(prefix, dateText) {
  return `obs-galaxy-${prefix}-${dateText}`;
}

function buildPreviousState() {
  return {
    scenarioDistribution: {
      normal: 23,
      controlled: 52,
      severe: 18,
      closure: 7,
    },
    targetForecasts: [
      { target: "brent", horizon: "7d", direction: "up", confidence: 0.58, deltaLabel: "+ risk premium", rationale: "上轮判断为可控扰动。", sourceIds: ["fred-market"] },
      { target: "wti", horizon: "7d", direction: "up", confidence: 0.5, deltaLabel: "+ risk premium", rationale: "跟随 Brent 风险溢价。", sourceIds: ["fred-market"] },
      { target: "gold", horizon: "7d", direction: "uncertain", confidence: 0.3, deltaLabel: "pending source", rationale: "Gold source 仍是 pending。", sourceIds: [] },
      { target: "broad_usd", horizon: "7d", direction: "up", confidence: 0.45, deltaLabel: "+ haven", rationale: "温和避险需求。", sourceIds: ["fred-market"] },
      { target: "usd_cny", horizon: "7d", direction: "up", confidence: 0.42, deltaLabel: "+ pressure", rationale: "FX pressure 上行。", sourceIds: ["fred-market"] },
      { target: "usd_cnh", horizon: "7d", direction: "uncertain", confidence: 0.25, deltaLabel: "pending source", rationale: "CNH source 仍是 pending。", sourceIds: [] },
      { target: "us10y", horizon: "7d", direction: "flat", confidence: 0.4, deltaLabel: "mixed", rationale: "通胀、避险与利率渠道方向混合。", sourceIds: ["fred-market"] },
      { target: "vix", horizon: "7d", direction: "up", confidence: 0.55, deltaLabel: "+ headline beta", rationale: "对 headline risk 较敏感。", sourceIds: ["fred-market"] },
      { target: "sp500", horizon: "7d", direction: "down", confidence: 0.48, deltaLabel: "- risk appetite", rationale: "风险偏好受压。", sourceIds: ["fred-market"] },
      { target: "regional_escalation_7d", horizon: "7d", direction: "up", confidence: 0.5, deltaLabel: "+5 pp", rationale: "Advisory 与 maritime risk 推高。", sourceIds: ["official-advisory"] },
      { target: "transit_disruption_7d", horizon: "7d", direction: "up", confidence: 0.55, deltaLabel: "+ transit risk", rationale: "Advisory 与 insurance channel 支撑。", sourceIds: ["official-advisory"] },
      { target: "state_on_state_strike_14d", horizon: "14d", direction: "uncertain", confidence: 0.4, deltaLabel: "needs conflict evidence", rationale: "ACLED 仅作 candidate context。", sourceIds: [] },
      { target: "deescalation_signal_14d", horizon: "14d", direction: "down", confidence: 0.45, deltaLabel: "-4 pp", rationale: "de-escalation 证据有限。", sourceIds: ["official-advisory"] },
    ],
  };
}

function buildArtifact({ question, dateText, outputDir, taskDir, runId, startedAt, status, summaryRecord, finalize, note, stats, actionTrace, command, error }) {
  const runArtifactPath = resolve(outputDir, "run-artifact.json");
  const forecastedAt = summaryRecord?.ended_at ?? new Date().toISOString();
  const prediction = summaryRecord?.prediction || finalize?.prediction || "B";
  const predictedScenario = scenarioFromPrediction(prediction);
  const brentWeeklyHigh = isBrentWeeklyHighQuestion(question);
  const sourceObservations = [
    {
      observationId: sourceObservationId("question", dateText),
      sourceId: "galaxy-selfevolve",
      publishedAt: `${dateText}T00:00:00+08:00`,
      retrievedAt: forecastedAt,
      sourceUrl: "data/galaxy/hormuz-daily-question.jsonl",
      title: brentWeeklyHigh ? "Weekly Brent high numeric question" : "Daily Hormuz FutureWorld-style question",
      summary: brentWeeklyHigh
        ? "题目要求预测本交易周 FRED DCOILBRENTEU Brent daily spot price 的最高值，单位 USD/bbl。"
        : "题目要求在 7d horizon 内预测 Hormuz scenario：normal / controlled / severe / closure。",
      freshness: "fresh",
      licenseStatus: "open",
    },
    {
      observationId: sourceObservationId("final", dateText),
      sourceId: "galaxy-selfevolve",
      publishedAt: forecastedAt,
      retrievedAt: forecastedAt,
      sourceUrl: relative(root, resolve(taskDir, "main_agent.jsonl")),
      title: status === "success" ? "Galaxy final prediction" : "Galaxy adapter final prediction",
      summary: brentWeeklyHigh
        ? note?.question_state || `Galaxy numeric Brent weekly-high prediction is ${prediction} USD/bbl.`
        : note?.question_state || `Galaxy prediction maps to ${predictedScenario}.`,
      freshness: status === "failed" ? "missing" : "fresh",
      licenseStatus: "open",
    },
    {
      observationId: sourceObservationId("fred-market", dateText),
      sourceId: "fred-market",
      publishedAt: `${dateText}T22:00:00Z`,
      retrievedAt: forecastedAt,
      sourceUrl: "data/normalized/market/fred_series.csv",
      title: "FRED market bundle for galaxy adapter",
      summary: brentWeeklyHigh
        ? "FRED market bundle is the resolution anchor for Brent spot observations and the primary numeric price context."
        : "Brent / WTI risk premium remains relevant, while broad market stress does not support closure-style shock.",
      freshness: "fresh",
      licenseStatus: "open",
    },
    {
      observationId: sourceObservationId("advisory", dateText),
      sourceId: "official-advisory",
      publishedAt: `${dateText}T07:13:10Z`,
      retrievedAt: forecastedAt,
      sourceUrl: "data/normalized/maritime/advisories.jsonl",
      title: "Official advisory bundle for galaxy adapter",
      summary: "Official advisory layer remains elevated but does not provide verified closure or avoidance instruction.",
      freshness: "fresh",
      licenseStatus: "open",
    },
    {
      observationId: sourceObservationId("ais-pending", dateText),
      sourceId: "ais-flow-pending",
      retrievedAt: forecastedAt,
      title: "AIS flow source pending",
      summary: "No authorized live AIS flow source is available; pending source cannot create high-confidence live evidence.",
      freshness: "pending",
      licenseStatus: "pending",
    },
  ];

  const predictionEvidenceClaim =
    brentWeeklyHigh
      ? `Galaxy numeric answer predicts the weekly high Brent spot price at ${prediction} USD/bbl; resolution must be checked against FRED DCOILBRENTEU observations in the target window.`
      : predictedScenario === "closure"
      ? "Galaxy task answer maps to closure; this remains constrained by the missing verified flow-stop guardrail."
      : predictedScenario === "severe"
        ? "Galaxy task answer maps to severe disruption; this requires official or traffic-flow corroboration before becoming base case."
        : predictedScenario === "normal"
          ? "Galaxy task answer maps to normal; market and advisory evidence still require reviewer caution."
          : "Galaxy task answer maps to controlled disruption: elevated maritime/security risk without verified sustained closure-class traffic stop.";

  const evidenceClaims = [
    {
      evidenceId: brentWeeklyHigh ? "ev-galaxy-final-brent-high" : "ev-galaxy-final-controlled",
      sourceObservationIds: [
        sourceObservationId("question", dateText),
        sourceObservationId("final", dateText),
      ],
      claim: predictionEvidenceClaim,
      polarity: brentWeeklyHigh || predictedScenario !== "normal" ? "support" : "uncertain",
      affects: brentWeeklyHigh ? ["target", "market"] : ["scenario", "target"],
      mechanismTags:
        brentWeeklyHigh
          ? ["market_pricing_risk_premium"]
          : predictedScenario === "closure"
          ? ["traffic_flow_down", "mine_or_swarm_risk_up"]
          : predictedScenario === "severe"
            ? ["traffic_flow_down", "energy_supply_risk_up"]
            : ["transit_risk_up", "insurance_cost_up"],
      confidence: confidence(summaryRecord?.confidence || finalize?.confidence) === "high" ? "high" : "medium",
      quality: {
        sourceReliability: "medium",
        freshness: status === "failed" ? "stale" : "fresh",
        corroboration: "single_source",
        directness: "direct",
      },
      targetHints: brentWeeklyHigh
        ? [
            { target: "brent", direction: "up", weight: 0.8 },
          ]
        : [
            { target: "transit_disruption_7d", direction: predictedScenario === "normal" ? "flat" : "up", weight: 0.8 },
            { target: "regional_escalation_7d", direction: predictedScenario === "normal" ? "flat" : "up", weight: 0.5 },
          ],
    },
    {
      evidenceId: "ev-galaxy-market-mixed",
      sourceObservationIds: [sourceObservationId("fred-market", dateText)],
      claim: brentWeeklyHigh
        ? "FRED Brent observations define the numeric resolution target; Hormuz risk premium is relevant only insofar as it moves the Brent weekly high."
        : "Market bundle still supports Hormuz risk premium, but cross-asset stress is mixed and does not price a closure shock.",
      polarity: "support",
      affects: brentWeeklyHigh ? ["market", "target"] : ["market", "scenario", "target"],
      mechanismTags: brentWeeklyHigh
        ? ["market_pricing_risk_premium"]
        : ["market_pricing_risk_premium", "market_not_pricing_closure"],
      confidence: "medium",
      quality: {
        sourceReliability: "high",
        freshness: "fresh",
        corroboration: "multi_source",
        directness: "direct",
      },
      targetHints: [
        { target: "brent", direction: "up", weight: 0.75 },
        { target: "wti", direction: "up", weight: 0.55 },
        { target: "vix", direction: "up", weight: 0.35 },
        { target: "sp500", direction: "down", weight: 0.35 },
      ],
    },
    {
      evidenceId: "ev-galaxy-advisory-elevated",
      sourceObservationIds: [sourceObservationId("advisory", dateText)],
      claim: "Official advisory layer remains elevated but lacks avoidance or verified closure wording.",
      polarity: "support",
      affects: ["scenario", "target", "watchlist"],
      mechanismTags: ["transit_risk_up", "insurance_cost_up"],
      confidence: "medium",
      quality: {
        sourceReliability: "high",
        freshness: "fresh",
        corroboration: "single_source",
        directness: "direct",
      },
      targetHints: [
        { target: "transit_disruption_7d", direction: "up", weight: 0.75 },
      ],
    },
    {
      evidenceId: "ev-galaxy-flow-pending",
      sourceObservationIds: [sourceObservationId("ais-pending", dateText)],
      claim: "Flow layer remains pending, so verified traffic stop evidence is absent and closure cannot become the base case.",
      polarity: "counter",
      affects: ["scenario", "watchlist"],
      mechanismTags: ["market_not_pricing_closure"],
      confidence: "low",
      quality: {
        sourceReliability: "low",
        freshness: "stale",
        corroboration: "single_source",
        directness: "context",
      },
      targetHints: [
        { target: "deescalation_signal_14d", direction: "down", weight: 0.25 },
      ],
    },
  ];

  return {
    schemaVersion: "hormuz-galaxy-run/v1",
    question,
    runMeta: {
      runId,
      taskId: question.task_id,
      status,
      generatedAt: startedAt,
      startedAt,
      completedAt: status === "success" || status === "failed" ? forecastedAt : undefined,
      forecastedAt,
      questionDate: dateText,
      runner: "galaxy-selfevolve",
      galaxyRepo,
      venvPath: galaxyVenvPath(),
      pythonPath: existsSync(galaxyPythonPath()) ? galaxyPythonPath() : undefined,
      outputDir: relative(root, outputDir),
      runDir: relative(root, taskDir),
      questionPath: relative(root, questionPath),
      command,
      finalPrediction: prediction,
      confidence: confidence(summaryRecord?.confidence || finalize?.confidence),
      durationSeconds: summaryRecord?.duration_seconds,
      terminalReason: stats?.terminal_reason,
      metrics: summaryRecord?.metrics || stats || {},
      artifactPaths: {
        question: relative(root, questionPath),
        artifact: relative(root, runArtifactPath),
        latestArtifact: relative(root, latestArtifactPath),
        mainAgent: relative(root, resolve(taskDir, "main_agent.jsonl")),
        checkpointNote: relative(root, resolve(taskDir, "checkpoint_note.json")),
        taskSummary: relative(root, resolve(outputDir, "task_summary.jsonl")),
      },
      error,
    },
    actionTrace,
    previousState: buildPreviousState(),
    sourceObservations,
    evidenceClaims,
    marketRead: {
      title: brentWeeklyHigh
        ? "Galaxy market read: Brent weekly high numeric target"
        : "Galaxy market read: mixed risk premium, no closure shock",
      summary: brentWeeklyHigh
        ? "FRED DCOILBRENTEU is the resolution source for the numeric Brent target; maritime evidence is context for risk premium, not the resolved unit."
        : "FRED market bundle supports controlled disruption risk premium, but does not by itself update forecast state and does not support closure as base case.",
      pricingPattern: "mixed",
      evidenceIds: ["ev-galaxy-market-mixed"],
      caveat: "Market read is evidence input only; final scenario update is written only by judgement_updated.",
      asOf: dateText,
    },
    nextWatch: [
      "Run scripts/run-galaxy-hormuz.mjs --execute to refresh the live galaxy-selfevolve artifact through the existing .venv",
      ...(brentWeeklyHigh ? ["FRED DCOILBRENTEU daily observations through the target window close"] : []),
      "UKMTO / JMIC / MARAD avoidance or threat wording escalation",
      "Authorized AIS / tanker / LNG flow turn-down",
      "Insurance / chartering / freight non-linear jump",
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const question = buildQuestion(args.date, args.questionKind);
  const startedAt = args.startedAt || new Date().toISOString();
  const timestamp = startedAt.replace(/\D/g, "").slice(0, 14) || Date.now().toString();
  const runId = args.runId || `${timestamp}__${question.task_id}`;
  const outputDir = resolve(args.outputDir || resolve(defaultOutputRoot, args.date, runId));
  const taskDir = resolve(outputDir, question.task_id);
  await mkdir(dirname(questionPath), { recursive: true });
  await mkdir(outputDir, { recursive: true });
  await writeFile(questionPath, `${JSON.stringify(question, null, 0)}\n`, "utf8");
  await ensureHormuzRunConfig(args, question, outputDir);

  const galaxyInvocation = buildGalaxyCommand(args, question, outputDir);
  const { command } = galaxyInvocation;
  let status = "adapter_only";
  let error = "";
  if (args.execute) {
    const result = spawnSync(command[0], command.slice(1), {
      cwd: galaxyRepo,
      stdio: "inherit",
      env: galaxyInvocation.env,
    });
    if (result.status === 0) {
      status = "success";
    } else {
      status = "failed";
      error = `galaxy command exited with status ${result.status ?? "unknown"}`;
    }
  }

  const summaryRows = await readJsonlRows(resolve(outputDir, "task_summary.jsonl"));
  const summaryRecord = [...summaryRows]
    .reverse()
    .find((row) => String(row.id || row.task_id || "") === question.task_id);
  const mainAgentRows = await readJsonlRows(resolve(taskDir, "main_agent.jsonl"));
  const finalize = lastFinalizeFromMessages(mainAgentRows);
  const note = await readJsonIfExists(resolve(taskDir, "checkpoint_note.json"));
  const stats = await readJsonIfExists(resolve(taskDir, "main_agent_stats.json"));
  if (summaryRecord?.status === "success") status = "success";
  const actionTrace = await buildActionTrace({
    taskDir,
    outputDir,
    dateText: args.date,
    question,
    summaryRecord,
    finalize,
    stats,
  });

  const artifact = buildArtifact({
    question,
    dateText: args.date,
    outputDir,
    taskDir,
    runId,
    startedAt,
    status,
    summaryRecord,
    finalize,
    note,
    stats,
    actionTrace,
    command,
    error: error || undefined,
  });

  await writeFile(resolve(outputDir, "run-artifact.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  if (!args.traceOnly) {
    await writeFile(latestArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  }
  console.log(`question: ${relative(root, questionPath)}`);
  console.log(`artifact: ${relative(root, latestArtifactPath)}`);
  console.log(`run-artifact: ${relative(root, resolve(outputDir, "run-artifact.json"))}`);
  console.log(`status: ${artifact.runMeta.status}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
