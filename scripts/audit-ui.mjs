// Static UI guardrail audit for reviewer-facing Product Surface pages.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const uiFiles = [
  "src/pages/OverviewPage.tsx",
  "src/pages/MarketPage.tsx",
  "src/pages/NewsTimelinePage.tsx",
  "src/lib/forecastCopy.ts",
];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const files = Object.fromEntries(uiFiles.map((file) => [file, read(file)]));
const combined = Object.values(files).join("\n");

function assertContains(file, pattern, message) {
  if (!pattern.test(files[file])) {
    throw new Error(`${file}: ${message}`);
  }
}

function assertNotContains(file, pattern, message) {
  if (pattern.test(files[file])) {
    throw new Error(`${file}: ${message}`);
  }
}

function assertCombinedNotContains(pattern, message) {
  if (pattern.test(combined)) {
    throw new Error(message);
  }
}

// Pending sources must remain visibly caveated on Product Surface pages.
for (const file of [
  "src/pages/OverviewPage.tsx",
  "src/pages/MarketPage.tsx",
  "src/pages/NewsTimelinePage.tsx",
]) {
  assertContains(file, /pending/i, "pending source state must be visible");
  assertContains(file, /caveat/i, "pending or data-boundary caveat must be visible");
}

// Pages using source-backed facts must expose source identity and temporal scope.
assertContains(
  "src/pages/OverviewPage.tsx",
  /source id|sourceId|source ids/i,
  "Overview must show baseline or market source ids",
);
assertContains(
  "src/pages/OverviewPage.tsx",
  /as-of|asOf|retrievedAt|截至/i,
  "Overview must show an as-of or retrievedAt-style timestamp where relevant",
);
assertContains(
  "src/pages/MarketPage.tsx",
  /source id|sourceId/i,
  "Market must show source ids for market series or coverage",
);
assertContains(
  "src/pages/MarketPage.tsx",
  /as-of|asOf|retrievedAt|verifiedAt|截至/i,
  "Market must show as-of, retrievedAt, or verifiedAt information",
);
assertContains(
  "src/pages/NewsTimelinePage.tsx",
  /source id|source\.id/i,
  "News source boundary must show source ids",
);

const legacyMarketScenarioField = ["supports", "Scenario"].join("");

// Market must use pricingPattern and never revive the legacy market scenario field.
assertContains(
  "src/pages/MarketPage.tsx",
  /pricingPattern/,
  "Market must render MarketRead.pricingPattern",
);
for (const file of uiFiles) {
  assertNotContains(
    file,
    new RegExp(`\\b${legacyMarketScenarioField}\\b`),
    "legacy market scenario field must not appear in Product Surface UI",
  );
}

// News is candidate-evidence handoff only; it must not imply direct probability revision.
assertContains(
  "src/pages/NewsTimelinePage.tsx",
  /candidate|候选/,
  "News must identify events as candidate evidence",
);
assertContains(
  "src/pages/NewsTimelinePage.tsx",
  /handoff|交接|承接/,
  "News must show the timeline-to-forecast handoff boundary",
);
assertContains(
  "src/pages/NewsTimelinePage.tsx",
  /不直接|不会直接|不能直接/,
  "News must state it does not directly revise forecast probabilities",
);
assertContains(
  "src/pages/NewsTimelinePage.tsx",
  /judgement_updated/,
  "News must name judgement_updated as the state-changing event",
);

// Reviewer-facing UI must not expose debug traces, chain-of-thought, or prompts.
assertCombinedNotContains(
  /raw debug|debug log|chain-of-thought|internal prompt|scratchpad/i,
  "Product Surface UI must not expose raw debug logs, chain-of-thought, internal prompts, or scratchpads",
);

console.log(
  "audit:ui passed: pending caveats, source/as-of visibility, pricingPattern, News handoff, and no-debug UI guardrails are satisfied.",
);
