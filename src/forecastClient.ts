// Stable API seam for forecast runs; the UI only consumes ForecastRunResponse.
import { createDemoForecastRun } from "./state/forecastStore";
import type { ForecastRunResponse, ForecastTarget } from "./types/forecast";

async function postForecast(target: ForecastTarget) {
  const response = await fetch("/api/hormuz-agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target }),
  });
  if (!response.ok) {
    throw new Error(`agent api failed: ${response.status}`);
  }
  return (await response.json()) as Partial<ForecastRunResponse>;
}

function isForecastRunResponse(value: Partial<ForecastRunResponse>): value is ForecastRunResponse {
  return Boolean(
    value.runId &&
      value.generatedAt &&
      value.scenarioDistribution &&
      Array.isArray(value.targetForecasts) &&
      Array.isArray(value.events) &&
      value.checkpoint,
  );
}

export async function runForecast(target: ForecastTarget): Promise<ForecastRunResponse> {
  await new Promise((resolve) => window.setTimeout(resolve, 850));

  try {
    const result = await postForecast(target);
    if (isForecastRunResponse(result)) return result;
  } catch {
    // The classroom demo stays deterministic when the local backend is unavailable.
  }

  return createDemoForecastRun(target);
}
