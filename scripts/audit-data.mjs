// Audits externally sourced demo data without exposing cross-check details in the UI.
import { readFile } from "node:fs/promises";

const dataUrl = new URL("../src/data.ts", import.meta.url);
const sourceRegistryUrl = new URL("../src/data/sourceRegistry.ts", import.meta.url);

const fredSeries = {
  DCOILBRENTEU: {
    label: "Brent spot",
  },
  DCOILWTICO: {
    label: "WTI spot",
  },
  VIXCLS: {
    label: "VIX",
  },
  DTWEXBGS: {
    label: "Broad USD",
  },
  DGS10: {
    label: "US10Y",
  },
  SP500: {
    label: "S&P 500",
  },
};

const structuralChecks = [
  {
    label: "EIA/IEA source registry entry",
    pattern: /id:\s*"eia-iea-hormuz"[\s\S]*?reliability:\s*"source-of-truth"/,
    rationale: "The structural Hormuz baseline needs its own registered source.",
  },
  {
    label: "Hormuz oil flow baseline",
    pattern: /value:\s*"20\.9"[\s\S]*?unit:\s*"mb\/d"/,
    rationale: "EIA public chokepoint summary reports 20.9 mb/d petroleum liquids transit for 2023.",
  },
  {
    label: "AIS vessel count is not promoted",
    pattern: /id:\s*"vessels"[\s\S]*?value:\s*"待接入"[\s\S]*?unit:\s*"授权数据"/,
    rationale: "Real vessel counts need licensed AIS or a stable public snapshot.",
  },
  {
    label: "Gold remains pending",
    pattern: /id:\s*"gold-pending"[\s\S]*?reliability:\s*"placeholder"/,
    rationale: "Gold should not be presented as sourced until a stable daily provider is wired.",
  },
];

function assertAlmostEqual(actual, expected, label) {
  const diff = Math.abs(Number(actual) - expected);
  if (diff > 0.005) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function fetchFredCsv(seriesId) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${seriesId}: FRED request failed with ${response.status}`);
  }
  const rows = (await response.text()).trim().split("\n").slice(1);
  return new Map(
    rows
      .map((line) => line.split(","))
      .filter(([date, value]) => date && value && value !== "."),
  );
}

function extractDisplayedFredPoints(dataFile) {
  const displayedPoints = new Map();
  const seriesPattern = /source:\s*"FRED ([A-Z0-9]+)"[\s\S]*?points:\s*\[([\s\S]*?)\],/g;

  for (const match of dataFile.matchAll(seriesPattern)) {
    const [, seriesId, pointsBlock] = match;
    const points = [];
    for (const pointMatch of pointsBlock.matchAll(/\{\s*date:\s*"([^"]+)",\s*value:\s*([0-9.]+)\s*\}/g)) {
      points.push({ date: pointMatch[1], value: Number(pointMatch[2]) });
    }
    displayedPoints.set(seriesId, points);
  }

  return displayedPoints;
}

async function auditFred(dataFile) {
  const displayedPoints = extractDisplayedFredPoints(dataFile);

  for (const [seriesId, config] of Object.entries(fredSeries)) {
    const checks = displayedPoints.get(seriesId);
    if (!checks?.length) {
      throw new Error(`${seriesId}: no displayed points found in src/data.ts`);
    }

    const values = await fetchFredCsv(seriesId);
    for (const { date, value: expected } of checks) {
      const actual = values.get(date);
      if (!actual) {
        throw new Error(`${seriesId}: missing ${date}`);
      }
      assertAlmostEqual(actual, expected, `${config.label} ${date}`);
    }
  }
}

function auditLocalData(dataFile, sourceRegistryFile) {
  const combinedFiles = `${dataFile}\n${sourceRegistryFile}`;
  for (const check of structuralChecks) {
    if (!check.pattern.test(combinedFiles)) {
      throw new Error(`${check.label}: local data check failed. ${check.rationale}`);
    }
  }
}

const dataFile = await readFile(dataUrl, "utf8");
const sourceRegistryFile = await readFile(sourceRegistryUrl, "utf8");
await auditFred(dataFile);
auditLocalData(dataFile, sourceRegistryFile);

console.log("Data audit passed: displayed FRED points and local source caveats are consistent.");
