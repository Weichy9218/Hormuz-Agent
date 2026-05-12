// Static Hormuz context map for route structure and reviewer orientation.
import { mapCountries, shippingLanes } from "../../data";
import { toPath } from "../../lib/mapProjection";
import { InfoTitle } from "../shared/InfoTitle";

export function CaseMap({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`console-card case-map ${compact ? "compact" : ""}`}>
      <div className="map-card-heading">
        <InfoTitle
          title={compact ? "区域" : "案例边界"}
          subtitle={compact ? undefined : "Hormuz region · static route context, no live AIS"}
        />
      </div>
      <svg className="clean-map" viewBox="0 0 1000 560" role="img" aria-label="Hormuz route structure and static context map">
        <defs>
          <linearGradient id="waterGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#eff7ff" />
            <stop offset="58%" stopColor="#dcefff" />
            <stop offset="100%" stopColor="#eef8ff" />
          </linearGradient>
          <marker id="routeArrow" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="3">
            <path d="M0,0 L0,6 L7,3 z" fill="#0b66f6" />
          </marker>
        </defs>
        <rect width="1000" height="560" fill="url(#waterGradient)" />
        <g>
          {mapCountries.flatMap((country) =>
            country.rings.map((ring, index) => (
              <path className="land-mass" d={toPath(ring, true)} key={`${country.name}-${index}`} />
            )),
          )}
        </g>
        <g>
          {shippingLanes.map((lane) => (
            <path
              className={`traffic-route ${lane.laneClass}`}
              d={toPath(lane.coordinates)}
              key={lane.id}
              markerEnd="url(#routeArrow)"
            />
          ))}
        </g>
        <g className="chokepoint-zone" aria-label="Hormuz chokepoint">
          <ellipse cx="618" cy="382" rx="76" ry="44" />
          <circle cx="618" cy="382" r="7" />
        </g>
        <text className="map-label country" x="458" y="116">Iran</text>
        <text className="map-label country" x="300" y="506">UAE</text>
        <text className="map-label country" x="646" y="500">Oman</text>
        <text className="map-label strait" x="508" y="340">Strait of</text>
        <text className="map-label strait" x="508" y="388">Hormuz</text>
      </svg>
      <div className="map-caption">
        航线只表示主干通道和替代走廊结构，不代表实时船舶位置、traffic stop
        或当日 throughput；实时 flow 仍需授权 AIS / tanker / LNG source。
      </div>
    </section>
  );
}
