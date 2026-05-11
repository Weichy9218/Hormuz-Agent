// Domain-shaped demo data for the Hormuz forecasting case room.
// Responsibility: provide fixed, reproducible demo inputs (events, signals, scenarios, checkpoints).
import type {
  Checkpoint,
  DailyBrief,
  DetailPage,
  EventItem,
  FlowMetric,
  MapCountry,
  MarketSeries,
  Scenario,
  ShippingLane,
} from "./types";
export { sourceGroups, sourceRegistry } from "./data/sourceRegistry";

export const detailPages: DetailPage[] = [
  { id: "overview", label: "概览" },
  { id: "map", label: "航线" },
  { id: "market", label: "市场" },
  { id: "forecast", label: "预测" },
];

export const events: EventItem[] = [
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
      "原油与波动率信号走强，黄金与美元指数体现避险需求，但权益资产回撤仍可控。",
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

export const marketSeries: MarketSeries[] = [
  {
    id: "brent-spot",
    label: "Brent 现货",
    unit: "USD/bbl",
    color: "#f0b84a",
    source: "FRED DCOILBRENTEU",
    sourceUrl: "https://fred.stlouisfed.org/series/DCOILBRENTEU",
    verifiedAt: "2026-05-10",
    caveat: "FRED 日频源的展示抽样点；不是完整逐日序列。",
    points: [
      { date: "2026-03-02", value: 77.24 }, { date: "2026-03-09", value: 94.35 },
      { date: "2026-03-16", value: 101.04 }, { date: "2026-03-23", value: 103.79 },
      { date: "2026-03-30", value: 121.88 }, { date: "2026-04-08", value: 122.11 },
      { date: "2026-04-15", value: 114.93 }, { date: "2026-04-22", value: 113.44 },
      { date: "2026-04-29", value: 124.16 }, { date: "2026-05-01", value: 118.26 },
    ],
  },
  {
    id: "wti-spot",
    label: "WTI 现货",
    unit: "USD/bbl",
    color: "#ff8743",
    source: "FRED DCOILWTICO",
    sourceUrl: "https://fred.stlouisfed.org/series/DCOILWTICO",
    verifiedAt: "2026-05-10",
    caveat: "FRED 日频源的展示抽样点；不是完整逐日序列。",
    points: [
      { date: "2026-03-02", value: 71.13 }, { date: "2026-03-09", value: 94.65 },
      { date: "2026-03-16", value: 93.39 }, { date: "2026-03-23", value: 89.33 },
      { date: "2026-03-30", value: 104.69 }, { date: "2026-04-07", value: 114.58 },
      { date: "2026-04-14", value: 93.07 }, { date: "2026-04-21", value: 93.64 },
      { date: "2026-04-28", value: 103.45 }, { date: "2026-05-04", value: 109.76 },
    ],
  },
  {
    id: "vix",
    label: "VIX",
    unit: "index",
    color: "#ff6b45",
    source: "FRED VIXCLS",
    sourceUrl: "https://fred.stlouisfed.org/series/VIXCLS",
    verifiedAt: "2026-05-10",
    caveat: "FRED 日频源的展示抽样点；不是完整逐日序列。",
    points: [
      { date: "2026-03-02", value: 21.44 }, { date: "2026-03-09", value: 25.5 },
      { date: "2026-03-16", value: 23.51 }, { date: "2026-03-23", value: 26.15 },
      { date: "2026-03-30", value: 30.61 }, { date: "2026-04-07", value: 25.78 },
      { date: "2026-04-14", value: 18.36 }, { date: "2026-04-21", value: 19.5 },
      { date: "2026-04-28", value: 17.83 }, { date: "2026-05-05", value: 17.38 },
      { date: "2026-05-07", value: 17.08 },
    ],
  },
  {
    id: "broad-usd",
    label: "美元指数（Broad USD）",
    unit: "index",
    color: "#8bd3c7",
    source: "FRED DTWEXBGS",
    sourceUrl: "https://fred.stlouisfed.org/series/DTWEXBGS",
    verifiedAt: "2026-05-10",
    caveat: "FRED 日频源的展示抽样点；不是完整逐日序列。",
    points: [
      { date: "2026-03-02", value: 118.667 }, { date: "2026-03-09", value: 119.5151 },
      { date: "2026-03-16", value: 120.097 }, { date: "2026-03-23", value: 119.9371 },
      { date: "2026-03-30", value: 121.2851 }, { date: "2026-04-06", value: 120.4302 },
      { date: "2026-04-13", value: 118.9916 }, { date: "2026-04-20", value: 118.2374 },
      { date: "2026-04-27", value: 118.5458 }, { date: "2026-05-01", value: 118.3926 },
    ],
  },
  {
    id: "us10y",
    label: "美债 10Y（US10Y）",
    unit: "%",
    color: "#9fa8da",
    source: "FRED DGS10",
    sourceUrl: "https://fred.stlouisfed.org/series/DGS10",
    verifiedAt: "2026-05-10",
    caveat: "FRED 日频源的展示抽样点；不是完整逐日序列。",
    points: [
      { date: "2026-03-02", value: 4.05 }, { date: "2026-03-09", value: 4.12 },
      { date: "2026-03-16", value: 4.23 }, { date: "2026-03-23", value: 4.34 },
      { date: "2026-03-30", value: 4.35 }, { date: "2026-04-06", value: 4.34 },
      { date: "2026-04-13", value: 4.3 }, { date: "2026-04-20", value: 4.26 },
      { date: "2026-04-27", value: 4.35 }, { date: "2026-05-04", value: 4.45 },
      { date: "2026-05-07", value: 4.41 },
    ],
  },
  {
    id: "sp500",
    label: "标普 500（S&P 500）",
    unit: "index",
    color: "#56b9ff",
    source: "FRED SP500",
    sourceUrl: "https://fred.stlouisfed.org/series/SP500",
    verifiedAt: "2026-05-10",
    caveat: "FRED 日频源的展示抽样点；不是完整逐日序列。",
    points: [
      { date: "2026-03-02", value: 6881.62 }, { date: "2026-03-09", value: 6795.99 },
      { date: "2026-03-16", value: 6699.38 }, { date: "2026-03-23", value: 6581 },
      { date: "2026-03-30", value: 6343.72 }, { date: "2026-04-07", value: 6616.85 },
      { date: "2026-04-14", value: 6967.38 }, { date: "2026-04-21", value: 7064.01 },
      { date: "2026-04-28", value: 7138.8 }, { date: "2026-05-05", value: 7259.22 },
      { date: "2026-05-08", value: 7398.93 },
    ],
  },
];

export const flowMetrics: FlowMetric[] = [
  {
    id: "oil-flow",
    label: "霍尔木兹油流量",
    value: "20.9",
    unit: "mb/d",
    detail: "EIA 2023 petroleum liquids transit baseline；IEA 2025 约 20 mb/d",
    tone: "critical",
  },
  {
    id: "bypass",
    label: "可替代绕行能力",
    value: "3.5–5.5",
    unit: "mb/d",
    detail: "替代 pipeline capacity 有上限，无法完全吸收冲击",
    tone: "warning",
  },
  {
    id: "vessels",
    label: "AIS 流量代理（proxy）",
    value: "待接入",
    unit: "授权数据",
    detail: "未接入授权 AIS 前不展示真实船数；此处仅保留“流量观察”占位",
    tone: "info",
  },
];

export const dailyBriefs: DailyBrief[] = [
  {
    id: "brief-2026-05-08",
    date: "2026-05-08 08:30 GMT+8",
    headline: "已出现局部压力，但尚无“已确认的封锁”",
    riskLevel: "elevated",
    anomalies: [
      "原油/VIX 的再定价与“可控扰动”一致。",
      "可追溯事实中未出现“广泛停航”。",
      "下一步重点观察“官方通告措辞是否升级”。",
    ],
    analystNote:
      "系统只应在“流量证据”或“官方通告措辞”变化时更新概率，不能仅被“新闻措辞/口头表态”带动。",
  },
  {
    id: "brief-2026-05-09",
    date: "2026-05-09 08:30 GMT+8",
    headline: "当前主线是“保险与官方通告”的观测",
    riskLevel: "elevated",
    anomalies: [
      "“可控扰动”仍是主情景，“严重扰动”为活跃尾部。",
      "Gold 与 DXY 同动更像避险需求，而不是单一的“原油机制”。",
      "流量数据存在滞后，避免过度解读单日市场波动。",
    ],
    analystNote:
      "每日更新应保留昨日预测轨迹（forecast trace），只追加简短的修订原因（revision reason）。",
  },
];

export const baseScenarios: Scenario[] = [
  {
    id: "normal",
    label: "正常通行",
    color: "#54b6ff",
    posture: "风险缓和趋势，但仍需保持高频监测",
  },
  {
    id: "controlled_disruption",
    label: "可控扰动",
    color: "#f0b84a",
    posture: "选择性延误 + 保险溢价上行，但无“全面封锁”证据",
  },
  {
    id: "severe_disruption",
    label: "严重扰动",
    color: "#ff8743",
    posture: "重复事件或官方限制开始实质影响通行流量",
  },
  {
    id: "closure",
    label: "封锁（尾部情景）",
    color: "#f25a5a",
    posture: "尾部情景：需要强于“新闻措辞/口头表态”的实证信号",
  },
];

export const checkpoints: Checkpoint[] = [
  {
    id: "cp1",
    label: "Checkpoint 01",
    time: "2026-05-07 08:00 GMT+8",
    forecast: "controlled_disruption",
    confidence: "med",
    probabilities: {
      normal: 50,
      controlled_disruption: 22,
      severe_disruption: 11,
      closure: 17,
    },
    revision:
      "上轮“封锁（尾部情景）”概率偏高，因为新闻措辞权重超过了通行与流量证据。",
    keyEvidence: [
      "官方能源基线说明该 chokepoint 具有结构性重要性。",
      "案例状态中未出现广泛通行中断信号。",
    ],
    counterevidence: [
      "军事与外交信号仍可能快速升级。",
    ],
    unresolvedConcerns: [
      "官方海事通告是否从 monitoring 转向 avoidance。",
    ],
  },
  {
    id: "cp2",
    label: "Checkpoint 02",
    time: "2026-05-08 20:00 GMT+8",
    forecast: "controlled_disruption",
    confidence: "med",
    probabilities: {
      normal: 45,
      controlled_disruption: 30,
      severe_disruption: 15,
      closure: 10,
    },
    revision:
      "“严重扰动”上调，因为 Oil/VIX 再定价确认了压力；“封锁（尾部情景）”下调，因为仍缺少流量停止的实证信号。",
    keyEvidence: [
      "Oil 与 VIX 同向反映风险再定价。",
      "通行/流量代理层仍指向局部压力，而不是全面封锁。",
      "外交信号仍不支持 hard blockade 作为 base case。",
    ],
    counterevidence: [
      "避险信号存在噪声，可能反映更宽泛的 macro risk。",
    ],
    unresolvedConcerns: [
      "insurance 与 chartering data 可能滞后于真实通行压力。",
      "单条官方海事通告就可能显著改变情景概率分布。",
    ],
  },
];
