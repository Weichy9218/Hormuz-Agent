// Renders forecast-agent actions as the primary run graph.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  Bot,
  Calculator,
  CheckCircle2,
  Database,
  FileSearch,
  FileText,
  Flag,
  HelpCircle,
  Search,
  Wrench,
} from "lucide-react";
import type {
  GalaxyActionKind,
  GalaxyActionTraceItem,
} from "../../types/galaxy";
import type {
  ForecastAgentGraphEdge,
  ForecastAgentGraphNode,
} from "../../types/forecastAgent";

type GraphMode = "summary" | "full";
type GraphNodeInput = ForecastAgentGraphNode;
type GraphEdgeInput = ForecastAgentGraphEdge;
type GraphStage = "question" | "evidence" | "decision";
const STORY_NODE_LIMIT = 15;
const NODE_WIDTH = 242;
const NODE_HEIGHT = 126;

interface GalaxyNodeData extends Record<string, unknown> {
  kind: GalaxyActionKind;
  title: string;
  summary: string;
  status: string;
  selected: boolean;
  criticalPath: boolean;
  criticalReason?: string;
  toolName?: string;
  lane?: string;
}

const forecastAgentLaneLabel: Record<ForecastAgentGraphNode["lane"], string> = {
  question: "问题",
  source: "数据边界",
  search: "检索",
  read: "读取",
  evidence: "证据",
  mechanism: "机制",
  judgement: "判断",
  forecast: "预测",
  checkpoint: "检查点",
};

const keyEvidenceThemes = [
  { key: "resolution", pattern: /\b(Investing\.com|XAU\/USD|LBMA|daily high|historical data|resolution source|source boundary)\b|黄金|金价|现货/i },
  { key: "trajectory", pattern: /\b(FXEmpire|resistance|support|momentum|sideways|technical|RSI|MA20|GC=F|futures)\b/i },
  { key: "official", pattern: /\b(UKMTO|JMIC|MARAD|advisory|maritime security)\b/i },
  { key: "traffic", pattern: /\b(PortWatch|AIS|tanker|shipping|ship|traffic|transit|closure)\b|通航|停摆/i },
  { key: "market", pattern: /\b(Brent|WTI|FRED|DCOILBRENTEU|crude|oil price|market)\b/i },
  { key: "news", pattern: /\b(Reuters|AP|Bloomberg|latest|May 12|May 11)\b|5\s*月\s*12|5月12/i },
  { key: "counter", pattern: /\b(reopen|resume|restore|ceasefire|talks|negotiation)\b|恢复|缓和|谈判/i },
] as const;

function displayCriticalReason(reason?: string, action?: Pick<GalaxyActionTraceItem, "kind">) {
  const text = String(reason ?? "");
  if (!text) return action?.kind === "final_forecast" ? "最终预测" : "关键路径";
  if (/forecast question/i.test(text)) return "问题定义";
  if (/record_forecast \/ boxed answer/i.test(text)) return "最终预测";
  if (/checkpoint/i.test(text)) return "运行检查点";
  if (/parent of record_forecast/i.test(text)) return "最终综合";
  if (/fallback/i.test(text)) return "近端证据";
  if (/parent of evidence #/i.test(text)) {
    if (action?.kind === "tool_call") return "证据检索";
    if (action?.kind === "assistant_note" || action?.kind === "evidence_synthesis") return "证据综合";
    return "证据链路";
  }
  if (/ref'd by record_forecast evidence #/i.test(text)) {
    if (action?.kind === "tool_call") return "证据检索";
    if (action?.kind === "tool_result" || action?.kind === "artifact_read") return "证据锚点";
    return "支撑最终预测";
  }
  return text;
}

function actionStage(kind: GalaxyActionKind): GraphStage {
  if (kind === "question" || kind === "supervisor") return "question";
  if (kind === "final_forecast" || kind === "checkpoint") return "decision";
  return "evidence";
}

function actionTone(kind: GalaxyActionKind, toolName?: string) {
  if (toolName === "execute_python_code" || toolName === "calculate_technical_indicators") return "calculation";
  if (toolName === "sub_agent_factor" || toolName === "sub_agent_access") return "delegation";
  if (kind === "question") return "question";
  if (kind === "tool_call") return "tool";
  if (kind === "tool_result" || kind === "artifact_read") return "result";
  if (kind === "evidence_synthesis") return "synthesis";
  if (kind === "final_forecast") return "final";
  if (kind === "checkpoint") return "checkpoint";
  return "note";
}

function nodeColor(node: Node<GalaxyNodeData>) {
  if (node.data.toolName === "execute_python_code" || node.data.toolName === "calculate_technical_indicators") return "#fde68a";
  if (node.data.toolName === "sub_agent_factor" || node.data.toolName === "sub_agent_access") return "#c4b5fd";
  if (node.data.kind === "question") return "#7dd3fc";
  if (node.data.kind === "tool_call") return "#93c5fd";
  if (node.data.kind === "tool_result" || node.data.kind === "artifact_read") return "#99f6e4";
  if (node.data.kind === "evidence_synthesis") return "#bfdbfe";
  if (node.data.kind === "final_forecast") return "#f59e0b";
  if (node.data.kind === "checkpoint") return "#a5b4fc";
  return "#cbd5e1";
}

function iconFor(kind: GalaxyActionKind, toolName?: string) {
  if (kind === "question") return HelpCircle;
  if (kind === "tool_call" && toolName === "search_web") return Search;
  if (toolName === "execute_python_code" || toolName === "calculate_technical_indicators") return Calculator;
  if (toolName === "sub_agent_factor" || toolName === "sub_agent_access") return Bot;
  if (kind === "tool_call") return Wrench;
  if (kind === "artifact_read") return Database;
  if (kind === "tool_result") return FileSearch;
  if (kind === "final_forecast") return Flag;
  if (kind === "checkpoint") return CheckCircle2;
  if (kind === "assistant_note" || kind === "evidence_synthesis") return Bot;
  return FileText;
}

function toolChipLabel(toolName?: string, lane?: string, kind?: GalaxyActionKind) {
  if (toolName === "execute_python_code") return "Python";
  if (toolName === "calculate_technical_indicators") return "Indicators";
  if (toolName === "sub_agent_factor") return "Factor sub-agent";
  if (toolName === "sub_agent_access") return "Access sub-agent";
  return toolName ?? lane ?? kind;
}

function GalaxyActionNode({ data }: NodeProps<Node<GalaxyNodeData>>) {
  const Icon = iconFor(data.kind, data.toolName);
  const criticalReason = displayCriticalReason(data.criticalReason, { kind: data.kind });
  const tooltip = [
    data.title,
    data.summary,
    data.criticalPath ? `Critical path: ${criticalReason}` : "",
  ].filter(Boolean).join("\n\n");
  return (
    <article
      className={`galaxy-action-node ${actionTone(data.kind, data.toolName)} ${data.status} ${data.criticalPath ? "critical-path" : ""} ${data.selected ? "selected" : ""}`}
      aria-label={tooltip}
      tabIndex={0}
      title={tooltip}
    >
      <Handle className="graph-handle" type="target" position={Position.Left} />
      <span>
        <Icon size={14} />
        {toolChipLabel(data.toolName, data.lane, data.kind)}
      </span>
      <strong>{data.title}</strong>
      {data.criticalPath ? <em>{criticalReason}</em> : null}
      <p>{data.summary}</p>
      <Handle className="graph-handle" type="source" position={Position.Right} />
    </article>
  );
}

const GalaxyNode = memo(GalaxyActionNode);
const nodeTypes = { galaxyAction: GalaxyNode };

function useElementSizeReady<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setReady(rect.width > 0 && rect.height > 0);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, ready };
}

function actionSearchText(action: GalaxyActionTraceItem) {
  return [
    action.title,
    action.summary,
    action.toolName,
    action.query,
    action.argsSummary,
    action.rawPreview?.text,
  ].filter(Boolean).join(" ");
}

function addActionId(ids: Set<string>, actionId?: string) {
  if (actionId) ids.add(actionId);
}

function sourcePairIds(
  action: GalaxyActionTraceItem,
  allById: Map<string, GalaxyActionTraceItem>,
) {
  const ids: string[] = [];
  for (const parentId of action.parentActionIds ?? []) {
    const parent = allById.get(parentId);
    if (parent?.kind === "tool_call") ids.push(parent.actionId);
  }
  ids.push(action.actionId);
  return [...new Set(ids)];
}

function addIfRoom(ids: Set<string>, nextIds: string[], limit = STORY_NODE_LIMIT) {
  const missing = nextIds.filter((id) => !ids.has(id));
  if (ids.size + missing.length > limit) return false;
  for (const id of missing) ids.add(id);
  return true;
}

function lineageIds(
  action: GalaxyActionTraceItem,
  allById: Map<string, GalaxyActionTraceItem>,
) {
  const ids: string[] = [];
  const visit = (actionId?: string) => {
    if (!actionId || ids.includes(actionId)) return;
    const item = allById.get(actionId);
    if (!item) return;
    for (const parentId of item.parentActionIds ?? []) visit(parentId);
    ids.push(item.actionId);
  };
  visit(action.actionId);
  return ids;
}

function keyEvidenceActions(actions: GalaxyActionTraceItem[]) {
  const candidates = actions.filter((action) =>
    action.toolName !== "record_forecast" &&
    (action.kind === "tool_result" || action.kind === "artifact_read" || action.kind === "tool_call")
  );
  const selected: GalaxyActionTraceItem[] = [];
  const selectedIds = new Set<string>();

  for (const theme of keyEvidenceThemes) {
    let best: { action: GalaxyActionTraceItem; score: number } | null = null;
    for (const action of candidates) {
      const text = actionSearchText(action);
      if (!theme.pattern.test(text)) continue;
      const score =
        action.index +
        (action.kind === "tool_result" || action.kind === "artifact_read" ? 1000 : 0) +
        (action.toolName === "read_webpage" || action.toolName === "read_webpage_with_query" ? 120 : 0) +
        (/\b(Investing\.com|FXEmpire|Reuters|AP|Bloomberg|UKMTO|JMIC|MARAD|FRED|EIA|IEA)\b/i.test(text) ? 80 : 0);
      if (!best || score > best.score) best = { action, score };
    }
    if (best && !selectedIds.has(best.action.actionId)) {
      selected.push(best.action);
      selectedIds.add(best.action.actionId);
    }
  }

  if (selected.length >= 4) return selected.slice(0, 5);
  for (const action of [...candidates].reverse()) {
    if (selectedIds.has(action.actionId)) continue;
    selected.push(action);
    selectedIds.add(action.actionId);
    if (selected.length >= 5) break;
  }
  return selected;
}

function storyActionIds(actions: GalaxyActionTraceItem[], selectedActionId?: string | null) {
  const allById = actionById(actions);
  const ids = new Set<string>();
  addActionId(ids, actions.find((action) => action.kind === "question")?.actionId);
  addActionId(ids, selectedActionId ?? undefined);

  const openingTurn =
    actions.find((action) => /question audit|plan|audit/i.test(action.summary) && action.kind === "assistant_note") ??
    actions.find((action) => action.kind === "assistant_note" || action.kind === "evidence_synthesis");
  addActionId(ids, openingTurn?.actionId);

  const finalSynthesis = [...actions].reverse().find((action) => action.kind === "evidence_synthesis");
  addActionId(ids, finalSynthesis?.actionId);

  const forecastActions = actions.filter(
    (action) => action.kind === "final_forecast" || action.toolName === "record_forecast",
  );
  for (const action of forecastActions) {
    addActionId(ids, action.actionId);
  }

  const checkpoint = [...actions].reverse().find((action) => action.kind === "checkpoint");
  addActionId(ids, checkpoint?.actionId);

  const latestAction = [...actions]
    .reverse()
    .find((action) => action.kind !== "question" && action.kind !== "supervisor");
  if (latestAction) {
    addIfRoom(ids, lineageIds(latestAction, allById));
  }

  for (const action of keyEvidenceActions(actions)) {
    if (ids.size >= STORY_NODE_LIMIT) break;
    const pairIds = sourcePairIds(action, allById);
    if (!addIfRoom(ids, pairIds)) addIfRoom(ids, [action.actionId]);
  }
  return ids;
}

function visibleActions(actions: GalaxyActionTraceItem[], mode: "summary" | "full", selectedActionId?: string | null) {
  if (mode === "full") return actions;
  const ids = storyActionIds(actions, selectedActionId);
  return actions.filter((action) => ids.has(action.actionId));
}

function actionById(actions: GalaxyActionTraceItem[]) {
  return new Map(actions.map((action) => [action.actionId, action]));
}

function visibleParent(action: GalaxyActionTraceItem, included: Set<string>, allById: Map<string, GalaxyActionTraceItem>) {
  const pending = [...(action.parentActionIds ?? [])];
  const seen = new Set<string>();
  const parents: string[] = [];
  while (pending.length > 0) {
    const parent = pending.shift();
    if (!parent || seen.has(parent)) continue;
    seen.add(parent);
    if (included.has(parent)) {
      parents.push(parent);
      continue;
    }
    const hidden = allById.get(parent);
    if (hidden?.parentActionIds) pending.push(...hidden.parentActionIds);
  }
  return [...new Set(parents)];
}

function kindForEventType(eventType?: string): GalaxyActionKind {
  if (eventType === "question_loaded") return "question";
  if (eventType === "tool_call") return "tool_call";
  if (eventType === "tool_result") return "tool_result";
  if (eventType === "evidence_added") return "artifact_read";
  if (eventType === "mechanism_mapped" || eventType === "judgement_updated") return "evidence_synthesis";
  if (eventType === "final_forecast") return "final_forecast";
  if (eventType === "checkpoint_written") return "checkpoint";
  return "assistant_note";
}

function eventTypeForKind(kind: GalaxyActionKind) {
  if (kind === "question") return "question_loaded";
  if (kind === "tool_call") return "tool_call";
  if (kind === "tool_result" || kind === "artifact_read") return "tool_result";
  if (kind === "evidence_synthesis") return "judgement_updated";
  if (kind === "final_forecast") return "final_forecast";
  if (kind === "checkpoint") return "checkpoint_written";
  return "agent_turn";
}

function nodeKind(node: ForecastAgentGraphNode, action?: GalaxyActionTraceItem): GalaxyActionKind {
  return action?.kind ?? kindForEventType(node.data.eventType);
}

function nodeLaneLabel(node: ForecastAgentGraphNode) {
  return forecastAgentLaneLabel[node.lane] ?? node.lane;
}

function dagreLayout(
  graph: { nodes: GraphNodeInput[]; edges: GraphEdgeInput[] },
  selectedActionId: string | null,
  actions: GalaxyActionTraceItem[],
) {
  const actionsById = actionById(actions);
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: "LR",
    align: "UL",
    nodesep: 44,
    ranksep: 96,
    marginx: 34,
    marginy: 32,
  });
  for (const node of graph.nodes) {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }
  dagre.layout(dagreGraph);

  const nodes: Node<GalaxyNodeData>[] = graph.nodes.map((node) => {
    const layout = dagreGraph.node(node.id) as { x?: number; y?: number } | undefined;
    const action = actionsById.get(node.id);
    const kind = nodeKind(node, action);
    return {
      id: node.id,
      type: "galaxyAction",
      position: {
        x: (layout?.x ?? 0) - NODE_WIDTH / 2,
        y: (layout?.y ?? 0) - NODE_HEIGHT / 2,
      },
      data: {
        kind,
        title: node.data.title,
        summary: node.data.summary,
        status: node.data.current ? "running" : node.data.status,
        selected: selectedActionId === node.id,
        criticalPath: Boolean(node.data.criticalPath ?? action?.criticalPath),
        criticalReason: displayCriticalReason(node.data.criticalReason ?? action?.criticalReason, { kind }),
        toolName: node.data.toolName ?? action?.toolName,
        lane: nodeLaneLabel(node),
      },
    };
  });
  const edges: Edge[] = graph.edges.map((edge) => {
    const targetAction = actionsById.get(edge.target);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.label === "returns" ? "step" : "smoothstep",
      animated: false,
      label: edge.label,
      className: `galaxy-action-edge ${edge.criticalPath ? "critical-path" : ""} ${targetAction?.kind ?? edge.label}`,
      labelShowBg: true,
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 6,
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.94 },
      labelStyle: { fill: "#475569", fontSize: 11, fontWeight: 800 },
    };
  });
  return { nodes, edges };
}

function graphFromActions(actions: GalaxyActionTraceItem[], mode: GraphMode, selectedActionId?: string | null) {
  const visible = visibleActions(actions, mode, selectedActionId);
  const included = new Set(visible.map((action) => action.actionId));
  const allById = actionById(actions);
  const nodes: GraphNodeInput[] = visible.map((action) => ({
    id: action.actionId,
    type: "forecastAgentAction",
    lane:
      action.kind === "question"
        ? "question"
        : action.kind === "tool_call" && action.toolName === "search_web"
          ? "search"
          : action.kind === "tool_call" || action.kind === "tool_result" || action.kind === "artifact_read"
            ? "read"
            : action.kind === "final_forecast"
              ? "forecast"
              : action.kind === "checkpoint"
                ? "checkpoint"
                : "evidence",
    data: {
      eventType: eventTypeForKind(action.kind),
      graphRole: action.evidenceRole ?? action.kind,
      title: action.title,
      summary: action.summary,
      status: action.status,
      toolName: action.toolName,
      current: action.status === "running",
      criticalPath: Boolean(action.criticalPath),
      criticalReason: displayCriticalReason(action.criticalReason, action),
    },
  }));
  const edges: GraphEdgeInput[] = [];
  for (const action of visible) {
    for (const parent of visibleParent(action, included, allById)) {
      edges.push({
        id: `${parent}->${action.actionId}`,
        source: parent,
        target: action.actionId,
        criticalPath: Boolean(action.criticalPath && allById.get(parent)?.criticalPath),
        label:
          action.kind === "tool_result" || action.kind === "artifact_read"
            ? "returns"
            : action.kind === "tool_call"
              ? "calls"
              : action.kind === "final_forecast"
                ? "records"
                : action.kind === "checkpoint"
                  ? "persists"
                  : "continues",
      });
    }
  }
  return { nodes, edges };
}

function useStableNodePositions(
  layout: { nodes: Node<GalaxyNodeData>[]; edges: Edge[] },
  resetKey: string,
) {
  const cacheRef = useRef(new Map<string, { x: number; y: number }>());
  const resetKeyRef = useRef(resetKey);
  return useMemo(() => {
    if (resetKeyRef.current !== resetKey) {
      cacheRef.current = new Map();
      resetKeyRef.current = resetKey;
    }
    const nextIds = new Set(layout.nodes.map((node) => node.id));
    for (const cachedId of cacheRef.current.keys()) {
      if (!nextIds.has(cachedId)) cacheRef.current.delete(cachedId);
    }
    return {
      nodes: layout.nodes.map((node) => {
        const cachedPosition = cacheRef.current.get(node.id);
        const position = cachedPosition ?? node.position;
        cacheRef.current.set(node.id, position);
        return cachedPosition ? { ...node, position } : node;
      }),
      edges: layout.edges,
    };
  }, [layout, resetKey]);
}

function FlowViewportFitter({ fitKey, hasNodes }: { fitKey: string; hasNodes: boolean }) {
  const reactFlow = useReactFlow();
  const fittedKeyRef = useRef("");
  useEffect(() => {
    if (!hasNodes || fittedKeyRef.current === fitKey) return;
    fittedKeyRef.current = fitKey;
    const frame = window.requestAnimationFrame(() => {
      void reactFlow.fitView({ padding: 0.14, duration: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitKey, hasNodes, reactFlow]);
  return null;
}

function FlowSelectedNodeFocuser({
  selectedActionId,
  nodes,
}: {
  selectedActionId: string | null;
  nodes: Node<GalaxyNodeData>[];
}) {
  const reactFlow = useReactFlow();
  useEffect(() => {
    if (!selectedActionId) return;
    const node = nodes.find((item) => item.id === selectedActionId);
    if (!node) return;
    const frame = window.requestAnimationFrame(() => {
      void reactFlow.setCenter(
        node.position.x + NODE_WIDTH / 2,
        node.position.y + NODE_HEIGHT / 2,
        {
          duration: 220,
          zoom: Math.max(reactFlow.getZoom(), 0.72),
        },
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [nodes, reactFlow, selectedActionId]);
  return null;
}

export function GalaxyActionGraph({
  actions,
  graph,
  mode,
  onSetMode,
  traceKey = "latest",
  selectedActionId,
  onSelectAction,
}: {
  actions: GalaxyActionTraceItem[];
  graph?: { nodes: ForecastAgentGraphNode[]; edges: ForecastAgentGraphEdge[] };
  mode: GraphMode;
  onSetMode: (mode: GraphMode) => void;
  traceKey?: string;
  selectedActionId: string | null;
  onSelectAction: (actionId: string | null) => void;
}) {
  const displayGraph = useMemo(
    () => (mode === "full" && graph ? graph : graphFromActions(actions, mode, selectedActionId)),
    [actions, graph, mode, selectedActionId],
  );
  const laid = useMemo(
    () => dagreLayout(displayGraph, selectedActionId, actions),
    [actions, displayGraph, selectedActionId],
  );
  const stableLayout = useStableNodePositions(laid, `${traceKey}:${mode}`);
  const graphShell = useElementSizeReady<HTMLDivElement>();
  const graphLegend = [
    { key: "question", label: "问题", tone: "question" },
    { key: "tool", label: "工具调用", tone: "tool" },
    { key: "result", label: "证据返回", tone: "result" },
    { key: "calculation", label: "计算", tone: "calculation" },
    { key: "delegation", label: "委派", tone: "delegation" },
    { key: "synthesis", label: "证据综合", tone: "synthesis" },
    { key: "final", label: "最终预测", tone: "final" },
    { key: "checkpoint", label: "检查点", tone: "checkpoint" },
    { key: "critical", label: "关键路径", tone: "critical" },
  ];
  const criticalCount = stableLayout.nodes.filter((n) => (n.data as GalaxyNodeData).criticalPath).length;
  const stageCounts = stableLayout.nodes.reduce<Record<GraphStage, number>>(
    (acc, node) => {
      acc[actionStage((node.data as GalaxyNodeData).kind)] += 1;
      return acc;
    },
    { question: 0, evidence: 0, decision: 0 },
  );
  const graphCaption = mode === "summary"
    ? `故事路径 · ${stableLayout.nodes.length} 个关键节点 / ${actions.length} 个全节点 · 读法：问题 → 证据锚点 → 最终预测`
    : `完整审计 · ${stableLayout.nodes.length} 个动作 · ${stableLayout.edges.length} 条依赖边 · 其中 ${criticalCount} 个关键路径节点`;

  return (
    <section className="console-card galaxy-action-graph-card">
      <div className="galaxy-section-head">
        <div>
          <span>Agent 行为图</span>
          <h2>预测决策路径</h2>
          <p>{graphCaption}</p>
        </div>
        <div className="replay-command-row" role="tablist" aria-label="视图模式">
          {(["summary", "full"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              className={mode === m ? "selected" : ""}
              onClick={() => onSetMode(m)}
            >
              {m === "summary" ? "故事路径" : "完整审计"}
            </button>
          ))}
        </div>
      </div>
      <div className="galaxy-lane-strip galaxy-graph-legend" aria-label="Galaxy graph node legend">
        {graphLegend.map((item) => (
          <span className={`legend-${item.tone}`} key={item.key}>{item.label}</span>
        ))}
      </div>
      <div className="galaxy-story-rail" aria-label="Story graph reading order">
        <span>
          <b>01</b>
          问题定义
          <small>{stageCounts.question} 节点</small>
        </span>
        <span>
          <b>02</b>
          证据锚点
          <small>{stageCounts.evidence} 节点</small>
        </span>
        <span>
          <b>03</b>
          最终预测
          <small>{stageCounts.decision} 节点</small>
        </span>
      </div>
      <div className="galaxy-action-graph-shell" ref={graphShell.ref}>
        {stableLayout.nodes.length > 0 && graphShell.ready ? (
          <ReactFlow
            nodes={stableLayout.nodes}
            edges={stableLayout.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.14 }}
            minZoom={0.38}
            maxZoom={1.3}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => onSelectAction(node.id)}
            onPaneClick={() => onSelectAction(null)}
          >
            <FlowViewportFitter fitKey={`${traceKey}:${mode}`} hasNodes={stableLayout.nodes.length > 0} />
            <FlowSelectedNodeFocuser selectedActionId={selectedActionId} nodes={stableLayout.nodes} />
            <Background color="rgba(120, 153, 180, 0.22)" gap={24} />
            <Controls showInteractive={false} />
            {mode === "full" ? (
              <MiniMap
                pannable
                zoomable
                nodeColor={nodeColor}
                nodeStrokeWidth={3}
                maskColor="rgba(15, 23, 42, 0.55)"
              />
            ) : null}
          </ReactFlow>
        ) : (
          <div className="evidence-graph-empty">
            <HelpCircle size={28} />
            <strong>等待 forecast-agent action trace</strong>
            <p>运行或刷新 artifact 后，这里会从 events.jsonl 动态生成行为图。</p>
          </div>
        )}
      </div>
    </section>
  );
}
