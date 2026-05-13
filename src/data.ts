// UI-presentational demo data: map geometry, shipping lanes, market series for charts,
// page tabs, and narrative events.
//
// Business state (scenario distribution, evidence, mechanism, judgement, checkpoint)
// lives in src/state/canonicalStore.ts and is accessed through projections.
import type {
  DetailPage,
  NarrativeEvent,
  MapCountry,
  MapPlace,
  MarketSeries,
  ShippingLane,
} from "./types/ui";
import generatedMarketSeries from "../data/generated/market_series.json";
export { sourceGroups, sourceRegistry, sourceBoundaryFacts } from "./data/sourceRegistry";

export const detailPages: DetailPage[] = [
  { id: "forecast", label: "预测" },
  { id: "overview", label: "背景总览" },
  { id: "market", label: "市场背景" },
  { id: "news", label: "事件背景" },
];

export const narrativeEvents: NarrativeEvent[] = [
  {
    id: "e1",
    time: "T-36h",
    title: "官方海事通告仍处“偏高风险”级别",
    category: "maritime",
    severity: "watch",
    summary:
      "安全通告仍提示区域风险偏高，但当前可追溯事实中没有看到“全面封锁”或“普遍避航”指令。",
    effect: "说明扰动风险仍在，但尚不足以支撑“严重限制/封锁”的判断。",
  },
  {
    id: "e2",
    time: "T-24h",
    title: "外交信号压低短期升级尾部",
    category: "diplomacy",
    severity: "stable",
    summary:
      "公开表态更接近“威慑 + 谈判”的组合，而不是已经确认的军事化封锁行动。",
    effect: "更支持“可控扰动”，而非“封锁”。",
  },
  {
    id: "e3",
    time: "T-12h",
    title: "流量代理指标未显示“广泛停航”",
    category: "flow",
    severity: "stable",
    summary:
      "通行代理指标存在噪声，但当前面板没有显示原油/液化天然气（LNG）运输出现广泛停止。",
    effect: "在官方限制显著收紧前，削弱“严重扰动”的判断。",
  },
  {
    id: "e4",
    time: "Now",
    title: "市场正在定价“部分冲击”",
    category: "market",
    severity: "elevated",
    summary:
      "原油风险溢价走强，但波动率、美元与权益组合还不像 closure-style shock。",
    effect: "市场定价更像“局部扰动”，而不是“封锁”。",
  },
];

export const mapCountries: MapCountry[] = [
  {
    name: "Iran",
    rings: [
      [
        { lon: 60.822, lat: 31.495 }, { lon: 61.687, lat: 31.373 }, { lon: 61.826, lat: 31.035 }, { lon: 60.844, lat: 29.858 },
        { lon: 61.893, lat: 28.543 }, { lon: 62.762, lat: 28.246 }, { lon: 62.742, lat: 27.267 }, { lon: 63.32, lat: 27.117 },
        { lon: 63.141, lat: 26.625 }, { lon: 62.418, lat: 26.562 }, { lon: 61.833, lat: 26.225 }, { lon: 61.62, lat: 25.285 },
        { lon: 61.412, lat: 25.059 }, { lon: 60.633, lat: 25.275 }, { lon: 60.55, lat: 25.447 }, { lon: 60.467, lat: 25.29 },
        { lon: 59.044, lat: 25.4 }, { lon: 58.814, lat: 25.564 }, { lon: 58.17, lat: 25.544 }, { lon: 57.326, lat: 25.777 },
        { lon: 56.809, lat: 27.14 }, { lon: 56.124, lat: 27.161 }, { lon: 54.791, lat: 26.496 }, { lon: 54.308, lat: 26.715 },
        { lon: 53.716, lat: 26.709 }, { lon: 52.601, lat: 27.353 }, { lon: 52.46, lat: 27.633 }, { lon: 51.4, lat: 27.932 },
        { lon: 51.059, lat: 28.736 }, { lon: 50.805, lat: 28.934 }, { lon: 50.93, lat: 29.055 }, { lon: 50.644, lat: 29.143 },
        { lon: 50.655, lat: 29.449 }, { lon: 50.073, lat: 30.196 }, { lon: 49.532, lat: 30.023 }, { lon: 48.921, lat: 30.381 },
        { lon: 49.203, lat: 30.347 }, { lon: 49.211, lat: 30.506 }, { lon: 48.981, lat: 30.516 }, { lon: 48.915, lat: 30.042 },
        { lon: 48.464, lat: 29.989 }, { lon: 48.397, lat: 30.221 }, { lon: 48.014, lat: 30.464 }, { lon: 48.012, lat: 30.989 },
        { lon: 47.673, lat: 30.995 }, { lon: 47.679, lat: 31.408 },
      ],
      [
        { lon: 56.212, lat: 27.003 }, { lon: 55.947, lat: 26.696 }, { lon: 55.291, lat: 26.548 }, { lon: 55.774, lat: 26.797 },
        { lon: 55.758, lat: 26.954 }, { lon: 56.212, lat: 27.003 },
      ],
    ],
  },
  {
    name: "Oman",
    rings: [
      [
        { lon: 55.345, lat: 21.097 }, { lon: 55.637, lat: 22.002 }, { lon: 55.187, lat: 22.704 }, { lon: 55.195, lat: 23.025 },
        { lon: 55.538, lat: 23.77 }, { lon: 55.457, lat: 23.963 }, { lon: 55.998, lat: 24.081 }, { lon: 55.933, lat: 24.221 },
        { lon: 55.756, lat: 24.23 }, { lon: 55.799, lat: 24.886 }, { lon: 55.978, lat: 24.972 }, { lon: 56.099, lat: 24.731 },
        { lon: 56.383, lat: 24.978 }, { lon: 56.611, lat: 24.496 }, { lon: 57.152, lat: 23.954 }, { lon: 58.605, lat: 23.638 },
        { lon: 59.516, lat: 22.562 }, { lon: 59.825, lat: 22.509 }, { lon: 59.812, lat: 22.237 }, { lon: 59.344, lat: 21.445 },
        { lon: 58.839, lat: 21.045 },
      ],
      [
        { lon: 56.077, lat: 26.061 }, { lon: 56.208, lat: 26.263 }, { lon: 56.404, lat: 26.215 }, { lon: 56.308, lat: 26.222 },
        { lon: 56.364, lat: 26.386 }, { lon: 56.501, lat: 26.359 }, { lon: 56.399, lat: 26.269 }, { lon: 56.48, lat: 26.146 },
        { lon: 56.329, lat: 26.173 }, { lon: 56.473, lat: 26.099 }, { lon: 56.279, lat: 25.627 }, { lon: 56.145, lat: 25.671 },
        { lon: 56.183, lat: 26.015 }, { lon: 56.077, lat: 26.061 },
      ],
    ],
  },
  {
    name: "United Arab Emirates",
    rings: [[
      { lon: 56.279, lat: 25.627 }, { lon: 56.383, lat: 24.978 }, { lon: 56.099, lat: 24.731 }, { lon: 55.978, lat: 24.972 },
      { lon: 55.799, lat: 24.886 }, { lon: 55.756, lat: 24.23 }, { lon: 55.933, lat: 24.221 }, { lon: 55.998, lat: 24.081 },
      { lon: 55.457, lat: 23.963 }, { lon: 55.538, lat: 23.77 }, { lon: 55.12, lat: 22.623 }, { lon: 52.558, lat: 22.939 },
      { lon: 51.579, lat: 24.102 }, { lon: 51.594, lat: 24.385 }, { lon: 51.929, lat: 23.965 }, { lon: 52.341, lat: 24.008 },
      { lon: 52.6, lat: 24.21 }, { lon: 53.879, lat: 24.065 }, { lon: 54.427, lat: 24.292 }, { lon: 54.574, lat: 24.447 },
      { lon: 54.417, lat: 24.535 }, { lon: 54.582, lat: 24.508 }, { lon: 54.643, lat: 24.749 }, { lon: 55.329, lat: 25.201 },
      { lon: 55.551, lat: 25.579 }, { lon: 55.952, lat: 25.772 }, { lon: 56.077, lat: 26.061 }, { lon: 56.183, lat: 26.015 },
      { lon: 56.145, lat: 25.671 }, { lon: 56.279, lat: 25.627 },
    ]],
  },
  {
    name: "Qatar",
    rings: [[
      { lon: 50.808, lat: 24.747 }, { lon: 50.785, lat: 25.605 }, { lon: 50.899, lat: 25.532 }, { lon: 50.984, lat: 25.981 },
      { lon: 51.251, lat: 26.16 }, { lon: 51.577, lat: 25.881 }, { lon: 51.472, lat: 25.521 }, { lon: 51.611, lat: 25.022 },
      { lon: 51.341, lat: 24.57 }, { lon: 51.278, lat: 24.663 }, { lon: 50.979, lat: 24.568 }, { lon: 50.808, lat: 24.747 },
    ]],
  },
  {
    name: "Saudi Arabia",
    rings: [[
      { lon: 46.024, lat: 29.09 }, { lon: 47.434, lat: 28.995 }, { lon: 47.668, lat: 28.534 }, { lon: 48.495, lat: 28.5 },
      { lon: 48.652, lat: 28.046 }, { lon: 48.883, lat: 27.827 }, { lon: 48.832, lat: 27.612 }, { lon: 49.24, lat: 27.545 },
      { lon: 49.313, lat: 27.449 }, { lon: 49.12, lat: 27.441 }, { lon: 49.264, lat: 27.414 }, { lon: 49.375, lat: 27.149 },
      { lon: 49.572, lat: 27.194 }, { lon: 49.699, lat: 26.958 }, { lon: 50.158, lat: 26.665 }, { lon: 49.988, lat: 26.724 },
      { lon: 50.217, lat: 26.324 }, { lon: 50.141, lat: 26.036 }, { lon: 50.032, lat: 26.201 }, { lon: 49.99, lat: 26.002 },
      { lon: 50.472, lat: 25.437 }, { lon: 50.761, lat: 24.736 }, { lon: 50.979, lat: 24.568 }, { lon: 51.498, lat: 24.584 },
      { lon: 51.279, lat: 24.308 }, { lon: 51.569, lat: 24.256 }, { lon: 51.594, lat: 24.078 }, { lon: 52.538, lat: 22.955 },
      { lon: 55.105, lat: 22.621 }, { lon: 55.187, lat: 22.704 }, { lon: 55.637, lat: 22.002 }, { lon: 55.345, lat: 21.097 },
    ]],
  },
  {
    name: "Kuwait",
    rings: [[
      { lon: 47.948, lat: 29.994 }, { lon: 48.177, lat: 29.542 }, { lon: 47.966, lat: 29.576 }, { lon: 47.705, lat: 29.364 },
      { lon: 48.1, lat: 29.35 }, { lon: 48.433, lat: 28.54 }, { lon: 47.668, lat: 28.534 }, { lon: 47.434, lat: 28.995 },
      { lon: 46.532, lat: 29.096 }, { lon: 47.145, lat: 30.003 }, { lon: 47.674, lat: 30.098 }, { lon: 47.948, lat: 29.994 },
    ]],
  },
  {
    name: "Iraq",
    rings: [[
      { lon: 47.679, lat: 31.408 }, { lon: 47.673, lat: 30.995 }, { lon: 48.012, lat: 30.989 }, { lon: 48.014, lat: 30.464 },
      { lon: 48.306, lat: 30.313 }, { lon: 48.559, lat: 29.947 }, { lon: 47.969, lat: 30.004 }, { lon: 47.935, lat: 30.107 },
      { lon: 47.948, lat: 29.994 }, { lon: 47.358, lat: 30.092 }, { lon: 47.145, lat: 30.003 }, { lon: 46.532, lat: 29.096 },
      { lon: 46.024, lat: 29.09 },
    ]],
  },
];

export const shippingLanes: ShippingLane[] = [
  {
    id: "major-eastbound",
    label: "Hormuz eastbound trunk 主航线",
    laneClass: "major",
    source: "Global Shipping Lanes v1, Major lane subset",
    coordinates: [
      { lon: 56.703, lat: 26.373 }, { lon: 57.169, lat: 25.817 },
      { lon: 57.461, lat: 25.464 }, { lon: 59.308, lat: 20.245 },
      { lon: 60.152, lat: 21.91 }, { lon: 60.214, lat: 22.475 },
    ],
  },
  {
    id: "major-westbound",
    label: "Gulf of Oman inbound lane 入湾航线",
    laneClass: "major",
    source: "Global Shipping Lanes v1, Major lane subset",
    coordinates: [
      { lon: 49.047, lat: 13.712 }, { lon: 56.74, lat: 17.239 },
      { lon: 58.274, lat: 18.827 }, { lon: 59.308, lat: 20.245 },
      { lon: 60.152, lat: 21.91 }, { lon: 60.214, lat: 22.475 },
      { lon: 57.461, lat: 25.464 }, { lon: 57.169, lat: 25.817 },
      { lon: 56.703, lat: 26.373 },
    ],
  },
  {
    id: "pipeline-bypass",
    label: "indicative bypass corridor 替代走廊",
    laneClass: "bypass",
    source: "Analyst overlay from public pipeline/bypass capacity notes",
    coordinates: [
      { lon: 48.5, lat: 28.6 }, { lon: 51.6, lat: 24.5 },
      { lon: 55.2, lat: 22.7 }, { lon: 58.5, lat: 20.4 },
    ],
  },
];

export const mapPlaces: MapPlace[] = [
  { id: "bandar-abbas", label: "Bandar Abbas", kind: "port", x: 612, y: 347 },
  { id: "fujairah", label: "Fujairah", kind: "port", x: 618, y: 433 },
  { id: "muscat", label: "Muscat", kind: "place", x: 722, y: 465 },
  { id: "gulf-oman", label: "Gulf of Oman", kind: "place", x: 752, y: 342 },
  { id: "persian-gulf", label: "Persian Gulf", kind: "place", x: 382, y: 284 },
];

export const marketSeries = generatedMarketSeries as MarketSeries[];
