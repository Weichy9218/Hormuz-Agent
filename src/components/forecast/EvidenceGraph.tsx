// Product explanation graph: source -> evidence -> mechanism -> judgement -> checkpoint.
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
import type { AgentRunEvent, EvidencePolarity, MechanismTag } from "../../types/agentEvents";
import type { SourceRegistryEntry } from "../../types";
import type { ScenarioKey } from "../../types/forecast";
import { scenarioColor, targetLabel } from "../../state/forecastStore";
import {
  getAgentEventKey,
  getGraphNodeIdForEvent,
  getMechanismNodeId,
} from "./eventIdentity";

type GraphNodeKind =
  | "source"
  | "evidence"
  | "mechanism"
  | "judgement"
  | "checkpoint";

interface EvidenceGraphNodeData extends Record<string, unknown> {
  kind: GraphNodeKind;
  title: string;
  kicker: string;
  summary: string;
  detail?: string;
  tone?: EvidencePolarity | "state" | "checkpoint" | "source";
  tags?: string[];
  eventKey?: string;
  selected?: boolean;
}

type EvidenceAddedEvent = Extract<AgentRunEvent, { type: "evidence_added" }> & {
  evidence?: string;
  summary?: string;
  confidence?: string;
};

const mechanismCopy: Record<string, string> = {
  transit_risk_up: "Maritime advisory pressure raises short-term transit disruption risk.",
  traffic_flow_down: "Flow proxy weakness would point to lower observed transit capacity.",
  insurance_cost_up: "Insurance or freight repricing would transmit risk into shipping costs.",
  naval_presence_up: "Higher naval presence changes the odds of incident escalation and escort delays.",
  mine_or_swarm_risk_up: "Mine, swarm, or small-craft risk increases the severe disruption tail.",
  gnss_or_ais_interference: "Navigation interference is relevant, but needs verification before state updates.",
  energy_supply_risk_up: "Energy supply risk pushes oil-sensitive targets and controlled disruption higher.",
  diplomatic_deescalation: "Diplomatic signals can counter escalation and support de-escalation targets.",
  market_not_pricing_closure: "Cross-asset behavior does not yet look like a closure base case.",
  market_pricing_risk_premium: "Oil and volatility repricing support a disruption risk premium.",
};

const mechanismShortLabel: Record<string, string> = {
  transit_risk_up: "transit risk",
  traffic_flow_down: "flow down",
  insurance_cost_up: "insurance",
  naval_presence_up: "naval",
  mine_or_swarm_risk_up: "mine / swarm",
  gnss_or_ais_interference: "GNSS / AIS",
  energy_supply_risk_up: "energy supply",
  diplomatic_deescalation: "de-escalation",
  market_not_pricing_closure: "not closure",
  market_pricing_risk_premium: "risk premium",
};

const polarityCopy: Record<EvidencePolarity, string> = {
  support: "support",
  counter: "counter",
  uncertain: "uncertain",
};

function sourceName(sourceRegistry: SourceRegistryEntry[], sourceId: string) {
  const source = sourceRegistry.find((entry) => entry.id === sourceId);
  return source?.name ?? sourceId;
}

function sourceCaveat(sourceRegistry: SourceRegistryEntry[], sourceId: string) {
  const source = sourceRegistry.find((entry) => entry.id === sourceId);
  return source?.caveat ?? sourceId;
}

function formatDelta(delta: number) {
  if (delta === 0) return "0 pp";
  return `${delta > 0 ? "+" : ""}${delta} pp`;
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

function edgeClassForPolarity(polarity: EvidencePolarity) {
  return `graph-edge ${polarity}`;
}

function evidenceSummary(event: EvidenceAddedEvent) {
  return event.evidence ?? event.summary ?? "";
}

function evidenceConfidence(event: EvidenceAddedEvent) {
  return event.confidence ?? "medium";
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
    <article className={`evidence-node ${data.kind} ${data.tone ?? ""} ${data.selected ? "selected" : ""}`}>
      <Handle className="graph-handle" type="target" position={Position.Left} />
      <div className="evidence-node-head">
        <span>
          <Icon size={14} />
          {data.kicker}
        </span>
        {data.tone && data.kind === "evidence" ? <b>{polarityCopy[data.tone as EvidencePolarity]}</b> : null}
      </div>
      <strong>{data.title}</strong>
      <p>{data.summary}</p>
      {data.detail ? <small>{data.detail}</small> : null}
      {data.tags?.length ? (
        <div className="evidence-node-tags">
          {data.tags.map((tag) => (
            <em key={tag}>{tag}</em>
          ))}
        </div>
      ) : null}
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

interface BuildGraphInput {
  events: AgentRunEvent[];
  visibleCount: number;
  selectedEventKey: string | null;
  selectedNodeId: string | null;
  sourceRegistry: SourceRegistryEntry[];
  scenarioLabels: Record<ScenarioKey, string>;
}

function buildGraph({
  events,
  visibleCount,
  selectedEventKey,
  selectedNodeId,
  sourceRegistry,
  scenarioLabels,
}: BuildGraphInput) {
  const visibleEvents = events.slice(0, visibleCount);
  const nodes: Node<EvidenceGraphNodeData>[] = [];
  const edges: Edge[] = [];
  const sourceNodeIds: string[] = [];
  const evidenceNodeIds: string[] = [];
  const mechanismNodeIds = new Map<MechanismTag, string>();
  let latestSourceNodeId: string | null = null;
  let latestJudgementNodeId: string | null = null;

  function selectedFor(nodeId: string, eventKey?: string) {
    return nodeId === selectedNodeId || Boolean(eventKey && eventKey === selectedEventKey);
  }

  for (const event of visibleEvents) {
    const eventKey = getAgentEventKey(event);

    if (event.type === "source_read") {
      const nodeId = getGraphNodeIdForEvent(event);
      if (!nodeId) continue;
      latestSourceNodeId = nodeId;
      sourceNodeIds.push(nodeId);
      const names = event.sourceIds.slice(0, 3).map((sourceId) => sourceName(sourceRegistry, sourceId));
      const caveatSource = event.sourceIds[0];
      nodes.push({
        id: nodeId,
        type: "evidenceNode",
        position: { x: 0, y: 0 },
        data: {
          kind: "source",
          kicker: `${event.status} source boundary`,
          title: event.title,
          summary: names.join(" / "),
          detail: caveatSource ? sourceCaveat(sourceRegistry, caveatSource) : event.summary,
          tone: "source",
          tags: event.sourceIds.length > 3 ? [`+${event.sourceIds.length - 3} more`] : [],
          eventKey,
          selected: selectedFor(nodeId, eventKey),
        },
      });
    }

    if (event.type === "evidence_added") {
      const nodeId = getGraphNodeIdForEvent(event);
      if (!nodeId) continue;
      evidenceNodeIds.push(nodeId);
      nodes.push({
        id: nodeId,
        type: "evidenceNode",
        position: { x: 0, y: 0 },
        data: {
          kind: "evidence",
          kicker: event.evidenceId,
          title: event.title,
          summary: evidenceSummary(event),
          detail: `${evidenceConfidence(event)} confidence · affects ${event.affects.join(" / ")}`,
          tone: event.polarity,
          tags: event.sourceIds,
          eventKey,
          selected: selectedFor(nodeId, eventKey),
        },
      });

      if (latestSourceNodeId) {
        edges.push({
          id: `${latestSourceNodeId}->${nodeId}`,
          source: latestSourceNodeId,
          target: nodeId,
          label: "read",
          className: "graph-edge source",
          animated: eventKey === selectedEventKey,
        });
      }

      for (const tag of event.mechanismTags) {
        const mechanismNodeId = getMechanismNodeId(tag);
        if (!mechanismNodeIds.has(tag)) {
          mechanismNodeIds.set(tag, mechanismNodeId);
          nodes.push({
            id: mechanismNodeId,
            type: "evidenceNode",
            position: { x: 0, y: 0 },
            data: {
              kind: "mechanism",
              kicker: mechanismShortLabel[tag] ?? "mechanism",
              title: tag,
              summary: mechanismCopy[tag] ?? "Evidence affects this forecast mechanism.",
              tone: "state",
              tags: [event.evidenceId],
              eventKey,
              selected: selectedFor(mechanismNodeId, eventKey),
            },
          });
        }

        edges.push({
          id: `${nodeId}->${mechanismNodeId}`,
          source: nodeId,
          target: mechanismNodeId,
          label: polarityCopy[event.polarity],
          className: edgeClassForPolarity(event.polarity),
          animated: eventKey === selectedEventKey,
        });
      }
    }

    if (event.type === "judgement_updated") {
      const nodeId = getGraphNodeIdForEvent(event);
      if (!nodeId) continue;
      latestJudgementNodeId = nodeId;
      const largestDelta = Object.entries(event.scenarioDelta).sort(
        ([, left], [, right]) => Math.abs(right ?? 0) - Math.abs(left ?? 0),
      )[0] as [ScenarioKey, number] | undefined;
      nodes.push({
        id: nodeId,
        type: "evidenceNode",
        position: { x: 0, y: 0 },
        data: {
          kind: "judgement",
          kicker: "old -> new",
          title: event.title,
          summary: largestDelta
            ? `${scenarioLabels[largestDelta[0]]}: ${formatDelta(largestDelta[1])}`
            : "Scenario distribution updated",
          detail: event.reason,
          tone: "state",
          tags: event.targetDeltas.slice(0, 3).map((delta) => targetLabel[delta.target]),
          eventKey,
          selected: selectedFor(nodeId, eventKey),
        },
      });

      const mechanismTargets = mechanismNodeIds.size ? [...mechanismNodeIds.values()] : evidenceNodeIds;
      for (const mechanismNodeId of mechanismTargets) {
        edges.push({
          id: `${mechanismNodeId}->${nodeId}`,
          source: mechanismNodeId,
          target: nodeId,
          label: "updates",
          className: "graph-edge judgement",
          animated: eventKey === selectedEventKey,
        });
      }
    }

    if (event.type === "checkpoint_written") {
      const nodeId = getGraphNodeIdForEvent(event);
      if (!nodeId) continue;
      nodes.push({
        id: nodeId,
        type: "evidenceNode",
        position: { x: 0, y: 0 },
        data: {
          kind: "checkpoint",
          kicker: event.checkpointId,
          title: event.title,
          summary: event.revisionReason,
          detail: event.summary,
          tone: "checkpoint",
          tags: event.nextWatch.slice(0, 2),
          eventKey,
          selected: selectedFor(nodeId, eventKey),
        },
      });

      if (latestJudgementNodeId) {
        edges.push({
          id: `${latestJudgementNodeId}->${nodeId}`,
          source: latestJudgementNodeId,
          target: nodeId,
          label: "persists",
          className: "graph-edge checkpoint",
          animated: eventKey === selectedEventKey,
        });
      }
    }
  }

  const columns: Record<GraphNodeKind, number> = {
    source: 0,
    evidence: 1,
    mechanism: 2,
    judgement: 3,
    checkpoint: 4,
  };
  const rowIndexByKind = new Map<GraphNodeKind, number>();
  const positionedNodes = nodes.map((node) => {
    const kind = node.data.kind;
    const rowIndex = rowIndexByKind.get(kind) ?? 0;
    rowIndexByKind.set(kind, rowIndex + 1);
    const offset =
      kind === "source" || kind === "judgement" || kind === "checkpoint"
        ? 95
        : 16;
    return {
      ...node,
      position: {
        x: columns[kind] * 286,
        y: offset + rowIndex * 178,
      },
    };
  });

  return { nodes: positionedNodes, edges, sourceNodeIds };
}

function EmptyGraph() {
  return (
    <div className="evidence-graph-empty">
      <CircleHelp size={28} />
      <strong>等待 AgentRunEvent[]</strong>
      <p>{"运行后图会按 source -> evidence -> mechanism -> judgement -> checkpoint 逐步追加。"}</p>
    </div>
  );
}

export function EvidenceGraph({
  events,
  visibleCount,
  selectedEventKey,
  selectedNodeId,
  sourceRegistry,
  scenarioLabels,
  onSelectEventKey,
  onSelectNodeId,
}: {
  events: AgentRunEvent[];
  visibleCount: number;
  selectedEventKey: string | null;
  selectedNodeId: string | null;
  sourceRegistry: SourceRegistryEntry[];
  scenarioLabels: Record<ScenarioKey, string>;
  onSelectEventKey: (eventKey: string | null) => void;
  onSelectNodeId: (nodeId: string | null) => void;
}) {
  const graph = useMemo(
    () =>
      buildGraph({
        events,
        visibleCount,
        selectedEventKey,
        selectedNodeId,
        sourceRegistry,
        scenarioLabels,
      }),
    [events, scenarioLabels, selectedEventKey, selectedNodeId, sourceRegistry, visibleCount],
  );

  const visibleEvents = events.slice(0, visibleCount);
  const graphShell = useElementSizeReady<HTMLDivElement>();
  const currentJudgement = [...visibleEvents]
    .reverse()
    .find(
      (event): event is Extract<AgentRunEvent, { type: "judgement_updated" }> =>
        event.type === "judgement_updated",
    );

  return (
    <section className="panel evidence-graph-panel">
      <div className="panel-title compact">
        <span className="icon-chip">
          <Binary size={18} />
        </span>
        <div>
          <h2>Evidence graph</h2>
          <p>React Flow 只读解释图；节点来自可见 AgentRunEvent[]</p>
        </div>
      </div>
      <div className="graph-state-strip">
        {currentJudgement ? (
          <>
            {Object.entries(currentJudgement.scenarioDelta).map(([scenario, delta]) => (
              <span key={scenario}>
                <i style={{ background: scenarioColor[scenario as ScenarioKey] }} />
                {scenarioLabels[scenario as ScenarioKey]}
                <b className={(delta ?? 0) >= 0 ? "positive" : "negative"}>
                  {formatDelta(delta ?? 0)}
                </b>
              </span>
            ))}
          </>
        ) : (
          <span>
            <i />
            Current State waits for judgement_updated
          </span>
        )}
      </div>
      <div className="evidence-graph-shell" ref={graphShell.ref}>
        {graph.nodes.length && graphShell.ready ? (
          <ReactFlow
            key={`${visibleCount}-${graph.nodes.length}-${graph.edges.length}`}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.28}
            maxZoom={1.2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => {
              onSelectNodeId(node.id);
              onSelectEventKey(node.data.eventKey ?? null);
            }}
            onPaneClick={() => {
              onSelectNodeId(null);
              onSelectEventKey(null);
            }}
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
        <span><TrendingUp size={13} />support strengthens movement</span>
        <span><TrendingDown size={13} />counter weakens movement</span>
        <span><CheckCircle2 size={13} />judgement_updated writes state</span>
      </div>
    </section>
  );
}
