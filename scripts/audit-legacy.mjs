// audit:legacy
//
// Scans the repo for forbidden legacy patterns. Failing tokens include:
//   - supportsScenario (replaced by pricingPattern)
//   - AgentRunEventV1 / legacy adapter / deprecated market field
//   - Pages reaching into mock business objects bypassing projection layer.
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const FORBIDDEN = [
  {
    label: "supportsScenario must be removed",
    pattern: /\bsupportsScenario\b/,
  },
  {
    label: "AgentRunEventV1 / legacy event adapter",
    pattern: /AgentRunEventV[12]\b/,
  },
  {
    label: "legacy 'WarTrend' enum",
    pattern: /WarTrendForecastTarget|\bwar_trend\b/,
  },
  {
    label: "legacy Checkpoint shape (revision/keyEvidence/counterevidence)",
    pattern: /\b(keyEvidence|counterevidence|unresolvedConcerns)\b/,
  },
  {
    label: "legacy ForecastRunResponse",
    pattern: /\bForecastRunResponse\b/,
  },
  {
    label: "legacy forecastClient.ts",
    pattern: /\brunHormuzAgent\b/,
  },
];

const EXEMPT_FILES = new Set([
  // Audit scripts contain forbidden patterns as literal regex strings.
  "scripts/audit-legacy.mjs",
  "scripts/audit-data.mjs",
]);

const targetDirs = ["src", "scripts"];
const skipDirs = new Set(["node_modules", "dist", ".git", "output"]);

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    if (skipDirs.has(name)) continue;
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (/\.(ts|tsx|mjs|js)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const d of targetDirs) {
  try {
    files.push(...(await walk(resolve(root, d))));
  } catch {
    // empty
  }
}

const violations = [];
for (const file of files) {
  const rel = relative(root, file);
  if (EXEMPT_FILES.has(rel)) continue;
  const content = await readFile(file, "utf8");
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(content)) {
      violations.push(`${rel}: ${rule.label}`);
    }
  }
}

// Pages must consume from projections only.
const pageFile = resolve(root, "src/App.tsx");
const pageContent = await readFile(pageFile, "utf8");
if (!/projectForecastState|projectOverviewState|projectMarketState/.test(pageContent)) {
  violations.push("src/App.tsx: must import projection functions (projectForecastState / projectOverviewState / projectMarketState).");
}
if (/from\s+["']\.\/state\/canonicalStore["']/.test(pageContent)) {
  violations.push("src/App.tsx: pages must not import canonicalStore directly; use projections.");
}

if (violations.length > 0) {
  console.error("audit:legacy FAILED");
  for (const v of violations) console.error("  -", v);
  process.exit(1);
}

console.log("audit:legacy passed: no forbidden legacy patterns found.");
