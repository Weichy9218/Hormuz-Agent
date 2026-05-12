// audit:legacy
//
// Scans global legacy removals plus background-page forecast coupling.
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, join, extname } from "node:path";

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

const BACKGROUND_FORBIDDEN = [
  {
    label: "scenarioDistribution",
    pattern: /\bscenarioDistribution\b/,
  },
  {
    label: "pricingPattern",
    pattern: /\bpricingPattern\b/,
  },
  {
    label: "judgement_updated",
    pattern: /\bjudgement_updated\b/,
  },
  {
    label: "mechanismTags",
    pattern: /\bmechanismTags\b/,
  },
  {
    label: "checkpointId",
    pattern: /\bcheckpointId\b/,
  },
  {
    label: "Why not closure",
    pattern: /Why not closure|为什么还不是封锁/,
  },
  {
    label: "next watch",
    pattern: /next watch|下一步观察/i,
  },
  {
    label: "MarketRead",
    pattern: /\bMarketRead\b/,
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

function formatMatches(rel, content, rule) {
  const out = [];
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(line)) {
      out.push(`${rel}:${index + 1}: background pages must not reference ${rule.label}`);
    }
  }
  return out;
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [];
  if (extname(base)) {
    candidates.push(base);
  } else {
    for (const suffix of [".tsx", ".ts", ".jsx", ".js", ".mjs"]) {
      candidates.push(`${base}${suffix}`);
    }
    for (const suffix of ["index.tsx", "index.ts", "index.js", "index.mjs"]) {
      candidates.push(join(base, suffix));
    }
  }
  return candidates;
}

async function collectBackgroundDependencyFiles(entryFiles) {
  const visited = new Set();
  const stack = entryFiles;
  const existingFiles = new Set(files);

  while (stack.length > 0) {
    const file = stack.pop();
    if (!file || visited.has(file)) continue;
    if (!existingFiles.has(file)) continue;
    visited.add(file);

    const content = await readFile(file, "utf8");
    const imports = [
      ...content.matchAll(/import(?:\s+type)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g),
      ...content.matchAll(/export(?:\s+type)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g),
    ];
    for (const match of imports) {
      const candidates = resolveImport(file, match[1]);
      if (!candidates) continue;
      for (const candidate of candidates) {
        if (existingFiles.has(candidate) && !visited.has(candidate)) stack.push(candidate);
      }
    }
  }
  return [...visited];
}

const backgroundEntryFiles = [
  "src/pages/OverviewPage.tsx",
  "src/pages/NewsPage.tsx",
  "src/pages/NewsTimelinePage.tsx",
  "src/pages/MarketPage.tsx",
]
  .map((file) => resolve(root, file))
  .filter((file) => files.includes(file));

for (const file of await collectBackgroundDependencyFiles(backgroundEntryFiles)) {
  const rel = relative(root, file);
  if (EXEMPT_FILES.has(rel)) continue;
  const content = await readFile(file, "utf8");
  for (const rule of BACKGROUND_FORBIDDEN) {
    violations.push(...formatMatches(rel, content, rule));
  }
}

const pageFile = resolve(root, "src/App.tsx");
const pageContent = await readFile(pageFile, "utf8");
for (const rule of BACKGROUND_FORBIDDEN) {
  violations.push(...formatMatches("src/App.tsx", pageContent, rule));
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
