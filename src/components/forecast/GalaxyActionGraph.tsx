// Renders forecast-agent actions as the primary run graph.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
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

function laneFor(action: GalaxyActionTraceItem): GalaxyLane {
  if (action.lane) return action.lane;
  if (action.kind === "question") return "question";
  if (action.kind === "assistant_note" || action.kind === "supervisor") return "agent_turn";
  if (action.kind === "tool_call" && action.toolName === "search_web") return "search_batch";
  if (action.kind === "tool_call" || action.kind === "tool_result" || action.kind === "artifact_read") {
    return "read_artifacts";
  }
  if (action.kind === "evidence_synthesis") return "evidence_synthesis";
  if (action.kind === "final_forecast") return "forecast";
  return "checkpoint";
}

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

function visibleActions(actions: GalaxyActionTraceItem[], mode: "summary" | "full") {
  if (mode === "full") return actions;
  return actions.filter((action) =>
    action.kind === "question" ||
    action.kind === "assistant_note" ||
    action.kind === "tool_call" ||
    action.kind === "evidence_synthesis" ||
    action.kind === "final_forecast" ||
    action.kind === "checkpoint"
  );
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

function layoutActions(
  allActions: GalaxyActionTraceItem[],
  mode: GraphMode,
  selectedActionId: string | null,
) {
  const actions = visibleActions(allActions, mode);
  const included = new Set(actions.map((action) => action.actionId));
  const allById = new Map(allActions.map((action) => [action.actionId, action]));
  const laneCounts = new Map<GalaxyLane, number>();
  const nodes: Node<GalaxyNodeData>[] = actions.map((action) => {
    const lane = laneFor(action);
    const laneIndex = laneOrder.indexOf(lane);
    const ordinal = laneCounts.get(lane) ?? 0;
    laneCounts.set(lane, ordinal + 1);
    return {
      id: action.actionId,
      type: "galaxyAction",
      position: {
        x: 56 + Math.max(0, laneIndex) * 260,
        y: 58 + ordinal * 146,
      },
      data: {
        kind: action.kind,
        title: action.title,
        summary: action.summary,
        status: action.status,
        selected: selectedActionId === action.actionId,
        toolName: action.toolName,
        lane: laneLabel[lane],
      },
    };
  });
  const edges: Edge[] = [];
  for (const action of actions) {
    for (const parent of visibleParent(action, included, allById)) {
      edges.push({
        id: `${parent}->${action.actionId}`,
        source: parent,
        target: action.actionId,
        type: "smoothstep",
        animated: action.status === "running" || action.kind === "final_forecast" || action.kind === "checkpoint",
        label:
          action.kind === "tool_result"
            ? "result"
            : action.kind === "final_forecast"
              ? "forecast"
              : action.kind === "evidence_synthesis"
                ? "synthesizes"
                : "depends",
        className: `galaxy-action-edge ${action.kind}`,
      });
    }
  }
  return { nodes, edges };
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

function layoutNativeGraph(
  graph: { nodes: ForecastAgentGraphNode[]; edges: ForecastAgentGraphEdge[] },
  selectedActionId: string | null,
) {
  const laneCounts = new Map<string, number>();
  const nodes: Node<GalaxyNodeData>[] = graph.nodes.map((node) => {
    const laneIndex = forecastAgentLaneOrder.indexOf(node.lane);
    const ordinal = laneCounts.get(node.lane) ?? 0;
    laneCounts.set(node.lane, ordinal + 1);
    return {
      id: node.id,
      type: "galaxyAction",
      position: {
        x: 48 + Math.max(0, laneIndex) * 244,
        y: 54 + ordinal * 136,
      },
      data: {
        kind: kindForEventType(node.data.eventType),
        title: node.data.title,
        summary: node.data.summary,
        status: node.data.current ? "running" : node.data.status,
        selected: selectedActionId === node.id,
        toolName: node.data.toolName,
        lane: forecastAgentLaneLabel[node.lane],
      },
    };
  });
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    animated: edge.label === "returns" || edge.label === "updates",
    label: edge.label,
    className: "galaxy-action-edge native",
  }));
  return { nodes, edges };
}

export function GalaxyActionGraph({
  actions,
  graph,
  mode,
  selectedActionId,
  onSelectAction,
}: {
  actions: GalaxyActionTraceItem[];
  graph?: { nodes: ForecastAgentGraphNode[]; edges: ForecastAgentGraphEdge[] };
  mode: GraphMode;
  selectedActionId: string | null;
  onSelectAction: (actionId: string | null) => void;
}) {
  const laid = useMemo(
    () => graph ? layoutNativeGraph(graph, selectedActionId) : layoutActions(actions, mode, selectedActionId),
    [actions, graph, mode, selectedActionId],
  );
  const graphShell = useElementSizeReady<HTMLDivElement>();
  const laneStrip = graph
    ? forecastAgentLaneOrder.map((lane) => <span key={lane}>{forecastAgentLaneLabel[lane]}</span>)
    : laneOrder.map((lane) => <span key={lane}>{laneLabel[lane]}</span>);

  return (
    <section className="console-card galaxy-action-graph-card">
      <div className="galaxy-section-head">
        <div>
          <span>XYFlow action graph</span>
          <h2>Forecast agent behavior</h2>
          <p>question → search/read tools → evidence extraction → record_forecast → checkpoint</p>
        </div>
      </div>
      <div className="galaxy-lane-strip" aria-label="Galaxy graph lanes">
        {laneStrip}
      </div>
      <div className="galaxy-action-graph-shell" ref={graphShell.ref}>
        {laid.nodes.length > 0 && graphShell.ready ? (
          <ReactFlow
            nodes={laid.nodes}
            edges={laid.edges}
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
