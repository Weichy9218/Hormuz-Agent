// Audits Polymarket reference questions and blocks external market data from forecast evidence.
import { readFile } from "node:fs/promises";

const polymarketUrl = new URL("../data/external/polymarket_questions.json", import.meta.url);
const evidenceClaimsUrl = new URL("../data/evidence/evidence_claims.jsonl", import.meta.url);
const canonicalInputsUrl = new URL("../data/generated/canonical_inputs.json", import.meta.url);

const forbiddenForecastSourceIds = ["polymarket-curated", "events-curated", "gdelt-news"];

function parseJsonl(text, label) {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { record: JSON.parse(line), line: index + 1 };
      } catch (error) {
        throw new Error(`${label}:${index + 1}: invalid JSON (${error.message})`);
      }
    });
}

function requireField(record, index, field) {
  if (record[field] === undefined || record[field] === null || record[field] === "") {
    throw new Error(`polymarket_questions.json:${index + 1}: missing ${field}`);
  }
}

function collectValues(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectValues(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectValues(item, out);
    return out;
  }
  if (typeof value === "string") out.push(value);
  return out;
}

const polymarketRefs = JSON.parse(await readFile(polymarketUrl, "utf8"));
if (!Array.isArray(polymarketRefs)) {
  throw new Error("polymarket_questions.json: root must be an array");
}

for (const [index, ref] of polymarketRefs.entries()) {
  for (const field of ["question_id", "question_url", "resolution_criteria", "retrieved_at", "caveat"]) {
    requireField(ref, index, field);
  }
  if (!ref.caveat.includes("External market, not our forecast")) {
    throw new Error(`polymarket_questions.json:${index + 1}: caveat must include "External market, not our forecast"`);
  }
  if (ref.source !== "polymarket") {
    throw new Error(`polymarket_questions.json:${index + 1}: source must be polymarket`);
  }
  if (!Array.isArray(ref.outcomes) || ref.outcomes.length === 0) {
    throw new Error(`polymarket_questions.json:${index + 1}: outcomes must be a non-empty array`);
  }
  for (const [outcomeIndex, outcome] of ref.outcomes.entries()) {
    if (!outcome.outcome_id) {
      throw new Error(`polymarket_questions.json:${index + 1}: outcome ${outcomeIndex + 1} missing outcome_id`);
    }
    if (
      outcome.last_price !== null &&
      outcome.last_price !== undefined &&
      (!Number.isFinite(Number(outcome.last_price)) || Number(outcome.last_price) < 0 || Number(outcome.last_price) > 1)
    ) {
      throw new Error(
        `polymarket_questions.json:${index + 1}: outcome ${outcome.outcome_id} last_price must be null or 0-1`,
      );
    }
  }
}

const evidenceClaims = parseJsonl(await readFile(evidenceClaimsUrl, "utf8"), "evidence_claims.jsonl");
for (const { record, line } of evidenceClaims) {
  const values = collectValues(record);
  for (const sourceId of forbiddenForecastSourceIds) {
    if (values.includes(sourceId)) {
      throw new Error(`evidence_claims.jsonl:${line}: forecast evidence must not reference ${sourceId}`);
    }
  }
}

const canonicalInputsText = await readFile(canonicalInputsUrl, "utf8");
const canonicalInputs = JSON.parse(canonicalInputsText);
const canonicalValues = collectValues(canonicalInputs);
for (const sourceId of forbiddenForecastSourceIds) {
  if (canonicalValues.includes(sourceId)) {
    throw new Error(`canonical_inputs.json: forecast canonical inputs must not reference ${sourceId}`);
  }
}

console.log(
  `audit:polymarket passed: ${polymarketRefs.length} external market refs are caveated and blocked from forecast evidence.`,
);
