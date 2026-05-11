// Local dev proxy for the Hormuz demo agent; keeps API keys out of browser bundles.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import process from "node:process";

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
        summary: "写回 standard ForecastRunResponse checkpoint。",
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

export default defineConfig({
  plugins: [react(), hormuzAgentPlugin()],
});
