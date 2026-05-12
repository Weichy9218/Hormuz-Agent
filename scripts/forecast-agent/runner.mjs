#!/usr/bin/env node
// Independent Hormuz forecast-agent runner.
// It copies Galaxy's forecast finalization contract into this repo and emits graph-native events.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORECAST_AGENT_SCHEMA_VERSION,
  createEvent,
  eventToAction,
  isoNow,
  sanitizeText,
} from "./schema.mjs";
import {
  buildQuestionAudit,
  loadAgentContext,
  runLocalTool,
} from "./local-tools.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const defaultRunRoot = resolve(root, "data/forecast-agent/runs");
const latestPath = resolve(root, "data/forecast-agent/latest-run.json");

function repoPath(filePath) {
  return relative(root, resolve(filePath));
}

function parseArgs(argv) {
  const out = {
    runId: "",
    outputDir: "",
    startedAt: "",
    speedMs: 900,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--run-id") {
      out.runId = argv[i + 1] || out.runId;
      i += 1;
    } else if (arg === "--output-dir") {
      out.outputDir = argv[i + 1] || out.outputDir;
      i += 1;
    } else if (arg === "--started-at") {
      out.startedAt = argv[i + 1] || out.startedAt;
      i += 1;
    } else if (arg === "--speed-ms") {
      out.speedMs = Number(argv[i + 1]) || out.speedMs;
      i += 1;
    }
  }
  return out;
}

function shanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function stamp(value = new Date()) {
  return value.toISOString().replace(/\D/g, "").slice(0, 14);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function appendJsonl(path, value) {
  const previous = existsSync(path) ? await readFile(path, "utf8") : "";
  await writeFile(path, `${previous}${JSON.stringify(value)}\n`, "utf8");
}

function scenarioFromPrediction(prediction) {
  const letter = String(prediction || "B").trim().toUpperCase()[0];
  return { A: "normal", B: "controlled", C: "severe", D: "closure" }[letter] || "controlled";
}

function confidenceFromEvidence(evidenceClaims, marketPattern) {
  const directCount = evidenceClaims.filter((claim) => claim.quality?.directness === "direct").length;
  const highCount = evidenceClaims.filter((claim) => claim.confidence === "high").length;
  if (marketPattern === "pricing_closure_shock" && highCount >= 2) return "high";
  if (directCount >= 2 || highCount >= 1) return "medium";
  return "low";
}

function buildForecastPayload(context, selectedEvidence, mechanismSummary, marketResult) {
  const closureEvidence = selectedEvidence.some((claim) =>
    claim.mechanismTags?.includes("traffic_flow_down") && claim.confidence === "high",
  );
  const controlledEvidence = selectedEvidence.some((claim) =>
    claim.mechanismTags?.includes("transit_risk_up") ||
    claim.mechanismTags?.includes("market_pricing_risk_premium"),
  );
  const prediction = closureEvidence ? "C" : controlledEvidence ? "B" : "A";
  const scenario = scenarioFromPrediction(prediction);
  const confidence = confidenceFromEvidence(selectedEvidence, marketResult.pricingPattern);
  const keyEvidenceItems = selectedEvidence
    .filter((claim) => claim.polarity !== "counter")
    .slice(0, 4)
    .map((claim) => sanitizeText(claim.claim, 180));
  const counterEvidenceItems = selectedEvidence
    .filter((claim) => claim.polarity === "counter")
    .slice(0, 3)
    .map((claim) => sanitizeText(claim.claim, 180));
  const openConcerns = [
    "授权 AIS / PortWatch 指标仍需确认是否出现连续 traffic stop。",
    "官方 advisory wording 是否升级为 avoidance / closure-class restriction。",
  ];
  const rationale =
    scenario === "controlled"
      ? "Fresh advisory and market-risk evidence support elevated controlled disruption, while verified closure-style traffic stop is still missing."
      : scenario === "severe"
        ? "Traffic-flow evidence and advisory pressure point toward material disruption, but sustained closure is not yet verified."
        : "Evidence remains closer to normal transit than a closure-class disruption.";

  return {
    prediction,
    scenario,
    confidence,
    rationale,
    keyEvidenceItems,
    counterEvidenceItems,
    openConcerns,
    temporalNotes: [
      `Question horizon: ${context.question.metadata?.horizon || "7d"}.`,
      `Market pattern: ${marketResult.pricingPattern}.`,
      mechanismSummary,
    ],
  };
}

function buildCheckpoint(runId, payload, selectedEvidence, marketResult) {
  return {
    checkpointId: `agent-cp-${runId.split("__")[0].replace(/\D/g, "").slice(-8)}`,
    revisionReason: payload.rationale,
    finalPrediction: payload.prediction,
    reusedState: {
      activeEvidenceIds: selectedEvidence.map((claim) => claim.evidenceId),
      staleEvidenceIds: selectedEvidence
        .filter((claim) => claim.quality?.freshness === "stale")
        .map((claim) => claim.evidenceId),
      pendingSourceIds: ["ais-flow-pending", "gold-pending", "usdcnh-pending"],
    },
    nextWatch: [
      "UKMTO / JMIC / MARAD 是否出现 avoidance、closure 或 threat wording 升级。",
      "PortWatch / AIS proxy 是否出现连续多日 transit calls 非线性下降。",
      `Market pricing pattern 是否从 ${marketResult.pricingPattern} 升级为 closure shock。`,
    ],
  };
}

export async function readSafeEvents(runDir) {
  const eventsPath = resolve(runDir, "events.jsonl");
  if (!existsSync(eventsPath)) return [];
  const text = await readFile(eventsPath, "utf8");
  const lines = text.split(/\r?\n/);
  const events = [];
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      if (index !== lines.length - 1) throw error;
    }
  }
  return events;
}

export async function buildTrace(runDir) {
  const events = normalizeEventStatuses(await readSafeEvents(runDir));
  return {
    traceId: `trace-${runDir.split("/").at(-1) || "forecast-agent"}`,
    runDir: repoPath(runDir),
    generatedAt: isoNow(),
    actions: events.map((event, index) => eventToAction(event, index)),
    events,
    graph: buildFlowGraph(events),
  };
}

function normalizeEventStatuses(events) {
  const completedToolCalls = new Set(
    events
      .filter((event) => event.type === "tool_result" && event.toolCallId)
      .map((event) => event.toolCallId),
  );
  const runCompleted = events.some((event) => event.type === "run_completed" || event.type === "run_failed");
  return events.map((event) => {
    if (event.type === "tool_call" && completedToolCalls.has(event.toolCallId)) {
      return { ...event, status: "success", current: false };
    }
    if (event.type === "run_started" && runCompleted) {
      return { ...event, status: "success", current: false };
    }
    return event;
  });
}

function buildFlowGraph(events) {
  return {
    nodes: events.map((event) => ({
      id: event.eventId,
      type: "forecastAgentAction",
      lane: event.lane,
      data: {
        eventType: event.type,
        graphRole: event.graphRole,
        title: event.title,
        summary: event.summary,
        status: event.status,
        toolName: event.toolName,
        current: event.current,
      },
    })),
    edges: events.flatMap((event) =>
      (event.parentIds || []).map((parentId) => ({
        id: `${parentId}->${event.eventId}`,
        source: parentId,
        target: event.eventId,
        label:
          event.type === "tool_result"
            ? "returns"
            : event.type === "judgement_updated"
              ? "updates"
              : event.type === "checkpoint_written"
                ? "persists"
                : "depends",
      })),
    ),
  };
}

export async function buildCompletedArtifact(runDir) {
  const [trace, finalForecast, checkpoint] = await Promise.all([
    buildTrace(runDir),
    readJsonIfExists(resolve(runDir, "final_forecast.json")),
    readJsonIfExists(resolve(runDir, "checkpoint.json")),
  ]);
  const runMeta = await readJsonIfExists(resolve(runDir, "run-meta.json"));
  return {
    schemaVersion: FORECAST_AGENT_SCHEMA_VERSION,
    runMeta,
    trace,
    finalForecast,
    checkpoint,
  };
}

async function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8"));
}

async function emit(runDir, event) {
  await appendJsonl(resolve(runDir, "events.jsonl"), event);
  await writeFile(resolve(runDir, "trace.json"), JSON.stringify(await buildTrace(runDir), null, 2), "utf8");
}

export async function runForecastAgent(args) {
  const startedAt = args.startedAt || isoNow();
  const date = shanghaiDate(new Date(startedAt));
  const runId = args.runId || `${date}-${stamp(new Date(startedAt))}__local-forecast-agent`;
  const runDir = args.outputDir || resolve(defaultRunRoot, date, runId);
  await mkdir(runDir, { recursive: true });

  const context = await loadAgentContext();
  const meta = {
    runId,
    taskId: context.question.task_id,
    status: "running",
    runner: "hormuz-local-forecast-agent",
    schemaVersion: FORECAST_AGENT_SCHEMA_VERSION,
    startedAt,
    lastUpdatedAt: startedAt,
    runDir: repoPath(runDir),
    questionPath: "data/galaxy/hormuz-daily-question.jsonl",
    sourceArtifacts: [
      "data/generated/canonical_inputs.json",
      "data/registry/sources.json",
      "data/galaxy/latest-run.json",
    ],
  };
  await writeFile(resolve(runDir, "run-meta.json"), JSON.stringify(meta, null, 2), "utf8");

  let seq = 0;
  const started = createEvent({
    runId,
    sequence: seq++,
    type: "run_started",
    lane: "question",
    title: "Local forecast agent started",
    summary: "Independent Hormuz forecast-agent runtime loaded source-backed case artifacts.",
    status: "running",
    current: true,
  });
  await emit(runDir, started);
  await delay(args.speedMs);

  const audit = buildQuestionAudit(context);
  const questionEvent = createEvent({
    runId,
    sequence: seq++,
    type: "question_loaded",
    lane: "question",
    title: "Question loaded",
    summary: `${audit.taskId} · horizon ${audit.horizon} · options ${Object.entries(audit.options).map(([k, v]) => `${k}:${v}`).join(", ")}`,
    parentIds: [started.eventId],
    status: "success",
  });
  await emit(runDir, questionEvent);
  await delay(args.speedMs);

  const turnEvent = createEvent({
    runId,
    sequence: seq++,
    type: "agent_turn",
    lane: "source",
    title: "Plan evidence routes",
    summary: "Plan: audit official advisories, traffic proxy, and market pricing pattern before calling record_forecast.",
    parentIds: [questionEvent.eventId],
    status: "success",
  });
  await emit(runDir, turnEvent);
  await delay(args.speedMs);

  const toolSpecs = [
    {
      name: "search_evidence",
      lane: "search",
      args: {
        topic: "hormuz",
        query: "official advisory Hormuz transit risk",
        sourceIds: ["official-advisory"],
        mechanismTags: ["transit_risk_up", "mine_or_swarm_risk_up"],
        limit: 4,
      },
    },
    {
      name: "read_source_bundle",
      lane: "read",
      args: {
        sourceIds: ["official-advisory", "imf-portwatch-hormuz", "imo-hormuz-monthly"],
        limit: 6,
      },
    },
    {
      name: "read_market_pattern",
      lane: "read",
      args: {},
    },
  ];

  const toolCalls = [];
  for (const spec of toolSpecs) {
    const call = createEvent({
      runId,
      sequence: seq++,
      type: "tool_call",
      lane: spec.lane,
      title: spec.name,
      summary: spec.name === "read_market_pattern" ? "Read audited market pricing pattern." : sanitizeText(spec.args.query || JSON.stringify(spec.args), 180),
      parentIds: [turnEvent.eventId],
      status: "running",
      toolName: spec.name,
      toolCallId: `${runId}-tool-${toolCalls.length + 1}`,
      args: spec.args,
      current: true,
    });
    toolCalls.push({ spec, call });
    await emit(runDir, call);
  }
  await delay(args.speedMs);

  const toolResults = [];
  for (const { spec, call } of toolCalls) {
    const result = await runLocalTool(context, spec.name, spec.args);
    const resultEvent = createEvent({
      runId,
      sequence: seq++,
      type: "tool_result",
      lane: spec.lane === "search" ? "search" : "read",
      title: `${spec.name} result`,
      summary: result.summary || `Completed ${spec.name}.`,
      parentIds: [call.eventId],
      status: "success",
      toolName: spec.name,
      toolCallId: call.toolCallId,
      result,
    });
    toolResults.push({ spec, result, event: resultEvent });
    await emit(runDir, resultEvent);
  }
  await delay(args.speedMs);

  const selectedIds = new Set([
    ...toolResults.flatMap((item) => item.result.claimIds || []),
    ...(toolResults.find((item) => item.spec.name === "read_market_pattern")?.result.evidenceIds || []),
  ]);
  const selectedEvidence = context.evidenceClaims
    .filter((claim) => selectedIds.has(claim.evidenceId))
    .sort((a, b) => b.confidence.localeCompare(a.confidence))
    .slice(0, 5);

  const evidenceEvents = [];
  for (const claim of selectedEvidence) {
    const evidenceEvent = createEvent({
      runId,
      sequence: seq++,
      type: "evidence_added",
      lane: "evidence",
      title: claim.polarity === "counter" ? "Counter evidence retained" : "Evidence claim accepted",
      summary: claim.claim,
      parentIds: toolResults.map((item) => item.event.eventId),
      status: "success",
      sourceObservationIds: claim.sourceObservationIds,
      evidenceIds: [claim.evidenceId],
      mechanismTags: claim.mechanismTags,
    });
    evidenceEvents.push(evidenceEvent);
    await emit(runDir, evidenceEvent);
  }
  await delay(args.speedMs);

  const mechanismTags = [...new Set(selectedEvidence.flatMap((claim) => claim.mechanismTags || []))];
  const mechanismSummary = `Mapped mechanisms: ${mechanismTags.join(", ") || "none"}.`;
  const mechanismEvent = createEvent({
    runId,
    sequence: seq++,
    type: "mechanism_mapped",
    lane: "mechanism",
    title: "Evidence -> mechanism",
    summary: mechanismSummary,
    parentIds: evidenceEvents.map((event) => event.eventId),
    status: "success",
    evidenceIds: selectedEvidence.map((claim) => claim.evidenceId),
    mechanismTags,
  });
  await emit(runDir, mechanismEvent);
  await delay(args.speedMs);

  const marketResult = toolResults.find((item) => item.spec.name === "read_market_pattern")?.result || {};
  const forecastPayload = buildForecastPayload(context, selectedEvidence, mechanismSummary, marketResult);
  const judgementEvent = createEvent({
    runId,
    sequence: seq++,
    type: "judgement_updated",
    lane: "judgement",
    title: "Judgement delta",
    summary: forecastPayload.rationale,
    parentIds: [mechanismEvent.eventId],
    status: "success",
    evidenceIds: selectedEvidence.map((claim) => claim.evidenceId),
    mechanismTags,
    forecastPayload,
  });
  await emit(runDir, judgementEvent);
  await delay(args.speedMs);

  const finalEvent = createEvent({
    runId,
    sequence: seq++,
    type: "final_forecast",
    lane: "forecast",
    title: "record_forecast",
    summary: `Prediction ${forecastPayload.prediction} (${forecastPayload.scenario}); confidence ${forecastPayload.confidence}.`,
    parentIds: [judgementEvent.eventId],
    status: "success",
    toolName: "record_forecast",
    toolCallId: `${runId}-record-forecast`,
    forecastPayload,
  });
  await writeFile(resolve(runDir, "final_forecast.json"), JSON.stringify(forecastPayload, null, 2), "utf8");
  await emit(runDir, finalEvent);
  await delay(args.speedMs);

  const checkpoint = buildCheckpoint(runId, forecastPayload, selectedEvidence, marketResult);
  const checkpointEvent = createEvent({
    runId,
    sequence: seq++,
    type: "checkpoint_written",
    lane: "checkpoint",
    title: "Checkpoint written",
    summary: checkpoint.revisionReason,
    parentIds: [finalEvent.eventId],
    status: "success",
    evidenceIds: checkpoint.reusedState.activeEvidenceIds,
    mechanismTags,
    checkpoint,
  });
  await writeFile(resolve(runDir, "checkpoint.json"), JSON.stringify(checkpoint, null, 2), "utf8");
  await emit(runDir, checkpointEvent);

  const completedAt = isoNow();
  const completeEvent = createEvent({
    runId,
    sequence: seq++,
    type: "run_completed",
    lane: "checkpoint",
    title: "Run completed",
    summary: "Local forecast agent completed with graph-native trace, final forecast, and checkpoint.",
    parentIds: [checkpointEvent.eventId],
    status: "success",
    completedAt,
  });
  await emit(runDir, completeEvent);

  const completedMeta = {
    ...meta,
    status: "completed",
    completedAt,
    lastUpdatedAt: completedAt,
    finalPrediction: forecastPayload.prediction,
    confidence: forecastPayload.confidence,
  };
  await writeFile(resolve(runDir, "run-meta.json"), JSON.stringify(completedMeta, null, 2), "utf8");
  const artifact = await buildCompletedArtifact(runDir);
  await writeFile(resolve(runDir, "run-artifact.json"), JSON.stringify(artifact, null, 2), "utf8");
  await mkdir(dirname(latestPath), { recursive: true });
  await writeFile(latestPath, JSON.stringify(artifact, null, 2), "utf8");

  return {
    runId,
    runDir,
    artifactPath: relative(root, resolve(runDir, "run-artifact.json")),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runForecastAgent(parseArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch(async (error) => {
      const args = parseArgs(process.argv.slice(2));
      if (args.outputDir) {
        await mkdir(args.outputDir, { recursive: true });
        await appendJsonl(
          resolve(args.outputDir, "events.jsonl"),
          createEvent({
            runId: args.runId || "local-forecast-agent-failed",
            sequence: 999,
            type: "run_failed",
            lane: "checkpoint",
            title: "Run failed",
            summary: error instanceof Error ? error.message : String(error),
            status: "failed",
          }),
        );
      }
      console.error(error);
      process.exit(1);
    });
}
