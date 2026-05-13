// Static Hormuz schematic map: communicates chokepoint geography without live AIS claims.
import { useState } from "react";
import { InfoTitle } from "../shared/InfoTitle";

type CaseMapVariant = "default" | "context" | "traffic";
type MapLayerId = "inbound" | "outbound" | "buffer" | "alternative" | "vessels";

interface LandShape {
  id: string;
  d: string;
  label: string;
  labelX: number;
  labelY: number;
  muted?: boolean;
}

interface LaneLayer {
  id: Exclude<MapLayerId, "vessels">;
  d: string;
  label: string;
  labelX: number;
  labelY: number;
  color: string;
  dashed: boolean;
  arrowDir: "end" | "none";
}

interface SampleVessel {
  id: string;
  x: number;
  y: number;
  course: number;
  type: "tanker" | "cargo";
  label: string;
}

interface Callout {
  id: string;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  text: string;
  size: "sm" | "md" | "lg";
  sea?: boolean;
}

const LAND_SHAPES: LandShape[] = [
  {
    id: "saudi",
    d: "M 0,300 C 78,292 155,320 230,374 C 296,421 340,500 360,620 L 0,620 Z",
    label: "Saudi Arabia",
    labelX: 82,
    labelY: 326,
    muted: true,
  },
  {
    id: "uae",
    d: "M 0,620 L 0,432 C 100,410 188,402 282,423 C 352,438 410,462 452,500 L 472,620 Z",
    label: "UAE 阿联酋",
    labelX: 172,
    labelY: 448,
  },
  {
    id: "oman",
    d: "M 492,620 C 486,548 494,478 520,421 C 540,401 568,402 592,430 C 642,483 712,510 802,529 C 885,548 956,582 1000,604 L 1000,620 Z",
    label: "Oman 阿曼",
    labelX: 714,
    labelY: 548,
  },
  {
    id: "iran",
    d: "M 0,0 L 1000,0 L 1000,204 C 928,206 875,216 812,228 C 742,241 688,247 640,270 C 604,287 584,286 551,278 C 502,266 460,260 414,246 C 354,228 300,222 236,226 C 150,232 84,218 0,202 Z",
    label: "伊朗 Iran",
    labelX: 405,
    labelY: 160,
  },
];

const ISLAND_SHAPES = [
  { id: "qeshm", d: "M 497,282 C 528,268 584,269 630,284 C 606,304 548,309 504,296 Z" },
  { id: "hormuz", d: "M 586,326 C 598,315 618,318 624,332 C 612,344 594,342 586,326 Z" },
  { id: "larak", d: "M 646,307 C 662,296 690,300 704,314 C 688,327 660,323 646,307 Z" },
];

const LANE_LAYERS: LaneLayer[] = [
  {
    id: "inbound",
    d: "M 900,400 C 750,380 680,370 600,350 C 530,330 440,310 300,280",
    label: "入湾主航道",
    labelX: 480,
    labelY: 310,
    color: "#2563eb",
    dashed: false,
    arrowDir: "end",
  },
  {
    id: "outbound",
    d: "M 300,300 C 440,330 530,348 600,366 C 680,385 750,396 900,420",
    label: "出湾主航道",
    labelX: 480,
    labelY: 400,
    color: "#0e7490",
    dashed: false,
    arrowDir: "end",
  },
  {
    id: "buffer",
    d: "M 900,410 C 750,389 680,378 600,358 C 530,339 440,320 300,290",
    label: "分隔/缓冲区（TSS 示意）",
    labelX: 760,
    labelY: 342,
    color: "#94a3b8",
    dashed: true,
    arrowDir: "none",
  },
  {
    id: "alternative",
    d: "M 200,380 C 280,430 340,460 430,480",
    label: "替代出口走廊示意",
    labelX: 205,
    labelY: 498,
    color: "#d97706",
    dashed: true,
    arrowDir: "end",
  },
];

const SAMPLE_VESSELS: SampleVessel[] = [
  { id: "sv1", x: 400, y: 295, course: -50, type: "tanker", label: "入湾油轮示例" },
  { id: "sv2", x: 600, y: 360, course: 30, type: "cargo", label: "出湾货船示例" },
  { id: "sv3", x: 750, y: 405, course: 45, type: "tanker", label: "出湾油轮示例" },
];

const CALLOUTS: Callout[] = [
  { id: "strait", x: 600, y: 350, anchorX: 600, anchorY: 432, text: "霍尔木兹海峡", size: "lg" },
  { id: "bandar", x: 620, y: 240, anchorX: 672, anchorY: 224, text: "阿巴斯港 Bandar Abbas", size: "sm" },
  { id: "musandam", x: 540, y: 420, anchorX: 490, anchorY: 492, text: "Musandam (Oman)", size: "sm" },
  { id: "qeshm", x: 570, y: 290, anchorX: 510, anchorY: 256, text: "Qeshm", size: "sm" },
  { id: "persian-gulf", x: 280, y: 240, anchorX: 280, anchorY: 240, text: "波斯湾 Persian Gulf", size: "md", sea: true },
  { id: "gulf-oman", x: 800, y: 380, anchorX: 820, anchorY: 332, text: "阿曼湾 Gulf of Oman", size: "md", sea: true },
];

const LEGEND_ITEMS: Array<{ id: MapLayerId; label: string; color: string }> = [
  { id: "inbound", label: "入湾主航道", color: "#2563eb" },
  { id: "outbound", label: "出湾主航道", color: "#0e7490" },
  { id: "buffer", label: "分隔区", color: "#94a3b8" },
  { id: "alternative", label: "替代走廊", color: "#d97706" },
  { id: "vessels", label: "示例船点", color: "#1d4ed8" },
];

function layerClass(layerId: MapLayerId, focusedLayer: MapLayerId | null) {
  return [
    "schematic-layer",
    `layer-${layerId}`,
    focusedLayer && focusedLayer !== layerId ? "is-dimmed" : "",
    focusedLayer === layerId ? "is-focused" : "",
  ].filter(Boolean).join(" ");
}

function calloutAnchor(callout: Callout) {
  if (callout.sea || callout.size === "lg") return "middle";
  return callout.anchorX < callout.x ? "end" : "start";
}

export function CaseMap({
  compact = false,
  variant = "default",
}: {
  compact?: boolean;
  variant?: CaseMapVariant;
}) {
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [hoverLayer, setHoverLayer] = useState<MapLayerId | null>(null);
  const focusedLayer = hoverLayer ?? (activeLayer as MapLayerId | null);
  const title = variant === "traffic" ? "霍尔木兹通航态势示意" : "霍尔木兹专题态势示意";
  const subtitle = variant === "traffic"
    ? "IMO TSS / IEA 公开描述重构 · 示例船点非实时 AIS"
    : "Schematic context only · no live AIS";

  return (
    <section className={`console-card case-map ${compact ? "compact" : ""} ${variant === "traffic" ? "traffic-map" : variant === "context" ? "context-map" : "default-map"}`}>
      <div className="map-card-heading">
        <InfoTitle title={title} subtitle={subtitle} />
        <a className="map-live-link" href="https://www.shipxy.com/special/hormuz" rel="noreferrer" target="_blank">
          ShipXY ↗
        </a>
      </div>

      <svg className="clean-map hormuz-schematic" viewBox="0 0 1000 620" role="img" aria-label="霍尔木兹海峡专题态势示意图，展示主航道、分隔区、替代出口走廊和非实时示例船点">
        <defs>
          <linearGradient id="schematicWater" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#e8f5ff" />
            <stop offset="52%" stopColor="#dceefa" />
            <stop offset="100%" stopColor="#f6fbff" />
          </linearGradient>
          <filter id="vesselGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="0" floodColor="#60a5fa" floodOpacity="0.68" stdDeviation="6" />
          </filter>
          {LANE_LAYERS.filter((lane) => lane.arrowDir === "end").map((lane) => (
            <marker id={`lane-arrow-${lane.id}`} key={lane.id} markerHeight="8" markerWidth="9" orient="auto" refX="8" refY="4">
              <path d="M0,0 L0,8 L9,4 z" fill={lane.color} />
            </marker>
          ))}
        </defs>

        <rect className="water-fill" width="1000" height="620" fill="url(#schematicWater)" />
        <g className="bathymetry-lines" aria-hidden="true">
          <path d="M 42,212 C 170,235 270,238 384,266 C 520,302 660,318 948,294" />
          <path d="M 58,360 C 190,338 322,348 444,380 C 578,416 714,432 960,424" />
          <path d="M 80,500 C 226,468 358,478 490,516 C 632,556 790,566 972,536" />
        </g>

        <g className="land-layer" aria-label="regional landmass schematic">
          {LAND_SHAPES.map((shape) => (
            <path className={`schematic-land ${shape.muted ? "muted" : ""}`} d={shape.d} key={shape.id} />
          ))}
          {ISLAND_SHAPES.map((shape) => (
            <path className="schematic-island" d={shape.d} key={shape.id} />
          ))}
        </g>

        <g className="land-labels" aria-label="country labels">
          {LAND_SHAPES.map((shape) => (
            <text className={`land-label ${shape.muted ? "muted" : ""}`} x={shape.labelX} y={shape.labelY} key={shape.id}>
              {shape.label}
            </text>
          ))}
        </g>

        <g className="chokepoint-zone" aria-label="Hormuz chokepoint zone">
          <ellipse cx="600" cy="356" rx="86" ry="42" />
          <circle cx="600" cy="350" r="6" />
        </g>

        <g className="lane-layer" aria-label="schematic shipping lanes">
          {LANE_LAYERS.map((lane) => (
            <g
              className={layerClass(lane.id, focusedLayer)}
              key={lane.id}
              onMouseEnter={() => setHoverLayer(lane.id)}
              onMouseLeave={() => setHoverLayer(null)}
              style={{ color: lane.color }}
            >
              <path className="lane-hit-area" d={lane.d} />
              <path
                className={`schematic-lane-path ${lane.dashed ? "dashed" : ""}`}
                d={lane.d}
                markerEnd={lane.arrowDir === "end" ? `url(#lane-arrow-${lane.id})` : undefined}
              />
              <text className={`lane-label lane-label-${lane.id}`} x={lane.labelX} y={lane.labelY}>
                {lane.label}
              </text>
            </g>
          ))}
        </g>

        <g
          className={layerClass("vessels", focusedLayer)}
          aria-label="sample vessel points, not live AIS"
          onMouseEnter={() => setHoverLayer("vessels")}
          onMouseLeave={() => setHoverLayer(null)}
        >
          {SAMPLE_VESSELS.map((vessel) => (
            <g className="vessel-marker" data-type={vessel.type} key={vessel.id} transform={`translate(${vessel.x} ${vessel.y}) rotate(${vessel.course})`}>
              <title>{`${vessel.label}·示例船点，非实时 AIS`}</title>
              <circle r="12" />
              <path d="M0 -10 L7 9 L0 5 L-7 9 Z" />
            </g>
          ))}
        </g>

        <g className="callout-layer" aria-label="schematic geography labels">
          {CALLOUTS.map((callout) => {
            const optional = !callout.sea && callout.id !== "strait";
            const leaderEndY = callout.anchorY - (callout.size === "lg" ? 18 : 11);
            return (
              <g className={`map-callout callout-${callout.size} ${callout.sea ? "sea-callout" : ""} ${optional ? "callout-optional" : ""}`} key={callout.id}>
                {!callout.sea ? (
                  <>
                    <path className="callout-leader" d={`M ${callout.x},${callout.y} L ${callout.anchorX},${leaderEndY}`} />
                    <circle className="callout-point" cx={callout.x} cy={callout.y} r={callout.size === "lg" ? 5 : 3.5} />
                  </>
                ) : null}
                <text className="callout-label" x={callout.anchorX} y={callout.anchorY} textAnchor={calloutAnchor(callout)}>
                  {callout.text}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="map-traffic-legend" aria-label="map layer controls">
        {LEGEND_ITEMS.map((item) => {
          const pressed = activeLayer === item.id;
          return (
            <button
              aria-label={`聚焦${item.label}图层`}
              aria-pressed={pressed}
              data-layer={item.id}
              key={item.id}
              onBlur={() => setHoverLayer(null)}
              onClick={() => setActiveLayer(pressed ? null : item.id)}
              onFocus={() => setHoverLayer(item.id)}
              onMouseEnter={() => setHoverLayer(item.id)}
              onMouseLeave={() => setHoverLayer(null)}
              type="button"
            >
              <i style={{ backgroundColor: item.color }} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="map-reference-panel" aria-label="map data boundary">
        <p>
          本图根据公开航道描述（IMO TSS / IEA）重构为态势示意图，不显示实时 AIS 船流；示例船点仅表达航行方向，不代表本站实时数据。
          外部参考站点：
          <a href="https://www.shipxy.com/special/hormuz" rel="noreferrer" target="_blank">ShipXY 霍尔木兹专题 ↗</a>
        </p>
      </div>
    </section>
  );
}
