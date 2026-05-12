// Build a JSON snapshot of the canonical store using esbuild.
// Output: scripts/.snapshot.json
//
// The snapshot is the single source of truth for audit:evidence and
// audit:forecast — both run as plain Node scripts and consume this JSON.
import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(here);
const outPath = resolve(outDir, ".snapshot.json");

const result = await build({
  stdin: {
    contents: `
      export * from "./src/state/canonicalStore";
      export { sourceRegistry } from "./src/data/sourceRegistry";
    `,
    resolveDir: root,
    sourcefile: "canonical-snapshot-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  write: false,
  external: [],
});

const text = result.outputFiles[0].text;
const dataUrl = `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const mod = await import(dataUrl);

const snapshot = {
  scenarioOrder: mod.scenarioOrder,
  canonicalScenarioDefinitions: mod.canonicalScenarioDefinitions,
  canonicalCalibrationConfig: mod.canonicalCalibrationConfig,
  canonicalSourceObservations: mod.canonicalSourceObservations,
  canonicalEvidenceClaims: mod.canonicalEvidenceClaims,
  canonicalMarketRead: mod.canonicalMarketRead,
  canonicalAgentRunEvents: mod.canonicalAgentRunEvents,
  canonicalForecastCheckpoints: mod.canonicalForecastCheckpoints,
  canonicalPredictionRecords: mod.canonicalPredictionRecords,
  canonicalRun: mod.canonicalRun,
  sourceRegistry: mod.sourceRegistry,
};

await mkdir(outDir, { recursive: true });
await writeFile(outPath, JSON.stringify(snapshot, null, 2));
console.log(`Snapshot written: ${outPath}`);
