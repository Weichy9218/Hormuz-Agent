// Single forecast-state contract consumed by the Forecast page and API seam.
import type { AgentRunEvent } from "../types/agentEvents";
import type {
  ForecastRunResponse,
  ForecastTarget,
  ScenarioKey,
  TargetForecast,
} from "../types/forecast";

export const scenarioOrder: ScenarioKey[] = [
  "normal",
  "controlled_disruption",
  "severe_disruption",
  "closure",
];

export const forecastTargetOptions: Array<{
  target: ForecastTarget;
  label: string;
  group: "assets" | "war_trend";
}> = [
  { target: "brent", label: "Brent", group: "assets" },
  { target: "wti", label: "WTI", group: "assets" },
  { target: "gold", label: "Gold", group: "assets" },
  { target: "usd_broad", label: "Broad USD", group: "assets" },
  { target: "usdcny", label: "USD/CNY", group: "assets" },
  { target: "us10y", label: "US10Y", group: "assets" },
  { target: "vix", label: "VIX", group: "assets" },
  { target: "sp500", label: "S&P 500", group: "assets" },
  { target: "escalation_7d", label: "Gulf escalation 7d", group: "war_trend" },
  {
    target: "transit_disruption_7d",
    label: "Transit disruption 7d",
    group: "war_trend",
  },
  { target: "spillover_30d", label: "Regional spillover 30d", group: "war_trend" },
  {
    target: "deescalation_14d",
    label: "De-escalation signal 14d",
    group: "war_trend",
  },
];

export const targetLabel: Record<ForecastTarget, string> =
  Object.fromEntries(
    forecastTargetOptions.map((option) => [option.target, option.label]),
  ) as Record<ForecastTarget, string>;

export const scenarioLabel: Record<ScenarioKey, string> = {
  normal: "正常通行",
  controlled_disruption: "可控扰动",
  severe_disruption: "严重扰动",
  closure: "封锁（尾部情景）",
};

export const scenarioPosture: Record<ScenarioKey, string> = {
  normal: "风险缓和趋势，但仍需保持高频监测",
  controlled_disruption: "选择性延误 + 保险溢价上行，但无“全面封锁”证据",
  severe_disruption: "重复事件或官方限制开始实质影响通行流量",
  closure: "尾部情景：需要强于新闻措辞或口头表态的实证信号",
};

export const scenarioColor: Record<ScenarioKey, string> = {
  normal: "#54b6ff",
  controlled_disruption: "#f0b84a",
  severe_disruption: "#ff8743",
  closure: "#f25a5a",
};

const previousScenario: Record<ScenarioKey, number> = {
  normal: 50,
  controlled_disruption: 22,
  severe_disruption: 11,
  closure: 17,
};

const currentScenario: Record<ScenarioKey, number> = {
  normal: 45,
  controlled_disruption: 30,
  severe_disruption: 15,
  closure: 10,
};

const scenarioDelta: Record<ScenarioKey, number> = {
  normal: -5,
  controlled_disruption: 8,
  severe_disruption: 4,
  closure: -7,
};

const targetForecasts: TargetForecast[] = [
  {
    target: "brent",
    horizon: "7d",
    signal: "up",
    confidence: 0.67,
    rationale: "controlled disruption 仍是主情景，oil risk premium 保持正向。",
  },
  {
    target: "wti",
    horizon: "7d",
    signal: "up",
    confidence: 0.61,
    rationale: "方向跟随 Brent，但美国本土基准的 Hormuz beta 略低。",
  },
  {
    target: "gold",
    horizon: "7d",
    signal: "uncertain",
    confidence: 0.42,
    rationale: "safe-haven channel 合理，但 Gold source 仍 pending，不能给高置信。",
  },
  {
    target: "usd_broad",
    horizon: "7d",
    signal: "up",
    confidence: 0.55,
    rationale: "避险需求支持 Broad USD，但不是 closure 式美元短缺冲击。",
  },
  {
    target: "usdcny",
    horizon: "7d",
    signal: "up",
    confidence: 0.52,
    rationale: "使用 USD/CNY 公开 daily mirror；政策锚和 CNH market 尚需分层。",
  },
  {
    target: "us10y",
    horizon: "7d",
    signal: "flat",
    confidence: 0.46,
    rationale: "energy inflation 与 risk-off duration demand 方向相互抵消。",
  },
  {
    target: "vix",
    horizon: "7d",
    signal: "up",
    confidence: 0.64,
    rationale: "市场已定价局部压力，VIX 对 headline risk 更敏感。",
  },
  {
    target: "sp500",
    horizon: "7d",
    signal: "down",
    confidence: 0.57,
    rationale: "权益风险偏好受压，但尚未出现 closure base-case 式冲击。",
  },
  {
    target: "escalation_7d",
    horizon: "7d",
    signal: "up",
    confidence: 0.58,
    rationale: "官方通告与海事风险抬升支持 Gulf theater 短期升级概率上行。",
  },
  {
    target: "transit_disruption_7d",
    horizon: "7d",
    signal: "up",
    confidence: 0.62,
    rationale: "保险、绕行和通告措辞是更直接触发项。",
  },
  {
    target: "spillover_30d",
    horizon: "30d",
    signal: "uncertain",
    confidence: 0.45,
    rationale: "spillover 需要更多冲突事件层证据，目前 ACLED 仅作候选层。",
  },
  {
    target: "deescalation_14d",
    horizon: "14d",
    signal: "down",
    confidence: 0.5,
    rationale: "短期缓和信号不足，但外交通道仍是 counter evidence。",
  },
];

function buildEvents(runId: string): AgentRunEvent[] {
  return [
    {
      type: "run_started",
      runId,
      at: "T+00:00",
      title: "预测运行开始",
      summary:
        "本轮只回答 Hormuz 情景是否修订，以及修订如何传导到资产和 war-trend targets。",
    },
    {
      type: "source_read",
      runId,
      at: "T+00:04",
      sourceIds: [
        "eia-iea-hormuz",
        "official-advisory",
        "fred-market",
        "ais-flow-pending",
        "acled-conflict",
        "ucdp-ged",
      ],
      status: "fresh",
      title: "读取固定信源 bundle",
      summary:
        "live operational、market benchmark、historical/backtest 和 pending source 被分开登记；UCDP 只进入历史基线，不作为 live signal。",
    },
    {
      type: "evidence_added",
      runId,
      at: "T+00:11",
      evidenceId: "ev-market-risk-premium",
      title: "市场证据支持 risk premium",
      summary:
        "Oil/VIX 同向再定价支持风险溢价上行，但 Broad USD、US10Y 与 SPX 的组合还不像 closure 已被充分定价。",
      sourceIds: ["fred-market"],
      polarity: "support",
      mechanismTags: ["market_pricing_risk_premium", "energy_supply_risk_up"],
      affects: ["market", "scenario"],
    },
    {
      type: "evidence_added",
      runId,
      at: "T+00:18",
      evidenceId: "ev-flow-not-verified",
      title: "通行层仍未确认全面停航",
      summary:
        "AIS flow 仍是 pending，不能把未授权船流占位当成真实停航证据；这削弱 closure 作为主情景。",
      sourceIds: ["ais-flow-pending", "global-shipping-lanes"],
      polarity: "counter",
      mechanismTags: ["oil_flow_resilient", "market_not_pricing_closure"],
      affects: ["scenario", "watchlist"],
    },
    {
      type: "evidence_added",
      runId,
      at: "T+00:23",
      evidenceId: "ev-official-advisory",
      title: "官方通告仍需高频观察",
      summary:
        "海事通告是当前最强 live operational trigger；若措辞从 monitoring 转向 avoidance，将直接推高 severe disruption。",
      sourceIds: ["official-advisory"],
      polarity: "uncertain",
      mechanismTags: ["transit_risk_up", "insurance_cost_up", "naval_presence_up"],
      affects: ["scenario", "war_trend", "watchlist"],
    },
    {
      type: "judgement_updated",
      runId,
      at: "T+00:31",
      title: "情景与目标预测修订",
      reason:
        "市场压力确认局部扰动，但没有流量停止或官方 avoidance 级别证据，因此上调 controlled/severe，下调 closure。",
      previousScenario,
      currentScenario,
      scenarioDelta,
      targetDeltas: [
        {
          target: "brent",
          horizon: "7d",
          previous: "flat/up",
          current: "up",
          deltaLabel: "risk premium stronger",
        },
        {
          target: "vix",
          horizon: "7d",
          previous: "flat",
          current: "up",
          deltaLabel: "headline beta higher",
        },
        {
          target: "escalation_7d",
          horizon: "7d",
          previous: 0.34,
          current: 0.41,
          deltaLabel: "+7 pp",
        },
        {
          target: "deescalation_14d",
          horizon: "14d",
          previous: 0.38,
          current: 0.32,
          deltaLabel: "-6 pp",
        },
      ],
    },
    {
      type: "checkpoint_written",
      runId,
      at: "T+00:38",
      checkpointId: "cp2",
      title: "Checkpoint 写回",
      summary:
        "本轮保留 controlled disruption 作为主情景，并把 revision reason、target deltas 与 next watch 写回。",
      revisionReason:
        "Oil/VIX 证明风险被部分定价；缺少 verified flow stop 和 official avoidance，使 closure 仍是尾部。",
      nextWatch: [
        "UKMTO / JMIC / MARAD 是否出现 avoidance 或 threat wording 升级",
        "授权 AIS / tanker / LNG flow 是否显示连续下降",
        "保险、chartering 或 freight rate 是否出现非线性跳升",
      ],
    },
    {
      type: "run_completed",
      runId,
      at: "T+00:42",
      title: "预测运行完成",
      summary:
        "事件流、scenario distribution、asset forecasts、war-trend forecasts 与 checkpoint 保持同一数据契约。",
    },
  ];
}

export function createDemoForecastRun(
  selectedTarget: ForecastTarget = "brent",
): ForecastRunResponse {
  const runId = `demo-hormuz-${selectedTarget}`;
  return {
    runId,
    generatedAt: "2026-05-11T09:30:00+08:00",
    scenarioDistribution: currentScenario,
    targetForecasts,
    events: buildEvents(runId),
    checkpoint: {
      checkpointId: "cp2",
      revisionReason:
        "Oil/VIX 证明风险被部分定价；缺少 verified flow stop 和 official avoidance，使 closure 仍是尾部。",
      nextWatch: [
        "UKMTO / JMIC / MARAD 是否出现 avoidance 或 threat wording 升级",
        "授权 AIS / tanker / LNG flow 是否显示连续下降",
        "保险、chartering 或 freight rate 是否出现非线性跳升",
      ],
    },
  };
}

export const initialForecastRun = createDemoForecastRun();

export function getDominantScenario(
  distribution: Record<ScenarioKey, number>,
): ScenarioKey {
  return scenarioOrder.reduce((best, candidate) =>
    distribution[candidate] > distribution[best] ? candidate : best,
  );
}

export function getFocusedForecasts(
  response: ForecastRunResponse,
  selectedTarget: ForecastTarget,
) {
  const selected = response.targetForecasts.find(
    (forecast) => forecast.target === selectedTarget,
  );
  return selected ? [selected, ...response.targetForecasts.filter((item) => item !== selected)] : response.targetForecasts;
}
