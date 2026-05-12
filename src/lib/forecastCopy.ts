// Shared UI copy for forecast reviewer pages; this file owns labels only, not semantics.
import type { NarrativeEvent } from "../types";
import type { TargetForecast } from "../types/forecast";

export const pricingPatternCopy: Record<string, string> = {
  not_pricing_hormuz: "市场未明显定价 Hormuz-specific risk",
  pricing_controlled_disruption: "市场正在定价可控扰动",
  pricing_severe_disruption: "市场正在定价严重扰动",
  pricing_closure_shock: "市场正在定价封锁冲击",
  mixed: "油价风险溢价仍在，但事件窗口压力回落",
};

export const pricingPatternShortCopy: Record<string, string> = {
  not_pricing_hormuz: "未明显定价 Hormuz risk",
  pricing_controlled_disruption: "可控扰动定价",
  pricing_severe_disruption: "严重扰动定价",
  pricing_closure_shock: "封锁冲击定价",
  mixed: "混合信号",
};

export const polarityCopy: Record<string, string> = {
  support: "支持",
  counter: "反证",
  uncertain: "不确定",
};

export const sourceStatusCopy: Record<string, string> = {
  fresh: "已更新",
  lagging: "滞后",
  stale: "陈旧",
  missing: "缺失",
  pending: "待接入",
};

export const eventCategoryLabel: Record<NarrativeEvent["category"], string> = {
  news: "新闻",
  diplomacy: "外交",
  maritime: "海事",
  flow: "通行流量",
  market: "市场",
};

export const directionCopy: Record<TargetForecast["direction"], string> = {
  up: "上行",
  down: "下行",
  flat: "持平",
  uncertain: "不确定",
};
