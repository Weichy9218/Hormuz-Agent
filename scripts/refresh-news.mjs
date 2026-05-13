// Refreshes local News timeline inputs and generated bundles for a daily job.
// The UI remains offline/reproducible: it only reads data/generated/*.json.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const startedAt = new Date().toISOString();
const statusPath = resolve(root, "data", "generated", "news_refresh_status.json");

function runStep(label, command, args, options = {}) {
  const started = new Date().toISOString();
  return new Promise((resolveStep) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("close", (code) => {
      resolveStep({
        label,
        command: [command, ...args].join(" "),
        started_at: started,
        finished_at: new Date().toISOString(),
        ok: code === 0 || Boolean(options.allowFailure),
        exit_code: code,
        allowed_failure: Boolean(options.allowFailure),
        stdout: stdout.trim().slice(-4000),
        stderr: stderr.trim().slice(-4000),
      });
    });
  });
}

async function readJsonlCount(path) {
  try {
    const text = await readFile(resolve(root, path), "utf8");
    return text.split(/\r?\n/).filter((line) => line.trim()).length;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
}

async function readGeneratedSummary() {
  try {
    const text = await readFile(resolve(root, "data", "generated", "news_timeline.json"), "utf8");
    const bundle = JSON.parse(text);
    const dates = (bundle.events ?? []).map((event) => String(event.event_at ?? "").slice(0, 10)).filter(Boolean);
    return {
      built_at: bundle.built_at ?? null,
      data_as_of: bundle.data_as_of ?? null,
      event_count: bundle.events?.length ?? 0,
      topic_cloud_count: bundle.topic_cloud?.length ?? 0,
      event_date_min: dates.length ? dates.sort()[0] : null,
      event_date_max: dates.length ? dates.sort().at(-1) : null,
    };
  } catch {
    return null;
  }
}

async function main() {
  const steps = [];
  steps.push(await runStep("fetch advisory snapshots", "node", ["scripts/fetch-advisories.mjs"], { allowFailure: true }));
  steps.push(
    await runStep("refresh GDELT candidates", "node", ["scripts/curate-events.mjs", "--gdelt-only", "--prune-candidates"], {
      allowFailure: true,
      env: {
        GDELT_TIMESPAN: process.env.GDELT_TIMESPAN ?? "3d",
        GDELT_MAX_RECORDS: process.env.GDELT_MAX_RECORDS ?? "50",
        GDELT_FETCH_ATTEMPTS: process.env.GDELT_FETCH_ATTEMPTS ?? "2",
        GDELT_REQUEST_TIMEOUT_MS: process.env.GDELT_REQUEST_TIMEOUT_MS ?? "20000",
        GDELT_QUERY_DELAY_MS: process.env.GDELT_QUERY_DELAY_MS ?? "1000",
      },
    }),
  );
  steps.push(
    await runStep("merge advisories and history seed", "node", ["scripts/curate-events.mjs", "--skip-gdelt"], {
      allowFailure: true,
    }),
  );
  steps.push(await runStep("build generated bundles", "node", ["scripts/build-generated.mjs"]));
  steps.push(await runStep("audit events", "node", ["scripts/audit-events.mjs"]));

  const hardFailed = steps.some((step) => !step.ok);
  const status = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ok: !hardFailed,
    mode: "local-daily-news-refresh",
    notes:
      "News page is served from local generated bundles. External fetch failures are recorded here; previous local timeline data is preserved unless generation/audit fails.",
    counts: {
      timeline_events: await readJsonlCount("data/events/events_timeline.jsonl"),
      gdelt_candidates: await readJsonlCount("data/events/events_candidates.jsonl"),
    },
    generated: await readGeneratedSummary(),
    steps,
  };

  await mkdir(dirname(statusPath), { recursive: true });
  await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`);
  console.log(`refresh:news wrote ${statusPath}`);
  if (hardFailed) process.exitCode = 1;
}

await main();
