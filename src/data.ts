// UI-presentational demo data: map geometry, shipping lanes, market series for charts,
// page tabs, and narrative events.
//
// Business state (scenario distribution, evidence, mechanism, judgement, checkpoint)
// lives in src/state/canonicalStore.ts and is accessed through projections.
import type {
  DetailPage,
  NarrativeEvent,
  MapCountry,
  MarketSeries,
  ShippingLane,
} from "./types";
import generatedMarketSeries from "../data/generated/market_series.json";
export { sourceGroups, sourceRegistry, sourceBoundaryFacts } from "./data/sourceRegistry";

export const detailPages: DetailPage[] = [
  { id: "overview", label: "概览" },
  { id: "market", label: "市场" },
  { id: "news", label: "新闻" },
  { id: "forecast", label: "预测" },
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
    rings: [[
      { lon: 48.568, lat: 29.927 }, { lon: 48.015, lat: 30.453 },
      { lon: 48.005, lat: 30.985 }, { lon: 47.685, lat: 30.985 },
      { lon: 47.849, lat: 31.709 }, { lon: 60.942, lat: 31.548 },
      { lon: 61.699, lat: 31.38 }, { lon: 61.781, lat: 30.736 },
      { lon: 60.874, lat: 29.829 }, { lon: 61.369, lat: 29.303 },
      { lon: 61.772, lat: 28.699 }, { lon: 62.728, lat: 28.26 },
      { lon: 62.755, lat: 27.379 }, { lon: 63.234, lat: 27.217 },
      { lon: 63.317, lat: 26.756 }, { lon: 61.874, lat: 26.24 },
      { lon: 61.497, lat: 25.078 }, { lon: 59.616, lat: 25.38 },
      { lon: 58.526, lat: 25.61 }, { lon: 57.397, lat: 25.74 },
      { lon: 56.971, lat: 26.966 }, { lon: 56.492, lat: 27.143 },
      { lon: 55.724, lat: 26.965 }, { lon: 54.715, lat: 26.481 },
      { lon: 53.493, lat: 26.812 }, { lon: 52.484, lat: 27.581 },
      { lon: 51.521, lat: 27.866 }, { lon: 50.853, lat: 28.814 },
      { lon: 50.115, lat: 30.148 }, { lon: 49.577, lat: 29.986 },
      { lon: 48.941, lat: 30.317 }, { lon: 48.568, lat: 29.927 },
    ]],
  },
  {
    name: "Oman",
    rings: [
      [
        { lon: 55.208, lat: 22.708 }, { lon: 55.234, lat: 23.111 },
        { lon: 55.526, lat: 23.525 }, { lon: 55.529, lat: 23.934 },
        { lon: 55.981, lat: 24.131 }, { lon: 55.804, lat: 24.27 },
        { lon: 55.886, lat: 24.921 }, { lon: 56.397, lat: 24.925 },
        { lon: 56.845, lat: 24.242 }, { lon: 57.404, lat: 23.879 },
        { lon: 58.137, lat: 23.748 }, { lon: 58.729, lat: 23.566 },
        { lon: 59.181, lat: 22.992 }, { lon: 59.45, lat: 22.66 },
        { lon: 59.808, lat: 22.534 }, { lon: 59.806, lat: 22.311 },
        { lon: 59.442, lat: 21.715 }, { lon: 59.282, lat: 21.434 },
        { lon: 58.861, lat: 21.114 }, { lon: 58.488, lat: 20.429 },
        { lon: 58.034, lat: 20.481 }, { lon: 57.826, lat: 20.243 },
        { lon: 55, lat: 20 }, { lon: 55.667, lat: 22 },
        { lon: 55.208, lat: 22.708 },
      ],
      [
        { lon: 56.261, lat: 25.715 }, { lon: 56.071, lat: 26.055 },
        { lon: 56.362, lat: 26.396 }, { lon: 56.486, lat: 26.309 },
        { lon: 56.391, lat: 25.896 }, { lon: 56.261, lat: 25.715 },
      ],
    ],
  },
  {
    name: "United Arab Emirates",
    rings: [[
      { lon: 51.58, lat: 24.245 }, { lon: 51.757, lat: 24.294 },
      { lon: 51.794, lat: 24.02 }, { lon: 52.577, lat: 24.177 },
      { lon: 53.404, lat: 24.151 }, { lon: 54.008, lat: 24.122 },
      { lon: 54.693, lat: 24.798 }, { lon: 55.439, lat: 25.439 },
      { lon: 56.071, lat: 26.055 }, { lon: 56.261, lat: 25.715 },
      { lon: 56.397, lat: 24.925 }, { lon: 55.886, lat: 24.921 },
      { lon: 55.804, lat: 24.27 }, { lon: 55.981, lat: 24.131 },
      { lon: 55.529, lat: 23.934 }, { lon: 55.526, lat: 23.525 },
      { lon: 55.234, lat: 23.111 }, { lon: 55.208, lat: 22.708 },
      { lon: 55.007, lat: 22.497 }, { lon: 52.001, lat: 23.001 },
      { lon: 51.618, lat: 24.014 }, { lon: 51.58, lat: 24.245 },
    ]],
  },
  {
    name: "Qatar",
    rings: [[
      { lon: 50.81, lat: 24.755 }, { lon: 50.744, lat: 25.482 },
      { lon: 51.013, lat: 26.007 }, { lon: 51.286, lat: 26.115 },
      { lon: 51.589, lat: 25.801 }, { lon: 51.607, lat: 25.216 },
      { lon: 51.39, lat: 24.627 }, { lon: 51.112, lat: 24.556 },
      { lon: 50.81, lat: 24.755 },
    ]],
  },
  {
    name: "Saudi Arabia",
    rings: [[
      { lon: 44.709, lat: 29.179 }, { lon: 46.569, lat: 29.099 },
      { lon: 47.46, lat: 29.003 }, { lon: 47.709, lat: 28.526 },
      { lon: 48.416, lat: 28.552 }, { lon: 48.808, lat: 27.69 },
      { lon: 49.3, lat: 27.461 }, { lon: 49.471, lat: 27.11 },
      { lon: 50.152, lat: 26.69 }, { lon: 50.213, lat: 26.277 },
      { lon: 50.113, lat: 25.944 }, { lon: 50.24, lat: 25.608 },
      { lon: 50.527, lat: 25.328 }, { lon: 50.661, lat: 25 },
      { lon: 50.81, lat: 24.755 }, { lon: 51.112, lat: 24.556 },
      { lon: 51.39, lat: 24.627 }, { lon: 51.58, lat: 24.245 },
      { lon: 51.618, lat: 24.014 }, { lon: 52.001, lat: 23.001 },
      { lon: 55.007, lat: 22.497 }, { lon: 55.208, lat: 22.708 },
      { lon: 55.667, lat: 22 }, { lon: 55, lat: 20 },
      { lon: 44.709, lat: 29.179 },
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

export const marketSeries = generatedMarketSeries as MarketSeries[];
