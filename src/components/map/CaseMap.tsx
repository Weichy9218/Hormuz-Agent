// Static Hormuz context map for route structure and reviewer orientation.
import { mapCountries, mapPlaces, shippingLanes } from "../../data";
import { toPath } from "../../lib/mapProjection";
import { InfoTitle } from "../shared/InfoTitle";

export function CaseMap({
  compact = false,
  variant = "default",
}: {
  compact?: boolean;
  variant?: "default" | "context";
}) {
  return (
    <section className={`console-card case-map ${compact ? "compact" : ""} ${variant === "context" ? "context-map" : ""}`}>
      <div className="map-card-heading">
        <InfoTitle
          title={variant === "context" ? "Static case geography" : compact ? "区域" : "案例边界"}
          subtitle={variant === "context" ? "Natural Earth region outline · route overlay · no live AIS" : compact ? undefined : "Hormuz region · static route context, no live AIS"}
        />
      </div>
      <svg className="clean-map" viewBox="0 0 1000 560" role="img" aria-label="Hormuz route structure and static context map">
        <defs>
          <linearGradient id="waterGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#e8f4ff" />
            <stop offset="48%" stopColor="#d8ebf9" />
            <stop offset="100%" stopColor="#f2f8ff" />
          </linearGradient>
          <marker id="routeArrow" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="3">
            <path d="M0,0 L0,6 L7,3 z" fill="#0b66f6" />
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
        <g className="map-place-points" aria-label="static geography labels">
          {mapPlaces.map((place) => (
            <g key={place.id} transform={`translate(${place.x} ${place.y})`}>
              <circle r={place.kind === "port" ? 5 : 3.5} />
              <text x="10" y="4">{place.label}</text>
            </g>
          ))}
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
          <ellipse cx="600" cy="356" rx="84" ry="42" />
          <circle cx="600" cy="356" r="7" />
        </g>
        <text className="map-label country" x="502" y="105">Iran</text>
        <text className="map-label country" x="272" y="438">UAE</text>
        <text className="map-label country" x="638" y="462">Oman</text>
        <text className="map-label country muted" x="140" y="230">Saudi Arabia</text>
        <text className="map-label strait" x="536" y="333">Strait of Hormuz</text>
      </svg>
      <div className="map-caption">
        Static geography only: country outlines use Natural Earth-style admin geometry;
        route overlays are explanatory and do not represent live vessel positions or current throughput.
      </div>
    </section>
  );
}
