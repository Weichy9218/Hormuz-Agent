// Source registry for data lineage, refresh cadence, license status, and caveats.
// Hard constraints: pending sources cannot produce high-confidence live evidence.
import type { SignalSource, SourceRegistryEntry } from "../types";
import sourceRegistryData from "../../data/registry/sources.json";
import baselineFacts from "../../data/normalized/baseline/hormuz_baseline.json";

export const sourceRegistry = sourceRegistryData as SourceRegistryEntry[];

export const sourceBoundaryFacts = baselineFacts.map((fact) => ({
  id: fact.fact_id,
  label: fact.label,
  value: fact.value,
  unit: fact.unit,
  sourceId: fact.source_id,
  detail: fact.detail,
}));

export const sourceGroups: SignalSource[] = [
  {
    id: "official-energy",
    name: "能源",
    status: "fresh",
    detail: "EIA / IEA chokepoint 基线",
  },
  {
    id: "maritime-security",
    name: "海事安全",
    status: "fresh",
    detail: "UKMTO / JMIC / MARAD advisory",
  },
  {
    id: "flow",
    name: "船流/通行",
    status: "pending",
    detail: "AIS / tanker / LNG source pending",
  },
  {
    id: "market",
    name: "市场",
    status: "fresh",
    detail: "Brent, WTI, Broad USD, US10Y, SPX, VIX；Gold pending",
  },
];
