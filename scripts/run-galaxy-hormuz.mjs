#!/usr/bin/env node
// Generate the daily Hormuz FutureWorld-style question and optionally execute
// it through the neighboring galaxy-selfevolve runner. The browser consumes
// only the normalized artifact written to data/galaxy/latest-run.json.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter } from "node:path";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const galaxyRepo =
  process.env.GALAXY_REPO ||
  "/Users/weichy/Desktop/Doing-Right-Things/FutureX/papers/galaxy-selfevolve";
const questionPath = resolve(root, "data/galaxy/hormuz-daily-question.jsonl");
const latestArtifactPath = resolve(root, "data/galaxy/latest-run.json");
const defaultOutputRoot = resolve(root, "data/galaxy/runs");

function galaxyVenvPath() {
  return process.env.GALAXY_VENV || resolve(galaxyRepo, ".venv");
}

function galaxyPythonPath() {
  return process.env.GALAXY_PYTHON || resolve(galaxyVenvPath(), "bin/python");
}

function buildGalaxyCommand(args, question, outputDir) {
  const pythonPath = galaxyPythonPath();
  const venvPath = galaxyVenvPath();
  const useExistingVenv = existsSync(pythonPath);
  const command = [
    useExistingVenv ? pythonPath : "uv",
    ...(useExistingVenv ? [] : ["run", "python"]),
    "main.py",
    "--run-config",
    args.runConfig,
    "--input-data",
    questionPath,
    "--output-dir",
    outputDir,
    "--task-id",
    question.task_id,
    "--max-concurrent",
    "1",
    "--agent-name",
    args.agentName,
    "--agent-profile",
    args.agentProfile,
    "--agent-llm",
    args.agentLlm,
    "--agent-tool",
    args.agentTool,
  ];
  const env = useExistingVenv
    ? {
        ...process.env,
        VIRTUAL_ENV: venvPath,
        PATH: `${resolve(venvPath, "bin")}${delimiter}${process.env.PATH || ""}`,
      }
    : process.env;
  return { command, env };
}

function parseArgs(argv) {
  const args = {
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    execute: false,
    outputDir: "",
    runConfig: "baseline.yaml",
    agentName: "forecast_noskill",
    agentProfile: "forecast",
    agentLlm: "codex_sub2api",
    agentTool: "default",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") {
      args.execute = true;
    } else if (arg === "--date") {
      args.date = argv[index + 1] ?? args.date;
      index += 1;
    } else if (arg === "--output-dir") {
      args.outputDir = argv[index + 1] ?? args.outputDir;
      index += 1;
    } else if (arg === "--run-config") {
      args.runConfig = argv[index + 1] ?? args.runConfig;
      index += 1;
    } else if (arg === "--agent-llm") {
      args.agentLlm = argv[index + 1] ?? args.agentLlm;
      index += 1;
    } else if (arg === "--agent-name") {
      args.agentName = argv[index + 1] ?? args.agentName;
      index += 1;
    } else if (arg === "--agent-profile") {
      args.agentProfile = argv[index + 1] ?? args.agentProfile;
      index += 1;
    } else if (arg === "--agent-tool") {
      args.agentTool = argv[index + 1] ?? args.agentTool;
      index += 1;
    }
  }
  return args;
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildQuestion(dateText) {
  const targetDate = addDays(dateText, 7);
  return {
    task_id: `hormuz-traffic-risk-${dateText}`,
    task_question:
      `You are an agent that can predict future events. The event to be predicted:\n` +
      `\"\"\"\n` +
      `On ${targetDate} (UTC+8), which Hormuz transit-risk scenario will best describe the Strait of Hormuz case state?\n` +
      `A. normal: transit and cross-asset pricing remain close to normal.\n` +
      `B. controlled: maritime/security risk is elevated, but there is no sustained closure-class traffic stop.\n` +
      `C. severe: repeated incidents or official restrictions materially disrupt transit.\n` +
      `D. closure: sustained closure-class traffic stop is verified by multiple sources.\n` +
      `\"\"\"\n\n` +
      `Your goal is to make a categorical prediction.\n\n` +
      `IMPORTANT: Your final answer MUST end with this exact format:\n` +
      `\\boxed{letter}\n\n` +
      `Do not use any other format. Do not refuse to make a prediction. ` +
      `You must make a clear prediction based on the best data currently available.`,
    task_description:
      `Scope: This is the daily Hormuz reviewer-console question generated for ${dateText} (UTC+8). ` +
      `The scenario definitions are those used by Hormuz Risk Intelligence Agent: normal, controlled, severe, closure. ` +
      `Resolution should prefer official maritime advisory sources (UKMTO/JMIC/MARAD), public traffic-flow proxies such as IMF PortWatch when available, and audited market evidence as supporting context. ` +
      `Market data is evidence input only and does not directly decide the scenario. ` +
      `The answer must be a single letter among A/B/C/D. The forecast horizon is 7 days from the generated date.`,
    metadata: {
      case_id: "hormuz",
      generated_for_date: dateText,
      timezone: "UTC+8",
      horizon: "7d",
      scenario_options: {
        A: "normal",
        B: "controlled",
        C: "severe",
        D: "closure",
      },
      source_boundary: [
        "official-advisory",
        "imf-portwatch-hormuz",
        "fred-market",
        "ais-flow-pending",
      ],
    },
  };
}

async function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function readJsonlRows(path) {
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function lastFinalizeFromMessages(rows) {
  for (const row of [...rows].reverse()) {
    if (row.type === "finalize") return row.payload ?? null;
  }
  return null;
}

function confidence(value) {
  if (value === "med") return "medium";
  if (value === "medium" || value === "low" || value === "high") return value;
  return undefined;
}

function scenarioFromPrediction(prediction) {
  const letter = String(prediction || "").trim().match(/[A-D]/i)?.[0]?.toUpperCase();
  if (letter === "A") return "normal";
  if (letter === "B") return "controlled";
  if (letter === "C") return "severe";
  if (letter === "D") return "closure";
  return "controlled";
}

function sourceObservationId(prefix, dateText) {
  return `obs-galaxy-${prefix}-${dateText}`;
}

function buildPreviousState() {
  return {
    scenarioDistribution: {
      normal: 23,
      controlled: 52,
      severe: 18,
      closure: 7,
    },
    targetForecasts: [
      { target: "brent", horizon: "7d", direction: "up", confidence: 0.58, deltaLabel: "+ risk premium", rationale: "上轮判断为可控扰动。", sourceIds: ["fred-market"] },
      { target: "wti", horizon: "7d", direction: "up", confidence: 0.5, deltaLabel: "+ risk premium", rationale: "跟随 Brent 风险溢价。", sourceIds: ["fred-market"] },
      { target: "gold", horizon: "7d", direction: "uncertain", confidence: 0.3, deltaLabel: "pending source", rationale: "Gold source 仍是 pending。", sourceIds: [] },
      { target: "broad_usd", horizon: "7d", direction: "up", confidence: 0.45, deltaLabel: "+ haven", rationale: "温和避险需求。", sourceIds: ["fred-market"] },
      { target: "usd_cny", horizon: "7d", direction: "up", confidence: 0.42, deltaLabel: "+ pressure", rationale: "FX pressure 上行。", sourceIds: ["fred-market"] },
      { target: "usd_cnh", horizon: "7d", direction: "uncertain", confidence: 0.25, deltaLabel: "pending source", rationale: "CNH source 仍是 pending。", sourceIds: [] },
      { target: "us10y", horizon: "7d", direction: "flat", confidence: 0.4, deltaLabel: "mixed", rationale: "通胀、避险与利率渠道方向混合。", sourceIds: ["fred-market"] },
      { target: "vix", horizon: "7d", direction: "up", confidence: 0.55, deltaLabel: "+ headline beta", rationale: "对 headline risk 较敏感。", sourceIds: ["fred-market"] },
      { target: "sp500", horizon: "7d", direction: "down", confidence: 0.48, deltaLabel: "- risk appetite", rationale: "风险偏好受压。", sourceIds: ["fred-market"] },
      { target: "regional_escalation_7d", horizon: "7d", direction: "up", confidence: 0.5, deltaLabel: "+5 pp", rationale: "Advisory 与 maritime risk 推高。", sourceIds: ["official-advisory"] },
      { target: "transit_disruption_7d", horizon: "7d", direction: "up", confidence: 0.55, deltaLabel: "+ transit risk", rationale: "Advisory 与 insurance channel 支撑。", sourceIds: ["official-advisory"] },
      { target: "state_on_state_strike_14d", horizon: "14d", direction: "uncertain", confidence: 0.4, deltaLabel: "needs conflict evidence", rationale: "ACLED 仅作 candidate context。", sourceIds: [] },
      { target: "deescalation_signal_14d", horizon: "14d", direction: "down", confidence: 0.45, deltaLabel: "-4 pp", rationale: "de-escalation 证据有限。", sourceIds: ["official-advisory"] },
    ],
  };
}

function buildArtifact({ question, dateText, outputDir, status, summaryRecord, finalize, note, stats, command, error }) {
  const forecastedAt = summaryRecord?.ended_at ?? `${dateText}T09:30:00+08:00`;
  const prediction = summaryRecord?.prediction || finalize?.prediction || "B";
  const predictedScenario = scenarioFromPrediction(prediction);
  const sourceObservations = [
    {
      observationId: sourceObservationId("question", dateText),
      sourceId: "galaxy-selfevolve",
      publishedAt: `${dateText}T00:00:00+08:00`,
      retrievedAt: forecastedAt,
      sourceUrl: "data/galaxy/hormuz-daily-question.jsonl",
      title: "Daily Hormuz FutureWorld-style question",
      summary: "题目要求在 7d horizon 内预测 Hormuz scenario：normal / controlled / severe / closure。",
      freshness: "fresh",
      licenseStatus: "open",
    },
    {
      observationId: sourceObservationId("final", dateText),
      sourceId: "galaxy-selfevolve",
      publishedAt: forecastedAt,
      retrievedAt: forecastedAt,
      sourceUrl: relative(root, resolve(outputDir, String(question.task_id), "main_agent.jsonl")),
      title: status === "success" ? "Galaxy final prediction" : "Galaxy adapter final prediction",
      summary: note?.question_state || `Galaxy prediction maps to ${predictedScenario}.`,
      freshness: status === "failed" ? "missing" : "fresh",
      licenseStatus: "open",
    },
    {
      observationId: sourceObservationId("fred-market", dateText),
      sourceId: "fred-market",
      publishedAt: `${dateText}T22:00:00Z`,
      retrievedAt: forecastedAt,
      sourceUrl: "data/normalized/market/fred_series.csv",
      title: "FRED market bundle for galaxy adapter",
      summary: "Brent / WTI risk premium remains relevant, while broad market stress does not support closure-style shock.",
      freshness: "fresh",
      licenseStatus: "open",
    },
    {
      observationId: sourceObservationId("advisory", dateText),
      sourceId: "official-advisory",
      publishedAt: `${dateText}T07:13:10Z`,
      retrievedAt: forecastedAt,
      sourceUrl: "data/normalized/maritime/advisories.jsonl",
      title: "Official advisory bundle for galaxy adapter",
      summary: "Official advisory layer remains elevated but does not provide verified closure or avoidance instruction.",
      freshness: "fresh",
      licenseStatus: "open",
    },
    {
      observationId: sourceObservationId("ais-pending", dateText),
      sourceId: "ais-flow-pending",
      retrievedAt: forecastedAt,
      title: "AIS flow source pending",
      summary: "No authorized live AIS flow source is available; pending source cannot create high-confidence live evidence.",
      freshness: "pending",
      licenseStatus: "pending",
    },
  ];

  const predictionEvidenceClaim =
    predictedScenario === "closure"
      ? "Galaxy task answer maps to closure; this remains constrained by the missing verified flow-stop guardrail."
      : predictedScenario === "severe"
        ? "Galaxy task answer maps to severe disruption; this requires official or traffic-flow corroboration before becoming base case."
        : predictedScenario === "normal"
          ? "Galaxy task answer maps to normal; market and advisory evidence still require reviewer caution."
          : "Galaxy task answer maps to controlled disruption: elevated maritime/security risk without verified sustained closure-class traffic stop.";

  const evidenceClaims = [
    {
      evidenceId: "ev-galaxy-final-controlled",
      sourceObservationIds: [
        sourceObservationId("question", dateText),
        sourceObservationId("final", dateText),
      ],
      claim: predictionEvidenceClaim,
      polarity: predictedScenario === "normal" ? "uncertain" : "support",
      affects: ["scenario", "target"],
      mechanismTags:
        predictedScenario === "closure"
          ? ["traffic_flow_down", "mine_or_swarm_risk_up"]
          : predictedScenario === "severe"
            ? ["traffic_flow_down", "energy_supply_risk_up"]
            : ["transit_risk_up", "insurance_cost_up"],
      confidence: confidence(summaryRecord?.confidence || finalize?.confidence) === "high" ? "high" : "medium",
      quality: {
        sourceReliability: "medium",
        freshness: status === "failed" ? "stale" : "fresh",
        corroboration: "single_source",
        directness: "direct",
      },
      targetHints: [
        { target: "transit_disruption_7d", direction: predictedScenario === "normal" ? "flat" : "up", weight: 0.8 },
        { target: "regional_escalation_7d", direction: predictedScenario === "normal" ? "flat" : "up", weight: 0.5 },
      ],
    },
    {
      evidenceId: "ev-galaxy-market-mixed",
      sourceObservationIds: [sourceObservationId("fred-market", dateText)],
      claim: "Market bundle still supports Hormuz risk premium, but cross-asset stress is mixed and does not price a closure shock.",
      polarity: "support",
      affects: ["market", "scenario", "target"],
      mechanismTags: ["market_pricing_risk_premium", "market_not_pricing_closure"],
      confidence: "medium",
      quality: {
        sourceReliability: "high",
        freshness: "fresh",
        corroboration: "multi_source",
        directness: "direct",
      },
      targetHints: [
        { target: "brent", direction: "up", weight: 0.75 },
        { target: "wti", direction: "up", weight: 0.55 },
        { target: "vix", direction: "up", weight: 0.35 },
        { target: "sp500", direction: "down", weight: 0.35 },
      ],
    },
    {
      evidenceId: "ev-galaxy-advisory-elevated",
      sourceObservationIds: [sourceObservationId("advisory", dateText)],
      claim: "Official advisory layer remains elevated but lacks avoidance or verified closure wording.",
      polarity: "support",
      affects: ["scenario", "target", "watchlist"],
      mechanismTags: ["transit_risk_up", "insurance_cost_up"],
      confidence: "medium",
      quality: {
        sourceReliability: "high",
        freshness: "fresh",
        corroboration: "single_source",
        directness: "direct",
      },
      targetHints: [
        { target: "transit_disruption_7d", direction: "up", weight: 0.75 },
      ],
    },
    {
      evidenceId: "ev-galaxy-flow-pending",
      sourceObservationIds: [sourceObservationId("ais-pending", dateText)],
      claim: "Flow layer remains pending, so verified traffic stop evidence is absent and closure cannot become the base case.",
      polarity: "counter",
      affects: ["scenario", "watchlist"],
      mechanismTags: ["market_not_pricing_closure"],
      confidence: "low",
      quality: {
        sourceReliability: "low",
        freshness: "stale",
        corroboration: "single_source",
        directness: "context",
      },
      targetHints: [
        { target: "deescalation_signal_14d", direction: "down", weight: 0.25 },
      ],
    },
  ];

  return {
    schemaVersion: "hormuz-galaxy-run/v1",
    question,
    runMeta: {
      runId: `galaxy-hormuz-${dateText}`,
      taskId: question.task_id,
      status,
      generatedAt: `${dateText}T00:00:00+08:00`,
      forecastedAt,
      questionDate: dateText,
      runner: "galaxy-selfevolve",
      galaxyRepo,
      venvPath: galaxyVenvPath(),
      pythonPath: existsSync(galaxyPythonPath()) ? galaxyPythonPath() : undefined,
      outputDir: relative(root, outputDir),
      questionPath: relative(root, questionPath),
      command,
      finalPrediction: prediction,
      confidence: confidence(summaryRecord?.confidence || finalize?.confidence),
      durationSeconds: summaryRecord?.duration_seconds,
      terminalReason: stats?.terminal_reason,
      metrics: summaryRecord?.metrics || stats || {},
      artifactPaths: {
        question: relative(root, questionPath),
        artifact: relative(root, latestArtifactPath),
        mainAgent: relative(root, resolve(outputDir, String(question.task_id), "main_agent.jsonl")),
        checkpointNote: relative(root, resolve(outputDir, String(question.task_id), "checkpoint_note.json")),
        taskSummary: relative(root, resolve(outputDir, "task_summary.jsonl")),
      },
      error,
    },
    previousState: buildPreviousState(),
    sourceObservations,
    evidenceClaims,
    marketRead: {
      title: "Galaxy market read: mixed risk premium, no closure shock",
      summary:
        "FRED market bundle supports controlled disruption risk premium, but does not by itself update forecast state and does not support closure as base case.",
      pricingPattern: "mixed",
      evidenceIds: ["ev-galaxy-market-mixed"],
      caveat: "Market read is evidence input only; final scenario update is written only by judgement_updated.",
      asOf: dateText,
    },
    nextWatch: [
        "Run scripts/run-galaxy-hormuz.mjs --execute to refresh the live galaxy-selfevolve artifact through the existing .venv",
      "UKMTO / JMIC / MARAD avoidance or threat wording escalation",
      "Authorized AIS / tanker / LNG flow turn-down",
      "Insurance / chartering / freight non-linear jump",
    ],
  };
}

const args = parseArgs(process.argv.slice(2));
const question = buildQuestion(args.date);
const outputDir = resolve(args.outputDir || resolve(defaultOutputRoot, args.date));
await mkdir(dirname(questionPath), { recursive: true });
await mkdir(outputDir, { recursive: true });
await writeFile(questionPath, `${JSON.stringify(question, null, 0)}\n`, "utf8");

const galaxyInvocation = buildGalaxyCommand(args, question, outputDir);
const { command } = galaxyInvocation;
let status = "adapter_only";
let error = "";
if (args.execute) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: galaxyRepo,
    stdio: "inherit",
    env: galaxyInvocation.env,
  });
  if (result.status === 0) {
    status = "success";
  } else {
    status = "failed";
    error = `galaxy command exited with status ${result.status ?? "unknown"}`;
  }
}

const summaryRows = await readJsonlRows(resolve(outputDir, "task_summary.jsonl"));
const summaryRecord = [...summaryRows]
  .reverse()
  .find((row) => String(row.id || row.task_id || "") === question.task_id);
const taskDir = resolve(outputDir, question.task_id);
const mainAgentRows = await readJsonlRows(resolve(taskDir, "main_agent.jsonl"));
const finalize = lastFinalizeFromMessages(mainAgentRows);
const note = await readJsonIfExists(resolve(taskDir, "checkpoint_note.json"));
const stats = await readJsonIfExists(resolve(taskDir, "main_agent_stats.json"));
if (summaryRecord?.status === "success") status = "success";

const artifact = buildArtifact({
  question,
  dateText: args.date,
  outputDir,
  status,
  summaryRecord,
  finalize,
  note,
  stats,
  command,
  error: error || undefined,
});

await writeFile(latestArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`question: ${relative(root, questionPath)}`);
console.log(`artifact: ${relative(root, latestArtifactPath)}`);
console.log(`status: ${artifact.runMeta.status}`);
