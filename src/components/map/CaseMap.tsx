// Static Hormuz context map for route structure and reviewer orientation.
import { mapCountries, mapPlaces, shippingLanes } from "../../data";
import { toPath } from "../../lib/mapProjection";
import { InfoTitle } from "../shared/InfoTitle";

const vesselPoints = [
  { id: "v1", x: 330, y: 292, type: "tanker", label: "油轮", speed: 11.2, course: -58 },
  { id: "v2", x: 468, y: 386, type: "cargo", label: "货船", speed: 9.4, course: 28 },
  { id: "v3", x: 576, y: 348, type: "tanker", label: "油轮", speed: 12.0, course: 42 },
  { id: "v4", x: 628, y: 338, type: "bulk", label: "散货船", speed: 7.1, course: -22 },
  { id: "v5", x: 696, y: 386, type: "cargo", label: "货船", speed: 13.6, course: 38 },
  { id: "v6", x: 754, y: 310, type: "tanker", label: "油轮", speed: 10.5, course: 72 },
  { id: "v7", x: 526, y: 280, type: "support", label: "辅助船", speed: 3.4, course: -12 },
  { id: "v8", x: 408, y: 448, type: "cargo", label: "货船", speed: 8.8, course: 21 },
];

const vesselLegend = [
  { type: "tanker", label: "油轮" },
  { type: "cargo", label: "货船" },
  { type: "bulk", label: "散货船" },
  { type: "support", label: "辅助船" },
];

export function CaseMap({
  compact = false,
  variant = "default",
}: {
  compact?: boolean;
  variant?: "default" | "context" | "traffic";
}) {
  const isTraffic = variant === "traffic";

  return (
    <section className={`console-card case-map ${compact ? "compact" : ""} ${isTraffic ? "traffic-map" : variant === "context" ? "context-map" : ""}`}>
      <div className="map-card-heading">
        <InfoTitle
          title={isTraffic ? "霍尔木兹通航态势示意" : variant === "context" ? "Static case geography" : compact ? "区域" : "案例边界"}
          subtitle={isTraffic ? "示例船点 + 航道方向 + 数据边界；不是本站实时 AIS" : variant === "context" ? "Natural Earth region outline · route overlay · no live AIS" : compact ? undefined : "Hormuz region · static route context, no live AIS"}
        />
        {isTraffic ? (
          <a className="map-live-link" href="https://hormuz.data-tracking.net/" rel="noreferrer" target="_blank">
            公开 AIS 参考
          </a>
        ) : null}
      </div>
      <svg className="clean-map" viewBox="0 0 1000 560" role="img" aria-label="Hormuz route structure and traffic context map">
        <defs>
          <linearGradient id="waterGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#e8f4ff" />
            <stop offset="48%" stopColor="#d8ebf9" />
            <stop offset="100%" stopColor="#f2f8ff" />
          </linearGradient>
          <marker id="routeArrow" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="3">
            <path d="M0,0 L0,6 L7,3 z" fill="#0b66f6" />
          </marker>
          <marker id="routeArrowSoft" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="2.5">
            <path d="M0,0 L0,5 L6,2.5 z" fill="#2563eb" fillOpacity="0.64" />
          </marker>
          <filter id="mapGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" floodColor="#1d4ed8" floodOpacity="0.14" stdDeviation="9" />
          </filter>
        </defs>
        <rect width="1000" height="560" fill="url(#waterGradient)" />
        <g className="bathymetry-lines" aria-hidden="true">
          <path d="M30 404 C190 356 303 386 454 334 C574 292 708 296 956 216" />
          <path d="M62 474 C224 430 338 454 490 402 C620 360 748 356 984 280" />
          <path d="M166 274 C320 280 420 238 560 220 C728 198 830 178 988 132" />
        </g>
        <g>
          {mapCountries.flatMap((country) =>
            country.rings.map((ring, index) => (
              <path className="land-mass" d={toPath(ring, true)} key={`${country.name}-${index}`} />
            )),
          )}
        </g>
        {isTraffic ? (
          <g className="traffic-context-labels" aria-label="traffic geography labels">
            <text className="sea" x="292" y="266">波斯湾</text>
            <text className="sea" x="746" y="316">阿曼湾</text>
            <g className="map-port-label" transform="translate(612 347)">
              <circle r="5" />
              <text x="12" y="-9">阿巴斯港</text>
            </g>
            <g className="map-port-label" transform="translate(618 433)">
              <circle r="5" />
              <text x="13" y="18">富查伊拉港</text>
            </g>
          </g>
        ) : (
          <g className="map-place-points" aria-label="static geography labels">
            {mapPlaces.map((place) => (
              <g key={place.id} transform={`translate(${place.x} ${place.y})`}>
                <circle r={place.kind === "port" ? 5 : 3.5} />
                <text x="10" y="4">{place.label}</text>
              </g>
            ))}
          </g>
        )}
        <g>
          {shippingLanes.map((lane) => (
            <path
              className={`traffic-route ${lane.laneClass}`}
              d={toPath(lane.coordinates)}
              key={lane.id}
              markerEnd={isTraffic ? "url(#routeArrowSoft)" : "url(#routeArrow)"}
            />
          ))}
        </g>
        {isTraffic ? (
          <g className="traffic-route-labels" aria-label="route direction labels">
            <text x="382" y="328">入湾主航道</text>
            <text x="654" y="408">出湾主航道</text>
            <text className="bypass" x="286" y="392">替代出口走廊示意</text>
          </g>
        ) : null}
        <g className="chokepoint-zone" aria-label="Hormuz chokepoint">
          <ellipse cx="600" cy="356" rx="84" ry="42" />
          <circle cx="600" cy="356" r="7" />
        </g>
        {isTraffic ? (
          <g className="ais-vessel-layer" aria-label="AIS style sample vessel layer">
            {vesselPoints.map((vessel) => (
              <g data-type={vessel.type} key={vessel.id} transform={`translate(${vessel.x} ${vessel.y}) rotate(${vessel.course})`}>
                <title>{`${vessel.label}示例 · ${vessel.speed.toFixed(1)} kn`}</title>
                <circle r="15" />
                <path d="M0 -9 L6 8 L0 5 L-6 8 Z" />
              </g>
            ))}
          </g>
        ) : null}
        <text className="map-label country" x="502" y="105">{isTraffic ? "伊朗 Iran" : "Iran"}</text>
        <text className="map-label country" x="190" y="378">{isTraffic ? "阿联酋 (UAE)" : "UAE"}</text>
        <text className="map-label country" x="638" y="462">{isTraffic ? "阿曼 Oman" : "Oman"}</text>
        <text className="map-label country muted" x="130" y="230">{isTraffic ? "沙特阿拉伯" : "Saudi Arabia"}</text>
        <text className="map-label strait" x="514" y="326">{isTraffic ? "霍尔木兹海峡" : "Strait of Hormuz"}</text>
      </svg>
      {isTraffic ? (
        <div className="map-traffic-stats" aria-label="public ais reference stats">
          <article>
            <span>参考站点</span>
            <strong>约 950 艘/轮询</strong>
          </article>
          <article>
            <span>更新节奏</span>
            <strong>约 30 分钟</strong>
          </article>
          <article>
            <span>可接数据</span>
            <strong>ships / crossings</strong>
          </article>
        </div>
      ) : null}
      {isTraffic ? (
        <div className="map-traffic-legend" aria-label="vessel legend">
          {vesselLegend.map((item) => (
            <span data-type={item.type} key={item.type}>
              <i />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="map-caption">
        {isTraffic
          ? "边界说明：UAE 是阿拉伯联合酋长国（阿联酋）。当前船点是 AIS-style 示例叠加，不是本站实时抓取；正式使用前必须把 live JSON 纳入 data pipeline，并显示 source_url、retrieved_at 与 AIS 局限。"
          : "Static geography only: country outlines use Natural Earth-style admin geometry; route overlays are explanatory and do not represent live vessel positions or current throughput."}
      </div>
    </section>
  );
}
