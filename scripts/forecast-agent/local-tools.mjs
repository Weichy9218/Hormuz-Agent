// Local evidence tools for the Hormuz forecast agent.
// Tools read only source-backed artifacts and emit reviewer-safe summaries.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeText } from "./schema.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
}

async function readJsonl(relativePath) {
  const text = await readFile(resolve(root, relativePath), "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function sourceName(sourceId, sources) {
  return sources.find((source) => source.id === sourceId)?.name || sourceId;
}

function qualityScore(claim) {
  const confidence = { high: 3, medium: 2, low: 1 }[claim.confidence] || 0;
  const freshness = { fresh: 3, lagging: 2, stale: 1 }[claim.quality?.freshness] || 0;
  const directness = { direct: 3, proxy: 2, context: 1 }[claim.quality?.directness] || 0;
  return confidence * 3 + freshness * 2 + directness;
}

export async function loadAgentContext() {
  const [canonicalInputs, sourceRegistry, questionRows, latestGalaxy] = await Promise.all([
    readJson("data/generated/canonical_inputs.json"),
    readJson("data/registry/sources.json"),
    readJsonl("data/galaxy/hormuz-daily-question.jsonl"),
    readJson("data/galaxy/latest-run.json").catch(() => null),
  ]);

  const question = questionRows[0] || {
    task_id: "hormuz-traffic-risk-local",
    task_question: "Hormuz scenario forecast",
    task_description: "Local Hormuz forecast agent run.",
  };

  return {
    question,
    sourceRegistry,
    sourceObservations: canonicalInputs.sourceObservations || [],
    evidenceClaims: canonicalInputs.evidenceClaims || [],
    marketRead: canonicalInputs.marketRead,
    latestGalaxy,
  };
}

export function buildQuestionAudit(context) {
  const taskText = context.question.task_question || "";
  const options = context.question.metadata?.scenario_options || {
    A: "normal",
    B: "controlled",
    C: "severe",
    D: "closure",
  };
  return {
    taskId: context.question.task_id,
    horizon: context.question.metadata?.horizon || "7d",
    options,
    summary: sanitizeText(
      taskText.split('"""')[1] ||
        "Predict which Hormuz transit-risk scenario best describes the case state.",
      360,
    ),
  };
}

export async function searchEvidence(context, args) {
  const topic = args.topic || "hormuz";
  const tags = Array.isArray(args.mechanismTags) ? args.mechanismTags : [];
  const sourceIds = new Set(Array.isArray(args.sourceIds) ? args.sourceIds : []);
  const claims = context.evidenceClaims
    .filter((claim) => {
      const haystack = [
        claim.claim,
        ...(claim.mechanismTags || []),
        ...(claim.affects || []),
        claim.polarity,
      ]
        .join(" ")
        .toLowerCase();
      const topicHit = haystack.includes(String(topic).toLowerCase()) || topic === "hormuz";
      const tagHit = tags.length === 0 || tags.some((tag) => claim.mechanismTags?.includes(tag));
      const sourceHit =
        sourceIds.size === 0 ||
        claim.sourceObservationIds?.some((obsId) => {
          const obs = context.sourceObservations.find((item) => item.observationId === obsId);
          return obs && sourceIds.has(obs.sourceId);
        });
      return topicHit && tagHit && sourceHit;
    })
    .sort((a, b) => qualityScore(b) - qualityScore(a))
    .slice(0, args.limit || 4);

  return {
    query: sanitizeText(args.query || `${topic} ${tags.join(" ")}`),
    claimIds: claims.map((claim) => claim.evidenceId),
    summary: claims.length
      ? claims.map((claim) => sanitizeText(claim.claim, 120)).join(" | ")
      : "No source-backed evidence claim matched this search route.",
  };
}

export async function readSourceBundle(context, args) {
  const requested = new Set(Array.isArray(args.sourceIds) ? args.sourceIds : []);
  const observations = context.sourceObservations
    .filter((obs) => requested.size === 0 || requested.has(obs.sourceId))
    .slice(0, args.limit || 6)
    .map((obs) => ({
      observationId: obs.observationId,
      sourceId: obs.sourceId,
      sourceName: sourceName(obs.sourceId, context.sourceRegistry),
      title: obs.title,
      summary: sanitizeText(obs.summary, 220),
      freshness: obs.freshness,
      licenseStatus: obs.licenseStatus,
      sourceUrl: obs.sourceUrl,
      retrievedAt: obs.retrievedAt,
    }));

  return {
    observationIds: observations.map((obs) => obs.observationId),
    summary: observations
      .map((obs) => `${obs.sourceName}: ${sanitizeText(obs.summary, 120)}`)
      .join(" | "),
    observations,
  };
}

export async function readMarketPattern(context) {
  return {
    pricingPattern: context.marketRead?.pricingPattern || "mixed",
    evidenceIds: context.marketRead?.evidenceIds || [],
    asOf: context.marketRead?.asOf,
    caveat: context.marketRead?.caveat,
    summary: sanitizeText(context.marketRead?.summary || "Market read unavailable.", 300),
  };
}

export async function runLocalTool(context, name, args) {
  if (name === "search_evidence") return searchEvidence(context, args);
  if (name === "read_source_bundle") return readSourceBundle(context, args);
  if (name === "read_market_pattern") return readMarketPattern(context, args);
  throw new Error(`unknown local forecast-agent tool: ${name}`);
}
