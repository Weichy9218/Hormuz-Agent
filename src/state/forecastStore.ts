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
  "controlled",
  "severe",
  "closure",
];

export const forecastTargetOptions: Array<{
  target: ForecastTarget;
  label: string;
  group: "assets" | "risk_targets";
}> = [
  { target: "brent", label: "Brent", group: "assets" },
  { target: "wti", label: "WTI", group: "assets" },
  { target: "gold", label: "Gold", group: "assets" },
  { target: "broad_usd", label: "Broad USD", group: "assets" },
  { target: "usd_cny", label: "USD/CNY", group: "assets" },
  { target: "usd_cnh", label: "USD/CNH pending", group: "assets" },
  { target: "us10y", label: "US10Y", group: "assets" },
  { target: "vix", label: "VIX", group: "assets" },
  { target: "sp500", label: "S&P 500", group: "assets" },
  {
    target: "regional_escalation_7d",
    label: "Regional escalation 7d",
    group: "risk_targets",
  },
  {
    target: "transit_disruption_7d",
    label: "Transit disruption 7d",
    group: "risk_targets",
  },
  {
    target: "state_on_state_strike_14d",
    label: "State-on-state strike 14d",
    group: "risk_targets",
  },
  {
    target: "deescalation_signal_14d",
    label: "De-escalation signal 14d",
    group: "risk_targets",
  },
];

export const targetLabel: Record<ForecastTarget, string> =
  Object.fromEntries(
    forecastTargetOptions.map((option) => [option.target, option.label]),
  ) as Record<ForecastTarget, string>;

export const scenarioLabel: Record<ScenarioKey, string> = {
  normal: "正常通行",
  controlled: "可控扰动",
  severe: "严重扰动",
  closure: "封锁（尾部情景）",
};

export const scenarioPosture: Record<ScenarioKey, string> = {
  normal: "风险缓和趋势，但仍需保持高频监测",
  controlled: "选择性延误 + 保险溢价上行，但无“全面封锁”证据",
  severe: "重复事件或官方限制开始实质影响通行流量",
  closure: "尾部情景：需要强于新闻措辞或口头表态的实证信号",
};

export const scenarioColor: Record<ScenarioKey, string> = {
  normal: "#94a3b8",
  controlled: "#0b66f6",
  severe: "#ff9f1c",
  closure: "#ef2b2d",
};

const previousScenario: Record<ScenarioKey, number> = {
  normal: 23,
  controlled: 52,
  severe: 18,
  closure: 7,
};

const currentScenario: Record<ScenarioKey, number> = {
  normal: 14,
  controlled: 58,
  severe: 22,
  closure: 6,
};

const scenarioDelta: Record<ScenarioKey, number> = {
  normal: -9,
  controlled: 6,
  severe: 4,
  closure: -1,
};

const targetForecasts: TargetForecast[] = [
  {
    target: "brent",
    horizon: "7d",
    direction: "up",
    confidence: 0.67,
    deltaLabel: "+ risk premium",
    rationale: "controlled 仍是主情景，oil risk premium 保持正向。",
    sourceIds: ["fred-market", "official-advisory"],
  },
  {
    target: "wti",
    horizon: "7d",
    direction: "up",
    confidence: 0.61,
    deltaLabel: "+ risk premium",
    rationale: "方向跟随 Brent，但美国本土基准的 Hormuz beta 略低。",
    sourceIds: ["fred-market"],
  },
  {
    target: "gold",
    horizon: "7d",
    direction: "uncertain",
    confidence: 0.42,
    deltaLabel: "pending source",
    rationale: "safe-haven channel 合理，但 Gold source 仍 pending，不能给高置信。",
    sourceIds: ["gold-pending"],
  },
  {
    target: "broad_usd",
    horizon: "7d",
    direction: "up",
    confidence: 0.55,
    deltaLabel: "+ safe haven demand",
    rationale: "避险需求支持 Broad USD，但不是 closure 式美元短缺冲击。",
    sourceIds: ["fred-market"],
  },
  {
    target: "usd_cny",
    horizon: "7d",
    direction: "up",
    confidence: 0.52,
    deltaLabel: "+ USD/CNY pressure",
    rationale: "USD/CNY 应单独保留；政策锚和 CNH market 尚需分层。",
    sourceIds: ["fred-market"],
  },
  {
    target: "usd_cnh",
    horizon: "7d",
    direction: "uncertain",
    confidence: 0.28,
    deltaLabel: "pending source",
    rationale: "USD/CNH 没有稳定源前只保留 schema，不作为 live market evidence。",
    sourceIds: ["usdcnh-pending"],
  },
  {
    target: "us10y",
    horizon: "7d",
    direction: "flat",
    confidence: 0.46,
    deltaLabel: "mixed channel",
    rationale: "energy inflation 与 risk-off duration demand 方向相互抵消。",
    sourceIds: ["fred-market"],
  },
  {
    target: "vix",
    horizon: "7d",
    direction: "up",
    confidence: 0.64,
    deltaLabel: "+ headline beta",
    rationale: "市场已定价局部压力，VIX 对 headline risk 更敏感。",
    sourceIds: ["fred-market"],
  },
  {
    target: "sp500",
    horizon: "7d",
    direction: "down",
    confidence: 0.57,
    deltaLabel: "- risk appetite",
    rationale: "权益风险偏好受压，但尚未出现 closure base-case 式冲击。",
    sourceIds: ["fred-market"],
  },
  {
    target: "regional_escalation_7d",
    horizon: "7d",
    direction: "up",
    confidence: 0.58,
    deltaLabel: "+7 pp",
    rationale: "官方通告与海事风险抬升支持短期区域升级概率上行。",
    sourceIds: ["official-advisory", "acled-conflict"],
  },
  {
    target: "transit_disruption_7d",
    horizon: "7d",
    direction: "up",
    confidence: 0.62,
    deltaLabel: "+ transit risk",
    rationale: "保险、绕行和通告措辞是更直接触发项。",
    sourceIds: ["official-advisory", "ais-flow-pending"],
  },
  {
    target: "state_on_state_strike_14d",
    horizon: "14d",
    direction: "uncertain",
    confidence: 0.45,
    deltaLabel: "needs conflict evidence",
    rationale: "国家间打击需要更多官方或冲突事件层证据，目前 ACLED 仅作候选层。",
    sourceIds: ["official-advisory", "acled-conflict"],
  },
  {
    target: "deescalation_signal_14d",
    horizon: "14d",
    direction: "down",
    confidence: 0.5,
    deltaLabel: "-6 pp",
    rationale: "短期缓和信号不足，但外交通道仍是 counter evidence。",
    sourceIds: ["official-advisory"],
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
        "本轮只回答 Hormuz 情景是否修订，以及修订如何传导到资产和风险预测 targets。",
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
        "gold-pending",
        "usdcnh-pending",
        "acled-conflict",
        "ucdp-ged",
      ],
      status: "fresh",
      title: "读取固定信源 bundle",
      summary:
        "structural baseline、live operational、market benchmark、historical/backtest 和 pending source 被分开登记；UCDP 只进入历史基线，不作为 live signal。",
    },
    {
      type: "evidence_added",
      runId,
      at: "T+00:11",
      evidenceId: "ev-market-risk-premium",
      title: "市场证据支持 risk premium",
      evidence:
        "Oil risk premium 支持局部扰动风险上行，但 VIX、Broad USD、US10Y 与 SPX 的组合还不像 closure 已被充分定价。",
      sourceIds: ["fred-market"],
      polarity: "support",
      mechanismTags: ["market_pricing_risk_premium", "energy_supply_risk_up"],
      affects: ["market", "scenario", "target"],
      confidence: "medium",
    },
    {
      type: "evidence_added",
      runId,
      at: "T+00:18",
      evidenceId: "ev-flow-not-verified",
      title: "通行层仍未确认全面停航",
      evidence:
        "AIS flow 仍是 pending，不能把未授权船流占位当成真实停航证据；这削弱 closure 作为主情景。",
      sourceIds: ["ais-flow-pending", "global-shipping-lanes"],
      polarity: "counter",
      mechanismTags: ["market_not_pricing_closure"],
      affects: ["scenario", "watchlist"],
      confidence: "medium",
    },
    {
      type: "evidence_added",
      runId,
      at: "T+00:23",
      evidenceId: "ev-official-advisory",
      title: "官方通告仍需高频观察",
      evidence:
        "海事通告是当前最强 live operational trigger；若措辞从 monitoring 转向 avoidance，将直接推高 severe 和 transit disruption。",
      sourceIds: ["official-advisory"],
      polarity: "uncertain",
      mechanismTags: [
        "transit_risk_up",
        "insurance_cost_up",
        "naval_presence_up",
        "gnss_or_ais_interference",
      ],
      affects: ["scenario", "target", "watchlist"],
      confidence: "medium",
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
      targetDeltas: targetForecasts.filter((forecast) =>
        ["brent", "vix", "regional_escalation_7d", "deescalation_signal_14d"].includes(
          forecast.target,
        ),
      ),
    },
    {
      type: "checkpoint_written",
      runId,
      at: "T+00:38",
      checkpointId: "cp2",
      title: "Checkpoint 写回",
      summary:
        "本轮保留 controlled 作为主情景，并把 revision reason、target deltas 与 next watch 写回。",
      revisionReason:
        "Oil risk premium 证明风险被部分定价；缺少 VIX/权益/利率 closure stress、verified flow stop 和 official avoidance，使 closure 仍是尾部。",
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
        "事件流、scenario distribution、asset forecasts、risk targets 与 checkpoint 保持同一数据契约。",
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
        "Oil risk premium 证明风险被部分定价；缺少 VIX/权益/利率 closure stress、verified flow stop 和 official avoidance，使 closure 仍是尾部。",
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
