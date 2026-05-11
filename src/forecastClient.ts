// Stable API seam for forecast runs; the UI only consumes AgentRunResult.
import { createDemoForecastRun } from "./state/forecastStore";
import type {
  ForecastRunResponse,
  ForecastTarget,
  ScenarioId,
  TargetForecast,
} from "./types/forecast";
import type { AgentRunEvent } from "./types/agentEvents";

export interface AgentRunResult {
  runId: string;
  events: AgentRunEvent[];
  finalScenario: Record<ScenarioId, number>;
  targetForecasts: TargetForecast[];
  checkpoint?: {
    checkpointId: string;
    revisionReason: string;
    nextWatch: string[];
  };
  generatedAt?: string;
}

async function postForecast(input: {
  horizon: "24h" | "7d" | "14d" | "30d";
  targets: ForecastTarget[];
}) {
  const response = await fetch("/api/hormuz-agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`agent api failed: ${response.status}`);
  }
  return (await response.json()) as Partial<AgentRunResult>;
}

function isAgentRunResult(value: Partial<AgentRunResult>): value is AgentRunResult {
  return Boolean(
    value.runId &&
      value.finalScenario &&
      Array.isArray(value.targetForecasts) &&
      Array.isArray(value.events),
  );
}

function toForecastRunResponse(result: AgentRunResult): ForecastRunResponse {
  return {
    runId: result.runId,
    generatedAt: result.generatedAt ?? new Date().toISOString(),
    scenarioDistribution: result.finalScenario,
    targetForecasts: result.targetForecasts,
    events: result.events,
    checkpoint: result.checkpoint ?? {
      checkpointId: "no-checkpoint",
      revisionReason: "No checkpoint returned by agent run.",
      nextWatch: [],
    },
  };
}

export async function runHormuzAgent(input: {
  horizon: "24h" | "7d" | "14d" | "30d";
  targets: ForecastTarget[];
}): Promise<AgentRunResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 850));

  try {
    const result = await postForecast(input);
    if (isAgentRunResult(result)) return result;
  } catch {
    // The classroom demo stays deterministic when the local backend is unavailable.
  }

  const fallback = createDemoForecastRun(input.targets[0] ?? "brent");
  return {
    runId: fallback.runId,
    generatedAt: fallback.generatedAt,
    events: fallback.events,
    finalScenario: fallback.scenarioDistribution,
    targetForecasts: fallback.targetForecasts,
    checkpoint: fallback.checkpoint,
  };
}

export async function runForecast(target: ForecastTarget): Promise<ForecastRunResponse> {
  const result = await runHormuzAgent({
    horizon: "7d",
    targets: [target],
  });
  return toForecastRunResponse(result);
}
