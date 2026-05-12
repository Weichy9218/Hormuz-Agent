#!/usr/bin/env node
// Builds the checked Forecast-page demo artifact without invoking an LLM run.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const questionPath = resolve(root, "data/galaxy/hormuz-daily-question.jsonl");
const latestArtifactPath = resolve(root, "data/galaxy/latest-run.json");
const fredCsvPath = resolve(root, "data/normalized/market/fred_series.csv");
const generatedAt = "2026-05-13T00:00:00+08:00";
const questionDate = "2026-05-13";
const runDir = "data/galaxy/runs/demo/hormuz-brent-weekly-high-demo";
const outputDir = "data/galaxy/runs/demo";

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"" && line[index + 1] === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

async function readBrentSeries() {
  const rows = (await readFile(fredCsvPath, "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(parseCsvLine);
  const header = rows.shift() ?? [];
  const column = (name) => header.indexOf(name);
  const seriesIndex = column("series_id");
  const targetIndex = column("target");
  const dateIndex = column("date");
  const valueIndex = column("value");
  const retrievedAtIndex = column("retrieved_at");
  const sourceUrlIndex = column("source_url");
  const points = [];
  let retrievedAt = generatedAt;
  let sourceUrl = "https://fred.stlouisfed.org/series/DCOILBRENTEU";

  for (const row of rows) {
    if (row[seriesIndex] !== "DCOILBRENTEU" || row[targetIndex] !== "brent") continue;
    const value = Number.parseFloat(row[valueIndex] ?? "");
    if (!Number.isFinite(value)) continue;
    points.push({ date: row[dateIndex], value });
    retrievedAt = row[retrievedAtIndex] || retrievedAt;
    sourceUrl = row[sourceUrlIndex] || sourceUrl;
  }

  points.sort((a, b) => a.date.localeCompare(b.date));
  return { points, retrievedAt, sourceUrl };
}

function buildQuestion() {
  const taskQuestion =
    `You are an agent that can predict future numeric market outcomes. The event to be predicted:\n` +
    `\"\"\"\n` +
    `During the trading week containing 2026-05-13 (UTC+8), what will be the highest daily Brent crude oil spot price, ` +
    `in USD per barrel, reported by FRED series DCOILBRENTEU?\n` +
    `\"\"\"\n\n` +
    `Resolve this by taking the maximum released FRED DCOILBRENTEU daily observation whose observation date falls inside the week. ` +
    `Ignore weekends or holidays with no released observation.\n\n` +
    `Your goal is to make a numeric prediction.\n\n` +
    `IMPORTANT: Your final answer MUST end with this exact format:\n` +
    `\\boxed{number}\n\n` +
    `The number must be USD/bbl rounded to two decimals. Do not use any other final format.`;

  return {
    task_id: "hormuz-brent-weekly-high-demo",
    task_question: taskQuestion,
    task_description:
      "Demo fixture for the Forecast page numeric surface. Resolution source is FRED series DCOILBRENTEU; Hormuz evidence may inform risk premium, but Market data is evidence input only and must be separated from unresolved maritime-flow claims.",
    metadata: {
      question_kind: "brent_weekly_high",
      target_series_id: "DCOILBRENTEU",
      target_series: "DCOILBRENTEU",
      target: "brent",
      unit: "USD/bbl",
      resolution_window: "weekly",
      resolution_window_detail: {
        start_date: "2026-05-11",
        end_date: "2026-05-15",
        timezone: "UTC+8",
      },
      case_id: "hormuz",
      generated_for_date: questionDate,
      timezone: "UTC+8",
      horizon: "this_week",
      source_boundary: [
        "fred-market",
        "official-advisory",
        "public-news-context",
        "ais-flow-pending",
      ],
    },
  };
}

function truncateText(text, limit = 4096) {
  const value = String(text ?? "");
  if (value.length <= limit) {
    return { text: value, isTruncated: false, fullLength: value.length };
  }
  return { text: `${value.slice(0, limit)}\n...`, isTruncated: true, fullLength: value.length };
}

function rawPreview(kind, title, text, extra = {}) {
  return {
    kind,
    title,
    ...truncateText(text),
    rawFilePath: "data/galaxy/latest-run.json",
    ...extra,
  };
}

function action(input) {
  return {
    actionId: input.actionId,
    index: input.index,
    at: `T+00:${String(input.index * 7).padStart(2, "0")}`,
    parentActionIds: input.parentActionIds ?? [],
    lane: input.lane,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    status: "success",
    ...input.extra,
  };
}

function graphLaneForAction(item) {
  if (item.kind === "question") return "question";
  if (item.kind === "tool_call" && item.toolName === "search_web") return "search";
  if (item.kind === "tool_result" || item.kind === "artifact_read" || item.kind === "tool_call") return "read";
  if (item.kind === "final_forecast") return "forecast";
  if (item.kind === "checkpoint") return "checkpoint";
  return "evidence";
}

function eventTypeForAction(item) {
  if (item.kind === "question") return "question_loaded";
  if (item.kind === "tool_call") return "tool_call";
  if (item.kind === "tool_result" || item.kind === "artifact_read") return "tool_result";
  if (item.kind === "final_forecast") return "final_forecast";
  if (item.kind === "checkpoint") return "checkpoint_written";
  return "agent_turn";
}

function edgeLabelForAction(item) {
  if (item.kind === "tool_call") return "calls";
  if (item.kind === "tool_result" || item.kind === "artifact_read") return "returns";
  if (item.kind === "final_forecast") return "records";
  if (item.kind === "checkpoint") return "persists";
  return "continues";
}

function buildActionGraph(actions) {
  const byId = new Map(actions.map((item) => [item.actionId, item]));
  return {
    nodes: actions.map((item) => ({
      id: item.actionId,
      type: "forecastAgentAction",
      lane: graphLaneForAction(item),
      data: {
        eventType: eventTypeForAction(item),
        graphRole: item.evidenceRole ?? item.kind,
        title: item.title,
        summary: item.summary,
        status: item.status,
        toolName: item.toolName,
        current: false,
        terminal: item.kind === "final_forecast",
        criticalPath: Boolean(item.criticalPath),
        criticalReason: item.criticalReason,
      },
    })),
    edges: actions.flatMap((item) =>
      (item.parentActionIds ?? [])
        .filter((parentId) => byId.has(parentId))
        .map((parentId) => ({
          id: `${parentId}->${item.actionId}`,
          source: parentId,
          target: item.actionId,
          label: edgeLabelForAction(item),
          criticalPath: Boolean(item.criticalPath && byId.get(parentId)?.criticalPath),
        })),
    ),
  };
}

function markCritical(actions, ids, reason) {
  for (const item of actions) {
    if (!ids.has(item.actionId)) continue;
    item.criticalPath = true;
    item.criticalReason ||= reason;
  }
}

function buildTrace(question, brent) {
  const latest = brent.points.at(-1);
  const recent = brent.points.slice(-20);
  const recentHigh = Math.max(...recent.map((point) => point.value));
  const recentLow = Math.min(...recent.map((point) => point.value));
  const predictionValue = 66.2;
  const rangeRelation =
    predictionValue >= recentLow && predictionValue <= recentHigh
      ? "inside the local recent observed band"
      : `outside the local recent observed band ${recentLow.toFixed(2)}-${recentHigh.toFixed(2)}; keep it only as a fixed UI fixture value`;
  const finalPayload = {
    prediction: "66.20 USD/bbl",
    confidence: "medium",
    rationale:
      `[demo] 66.20 USD/bbl is a fixed UI demo forecast, not a real model estimate; local FRED grounding shows it is ${rangeRelation}.`,
    keyEvidenceItems: [
      `[demo] FRED DCOILBRENTEU latest local observation is ${latest?.value.toFixed(2) ?? "pending"} USD/bbl on ${latest?.date ?? "pending"}.`,
      `[demo] FRED DCOILBRENTEU recent local range is ${recentLow.toFixed(2)}-${recentHigh.toFixed(2)} USD/bbl; the fixed 66.20 fixture is for UI demonstration only.`,
      "[demo] Official maritime-advisory context remains a risk-premium input, not the resolution source.",
    ],
    counterEvidenceItems: [
      "[demo] Without a fresh verified closure-class traffic stop, the demo should not imply an extreme Brent spike.",
    ],
    openConcerns: [
      "[demo] Real LLM run should replace this fixture before any substantive forecast review.",
    ],
    temporalNotes: [
      "[demo] Weekly high resolves after all FRED DCOILBRENTEU observations in the target week are released.",
    ],
  };

  const actions = [
    action({
      actionId: "demo-question",
      index: 0,
      lane: "question",
      kind: "question",
      title: "Question loaded",
      summary: "Brent weekly high numeric question loaded for the Hormuz case.",
      extra: {
        evidenceRole: "question_audit",
        rawRole: "user",
        rawPreview: rawPreview("question", "Forecast question", question.task_question, {
          rawFilePath: relative(root, questionPath),
        }),
      },
    }),
    action({
      actionId: "demo-turn-01",
      index: 1,
      parentActionIds: ["demo-question"],
      lane: "agent_turn",
      kind: "assistant_note",
      title: "Question audit and search plan",
      summary: "Identify the FRED target series, recent Brent band, and Hormuz risk-premium context.",
      extra: {
        evidenceRole: "question_audit",
        rawRole: "assistant",
        rawPreview: rawPreview(
          "assistant",
          "Assistant note",
          "[demo] Plan: verify FRED DCOILBRENTEU target, inspect recent Brent levels, then add limited Hormuz risk context without treating it as resolution data.",
          {
            toolCalls: [
              {
                id: "demo-call-fred",
                name: "search_web",
                arguments: "{\"query\":\"FRED DCOILBRENTEU Brent crude oil spot price\",\"domains\":[\"fred.stlouisfed.org\"]}",
              },
              {
                id: "demo-call-hormuz",
                name: "search_web",
                arguments: "{\"query\":\"Strait of Hormuz maritime advisory Brent risk premium\",\"domains\":[\"eia.gov\",\"ukmto.org\"]}",
              },
            ],
          },
        ),
      },
    }),
    action({
      actionId: "demo-search-fred",
      index: 2,
      parentActionIds: ["demo-turn-01"],
      lane: "search_batch",
      kind: "tool_call",
      title: "Search FRED target series",
      summary: "FRED DCOILBRENTEU Brent crude oil spot price target lookup.",
      extra: {
        toolName: "search_web",
        toolCallId: "demo-call-fred",
        query: "FRED DCOILBRENTEU Brent crude oil spot price",
        argsSummary: "FRED DCOILBRENTEU · fred.stlouisfed.org",
        evidenceRole: "source_search",
        rawRole: "assistant",
        rawPreview: rawPreview(
          "tool_call",
          "search_web arguments",
          "[demo] FRED DCOILBRENTEU weekly high estimate target lookup: https://fred.stlouisfed.org/series/DCOILBRENTEU · snippet placeholder notes this is the public FRED Brent spot series page.",
          { toolName: "search_web" },
        ),
      },
    }),
    action({
      actionId: "demo-search-hormuz",
      index: 3,
      parentActionIds: ["demo-turn-01"],
      lane: "search_batch",
      kind: "tool_call",
      title: "Search Hormuz risk context",
      summary: "Hormuz advisory and energy chokepoint context for risk-premium framing.",
      extra: {
        toolName: "search_web",
        toolCallId: "demo-call-hormuz",
        query: "Strait of Hormuz maritime advisory Brent risk premium",
        argsSummary: "Hormuz advisory context · EIA/UKMTO",
        evidenceRole: "source_search",
        rawRole: "assistant",
        rawPreview: rawPreview(
          "tool_call",
          "search_web arguments",
          "[demo] Hormuz context search: https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints · snippet placeholder marks chokepoint context only, not a live throughput claim.",
          { toolName: "search_web" },
        ),
      },
    }),
    action({
      actionId: "demo-result-fred",
      index: 4,
      parentActionIds: ["demo-search-fred"],
      lane: "read_artifacts",
      kind: "tool_result",
      title: "FRED local series result",
      summary: `Local FRED CSV has latest Brent ${latest?.value.toFixed(2) ?? "pending"} USD/bbl and recent range ${recentLow.toFixed(2)}-${recentHigh.toFixed(2)}.`,
      extra: {
        toolName: "search_web",
        toolCallId: "demo-call-fred",
        sourceUrl: brent.sourceUrl,
        evidenceRole: "source_read",
        rawRole: "tool",
        rawPreview: rawPreview(
          "tool_result",
          "search_web result",
          `[demo] FRED DCOILBRENTEU weekly high estimate uses local normalized file data/normalized/market/fred_series.csv. Latest=${latest?.value.toFixed(2) ?? "pending"} USD/bbl; recent_range=${recentLow.toFixed(2)}-${recentHigh.toFixed(2)} USD/bbl; source=${brent.sourceUrl}.`,
          { toolName: "search_web" },
        ),
      },
    }),
    action({
      actionId: "demo-result-hormuz",
      index: 5,
      parentActionIds: ["demo-search-hormuz"],
      lane: "read_artifacts",
      kind: "tool_result",
      title: "Hormuz context result",
      summary: "Chokepoint and advisory context can inform a risk premium but does not resolve the numeric Brent target.",
      extra: {
        toolName: "search_web",
        toolCallId: "demo-call-hormuz",
        sourceUrl: "https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints",
        evidenceRole: "source_read",
        rawRole: "tool",
        rawPreview: rawPreview(
          "tool_result",
          "search_web result",
          "[demo] Hormuz context result: https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints · snippet placeholder says this is structural chokepoint context and not a real-time flow observation.",
          { toolName: "search_web" },
        ),
      },
    }),
    action({
      actionId: "demo-turn-02",
      index: 6,
      parentActionIds: ["demo-result-fred", "demo-result-hormuz"],
      lane: "agent_turn",
      kind: "assistant_note",
      title: "Refine target-week query",
      summary: "Narrow from target identity and context to the target-week Brent high estimate.",
      extra: {
        evidenceRole: "evidence_extract",
        rawRole: "assistant",
        rawPreview: rawPreview(
          "assistant",
          "Assistant note",
          "[demo] Keep the fixed 66.20 fixture visibly grounded against local FRED data; a real run must replace it before substantive review. Refine the query around current-week Brent highs.",
          {
            toolCalls: [
              {
                id: "demo-call-refined",
                name: "search_web",
                arguments: "{\"query\":\"DCOILBRENTEU latest Brent spot current week high estimate\",\"domains\":[\"fred.stlouisfed.org\"]}",
              },
            ],
          },
        ),
      },
    }),
    action({
      actionId: "demo-search-refined",
      index: 7,
      parentActionIds: ["demo-turn-02"],
      lane: "search_batch",
      kind: "tool_call",
      title: "Search current-week Brent high",
      summary: "More precise FRED-targeted query for the current-week high.",
      extra: {
        toolName: "search_web",
        toolCallId: "demo-call-refined",
        query: "DCOILBRENTEU latest Brent spot current week high estimate",
        argsSummary: "current-week Brent high · FRED",
        evidenceRole: "source_search",
        rawRole: "assistant",
        rawPreview: rawPreview(
          "tool_call",
          "search_web arguments",
          "[demo] FRED DCOILBRENTEU weekly high estimate refined query: https://fred.stlouisfed.org/series/DCOILBRENTEU · snippet placeholder for current-week Brent spot check.",
          { toolName: "search_web" },
        ),
      },
    }),
    action({
      actionId: "demo-result-refined",
      index: 8,
      parentActionIds: ["demo-search-refined"],
      lane: "read_artifacts",
      kind: "tool_result",
      title: "Refined Brent range result",
      summary: "Refined check keeps 66.20 USD/bbl labeled as a fixed UI demo value, not a real range-derived estimate.",
      extra: {
        toolName: "search_web",
        toolCallId: "demo-call-refined",
        sourceUrl: brent.sourceUrl,
        evidenceRole: "source_read",
        rawRole: "tool",
        rawPreview: rawPreview(
          "tool_result",
          "search_web result",
          `[demo] FRED DCOILBRENTEU weekly high estimate fixture: 66.20 USD/bbl is ${rangeRelation}. Latest local observation=${latest?.value.toFixed(2) ?? "pending"} USD/bbl. This is a UI demo artifact, not a real LLM forecast.`,
          { toolName: "search_web" },
        ),
      },
    }),
    action({
      actionId: "demo-synthesis",
      index: 9,
      parentActionIds: ["demo-result-refined"],
      lane: "evidence_synthesis",
      kind: "assistant_note",
      title: "Numeric evidence synthesis",
      summary: "Use local FRED data for UI grounding; keep the fixed demo prediction clearly labeled.",
      extra: {
        evidenceRole: "evidence_extract",
        rawRole: "assistant",
        rawPreview: rawPreview(
          "assistant",
          "Assistant note",
          "[demo] Synthesis: FRED is the resolution source; local observations ground the sparkline and delta; 66.20 is a fixed UI fixture. Record 66.20 USD/bbl with demo caveats.",
        ),
      },
    }),
    action({
      actionId: "demo-record-forecast",
      index: 10,
      parentActionIds: ["demo-synthesis", "demo-result-fred", "demo-result-refined"],
      lane: "forecast",
      kind: "final_forecast",
      title: "Record forecast",
      summary: "record_forecast wrote the demo numeric Brent weekly-high estimate.",
      extra: {
        toolName: "record_forecast",
        toolCallId: "demo-call-record",
        evidenceRole: "forecast_record",
        rawRole: "assistant",
        forecastPayload: finalPayload,
        rawPreview: rawPreview(
          "record_forecast",
          "record_forecast payload",
          JSON.stringify(finalPayload, null, 2),
          { toolName: "record_forecast", boxedAnswer: "\\boxed{66.20}" },
        ),
      },
    }),
    action({
      actionId: "demo-checkpoint",
      index: 11,
      parentActionIds: ["demo-record-forecast"],
      lane: "checkpoint",
      kind: "checkpoint",
      title: "Demo checkpoint written",
      summary: "latest-run.json now points to an explicitly marked demo artifact.",
      extra: {
        evidenceRole: "forecast_record",
        rawRole: "tool",
        rawPreview: rawPreview(
          "checkpoint",
          "Checkpoint payload",
          "[demo] Static demo checkpoint persisted for Forecast page smoke testing.",
        ),
      },
    }),
  ];

  markCritical(
    actions,
    new Set([
      "demo-search-refined",
      "demo-result-refined",
    ]),
    "ref'd by record_forecast evidence",
  );
  markCritical(actions, new Set(["demo-record-forecast"]), "record_forecast / boxed answer");

  return {
    traceId: "trace-hormuz-brent-weekly-high-demo",
    runDir,
    generatedAt,
    actions,
    stats: {
      demo: true,
      totalActions: actions.length,
      criticalPathActions: actions.filter((item) => item.criticalPath).length,
    },
    graph: buildActionGraph(actions),
  };
}

function buildArtifact(question, trace, brent) {
  const latest = brent.points.at(-1);
  return {
    schemaVersion: "hormuz-galaxy-run/v1",
    question,
    runMeta: {
      runId: "demo__hormuz-brent-weekly-high-demo",
      taskId: "hormuz-brent-weekly-high-demo",
      status: "success",
      demo: true,
      generatedAt,
      startedAt: generatedAt,
      completedAt: generatedAt,
      forecastedAt: generatedAt,
      questionDate,
      runner: "galaxy-selfevolve",
      galaxyRepo: "demo-fixture-no-llm-run",
      venvPath: "/Users/weichy/Desktop/Doing-Right-Things/FutureX/papers/galaxy-selfevolve/.venv",
      pythonPath: "/Users/weichy/Desktop/Doing-Right-Things/FutureX/papers/galaxy-selfevolve/.venv/bin/python",
      outputDir,
      runDir,
      questionPath: "data/galaxy/hormuz-daily-question.jsonl",
      command: ["node", "scripts/build-demo-artifact.mjs", "--demo"],
      finalPrediction: "66.20",
      confidence: "medium",
      durationSeconds: 0,
      terminalReason: "record_forecast",
      metrics: {
        demo: true,
        llm_calls_total: 0,
        tool_calls: { total: 0, unique_tools_count: 0 },
        source_series_latest: latest ?? null,
      },
      artifactPaths: {
        question: "data/galaxy/hormuz-daily-question.jsonl",
        latestArtifact: "data/galaxy/latest-run.json",
      },
    },
    actionTrace: trace,
    previousState: {
      scenarioDistribution: {
        normal: 23,
        controlled: 52,
        severe: 18,
        closure: 7,
      },
      targetForecasts: [
        {
          target: "brent",
          horizon: "7d",
          direction: "up",
          confidence: 0.58,
          deltaLabel: "+ risk premium",
          rationale: "Demo fixture keeps Brent target grounded to local FRED observations.",
          sourceIds: ["fred-market"],
        },
      ],
    },
    sourceObservations: [
      {
        observationId: "obs-demo-question",
        sourceId: "galaxy-selfevolve",
        publishedAt: generatedAt,
        retrievedAt: generatedAt,
        sourceUrl: "data/galaxy/hormuz-daily-question.jsonl",
        title: "Demo Brent weekly-high question",
        summary: "Explicit demo question for Forecast page numeric UI smoke testing.",
        freshness: "fresh",
        licenseStatus: "open",
      },
      {
        observationId: "obs-demo-fred-local",
        sourceId: "fred-market",
        publishedAt: latest?.date,
        retrievedAt: brent.retrievedAt,
        sourceUrl: "data/normalized/market/fred_series.csv",
        title: "Local FRED DCOILBRENTEU series",
        summary: `[demo] Local FRED normalized data grounds the UI delta; latest ${latest?.value.toFixed(2) ?? "pending"} USD/bbl.`,
        freshness: "fresh",
        licenseStatus: "open",
      },
      {
        observationId: "obs-demo-hormuz-context",
        sourceId: "official-advisory",
        retrievedAt: generatedAt,
        sourceUrl: "data/normalized/maritime/advisories.jsonl",
        title: "Hormuz context caveat",
        summary: "[demo] Maritime context may inform risk premium, but it is not the FRED resolution source.",
        freshness: "fresh",
        licenseStatus: "open",
      },
      {
        observationId: "obs-demo-ais-pending",
        sourceId: "ais-flow-pending",
        retrievedAt: generatedAt,
        title: "AIS flow source pending",
        summary: "[demo] No authorized live AIS flow source is used by this numeric fixture.",
        freshness: "pending",
        licenseStatus: "pending",
      },
    ],
    evidenceClaims: [
      {
        evidenceId: "ev-demo-fred-anchor",
        sourceObservationIds: ["obs-demo-fred-local"],
        claim: "[demo] Local FRED DCOILBRENTEU observations ground the sparkline and delta; 66.20 USD/bbl remains a fixed UI fixture value.",
        polarity: "support",
        affects: ["market", "target"],
        mechanismTags: ["market_pricing_risk_premium"],
        confidence: "medium",
        quality: {
          sourceReliability: "high",
          freshness: "fresh",
          corroboration: "single_source",
          directness: "direct",
        },
        targetHints: [
          {
            target: "brent",
            direction: "up",
            weight: 0.55,
          },
        ],
      },
      {
        evidenceId: "ev-demo-hormuz-premium",
        sourceObservationIds: ["obs-demo-hormuz-context"],
        claim: "[demo] Hormuz chokepoint context supports a modest risk-premium input, not an extreme spike.",
        polarity: "support",
        affects: ["market", "watchlist"],
        mechanismTags: ["energy_supply_risk_up", "market_pricing_risk_premium"],
        confidence: "medium",
        quality: {
          sourceReliability: "medium",
          freshness: "fresh",
          corroboration: "single_source",
          directness: "context",
        },
        targetHints: [
          {
            target: "brent",
            direction: "up",
            weight: 0.35,
          },
        ],
      },
      {
        evidenceId: "ev-demo-no-extreme-spike",
        sourceObservationIds: ["obs-demo-ais-pending"],
        claim: "[demo] Pending live-flow evidence argues against presenting this fixture as a closure-shock Brent spike.",
        polarity: "counter",
        affects: ["market", "watchlist"],
        mechanismTags: ["market_not_pricing_closure"],
        confidence: "low",
        quality: {
          sourceReliability: "low",
          freshness: "stale",
          corroboration: "single_source",
          directness: "context",
        },
        targetHints: [
          {
            target: "brent",
            direction: "down",
            weight: 0.2,
          },
        ],
      },
    ],
    marketRead: {
      title: "Demo Brent market read",
      summary: "[demo] Numeric fixture uses local FRED Brent observations for UI grounding and labels 66.20 as a fixed demo forecast.",
      pricingPattern: "mixed",
      evidenceIds: ["ev-demo-fred-anchor", "ev-demo-hormuz-premium"],
      caveat: "Demo artifact is not a real LLM output; FRED remains the resolution source.",
      asOf: questionDate,
    },
    nextWatch: [
      "AIS source remains pending; demo cannot claim live traffic-flow evidence",
      "Run a real galaxy Brent weekly-high task to replace runMeta.demo",
      "Check FRED DCOILBRENTEU releases through the weekly resolution window",
    ],
  };
}

async function main() {
  const question = buildQuestion();
  const brent = await readBrentSeries();
  const trace = buildTrace(question, brent);
  const artifact = buildArtifact(question, trace, brent);

  await mkdir(dirname(questionPath), { recursive: true });
  await writeFile(questionPath, `${JSON.stringify(question)}\n`, "utf8");
  await writeFile(latestArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`demo artifact written: ${relative(root, latestArtifactPath)} (${trace.actions.length} actions)`);
}

await main();
