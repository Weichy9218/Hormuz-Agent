// SVG map projection helpers for the static Hormuz context map.
import type { CoordinatePoint } from "../types";

const mapBounds = { minLon: 44, maxLon: 64, minLat: 19.5, maxLat: 32 };

function projectPoint(point: CoordinatePoint) {
  const x = ((point.lon - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon)) * 1000;
  const y = (1 - (point.lat - mapBounds.minLat) / (mapBounds.maxLat - mapBounds.minLat)) * 560;
  return [x, y] as const;
}

export function toPath(points: CoordinatePoint[], closed = false) {
  if (!points.length) return "";
  return points
    .map((point, index) => {
      const [x, y] = projectPoint(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ")
    .concat(closed ? " Z" : "");
}
