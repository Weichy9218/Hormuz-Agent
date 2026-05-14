// Interactive Overview map: local Hormuz context overlays on a public basemap, never live AIS.
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type Map as MapLibreMap,
  type StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection, LineString, Point, Polygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { shippingLanes } from "../../data";
import type { OverviewSnapshot } from "../../types/marketChart";
import type { TimelineEvent, TimelineSeverity } from "../../types/timeline";
import { InfoTitle } from "../shared/InfoTitle";
import { CaseMap } from "./CaseMap";

type TrafficSnapshot = OverviewSnapshot["traffic_snapshot"];
type LayerKey = "traffic" | "lanes" | "places" | "events";
type MapGeoConfidence = "named_place" | "regional_centroid";
type PointFeatureCollection = FeatureCollection<Point>;
type LineFeatureCollection = FeatureCollection<LineString>;
type PolygonFeatureCollection = FeatureCollection<Polygon>;
type MapFeatureCollection = PointFeatureCollection | LineFeatureCollection | PolygonFeatureCollection;

interface MapGeoPoint {
  key: string;
  label: string;
  coordinates: [number, number];
  confidence: MapGeoConfidence;
  caveat: string;
}

const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "osm-raster": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm-raster",
      type: "raster",
      source: "osm-raster",
      paint: {
        "raster-opacity": 0.92,
      },
    },
  ],
};
const HORMUZ_CENTER: [number, number] = [56.42, 26.35];
const HORMUZ_BOUNDS = { minLng: 44, maxLng: 64, minLat: 19.5, maxLat: 32 };

const INITIAL_LAYERS: Record<LayerKey, boolean> = {
  traffic: true,
  lanes: true,
  places: true,
  events: true,
};

const LAYER_CONTROLS: Array<{ key: LayerKey; label: string; color: string }> = [
  { key: "traffic", label: "Traffic area", color: "#0b66f6" },
  { key: "lanes", label: "Routes", color: "#0e7490" },
  { key: "places", label: "Ports", color: "#64748b" },
  { key: "events", label: "Latest events", color: "#ff9f1c" },
];

const MAP_LAYERS_BY_CONTROL: Record<LayerKey, string[]> = {
  traffic: ["hormuz-chokepoint-fill", "hormuz-chokepoint-outline"],
  lanes: ["hormuz-lanes-major", "hormuz-lanes-bypass"],
  places: ["hormuz-places-circle"],
  events: ["hormuz-events-halo", "hormuz-events-circle"],
};

const GEOGRAPHY_POINTS: Record<string, MapGeoPoint> = {
  "strait of hormuz": {
    key: "strait-of-hormuz",
    label: "Strait of Hormuz",
    coordinates: [56.42, 26.35],
    confidence: "regional_centroid",
    caveat: "approximate regional point",
  },
  "persian gulf": {
    key: "persian-gulf",
    label: "Persian Gulf",
    coordinates: [52.6, 27.3],
    confidence: "regional_centroid",
    caveat: "approximate regional point",
  },
  "gulf of oman": {
    key: "gulf-of-oman",
    label: "Gulf of Oman",
    coordinates: [57.55, 24.75],
    confidence: "regional_centroid",
    caveat: "approximate regional point",
  },
  "bandar abbas": {
    key: "bandar-abbas",
    label: "Bandar Abbas",
    coordinates: [56.27, 27.18],
    confidence: "named_place",
    caveat: "named place point",
  },
  jask: {
    key: "jask",
    label: "Jask",
    coordinates: [57.77, 25.64],
    confidence: "named_place",
    caveat: "named place point",
  },
  sirik: {
    key: "sirik",
    label: "Sirik",
    coordinates: [57.1, 26.52],
    confidence: "named_place",
    caveat: "named place point",
  },
  "greater tunb island": {
    key: "greater-tunb-island",
    label: "Greater Tunb Island",
    coordinates: [55.3, 26.26],
    confidence: "named_place",
    caveat: "named place point",
  },
  fujairah: {
    key: "fujairah",
    label: "Fujairah",
    coordinates: [56.33, 25.13],
    confidence: "named_place",
    caveat: "named place point",
  },
  musandam: {
    key: "musandam",
    label: "Musandam",
    coordinates: [56.25, 26.18],
    confidence: "regional_centroid",
    caveat: "approximate regional point",
  },
  singapore: {
    key: "singapore",
    label: "Singapore",
    coordinates: [103.82, 1.29],
    confidence: "named_place",
    caveat: "outside Hormuz viewport",
  },
  "red sea": {
    key: "red-sea",
    label: "Red Sea",
    coordinates: [38.5, 20.0],
    confidence: "regional_centroid",
    caveat: "outside Hormuz viewport",
  },
  suez: {
    key: "suez",
    label: "Suez",
    coordinates: [32.55, 29.97],
    confidence: "named_place",
    caveat: "outside Hormuz viewport",
  },
  "united kingdom": {
    key: "united-kingdom",
    label: "United Kingdom",
    coordinates: [-2.0, 54.0],
    confidence: "regional_centroid",
    caveat: "outside Hormuz viewport",
  },
};

const CHOKEPOINT_POLYGON: PolygonFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        label: "PortWatch chokepoint6 aggregate window",
        caveat: "Context area only; not live AIS.",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [55.18, 25.82],
          [55.68, 26.53],
          [56.23, 26.86],
          [56.94, 26.76],
          [57.22, 26.22],
          [56.68, 25.76],
          [55.82, 25.62],
          [55.18, 25.82],
        ]],
      },
    },
  ],
};

const PLACE_POINTS: PointFeatureCollection = {
  type: "FeatureCollection",
  features: [
    "bandar abbas",
    "fujairah",
    "musandam",
    "jask",
    "sirik",
    "greater tunb island",
    "strait of hormuz",
  ].map((key) => {
    const point = GEOGRAPHY_POINTS[key];
    return {
      type: "Feature",
      properties: {
        key: point.key,
        label: point.label,
        caveat: point.caveat,
        confidence: point.confidence,
      },
      geometry: { type: "Point", coordinates: point.coordinates },
    };
  }),
};

function normalizeGeography(value: string) {
  return value.trim().toLowerCase();
}

function isInHormuzRegion(coordinates: [number, number]) {
  const [lng, lat] = coordinates;
  return lng >= HORMUZ_BOUNDS.minLng &&
    lng <= HORMUZ_BOUNDS.maxLng &&
    lat >= HORMUZ_BOUNDS.minLat &&
    lat <= HORMUZ_BOUNDS.maxLat;
}

function severityColor(severity: TimelineSeverity) {
  if (severity === "severe") return "#ef2b2d";
  if (severity === "elevated") return "#ff9f1c";
  if (severity === "deescalation") return "#16a34a";
  if (severity === "watch") return "#0b66f6";
  return "#64748b";
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const input = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
  }).format(date);
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(digits, 2),
  }).format(value);
}

function formatDeltaPct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 2)}%`;
}

function supportsWebGl() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

function eventPinFeatures(events: TimelineEvent[]): PointFeatureCollection {
  const features: PointFeatureCollection["features"] = [];

  events.slice(0, 3).forEach((event) => {
    const mapped = (event.geography ?? [])
      .map((value) => GEOGRAPHY_POINTS[normalizeGeography(value)])
      .filter((point): point is MapGeoPoint => Boolean(point))
      .filter((point) => isInHormuzRegion(point.coordinates))
      .sort((a, b) => {
        if (a.confidence !== b.confidence) return a.confidence === "named_place" ? -1 : 1;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 2);

    mapped.forEach((point, index) => {
      features.push({
        type: "Feature",
        properties: {
          id: `${event.event_id}:${point.key}`,
          eventId: event.event_id,
          title: event.title,
          sourceName: event.source_name,
          eventAt: event.event_at,
          severity: event.severity_hint,
          severityColor: severityColor(event.severity_hint),
          geography: point.label,
          confidence: point.confidence,
          caveat: point.caveat,
          rank: index + 1,
        },
        geometry: { type: "Point", coordinates: point.coordinates },
      });
    });
  });

  return { type: "FeatureCollection", features };
}

function laneFeatures(): LineFeatureCollection {
  return {
    type: "FeatureCollection",
    features: shippingLanes.map((lane) => ({
      type: "Feature",
      properties: {
        id: lane.id,
        label: lane.label,
        laneClass: lane.laneClass,
        source: lane.source,
      },
      geometry: {
        type: "LineString",
        coordinates: lane.coordinates.map((point) => [point.lon, point.lat]),
      },
    })),
  };
}

function setGeoJsonSource(
  map: MapLibreMap,
  id: string,
  data: MapFeatureCollection,
) {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource(id, { type: "geojson", data });
}

function addOverlayLayers(map: MapLibreMap) {
  if (!map.getLayer("hormuz-chokepoint-fill")) {
    map.addLayer({
      id: "hormuz-chokepoint-fill",
      type: "fill",
      source: "hormuz-chokepoint",
      paint: {
        "fill-color": "#0b66f6",
        "fill-opacity": 0.15,
      },
    });
  }
  if (!map.getLayer("hormuz-chokepoint-outline")) {
    map.addLayer({
      id: "hormuz-chokepoint-outline",
      type: "line",
      source: "hormuz-chokepoint",
      paint: {
        "line-color": "#0b66f6",
        "line-opacity": 0.72,
        "line-width": 2.2,
        "line-dasharray": [2, 1.4],
      },
    });
  }
  if (!map.getLayer("hormuz-lanes-major")) {
    map.addLayer({
      id: "hormuz-lanes-major",
      type: "line",
      source: "hormuz-lanes",
      filter: ["==", ["get", "laneClass"], "major"],
      paint: {
        "line-color": "#0e7490",
        "line-opacity": 0.9,
        "line-width": 3.2,
      },
    });
  }
  if (!map.getLayer("hormuz-lanes-bypass")) {
    map.addLayer({
      id: "hormuz-lanes-bypass",
      type: "line",
      source: "hormuz-lanes",
      filter: ["==", ["get", "laneClass"], "bypass"],
      paint: {
        "line-color": "#d97706",
        "line-opacity": 0.86,
        "line-width": 3,
        "line-dasharray": [1.2, 1.2],
      },
    });
  }
  if (!map.getLayer("hormuz-places-circle")) {
    map.addLayer({
      id: "hormuz-places-circle",
      type: "circle",
      source: "hormuz-places",
      paint: {
        "circle-color": "#ffffff",
        "circle-stroke-color": "#475569",
        "circle-stroke-width": 1.8,
        "circle-radius": 4.8,
      },
    });
  }
  if (!map.getLayer("hormuz-events-halo")) {
    map.addLayer({
      id: "hormuz-events-halo",
      type: "circle",
      source: "hormuz-events",
      paint: {
        "circle-color": ["get", "severityColor"],
        "circle-opacity": 0.16,
        "circle-radius": 15,
      },
    });
  }
  if (!map.getLayer("hormuz-events-circle")) {
    map.addLayer({
      id: "hormuz-events-circle",
      type: "circle",
      source: "hormuz-events",
      paint: {
        "circle-color": ["get", "severityColor"],
        "circle-radius": 7,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }
}

function applyLayerVisibility(map: MapLibreMap, visibleLayers: Record<LayerKey, boolean>) {
  Object.entries(MAP_LAYERS_BY_CONTROL).forEach(([key, layerIds]) => {
    const visibility = visibleLayers[key as LayerKey] ? "visible" : "none";
    layerIds.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visibility);
      }
    });
  });
}

function popupHtml(properties: Record<string, unknown>) {
  const title = String(properties.title ?? properties.label ?? "Map point");
  const meta = properties.eventAt
    ? `${formatDate(String(properties.eventAt))} · ${String(properties.sourceName ?? "source")}`
    : String(properties.caveat ?? "context overlay");
  const caveat = properties.confidence === "regional_centroid"
    ? "Approximate regional point, not exact incident coordinates."
    : String(properties.caveat ?? "Named place point.");
  return `
    <div class="hormuz-map-popup">
      <strong>${title}</strong>
      <span>${meta}</span>
      <small>${caveat}</small>
    </div>
  `;
}

function trafficTone(traffic: TrafficSnapshot) {
  const delta = traffic?.delta_vs_baseline_pct;
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return "unknown";
  if (delta <= -50) return "low";
  if (delta < -10) return "watch";
  return "normal";
}

export function HormuzInteractiveMap({
  events,
  traffic,
}: {
  events: TimelineEvent[];
  traffic: TrafficSnapshot;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<Record<LayerKey, boolean>>(INITIAL_LAYERS);

  const overlays = useMemo(() => ({
    lanes: laneFeatures(),
    events: eventPinFeatures(events),
  }), [events]);
  const overlaysRef = useRef(overlays);
  const visibleLayersRef = useRef(visibleLayers);

  useEffect(() => {
    overlaysRef.current = overlays;
  }, [overlays]);

  useEffect(() => {
    visibleLayersRef.current = visibleLayers;
  }, [visibleLayers]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!supportsWebGl()) {
      setMapFailed(true);
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: HORMUZ_CENTER,
      zoom: 5.55,
      minZoom: 4,
      maxZoom: 10,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.once("load", () => {
      readyRef.current = true;
      setGeoJsonSource(map, "hormuz-chokepoint", CHOKEPOINT_POLYGON);
      setGeoJsonSource(map, "hormuz-lanes", overlaysRef.current.lanes);
      setGeoJsonSource(map, "hormuz-places", PLACE_POINTS);
      setGeoJsonSource(map, "hormuz-events", overlaysRef.current.events);
      addOverlayLayers(map);
      applyLayerVisibility(map, visibleLayersRef.current);
      setMapReady(true);

      const showPopup = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature?.properties) return;
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: false, maxWidth: "260px", offset: 12 })
          .setLngLat(event.lngLat)
          .setHTML(popupHtml(feature.properties))
          .addTo(map);
      };

      ["hormuz-events-circle", "hormuz-places-circle"].forEach((layerId) => {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
          popupRef.current?.remove();
        });
        map.on("click", layerId, showPopup);
      });
    });

    map.on("error", () => {
      if (!readyRef.current) setMapFailed(true);
    });

    return () => {
      popupRef.current?.remove();
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    setGeoJsonSource(map, "hormuz-lanes", overlays.lanes);
    setGeoJsonSource(map, "hormuz-events", overlays.events);
    applyLayerVisibility(map, visibleLayers);
  }, [mapReady, overlays, visibleLayers]);

  if (mapFailed) {
    return <CaseMap compact variant="traffic" />;
  }

  const mappedEventCount = overlays.events.features.length;
  const tone = trafficTone(traffic);

  return (
    <section className="console-card interactive-map-card">
      <div className="map-card-heading">
        <InfoTitle
          title="Hormuz interactive context map"
          subtitle="OpenStreetMap raster basemap · local overlays · no live AIS"
        />
        <a className="map-live-link" href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">
          OSM attribution ↗
        </a>
      </div>

      <div className="interactive-map-frame">
        <div className="interactive-map-canvas" ref={containerRef} />
        {!mapReady ? (
          <div className="interactive-map-loading">
            <strong>Loading map</strong>
            <span>Preparing basemap and local Hormuz overlays.</span>
          </div>
        ) : null}
        <aside className="map-traffic-status" data-tone={tone}>
          <span>PortWatch aggregate</span>
          <strong>{traffic ? formatNumber(traffic.latest_value, 0) : "—"}</strong>
          <small>
            daily transit calls
            {traffic ? ` · ${formatDate(traffic.latest_date)}` : ""}
          </small>
          <b>7d avg {traffic ? formatNumber(traffic.avg_7d, 2) : "—"}</b>
          <b>vs 1y {traffic ? formatDeltaPct(traffic.delta_vs_baseline_pct) : "—"}</b>
        </aside>
      </div>

      <div className="map-traffic-legend interactive-map-controls" aria-label="interactive map layer controls">
        {LAYER_CONTROLS.map((item) => {
          const pressed = visibleLayers[item.key];
          return (
            <button
              aria-label={`${pressed ? "Hide" : "Show"} ${item.label} layer`}
              aria-pressed={pressed}
              data-layer={item.key}
              key={item.key}
              onClick={() => setVisibleLayers((current) => ({ ...current, [item.key]: !current[item.key] }))}
              type="button"
            >
              <i style={{ backgroundColor: item.color }} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="map-reference-panel" aria-label="interactive map data boundary">
        <p>
          地图底图来自 OpenStreetMap raster tiles；路线、港口和事件点是本地 context overlay。
          最新事件 pins：{mappedEventCount} 个 mapped geography points。Traffic 面板只显示 PortWatch aggregate，不显示实时 AIS 船流或单船位置。
          外部船流参考仍需单独打开：
          <a href="https://www.shipxy.com/special/hormuz" rel="noreferrer" target="_blank">ShipXY 霍尔木兹专题 ↗</a>
        </p>
      </div>
    </section>
  );
}
