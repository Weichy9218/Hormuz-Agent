// Local dev proxy for the Hormuz demo agent; keeps API keys out of browser bundles.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
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
}

interface ApiEnv {
  apiKey: string;
  baseUrl: string;
}

type GalaxyRunStatus = "running" | "completed" | "failed";
type ForecastAgentRunStatus = "running" | "completed" | "failed";

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
  error?: string;
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
      model: "gpt-5.4",
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

function shanghaiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildTaskId(date: string) {
  return `hormuz-traffic-risk-${date}`;
}

function buildRunId(date: string, startedAt: string, taskId: string) {
  const stamp = startedAt.replace(/\D/g, "").slice(0, 14) || Date.now().toString();
  return `${date}-${stamp}__${taskId}`;
}

function tailText(text: string, maxLength = 5000) {
  return text.length > maxLength ? text.slice(-maxLength) : text;
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
  if (record.status !== "running") return record;
  const artifact = readJsonIfExists(path.join(record.outputDir, "run-artifact.json"));
  if (artifact?.runMeta && typeof artifact.runMeta === "object") {
    const meta = artifact.runMeta as Record<string, unknown>;
    if (meta.status === "success" || meta.status === "failed") {
      record.status = meta.status === "success" ? "completed" : "failed";
      record.exitCode = meta.status === "success" ? 0 : record.exitCode;
      record.lastUpdatedAt = String(meta.completedAt || meta.forecastedAt || record.lastUpdatedAt);
    }
  }
  return record;
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
    outputTail: current.outputTail,
    error: current.error,
  };
}

function runByRequest(
  request: import("node:http").IncomingMessage,
  runs: Map<string, GalaxyRunRecord>,
) {
  const url = new URL(request.url || "", "http://localhost");
  const runId = url.searchParams.get("runId") || "";
  if (runId) return runs.get(runId);
  let latest: GalaxyRunRecord | undefined;
  runs.forEach((record) => {
    latest = record;
  });
  return latest;
}

async function liveActionTrace(record: GalaxyRunRecord) {
  const scriptPath = path.resolve(process.cwd(), "scripts/run-galaxy-hormuz.mjs");
  const scriptUrl = pathToFileURL(scriptPath);
  scriptUrl.searchParams.set("mtime", String(Date.now()));
  const mod = (await import(scriptUrl.href)) as {
    buildActionTrace: (input: {
      taskDir: string;
      question: Record<string, unknown>;
      summaryRecord?: Record<string, unknown>;
      finalize?: Record<string, unknown>;
      stats?: Record<string, unknown>;
      includeTerminal?: boolean;
    }) => Promise<unknown>;
  };
  const questionPath = path.resolve(process.cwd(), "data/galaxy/hormuz-daily-question.jsonl");
  const question = readJsonIfExists(questionPath) || {
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
    summaryRecord,
    stats,
    includeTerminal: recordStatus(record).status !== "running",
  });
}

function galaxyRunPlugin() {
  const runs = new Map<string, GalaxyRunRecord>();

  function startRun() {
    const date = shanghaiDate();
    const taskId = buildTaskId(date);
    const startedAt = new Date().toISOString();
    const runId = buildRunId(date, startedAt, taskId);
    const outputDir = path.join(GALAXY_RUNS_ROOT, date, runId);
    const runDir = path.join(outputDir, taskId);
    fs.mkdirSync(outputDir, { recursive: true });

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
      "hormuz_test.yaml",
    ];
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GALAXY_REPO,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const record: GalaxyRunRecord = {
      runId,
      taskId,
      pid: child.pid ?? null,
      startedAt,
      lastUpdatedAt: startedAt,
      outputDir,
      runDir,
      date,
      runConfig: "hormuz_test.yaml",
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
      recordStatus(record);
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
          const text = await fs.promises.readFile("data/galaxy/latest-run.json", "utf8");
          sendJson(response, 200, JSON.parse(text));
        } catch (error) {
          sendJson(response, 404, {
            error: "latest galaxy artifact not found",
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
        if (hasRunningRun) {
          sendJson(response, 409, { error: "galaxy run already in progress" });
          return;
        }

        try {
          const record = startRun();
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
          const actionTrace = await liveActionTrace(record);
          sendJson(response, 200, {
            runId: record.runId,
            status: recordStatus(record).status,
            pid: record.pid,
            elapsed: elapsedSeconds(record.startedAt),
            lastUpdatedAt: record.lastUpdatedAt,
            runDir: record.runDir,
            outputDir: record.outputDir,
            trace: actionTrace,
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
});
