// Product explanation graph rendered from buildForecastGraph output.
// Story mode shows only the highlighted revision path; Audit mode shows all.
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
  Anchor,
  Binary,
  CheckCircle2,
  CircleHelp,
  FileText,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type {
  ForecastGraph,
  ForecastGraphNode,
} from "../../lib/forecast/buildForecastGraph";
import type { ScenarioId } from "../../types/forecast";
import { scenarioColor } from "../../state/forecastStore";

type GraphNodeKind = ForecastGraphNode["kind"];

interface EvidenceGraphNodeData extends Record<string, unknown> {
  kind: GraphNodeKind;
  title: string;
  kicker: string;
  summary: string;
  detail?: string;
  tone?: ForecastGraphNode["tone"];
  inStoryPath?: boolean;
  selected?: boolean;
}

function getNodeColor(node: Node<EvidenceGraphNodeData>) {
  if (node.data.kind === "source") return "#74ddd6";
  if (node.data.kind === "evidence") {
    if (node.data.tone === "support") return "#63d28e";
    if (node.data.tone === "counter") return "#efbd4f";
    return "#56b9ff";
  }
  if (node.data.kind === "mechanism") return "#8bd3c7";
  if (node.data.kind === "judgement") return "#ff8743";
  return "#f0b84a";
}

function edgeClass(kind: string, inStoryPath: boolean) {
  return `graph-edge ${kind}${inStoryPath ? " in-story" : ""}`;
}

function NodeShell({ data }: NodeProps<Node<EvidenceGraphNodeData>>) {
  const Icon =
    data.kind === "source"
      ? FileText
      : data.kind === "evidence"
        ? Binary
        : data.kind === "mechanism"
          ? Anchor
          : data.kind === "judgement"
            ? TrendingUp
            : ShieldCheck;

  return (
    <article
      className={`evidence-node ${data.kind} ${data.tone ?? ""} ${data.selected ? "selected" : ""} ${data.inStoryPath ? "in-story" : "out-of-story"}`}
      tabIndex={0}
      aria-label={`${data.kind} node: ${data.title}`}
    >
      <Handle className="graph-handle" type="target" position={Position.Left} />
      <div className="evidence-node-head">
        <span>
          <Icon size={14} />
          {data.kicker}
        </span>
      </div>
      <strong>{data.title}</strong>
      {data.summary ? <p>{data.summary}</p> : null}
      {data.detail ? <small>{data.detail}</small> : null}
      <Handle className="graph-handle" type="source" position={Position.Right} />
    </article>
  );
}

const GraphNode = memo(NodeShell);

const nodeTypes = {
  evidenceNode: GraphNode,
};

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

function layoutGraph(graph: ForecastGraph, selectedNodeId: string | null) {
  const columns: Record<GraphNodeKind, number> = {
    source: 0,
    evidence: 1,
    mechanism: 2,
    judgement: 3,
    checkpoint: 4,
  };
  const rowIndexByKind = new Map<GraphNodeKind, number>();
  const nodes: Node<EvidenceGraphNodeData>[] = graph.nodes.map((node) => {
    const kind = node.kind;
    const rowIndex = rowIndexByKind.get(kind) ?? 0;
    rowIndexByKind.set(kind, rowIndex + 1);
    return {
      id: node.id,
      type: "evidenceNode",
      position: {
        x: 56 + columns[kind] * 300,
        y: 48 + rowIndex * 172,
      },
      data: {
        kind: node.kind,
        kicker: node.kind,
        title: node.label,
        summary: node.detail ?? "",
        tone: node.tone,
        inStoryPath: node.inStoryPath,
        selected: node.id === selectedNodeId,
      },
    };
  });

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "smoothstep",
    className: edgeClass(edge.kind, edge.inStoryPath),
    animated: edge.inStoryPath,
  }));

  return { nodes, edges };
}

function EmptyGraph() {
  return (
    <div className="evidence-graph-empty">
      <CircleHelp size={28} />
      <strong>等待 AgentRunEvent[]</strong>
      <p>{"运行后图会按 source -> evidence -> mechanism -> judgement -> checkpoint 渲染。"}</p>
    </div>
  );
}

export interface EvidenceGraphProps {
  storyGraph: ForecastGraph;
  auditGraph: ForecastGraph;
  mode: "story" | "audit";
  selectedNodeId: string | null;
  onSelectNodeId: (id: string | null) => void;
  scenarioDelta: Partial<Record<ScenarioId, number>>;
  scenarioLabels: Record<ScenarioId, string>;
}

function formatDelta(delta: number) {
  if (delta === 0) return "0 pp";
  return `${delta > 0 ? "+" : ""}${delta} pp`;
}

export function EvidenceGraph({
  storyGraph,
  auditGraph,
  mode,
  selectedNodeId,
  onSelectNodeId,
  scenarioDelta,
  scenarioLabels,
}: EvidenceGraphProps) {
  const active = mode === "story" ? storyGraph : auditGraph;
  const laid = useMemo(() => layoutGraph(active, selectedNodeId), [active, selectedNodeId]);
  const graphShell = useElementSizeReady<HTMLDivElement>();

  return (
    <section className="panel evidence-graph-panel">
      <div className="panel-title compact">
        <span className="icon-chip">
          <Binary size={18} />
        </span>
        <div>
          <h2>Evidence graph · 机制链</h2>
          <p>
            {mode === "story"
              ? "故事模式 · 只展示 highlighted revision path"
              : "审计模式 · 展开全部 source / evidence / mechanism / judgement / checkpoint"}
          </p>
        </div>
      </div>
      <div className="graph-state-strip">
        {Object.entries(scenarioDelta).map(([scenario, delta]) => (
          <span key={scenario}>
            <i style={{ background: scenarioColor[scenario as ScenarioId] }} />
            {scenarioLabels[scenario as ScenarioId]}
            <b className={(delta ?? 0) >= 0 ? "positive" : "negative"}>
              {formatDelta(delta ?? 0)}
            </b>
          </span>
        ))}
      </div>
      <div className="evidence-graph-shell" ref={graphShell.ref}>
        {laid.nodes.length && graphShell.ready ? (
          <ReactFlow
            key={`${mode}-${laid.nodes.length}-${laid.edges.length}`}
            nodes={laid.nodes}
            edges={laid.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.08 }}
            minZoom={0.58}
            maxZoom={1.2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => onSelectNodeId(node.id)}
            onPaneClick={() => onSelectNodeId(null)}
          >
            <Background color="rgba(128, 177, 205, 0.2)" gap={26} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={getNodeColor}
              nodeStrokeWidth={3}
              maskColor="rgba(3, 10, 15, 0.62)"
            />
          </ReactFlow>
        ) : (
          <EmptyGraph />
        )}
      </div>
      <div className="graph-legend" aria-label="边语义">
        <span><TrendingUp size={13} />support 推强判断</span>
        <span><TrendingDown size={13} />counter 削弱判断</span>
        <span><CheckCircle2 size={13} />judgement_updated 写入状态</span>
      </div>
    </section>
  );
}
