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

type GalaxyLane = NonNullable<GalaxyActionTraceItem["lane"]>;
type GraphMode = "summary" | "full";
type GraphNodeInput = ForecastAgentGraphNode;
type GraphEdgeInput = ForecastAgentGraphEdge;

interface GalaxyNodeData extends Record<string, unknown> {
  kind: GalaxyActionKind;
  title: string;
  summary: string;
  status: string;
  selected: boolean;
  toolName?: string;
  lane?: string;
}

const laneOrder: GalaxyLane[] = [
  "question",
  "agent_turn",
  "search_batch",
  "read_artifacts",
  "evidence_synthesis",
  "forecast",
  "checkpoint",
];

const laneLabel: Record<GalaxyLane, string> = {
  question: "Question",
  agent_turn: "Agent turn",
  search_batch: "Search batch",
  read_artifacts: "Read artifacts",
  evidence_synthesis: "Evidence synthesis",
  forecast: "Forecast",
  checkpoint: "Checkpoint",
};

const forecastAgentLaneOrder = [
  "question",
  "source",
  "search",
  "read",
  "evidence",
  "mechanism",
  "judgement",
  "forecast",
  "checkpoint",
] as const;

const forecastAgentLaneLabel: Record<(typeof forecastAgentLaneOrder)[number], string> = {
  question: "Question",
  source: "Source boundary",
  search: "Search batch",
  read: "Read artifacts",
  evidence: "Evidence",
  mechanism: "Mechanism",
  judgement: "Judgement delta",
  forecast: "Forecast",
  checkpoint: "Checkpoint",
};

const keyEvidenceThemes = [
  { key: "official", pattern: /\b(UKMTO|JMIC|MARAD|advisory|maritime security)\b/i },
  { key: "traffic", pattern: /\b(PortWatch|AIS|tanker|shipping|ship|traffic|transit|closure)\b|通航|停摆/i },
  { key: "market", pattern: /\b(Brent|WTI|FRED|DCOILBRENTEU|crude|oil price|market)\b/i },
  { key: "news", pattern: /\b(Reuters|AP|Bloomberg|latest|May 12|May 11)\b|5\s*月\s*12|5月12/i },
  { key: "counter", pattern: /\b(reopen|resume|restore|ceasefire|talks|negotiation)\b|恢复|缓和|谈判/i },
] as const;

function actionTone(kind: GalaxyActionKind) {
  if (kind === "question") return "question";
  if (kind === "tool_call") return "tool";
  if (kind === "tool_result" || kind === "artifact_read") return "result";
  if (kind === "evidence_synthesis") return "synthesis";
  if (kind === "final_forecast") return "final";
  if (kind === "checkpoint") return "checkpoint";
  return "note";
}

function nodeColor(node: Node<GalaxyNodeData>) {
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
  if (kind === "tool_call") return Wrench;
  if (kind === "artifact_read") return Database;
  if (kind === "tool_result") return FileSearch;
  if (kind === "final_forecast") return Flag;
  if (kind === "checkpoint") return CheckCircle2;
  if (kind === "assistant_note" || kind === "evidence_synthesis") return Bot;
  return FileText;
}

function GalaxyActionNode({ data }: NodeProps<Node<GalaxyNodeData>>) {
  const Icon = iconFor(data.kind, data.toolName);
  return (
    <article
      className={`galaxy-action-node ${actionTone(data.kind)} ${data.status} ${data.selected ? "selected" : ""}`}
      tabIndex={0}
    >
      <Handle className="graph-handle" type="target" position={Position.Left} />
      <span>
        <Icon size={14} />
        {data.toolName ?? data.lane ?? data.kind}
      </span>
      <strong>{data.title}</strong>
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

function addSourcePair(
  ids: Set<string>,
  action: GalaxyActionTraceItem,
  allById: Map<string, GalaxyActionTraceItem>,
) {
  addActionId(ids, action.actionId);
  for (const parentId of action.parentActionIds ?? []) {
    const parent = allById.get(parentId);
    if (parent?.kind === "tool_call") addActionId(ids, parent.actionId);
  }
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
        (/\b(Reuters|AP|Bloomberg|UKMTO|JMIC|MARAD|FRED|EIA|IEA)\b/i.test(text) ? 80 : 0);
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

function storyActionIds(actions: GalaxyActionTraceItem[]) {
  const allById = actionById(actions);
  const ids = new Set<string>();
  for (const action of actions) {
    if (action.kind === "question") addActionId(ids, action.actionId);
  }

  const openingTurn =
    actions.find((action) => /question audit|plan|audit/i.test(action.summary) && action.kind === "assistant_note") ??
    actions.find((action) => action.kind === "assistant_note" || action.kind === "evidence_synthesis");
  addActionId(ids, openingTurn?.actionId);

  for (const action of keyEvidenceActions(actions)) {
    addSourcePair(ids, action, allById);
  }

  const finalSynthesis = [...actions].reverse().find((action) => action.kind === "evidence_synthesis");
  addActionId(ids, finalSynthesis?.actionId);

  const forecastActions = actions.filter((action) => action.kind === "final_forecast");
  for (const action of forecastActions) {
    addActionId(ids, action.actionId);
  }

  for (const action of actions) {
    if (action.kind === "checkpoint") addActionId(ids, action.actionId);
  }
  return ids;
}

function visibleActions(actions: GalaxyActionTraceItem[], mode: "summary" | "full") {
  if (mode === "full") return actions;
  const ids = storyActionIds(actions);
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
    dagreGraph.setNode(node.id, { width: 242, height: 126 });
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
        x: (layout?.x ?? 0) - 121,
        y: (layout?.y ?? 0) - 63,
      },
      data: {
        kind,
        title: node.data.title,
        summary: node.data.summary,
        status: node.data.current ? "running" : node.data.status,
        selected: selectedActionId === node.id,
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
      animated: edge.label === "returns" || edge.label === "records" || edge.label === "persists",
      label: edge.label,
      className: `galaxy-action-edge ${targetAction?.kind ?? edge.label}`,
    };
  });
  return { nodes, edges };
}

function graphFromActions(actions: GalaxyActionTraceItem[], mode: GraphMode) {
  const visible = visibleActions(actions, mode);
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
    },
  }));
  const edges: GraphEdgeInput[] = [];
  for (const action of visible) {
    for (const parent of visibleParent(action, included, allById)) {
      edges.push({
        id: `${parent}->${action.actionId}`,
        source: parent,
        target: action.actionId,
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
  useEffect(() => {
    if (!hasNodes) return;
    const frame = window.requestAnimationFrame(() => {
      void reactFlow.fitView({ padding: 0.14, duration: 220 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitKey, hasNodes, reactFlow]);
  return null;
}

export function GalaxyActionGraph({
  actions,
  graph,
  mode,
  traceKey = "latest",
  selectedActionId,
  onSelectAction,
}: {
  actions: GalaxyActionTraceItem[];
  graph?: { nodes: ForecastAgentGraphNode[]; edges: ForecastAgentGraphEdge[] };
  mode: GraphMode;
  traceKey?: string;
  selectedActionId: string | null;
  onSelectAction: (actionId: string | null) => void;
}) {
  const displayGraph = useMemo(
    () => (mode === "full" && graph ? graph : graphFromActions(actions, mode)),
    [actions, graph, mode],
  );
  const laid = useMemo(
    () => dagreLayout(displayGraph, selectedActionId, actions),
    [actions, displayGraph, selectedActionId],
  );
  const stableLayout = useStableNodePositions(laid, `${traceKey}:${mode}`);
  const graphShell = useElementSizeReady<HTMLDivElement>();
  const laneStrip = mode === "full" && graph
    ? forecastAgentLaneOrder.map((lane) => <span key={lane}>{forecastAgentLaneLabel[lane]}</span>)
    : laneOrder.map((lane) => <span key={lane}>{laneLabel[lane]}</span>);
  const graphCaption = mode === "summary"
    ? `Story path: ${stableLayout.nodes.length} key actions from ${actions.length}; repeated search/read chatter is folded into bridged edges.`
    : `Full audit trace: ${stableLayout.nodes.length} actions and ${stableLayout.edges.length} dependency edges.`;

  return (
    <section className="console-card galaxy-action-graph-card">
      <div className="galaxy-section-head">
        <div>
          <span>XYFlow action graph</span>
          <h2>Forecast agent behavior</h2>
          <p>{graphCaption}</p>
        </div>
      </div>
      <div className="galaxy-lane-strip" aria-label="Galaxy graph lanes">
        {laneStrip}
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
            <Background color="rgba(120, 153, 180, 0.22)" gap={24} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={nodeColor}
              nodeStrokeWidth={3}
              maskColor="rgba(15, 23, 42, 0.55)"
            />
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
