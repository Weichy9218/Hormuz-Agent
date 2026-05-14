// Local dev proxy for the Hormuz demo agent; keeps API keys out of browser bundles.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import { spawn } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_GALAXY_ENV_PATH =
  "/Users/weichy/Desktop/Doing-Right-Things/FutureX/papers/galaxy-selfevolve/.env";
const LOCAL_GALAXY_ENV_PATH = "/Users/weichy/code/galaxy-selfevolve/.env";

interface AgentRequestBody {
  target?: string;
  questionText?: string;
}

const DEV_SERVER_WATCH_IGNORES = [
  "**/data/galaxy/runs/**",
  "**/data/forecast-agent/runs/**",
  "**/slides/**",
];

interface ApiEnv {
  apiKey: string;
  baseUrl: string;
}

type GalaxyRunStatus = "running" | "completed" | "failed";
type ForecastAgentRunStatus = "running" | "completed" | "failed";

interface ActionTraceLike {
  actions?: unknown[];
  graph?: {
    nodes?: unknown[];
    edges?: unknown[];
  };
  [key: string]: unknown;
}

interface GalaxyRunRecord {
  runId: string;
  taskId: string;
  pid: number | null;
  startedAt: string;
  lastUpdatedAt: string;
  outputDir: string;
  runDir: string;
  date: string;
  runConfig: string;
  status: GalaxyRunStatus;
  exitCode: number | null;
  command: string[];
  outputTail: string;
  questionPath?: string;
  error?: string;
}

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

interface ForecastAgentRunRecord {
  runId: string;
  taskId: string;
  pid: number | null;
  startedAt: string;
  lastUpdatedAt: string;
  runDir: string;
  status: ForecastAgentRunStatus;
  exitCode: number | null;
  command: string[];
  outputTail: string;
  error?: string;
}

function parseEnvFile(filePath: string) {
  const values = new Map<string, string>();
  if (!fs.existsSync(filePath)) return values;

  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    values.set(key, value);
  }
  return values;
}

function loadApiEnv(): ApiEnv | null {
  const envPath =
    process.env.GALAXY_ENV_PATH ||
    (fs.existsSync(LOCAL_GALAXY_ENV_PATH) ? LOCAL_GALAXY_ENV_PATH : DEFAULT_GALAXY_ENV_PATH);
  const envValues = parseEnvFile(envPath);
  const apiKey = process.env.apihy_API_KEY || envValues.get("apihy_API_KEY") || "";
  const baseUrl =
    process.env.apihy_BASE_URL || envValues.get("apihy_BASE_URL") || "https://zgc.apihy.com/v1";

  if (!apiKey) return null;
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, "") };
}

function readRequestBody(request: import("node:http").IncomingMessage) {
  return new Promise<AgentRequestBody>((resolve) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}") as AgentRequestBody);
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  payload: unknown,
) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function extractText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as Record<string, unknown>;
  const choices = data.choices;
  if (Array.isArray(choices)) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === "string") return message.content;
  }
  if (typeof data.output_text === "string") return data.output_text;
  return "";
}

function buildAgentMessages(body: AgentRequestBody) {
  const target = body.target?.trim() || "brent";
  return [
    {
      role: "system",
      content:
        "You are BaseAgent for a Hormuz Risk Intelligence demo. Keep proper nouns and technical terms in English. Explain important concepts in Chinese. Return concise Chinese analysis with English domain terms preserved.",
    },
    {
      role: "user",
      content:
        `请基于当前 case state 更新预测目标：${target}\n要求：用中文解释判断，保留 Brent、VIX、AIS、checkpoint、scenario 等英文专名。面向课堂 demo，必须简洁，120 个中文字符以内。严格返回 JSON：{"revisionReason":"..."}.`,
    },
  ];
}

function compactText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function normalizeForecastReply(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    const parsed = JSON.parse(cleaned) as { revisionReason?: string };
    if (parsed.revisionReason) {
      return compactText(parsed.revisionReason, 180);
    }
  } catch {
    // Non-JSON model output is normalized below.
  }

  return compactText(cleaned, 180);
}

function buildForecastResponse(target: string, normalizedReason: string) {
  const forecastTarget = target || "brent";
  const runId = `api-hormuz-${forecastTarget}`;
  const previousScenario = {
    normal: 50,
    controlled_disruption: 22,
    severe_disruption: 11,
    closure: 17,
  };
  const currentScenario = {
    normal: 45,
    controlled_disruption: 30,
    severe_disruption: 15,
    closure: 10,
  };
  const scenarioDelta = {
    normal: -5,
    controlled_disruption: 8,
    severe_disruption: 4,
    closure: -7,
  };
  const revisionReason =
    normalizedReason ||
    "Oil/VIX 证明风险被部分定价；缺少 verified flow stop 和 official avoidance。";

  return {
    runId,
    generatedAt: new Date().toISOString(),
    scenarioDistribution: currentScenario,
    targetForecasts: [
      {
        target: forecastTarget,
        horizon: "7d",
        signal: "up",
        confidence: 0.62,
        rationale: revisionReason,
      },
      {
        target: "transit_disruption_7d",
        horizon: "7d",
        signal: "up",
        confidence: 0.58,
        rationale: "Official advisory wording remains the primary live operational trigger.",
      },
    ],
    events: [
      {
        type: "run_started",
        runId,
        at: "T+00:00",
        title: "预测运行开始",
        summary: "API run accepted the forecast target and will return the standard event contract.",
      },
      {
        type: "source_read",
        runId,
        at: "T+00:04",
        sourceIds: ["official-advisory", "fred-market", "ais-flow-pending"],
        status: "fresh",
        title: "读取固定信源 bundle",
        summary: "官方海事通告、FRED market benchmark 与 AIS pending 状态进入本轮 case state。",
      },
      {
        type: "evidence_added",
        runId,
        at: "T+00:12",
        evidenceId: "api-agent-note",
        title: "Agent rationale normalized",
        summary: revisionReason,
        sourceIds: ["baseagent", "fred-market"],
        polarity: "support",
        mechanismTags: ["market_pricing_risk_premium", "market_not_pricing_closure"],
        affects: ["scenario", "market"],
      },
      {
        type: "judgement_updated",
        runId,
        at: "T+00:24",
        title: "情景概率修订",
        reason: revisionReason,
        previousScenario,
        currentScenario,
        scenarioDelta,
        targetDeltas: [
          {
            target: forecastTarget,
            horizon: "7d",
            previous: "flat/up",
            current: "up",
            deltaLabel: "risk premium stronger",
          },
        ],
      },
      {
        type: "checkpoint_written",
        runId,
        at: "T+00:32",
        checkpointId: "cp2",
        title: "Checkpoint 写回",
        summary: "写回 standard forecast checkpoint。",
        revisionReason,
        nextWatch: [
          "UKMTO / JMIC / MARAD 是否出现 avoidance 或 threat wording 升级",
          "授权 AIS / tanker / LNG flow 是否显示连续下降",
        ],
      },
      {
        type: "run_completed",
        runId,
        at: "T+00:36",
        title: "预测运行完成",
        summary: "API response preserved the single event-driven contract.",
      },
    ],
    checkpoint: {
      checkpointId: "cp2",
      revisionReason,
      nextWatch: [
        "UKMTO / JMIC / MARAD 是否出现 avoidance 或 threat wording 升级",
        "授权 AIS / tanker / LNG flow 是否显示连续下降",
      ],
    },
  };
}

async function callApihy(body: AgentRequestBody) {
  const env = loadApiEnv();
  if (!env) {
    return { ok: false, status: 500, payload: { error: "missing apihy_API_KEY" } };
  }

  const response = await fetch(`${env.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "glm-4-flash",
      messages: buildAgentMessages(body),
      temperature: 0.2,
      max_completion_tokens: 900,
      stream: false,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload: { error: "apihy request failed", status: response.status },
    };
  }

  return {
    ok: true,
    status: 200,
    payload: buildForecastResponse(body.target || "brent", normalizeForecastReply(extractText(payload))),
  };
}

function hormuzAgentPlugin() {
  return {
    name: "hormuz-agent-api",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/hormuz-agent", async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }

        try {
          const body = await readRequestBody(request);
          const result = await callApihy(body);
          sendJson(response, result.status, result.payload);
        } catch (error) {
          sendJson(response, 502, {
            error: "agent proxy failed",
            detail: error instanceof Error ? error.message : "unknown error",
          });
        }
      });
    },
  };
}

const GALAXY_RUNS_ROOT = path.resolve(process.cwd(), "data/galaxy/runs");
const GALAXY_REPO =
  process.env.GALAXY_REPO ||
  "/Users/weichy/Desktop/Doing-Right-Things/FutureX/papers/galaxy-selfevolve";
const GALAXY_DEFAULT_QUESTION_KIND = "brent-weekly-high";
const GALAXY_QUESTION_PATH = path.resolve(process.cwd(), "data/galaxy/hormuz-daily-question.jsonl");
const GALAXY_ACTIVE_RUN_PATH = path.resolve(process.cwd(), "data/galaxy/active-run.json");
const GALAXY_RUN_STATUS_FILE = "run-status.json";
const GALAXY_RUN_QUESTION_FILE = "run-question.json";
const GALAXY_RUN_LOG_FILE = "runner.log";
const GALAXY_DEFAULT_RUN_CONFIG = "hormuz_test.yaml";
const GALAXY_CUSTOM_RUN_CONFIG = "hormuz_custom.yaml";

function shanghaiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildTaskId(date: string, questionKind = GALAXY_DEFAULT_QUESTION_KIND) {
  if (questionKind === "brent-weekly-high") return `hormuz-brent-weekly-high-${date}`;
  if (questionKind === "custom") return `hormuz-custom-${date}`;
  return `hormuz-traffic-risk-${date}`;
}

function buildRunId(date: string, startedAt: string, taskId: string) {
  const stamp = startedAt.replace(/\D/g, "").slice(0, 14) || Date.now().toString();
  return `${date}-${stamp}__${taskId}`;
}

function tailText(text: string, maxLength = 5000) {
  return text.length > maxLength ? text.slice(-maxLength) : text;
}

function readFileTail(filePath: string, maxLength = 5000) {
  if (!fs.existsSync(filePath)) return "";
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxLength);
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      return buffer.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
}

function elapsedSeconds(startedAt: string) {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
}

function buildLocalAgentRunId(startedAt: string) {
  const date = shanghaiDate();
  const stamp = startedAt.replace(/\D/g, "").slice(0, 14) || Date.now().toString();
  return `${date}-${stamp}__local-forecast-agent`;
}

function readJsonIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function statusPathForRecord(record: Pick<GalaxyRunRecord, "outputDir">) {
  return path.join(record.outputDir, GALAXY_RUN_STATUS_FILE);
}

function questionPathForRun(outputDir: string) {
  return path.join(outputDir, GALAXY_RUN_QUESTION_FILE);
}

function runnerLogPathForRecord(record: Pick<GalaxyRunRecord, "outputDir">) {
  return path.join(record.outputDir, GALAXY_RUN_LOG_FILE);
}

function persistGalaxyRunStatus(record: GalaxyRunRecord) {
  writeJsonFile(statusPathForRecord(record), record);
  writeJsonFile(GALAXY_ACTIVE_RUN_PATH, {
    runId: record.runId,
    statusPath: path.relative(process.cwd(), statusPathForRecord(record)),
    updatedAt: record.lastUpdatedAt,
  });
}

function reviveGalaxyRunRecord(raw: Record<string, unknown> | null): GalaxyRunRecord | undefined {
  if (!raw?.runId || !raw?.taskId || !raw?.outputDir || !raw?.runDir || !raw?.startedAt) return undefined;
  const outputDir = path.resolve(process.cwd(), String(raw.outputDir));
  const runDir = path.resolve(process.cwd(), String(raw.runDir));
  return {
    runId: String(raw.runId),
    taskId: String(raw.taskId),
    pid: typeof raw.pid === "number" ? raw.pid : null,
    startedAt: String(raw.startedAt),
    lastUpdatedAt: String(raw.lastUpdatedAt || raw.startedAt),
    outputDir,
    runDir,
    date: String(raw.date || shanghaiDate()),
    runConfig: String(raw.runConfig || GALAXY_DEFAULT_RUN_CONFIG),
    status: raw.status === "failed" ? "failed" : raw.status === "completed" ? "completed" : "running",
    exitCode: typeof raw.exitCode === "number" ? raw.exitCode : null,
    command: Array.isArray(raw.command) ? raw.command.map(String) : [],
    outputTail: String(raw.outputTail || ""),
    questionPath: typeof raw.questionPath === "string" ? path.resolve(process.cwd(), raw.questionPath) : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

function readGalaxyRunRecordFromStatus(statusPath: string) {
  return reviveGalaxyRunRecord(readJsonIfExists(statusPath));
}

function findGalaxyRunStatusRecords() {
  const records: GalaxyRunRecord[] = [];
  const stack = [GALAXY_RUNS_ROOT];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === GALAXY_RUN_STATUS_FILE) {
        const record = readGalaxyRunRecordFromStatus(fullPath);
        if (record) records.push(record);
      }
    }
  }
  return records.sort((a, b) => Date.parse(b.lastUpdatedAt || b.startedAt) - Date.parse(a.lastUpdatedAt || a.startedAt));
}

function summarizeQuestionText(question: unknown) {
  if (!question || typeof question !== "object") return "Unknown question";
  const row = question as Record<string, unknown>;
  const text = String(row.task_question ?? row.task_description ?? "");
  const eventBlock = text.match(/"""([\s\S]*?)"""/)?.[1]?.trim();
  return compactText(eventBlock || text.replace(/IMPORTANT:[\s\S]*$/i, ""), 220);
}

function findGalaxyRunArtifacts() {
  const artifacts: string[] = [];
  const stack = [GALAXY_RUNS_ROOT];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === "run-artifact.json") {
        artifacts.push(fullPath);
      }
    }
  }
  return artifacts;
}

function normalizeGalaxyQuestionKind(value: string) {
  if (value === "brent-weekly-high") return "brent_weekly_high";
  if (value === "hormuz-traffic-risk") return "hormuz_traffic_risk";
  return value;
}

function normalizedQuestionText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function artifactQuestionKind(artifact: Record<string, unknown> | null) {
  const question = artifact?.question as Record<string, unknown> | undefined;
  const metadata = question?.metadata as Record<string, unknown> | undefined;
  return normalizeGalaxyQuestionKind(String(metadata?.question_kind || ""));
}

function artifactCompletedAt(artifact: Record<string, unknown>) {
  const meta = artifact.runMeta as Record<string, unknown> | undefined;
  return Date.parse(String(meta?.completedAt || meta?.forecastedAt || meta?.generatedAt || "0"));
}

function artifactQuestionIsAligned(artifact: Record<string, unknown> | null) {
  const meta = artifact?.runMeta as Record<string, unknown> | undefined;
  const question = artifact?.question as Record<string, unknown> | undefined;
  const taskId = String(meta?.taskId || "");
  if (!taskId || question?.task_id !== taskId) return false;
  const runDir = String(meta?.runDir || "");
  return path.basename(runDir) === taskId;
}

function artifactMatchesRequest(
  artifact: Record<string, unknown> | null,
  questionKind: string,
  questionText: string,
) {
  if (!artifactQuestionIsAligned(artifact)) return false;
  const kind = artifactQuestionKind(artifact);
  if (questionKind && kind !== normalizeGalaxyQuestionKind(questionKind)) return false;
  if (kind === "custom" && questionText) {
    const question = artifact?.question as Record<string, unknown> | undefined;
    const haystack = normalizedQuestionText(
      `${question?.task_question ?? ""} ${question?.task_description ?? ""}`,
    );
    return haystack.includes(normalizedQuestionText(questionText));
  }
  return true;
}

function latestGalaxyArtifactForRequest(questionKind: string, questionText: string) {
  const artifacts = findGalaxyRunArtifacts()
    .map((artifactPath) => {
      const artifact = readJsonIfExists(artifactPath);
      if (!artifactMatchesRequest(artifact, questionKind, questionText)) return null;
      return { artifact, artifactPath };
    })
    .filter((item): item is { artifact: Record<string, unknown>; artifactPath: string } => Boolean(item))
    .sort((a, b) => artifactCompletedAt(b.artifact) - artifactCompletedAt(a.artifact));
  return artifacts[0] ?? null;
}

function galaxyHistoryItems(): GalaxyRunHistoryItem[] {
  const artifactItems = findGalaxyRunArtifacts()
    .map((artifactPath): GalaxyRunHistoryItem | null => {
      const artifact = readJsonIfExists(artifactPath);
      if (!artifactQuestionIsAligned(artifact)) return null;
      const meta = artifact?.runMeta as Record<string, unknown> | undefined;
      if (!meta?.runId || !meta?.taskId) return null;
      const question = artifact?.question as Record<string, unknown> | undefined;
      const metadata = question?.metadata as Record<string, unknown> | undefined;
      return {
        runId: String(meta.runId),
        taskId: String(meta.taskId),
        questionKind: String(metadata?.question_kind || "unknown"),
        questionTitle: summarizeQuestionText(question),
        status: String(meta.status || "unknown"),
        finalPrediction: String(meta.finalPrediction || ""),
        completedAt: String(meta.completedAt || meta.forecastedAt || meta.generatedAt || ""),
        durationSeconds: typeof meta.durationSeconds === "number" ? meta.durationSeconds : null,
        artifactPath: path.relative(process.cwd(), artifactPath),
        runDir: String(meta.runDir || path.dirname(artifactPath)),
      } satisfies GalaxyRunHistoryItem;
    })
    .filter((item): item is GalaxyRunHistoryItem => Boolean(item));
  const seen = new Set(artifactItems.map((item) => item.runId));
  const statusTimes = new Map(findGalaxyRunStatusRecords().map((record) => [record.runId, record.lastUpdatedAt]));
  const fallbackTime = (item: GalaxyRunHistoryItem) =>
    Date.parse(item.completedAt || statusTimes.get(item.runId) || "0");
  const statusItems: GalaxyRunHistoryItem[] = [];
  for (const record of findGalaxyRunStatusRecords()) {
    if (seen.has(record.runId)) continue;
    const question = readJsonIfExists(record.questionPath || questionPathForRun(record.outputDir));
    if (question?.task_id && question.task_id !== record.taskId) continue;
    if (path.basename(record.runDir) !== record.taskId) continue;
    const metadata = question?.metadata as Record<string, unknown> | undefined;
    statusItems.push({
      runId: record.runId,
      taskId: record.taskId,
      questionKind: String(metadata?.question_kind || (record.taskId.includes("custom") ? "custom" : "unknown")),
      questionTitle: summarizeQuestionText(question || { task_question: record.taskId }),
      status: record.status,
      finalPrediction: "",
      completedAt: record.status === "running" ? "" : record.lastUpdatedAt,
      durationSeconds: record.status === "running" ? null : elapsedSeconds(record.startedAt),
      artifactPath: "",
      runDir: path.relative(process.cwd(), record.runDir),
    });
  }
  return [...artifactItems, ...statusItems]
    .sort((a, b) => fallbackTime(b) - fallbackTime(a));
}

async function importForecastAgentRunner() {
  const scriptPath = path.resolve(process.cwd(), "scripts/forecast-agent/runner.mjs");
  const scriptUrl = pathToFileURL(scriptPath);
  scriptUrl.searchParams.set("mtime", String(Date.now()));
  return (await import(scriptUrl.href)) as {
    buildTrace: (runDir: string) => Promise<unknown>;
    buildCompletedArtifact: (runDir: string) => Promise<unknown>;
  };
}

function recordStatus(record: GalaxyRunRecord) {
  const runnerLogTail = readFileTail(runnerLogPathForRecord(record));
  if (runnerLogTail) record.outputTail = runnerLogTail;
  if (record.status !== "running") return record;
  const artifact = readJsonIfExists(path.join(record.outputDir, "run-artifact.json"));
  if (artifact?.runMeta && typeof artifact.runMeta === "object") {
    const meta = artifact.runMeta as Record<string, unknown>;
    if (meta.status === "success" || meta.status === "failed") {
      record.status = meta.status === "success" ? "completed" : "failed";
      record.exitCode = meta.status === "success" ? 0 : record.exitCode;
      record.lastUpdatedAt = String(meta.completedAt || meta.forecastedAt || record.lastUpdatedAt);
      persistGalaxyRunStatus(record);
    }
  } else if (record.pid && !isPidAlive(record.pid)) {
    record.status = "failed";
    record.exitCode = record.exitCode ?? 1;
    record.error ||= "galaxy runner process is no longer active and no run-artifact.json was written";
    record.lastUpdatedAt = new Date().toISOString();
    persistGalaxyRunStatus(record);
  }
  return record;
}

function isPidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function statusPayload(record: GalaxyRunRecord) {
  const current = recordStatus(record);
  return {
    runId: current.runId,
    taskId: current.taskId,
    status: current.status,
    pid: current.pid,
    elapsed: elapsedSeconds(current.startedAt),
    startedAt: current.startedAt,
    lastUpdatedAt: current.lastUpdatedAt,
    runDir: current.runDir,
    outputDir: current.outputDir,
    runConfig: current.runConfig,
    exitCode: current.exitCode,
    command: current.command,
    outputTail: readFileTail(runnerLogPathForRecord(current)) || current.outputTail,
    error: current.error,
  };
}

function runByRequest(
  request: import("node:http").IncomingMessage,
  runs: Map<string, GalaxyRunRecord>,
) {
  const url = new URL(request.url || "", "http://localhost");
  const runId = url.searchParams.get("runId") || "";
  if (runId) {
    const memoryRecord = runs.get(runId);
    if (memoryRecord) return memoryRecord;
    return findGalaxyRunStatusRecords().find((record) => record.runId === runId);
  }
  let latest: GalaxyRunRecord | undefined;
  runs.forEach((record) => {
    latest = record;
  });
  if (latest) return latest;
  const diskRecords = findGalaxyRunStatusRecords();
  const runningDiskRecord = diskRecords.find((record) => recordStatus(record).status === "running");
  if (runningDiskRecord) return runningDiskRecord;
  return latestGalaxyRecordFromArtifact();
}

function latestGalaxyRecordFromArtifact(): GalaxyRunRecord | undefined {
  const artifact = readJsonIfExists(path.resolve(process.cwd(), "data/galaxy/latest-run.json"));
  const meta = artifact?.runMeta as Record<string, unknown> | undefined;
  if (!meta?.runId || !meta?.taskId || !meta?.outputDir || !meta?.runDir) return undefined;
  const startedAt = String(meta.startedAt || meta.generatedAt || meta.forecastedAt || new Date().toISOString());
  const completedAt = String(meta.completedAt || meta.forecastedAt || startedAt);
  return {
    runId: String(meta.runId),
    taskId: String(meta.taskId),
    pid: null,
    startedAt,
    lastUpdatedAt: completedAt,
    outputDir: path.resolve(process.cwd(), String(meta.outputDir)),
    runDir: path.resolve(process.cwd(), String(meta.runDir)),
    date: String(meta.questionDate || shanghaiDate()),
    runConfig: String(meta.runConfig || "hormuz_test.yaml"),
    status: meta.status === "failed" ? "failed" : "completed",
    exitCode: meta.status === "failed" ? 1 : 0,
    command: Array.isArray(meta.command) ? meta.command.map(String) : [],
    outputTail: "",
    questionPath: typeof meta.questionPath === "string" ? path.resolve(process.cwd(), String(meta.questionPath)) : undefined,
    error: typeof meta.error === "string" ? meta.error : undefined,
  };
}

async function liveActionTrace(record: GalaxyRunRecord) {
  const scriptPath = path.resolve(process.cwd(), "scripts/run-galaxy-hormuz.mjs");
  const scriptUrl = pathToFileURL(scriptPath);
  scriptUrl.searchParams.set("mtime", String(Date.now()));
  const mod = (await import(scriptUrl.href)) as {
    buildActionTrace: (input: {
      taskDir: string;
      question: Record<string, unknown>;
      questionFilePath?: string;
      summaryRecord?: Record<string, unknown>;
      finalize?: Record<string, unknown>;
      stats?: Record<string, unknown>;
      includeTerminal?: boolean;
    }) => Promise<ActionTraceLike>;
  };
  const runQuestionPath = record.questionPath || questionPathForRun(record.outputDir);
  const question = readJsonIfExists(runQuestionPath) || readJsonIfExists(path.resolve(process.cwd(), "data/galaxy/hormuz-daily-question.jsonl")) || {
    task_id: record.taskId,
    task_question: record.taskId,
  };
  const summaryRows = fs.existsSync(path.join(record.outputDir, "task_summary.jsonl"))
    ? fs
        .readFileSync(path.join(record.outputDir, "task_summary.jsonl"), "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => {
          try {
            return JSON.parse(line) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .filter((row): row is Record<string, unknown> => Boolean(row))
    : [];
  const summaryRecord = [...summaryRows]
    .reverse()
    .find((row) => String(row.id || row.task_id || "") === record.taskId);
  const stats = readJsonIfExists(path.join(record.runDir, "main_agent_stats.json")) || undefined;
  return mod.buildActionTrace({
    taskDir: record.runDir,
    question,
    questionFilePath: runQuestionPath,
    summaryRecord,
    stats,
    includeTerminal: recordStatus(record).status !== "running",
  });
}

function sliceActionTrace(trace: ActionTraceLike, afterIndex: number | null) {
  if (afterIndex == null || afterIndex < 0) return trace;
  const allActions = Array.isArray(trace.actions) ? trace.actions : [];
  const actions = allActions.filter((action) => {
    if (!action || typeof action !== "object") return false;
    const index = (action as Record<string, unknown>).index;
    return typeof index === "number" && index > afterIndex;
  });
  const actionIds = new Set(
    actions
      .map((action) => (action as Record<string, unknown>).actionId)
      .filter((id): id is string => typeof id === "string"),
  );
  const graph = trace.graph
    ? {
        nodes: Array.isArray(trace.graph.nodes)
          ? trace.graph.nodes.filter((node) => {
              if (!node || typeof node !== "object") return false;
              return actionIds.has(String((node as Record<string, unknown>).id));
            })
          : [],
        edges: Array.isArray(trace.graph.edges)
          ? trace.graph.edges.filter((edge) => {
              if (!edge || typeof edge !== "object") return false;
              const target = String((edge as Record<string, unknown>).target ?? "");
              return actionIds.has(target);
            })
          : [],
      }
    : undefined;
  return {
    ...trace,
    actions,
    graph,
    isDelta: true,
    afterIndex,
    totalActions: allActions.length,
  };
}

function galaxyRunPlugin() {
  const runs = new Map<string, GalaxyRunRecord>();

  function startRun(questionText?: string) {
    const date = shanghaiDate();
    const questionKind = questionText ? "custom" : GALAXY_DEFAULT_QUESTION_KIND;
    const taskId = buildTaskId(date, questionKind);
    const startedAt = new Date().toISOString();
    const runId = buildRunId(date, startedAt, taskId);
    const outputDir = path.join(GALAXY_RUNS_ROOT, date, runId);
    const runDir = path.join(outputDir, taskId);
    const runQuestionPath = questionPathForRun(outputDir);
    const recordQuestionPath = questionKind === "custom" ? runQuestionPath : GALAXY_QUESTION_PATH;
    const runConfig = questionKind === "custom" ? GALAXY_CUSTOM_RUN_CONFIG : GALAXY_DEFAULT_RUN_CONFIG;
    fs.mkdirSync(outputDir, { recursive: true });

    if (questionText) {
      const customQuestion = {
        task_id: taskId,
        task_question:
          `${questionText.trim()}\n\n` +
          `IMPORTANT: Your final answer MUST end with this exact format:\n` +
          `\\boxed{your answer}\n\n` +
          `Do not refuse to make a prediction. You must make a clear prediction based on the best data currently available.`,
        task_description: `Custom question: ${questionText.trim().slice(0, 300)}`,
        metadata: {
          case_id: "hormuz",
          question_kind: "custom",
          generated_for_date: date,
          timezone: "UTC+8",
          source_boundary: ["question-defined"],
        },
      };
      fs.writeFileSync(runQuestionPath, `${JSON.stringify(customQuestion)}\n`, "utf8");
    }

    const command = [
      "node",
      "scripts/run-galaxy-hormuz.mjs",
      "--execute",
      "--date",
      date,
      "--run-id",
      runId,
      "--started-at",
      startedAt,
      "--output-dir",
      outputDir,
      "--run-config",
      runConfig,
      "--question-path",
      questionKind === "custom" ? runQuestionPath : GALAXY_QUESTION_PATH,
      "--question-kind",
      questionKind,
    ];
    if (questionKind === "custom") {
      command.push("--agent-profile", "forecast", "--agent-name", "forecast_noskill");
    }
    const runnerLogPath = path.join(outputDir, GALAXY_RUN_LOG_FILE);
    fs.writeFileSync(
      runnerLogPath,
      [
        `[vite] detached galaxy run started ${startedAt}`,
        `[vite] runId=${runId}`,
        `[vite] command=${command.join(" ")}`,
        "",
      ].join("\n"),
      "utf8",
    );
    const stdoutFd = fs.openSync(runnerLogPath, "a");
    const stderrFd = fs.openSync(runnerLogPath, "a");
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        GALAXY_REPO,
      },
      stdio: ["ignore", stdoutFd, stderrFd],
    });
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
    child.unref();
    const record: GalaxyRunRecord = {
      runId,
      taskId,
      pid: child.pid ?? null,
      startedAt,
      lastUpdatedAt: startedAt,
      outputDir,
      runDir,
      date,
      runConfig,
      status: "running",
      exitCode: null,
      command,
      outputTail: "",
      questionPath: recordQuestionPath,
    };
    runs.set(runId, record);
    persistGalaxyRunStatus(record);

    child.on("error", (error) => {
      record.status = "failed";
      record.error = error.message;
      record.lastUpdatedAt = new Date().toISOString();
      persistGalaxyRunStatus(record);
    });
    child.on("close", (status) => {
      record.exitCode = status ?? 1;
      record.status = status === 0 ? "completed" : "failed";
      record.lastUpdatedAt = new Date().toISOString();
      recordStatus(record);
      persistGalaxyRunStatus(record);
    });

    return record;
  }

  return {
    name: "hormuz-galaxy-runner",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/galaxy-hormuz/latest", async (request, response) => {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        try {
          const url = new URL(request.url || "", "http://localhost");
          const questionKind = url.searchParams.get("questionKind") || "brent_weekly_high";
          const questionText = url.searchParams.get("questionText") || "";
          const match = latestGalaxyArtifactForRequest(questionKind, questionText);
          if (!match) {
            sendJson(response, 404, {
              error: "matching galaxy artifact not found",
              questionKind,
            });
            return;
          }
          sendJson(response, 200, match.artifact);
        } catch (error) {
          sendJson(response, 404, {
            error: "latest galaxy artifact not found",
            detail: error instanceof Error ? error.message : "unknown error",
          });
        }
      });
      server.middlewares.use("/api/galaxy-hormuz/history", async (request, response) => {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        try {
          sendJson(response, 200, { runs: galaxyHistoryItems() });
        } catch (error) {
          sendJson(response, 500, {
            error: "galaxy history scan failed",
            detail: error instanceof Error ? error.message : "unknown error",
          });
        }
      });
      server.middlewares.use("/api/galaxy-hormuz/artifact", async (request, response) => {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        const url = new URL(request.url || "", "http://localhost");
        const runId = url.searchParams.get("runId") || "";
        const item = galaxyHistoryItems().find((entry) => entry.runId === runId);
        if (!item || !item.artifactPath) {
          sendJson(response, 404, { error: "galaxy artifact not found" });
          return;
        }
        try {
          const artifactPath = path.resolve(process.cwd(), item.artifactPath);
          const text = await fs.promises.readFile(artifactPath, "utf8");
          sendJson(response, 200, JSON.parse(text));
        } catch (error) {
          sendJson(response, 500, {
            error: "galaxy artifact read failed",
            detail: error instanceof Error ? error.message : "unknown error",
          });
        }
      });
      server.middlewares.use("/api/galaxy-hormuz/run/start", async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        let hasRunningRun = false;
        runs.forEach((record) => {
          if (recordStatus(record).status === "running") hasRunningRun = true;
        });
        if (!hasRunningRun) {
          hasRunningRun = findGalaxyRunStatusRecords().some((record) => recordStatus(record).status === "running");
        }
        if (hasRunningRun) {
          sendJson(response, 409, { error: "galaxy run already in progress" });
          return;
        }

        try {
          const body = await readRequestBody(request);
          const record = startRun(body.questionText?.trim() || undefined);
          sendJson(response, 202, {
            ok: true,
            runId: record.runId,
            pid: record.pid,
            runDir: record.runDir,
            outputDir: record.outputDir,
            taskId: record.taskId,
            startedAt: record.startedAt,
            runConfig: record.runConfig,
          });
        } catch (error) {
          sendJson(response, 500, {
            error: "galaxy runner failed",
            detail: error instanceof Error ? error.message : "unknown error",
          });
        }
      });

      server.middlewares.use("/api/galaxy-hormuz/run/status", async (request, response) => {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        const record = runByRequest(request, runs);
        if (!record) {
          sendJson(response, 404, { error: "run not found" });
          return;
        }
        sendJson(response, 200, statusPayload(record));
      });

      server.middlewares.use("/api/galaxy-hormuz/run/trace", async (request, response) => {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        const record = runByRequest(request, runs);
        if (!record) {
          sendJson(response, 404, { error: "run not found" });
          return;
        }
        try {
          const url = new URL(request.url || "", "http://localhost");
          const afterParam = url.searchParams.get("afterIndex");
          const afterIndex = afterParam == null ? null : Number(afterParam);
          const actionTrace = await liveActionTrace(record);
          const tracePayload =
            Number.isFinite(afterIndex) && afterIndex != null
              ? sliceActionTrace(actionTrace, afterIndex)
              : actionTrace;
          sendJson(response, 200, {
            runId: record.runId,
            status: recordStatus(record).status,
            pid: record.pid,
            elapsed: elapsedSeconds(record.startedAt),
            lastUpdatedAt: record.lastUpdatedAt,
            runDir: record.runDir,
            outputDir: record.outputDir,
            trace: tracePayload,
            artifact:
              readJsonIfExists(path.join(record.outputDir, "run-artifact.json")) ||
              null,
          });
        } catch (error) {
          sendJson(response, 500, {
            error: "trace parse failed",
            detail: error instanceof Error ? error.message : "unknown error",
          });
        }
      });
    },
  };
}

function forecastAgentPlugin() {
  const runs = new Map<string, ForecastAgentRunRecord>();
  const runRoot = path.resolve(process.cwd(), "data/forecast-agent/runs");

  function startRun() {
    const startedAt = new Date().toISOString();
    const runId = buildLocalAgentRunId(startedAt);
    const runDir = path.join(runRoot, shanghaiDate(), runId);
    fs.mkdirSync(runDir, { recursive: true });
    const command = [
      "node",
      "scripts/forecast-agent/runner.mjs",
      "--run-id",
      runId,
      "--started-at",
      startedAt,
      "--output-dir",
      runDir,
    ];
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const record: ForecastAgentRunRecord = {
      runId,
      taskId: `hormuz-traffic-risk-${shanghaiDate()}`,
      pid: child.pid ?? null,
      startedAt,
      lastUpdatedAt: startedAt,
      runDir,
      status: "running",
      exitCode: null,
      command,
      outputTail: "",
    };
    runs.set(runId, record);

    const appendOutput = (chunk: unknown) => {
      record.outputTail = tailText(record.outputTail + String(chunk));
      record.lastUpdatedAt = new Date().toISOString();
    };
    child.stdout.on("data", appendOutput);
    child.stderr.on("data", appendOutput);
    child.on("error", (error) => {
      record.status = "failed";
      record.error = error.message;
      record.lastUpdatedAt = new Date().toISOString();
    });
    child.on("close", (status) => {
      record.exitCode = status ?? 1;
      record.status = status === 0 ? "completed" : "failed";
      record.lastUpdatedAt = new Date().toISOString();
    });

    return record;
  }

  function runByRequestLocal(request: import("node:http").IncomingMessage) {
    const url = new URL(request.url || "", "http://localhost");
    const runId = url.searchParams.get("runId") || "";
    if (runId) return runs.get(runId);
    let latest: ForecastAgentRunRecord | undefined;
    runs.forEach((record) => {
      latest = record;
    });
    return latest;
  }

  function payload(record: ForecastAgentRunRecord) {
    return {
      runId: record.runId,
      taskId: record.taskId,
      status: record.status,
      pid: record.pid,
      elapsed: elapsedSeconds(record.startedAt),
      startedAt: record.startedAt,
      lastUpdatedAt: record.lastUpdatedAt,
      runDir: record.runDir,
      outputDir: record.runDir,
      runConfig: "local-forecast-agent",
      exitCode: record.exitCode,
      command: record.command,
      outputTail: record.outputTail,
      error: record.error,
    };
  }

  return {
    name: "hormuz-local-forecast-agent",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/forecast-agent/latest", async (request, response) => {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        try {
          const text = await fs.promises.readFile("data/forecast-agent/latest-run.json", "utf8");
          sendJson(response, 200, JSON.parse(text));
        } catch (error) {
          sendJson(response, 404, {
            error: "latest local forecast-agent artifact not found",
            detail: error instanceof Error ? error.message : "unknown error",
          });
        }
      });

      server.middlewares.use("/api/forecast-agent/run/start", async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        let hasRunningRun = false;
        runs.forEach((record) => {
          if (record.status === "running") hasRunningRun = true;
        });
        if (hasRunningRun) {
          sendJson(response, 409, { error: "local forecast-agent run already in progress" });
          return;
        }
        try {
          const record = startRun();
          sendJson(response, 202, {
            ok: true,
            runId: record.runId,
            pid: record.pid,
            runDir: record.runDir,
            outputDir: record.runDir,
            taskId: record.taskId,
            startedAt: record.startedAt,
            runConfig: "local-forecast-agent",
          });
        } catch (error) {
          sendJson(response, 500, {
            error: "local forecast-agent runner failed",
            detail: error instanceof Error ? error.message : "unknown error",
          });
        }
      });

      server.middlewares.use("/api/forecast-agent/run/status", async (request, response) => {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        const record = runByRequestLocal(request);
        if (!record) {
          sendJson(response, 404, { error: "run not found" });
          return;
        }
        sendJson(response, 200, payload(record));
      });

      server.middlewares.use("/api/forecast-agent/run/trace", async (request, response) => {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        const record = runByRequestLocal(request);
        if (!record) {
          sendJson(response, 404, { error: "run not found" });
          return;
        }
        try {
          const runner = await importForecastAgentRunner();
          const trace = await runner.buildTrace(record.runDir);
          const artifact =
            readJsonIfExists(path.join(record.runDir, "run-artifact.json")) ||
            (record.status === "completed" ? await runner.buildCompletedArtifact(record.runDir) : null);
          sendJson(response, 200, {
            ...payload(record),
            trace,
            artifact,
          });
        } catch (error) {
          sendJson(response, 500, {
            error: "local forecast-agent trace parse failed",
            detail: error instanceof Error ? error.message : "unknown error",
          });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), hormuzAgentPlugin(), forecastAgentPlugin(), galaxyRunPlugin()],
  server: {
    watch: {
      ignored: DEV_SERVER_WATCH_IGNORES,
    },
  },
});
