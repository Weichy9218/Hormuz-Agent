// Numeric forecast helpers shared by the Forecast page and cards.
import type { GalaxyQuestionRow } from "../../types/galaxy";

export function parseForecastNumber(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function isNumericForecastQuestion(question?: GalaxyQuestionRow | null, prediction?: unknown) {
  const hasLocalSeriesTarget = Boolean(
    question?.metadata?.target_series_id ?? question?.metadata?.target_series,
  );
  const hasNumericUnit = Boolean(question?.metadata?.unit);
  return question?.metadata?.question_kind === "brent_weekly_high" ||
    (hasLocalSeriesTarget && (hasNumericUnit || parseForecastNumber(prediction) != null));
}
