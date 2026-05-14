# Hormuz Interactive Map Plan

Last updated: 2026-05-14

本文件定义 P0 动态地图的实现计划。它只覆盖 **Overview 页的交互式地理 context map**，不改变 Forecast 页，不接实时 AIS，不把地图输出写入 forecast pipeline。

## 1. Objective

实际目标不是“做一个船舶实时地图”，而是让 reviewer 在 Overview 一屏内更快建立地理语境：

- Strait of Hormuz 在哪里；
- 主航道、替代出口走廊和关键港口在哪里；
- 最新事件大致落在哪些地理点；
- 当前 PortWatch aggregate traffic 状态是什么；
- 地图上哪些内容是 source-backed，哪些只是 context overlay。

完成后，Overview 的 map 应该能回答：

```text
当前事件发生在 Hormuz 哪个区域？
这和主航道 / bypass corridor / PortWatch traffic snapshot 有什么空间关系？
这些图层是否只是 context，而不是实时 AIS 船位？
```

## 2. Non-Goals

P0 明确不做：

- 不显示实时 vessel-level AIS / SAR / satellite vessel detections。
- 不渲染单船位置、航速、船名、MMSI、ETA 或实时轨迹。
- 不从浏览器直接调用 GDELT、PortWatch、MarineTraffic、VesselFinder、Spire 等外部 API。
- 不让 Polymarket、events timeline、GDELT 或 map state 进入 `EvidenceClaim`、`canonical_inputs.json`、forecast store 或 galaxy run。
- 不把 PortWatch aggregate traffic 描述成 closure probability、scenario probability 或 trading signal。
- 不新增 News / Market 地图页；P0 只替换 Overview 的 context map。

## 3. Product Boundary

本计划遵守现有产品边界：

- Background pages 只消费 `data/generated/**` 和 `data/external/**`。
- Forecast 页只消费 `data/galaxy/**`。
- Overview 地图可以消费 `overview_snapshot.latest_events` 与 `overview_snapshot.traffic_snapshot`，但只做展示，不派生预测结论。
- 地图必须常驻 caveat：`No live AIS` / `PortWatch aggregate only` / `Context overlay`。
- 如果地图底图或 WebGL 不可用，必须 graceful fallback 到现有 SVG schematic map。

## 4. Recommended Stack

P0 使用：

| Layer | Choice | Reason |
| --- | --- | --- |
| Rendering | `maplibre-gl` | 开源、WebGL、GeoJSON layer 能力强，后续可自然扩展到 global news map。 |
| Basemap | OSM raster tiles via a local MapLibre style | demo/research 阶段无 API key，避免 public vector style glyph 依赖；未来高频 demo 需切 MapTiler / ArcGIS / self-host。 |
| Overlay data | local GeoJSON derived in frontend | P0 overlay 数据来自已有 `src/data.ts` 与 generated snapshot，不新增 fetch pipeline。 |
| Fallback | existing `CaseMap` SVG | 无网络 / WebGL fail 时仍能展示 Hormuz context。 |

为什么不用 `tile.openstreetmap.org` 直连生产：

- OSM data 是开放的，但 OSMF public tile server 不是无限公共 CDN。
- 生产或高频 demo 应使用 provider tiles、self-hosted tiles，或至少加缓存和 attribution。P0 只面向本地 demo / reviewer smoke，不把 OSM public tiles 作为生产承诺。

为什么 P0 不用 Leaflet：

- Leaflet 更轻，适合 raster tiles + marker。
- 本系统后续更可能需要 GeoJSON line layers、severity styling、global event overlays、动态 layer toggle；MapLibre 的路径更顺。

## 5. Data Contract

P0 不新增 persisted schema。组件内部维护一个小型 geography dictionary，把现有 timeline `geography: string[]` 映射到点位：

```ts
type MapGeoPoint = {
  key: string;
  label: string;
  coordinates: [number, number]; // [lng, lat]
  confidence: "named_place" | "regional_centroid";
  caveat: string;
};
```

初始 dictionary 覆盖：

- `Strait of Hormuz`
- `Persian Gulf`
- `Gulf of Oman`
- `Bandar Abbas`
- `Jask`
- `Sirik`
- `Greater Tunb Island`
- `Fujairah`
- `Musandam`
- `Singapore`
- `Red Sea`
- `Suez`
- `United Kingdom`

P0 event pins 规则：

- 从 `overview_snapshot.latest_events.slice(0, 3)` 读取。
- 每条 event 最多显示 2 个可映射 geography 点。
- 如果一个 geography 是 regional centroid，tooltip 必须显示 `approximate regional point`。
- 未映射 geography 不显示 pin，不补假坐标。

P0 traffic status 规则：

- 只读 `overview_snapshot.traffic_snapshot`。
- 显示 latest daily transit calls、7d avg、vs 1y baseline。
- 文案必须包含 `PortWatch aggregate` 或等价 caveat。
- 不显示船点；示例船图层移除或改为 `sample only`，默认不作为 live layer。

P0 overlay layers：

| Layer | Source | Visual |
| --- | --- | --- |
| Chokepoint area | local coordinates | translucent blue polygon / circle |
| Shipping lanes | `src/data.ts` `shippingLanes` | blue/teal line |
| Bypass corridor | `src/data.ts` `shippingLanes` | amber dashed line |
| Ports / places | local dictionary | small labeled markers |
| Latest events | `overview_snapshot.latest_events` + dictionary | severity-colored pins |
| Traffic snapshot | `overview_snapshot.traffic_snapshot` | compact status panel over map |

## 6. UI Design

Design language follows existing light reviewer console:

- White card, 1px cool gray border, 8px radius.
- Dense but readable controls; no dark “war room” styling.
- Primary map water/land comes from basemap; overlays use existing tokens:
  - `--blue` for chokepoint / primary route;
  - teal for outbound / ports;
  - amber for bypass / watch;
  - red only for severe event pins;
  - gray for caveats and fallback text.
- Layer toggles are compact icon/text buttons below or above the map.
- Tooltip text must show source boundary, not analytical interpretation.

Expected Overview card layout:

```text
┌────────────────────────────────────────────────────┐
│ title + data boundary                         link │
├────────────────────────────────────────────────────┤
│ interactive MapLibre canvas                       │
│  - lanes / chokepoint / latest event pins          │
│  - traffic status panel                            │
├────────────────────────────────────────────────────┤
│ layer toggles                                      │
├────────────────────────────────────────────────────┤
│ caveat: no live AIS; PortWatch aggregate only      │
└────────────────────────────────────────────────────┘
```

## 7. Implementation Order

### Step 1 — Plan doc

Create this file and make it the implementation contract for P0.

Verification:

```bash
test -f docs/map.md
```

### Step 2 — Dependency

Install `maplibre-gl` and commit package metadata changes only if install succeeds.

Verification:

```bash
npm ls maplibre-gl
```

### Step 3 — Interactive map component

Add `src/components/map/HormuzInteractiveMap.tsx`.

Responsibilities:

- initialize MapLibre map inside a React effect;
- use a local MapLibre style with OSM raster tiles;
- add GeoJSON sources and layers after map `load`;
- support layer toggles without tearing down the map;
- render local overlay controls / traffic status / caveat;
- fallback to `CaseMap` if MapLibre fails, WebGL is unavailable, or component unmounts before load.

### Step 4 — Overview integration

Update `OverviewPage.ContextMapCard` to use `HormuzInteractiveMap` with:

- `snapshot.latest_events`;
- `snapshot.traffic_snapshot`;
- `compact` layout matching existing card width.

Keep the current `CaseMap` import available only as fallback inside the new component.

### Step 5 — Styling

Update `src/styles/product.css` for:

- stable map aspect ratio and min height;
- overlay status panel;
- layer controls;
- popup / fallback card treatment;
- mobile layout.

### Step 6 — Verification

Run targeted checks:

```bash
npm run lint
npm run build
npm run audit:legacy
npm run audit:ui
```

Run browser smoke:

```bash
npm run dev -- --port 5173
```

Manual smoke checklist:

- Overview map renders with basemap when network is available.
- Event pins visible for latest events with mapped geography.
- Traffic status panel shows PortWatch latest / 7d avg / baseline delta.
- Layer toggles hide/show lanes, places, events, traffic area.
- Caveat visibly says no live AIS.
- If basemap fails, fallback SVG map still appears.
- Forecast page diff remains untouched by this task.

## 8. Future Extensions

P1, not in this implementation:

- Add `geo_points` to `TimelineEvent` generated bundle.
- Add News map mode with promoted events only.
- Add global news map for region-level event distribution.
- Add provider switch from local OSM raster style to MapTiler / ArcGIS / OpenFreeMap with environment-configured provider settings.
- Add self-hosted PMTiles / vector tiles for offline conference demo.

P2 / Hold:

- Vessel-level AIS overlay, only after licensed provider, caching policy, latency caveat, and audit contract are defined.
- SAR / RF detections, only after source rights and confidence metadata are available.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Public basemap endpoint unavailable | Fall back to `CaseMap`; do not block Overview. |
| Reviewer reads event pin as exact incident location | Mark regional centroids as approximate in popup/caveat. |
| Map suggests live vessel monitoring | No ship layer by default; caveat visible; traffic panel says aggregate only. |
| Bundle size increases | Use MapLibre only in Overview map component; verify build chunk. |
| Existing dirty Forecast/data work conflicts | Do not touch Forecast files or generated data during P0 map implementation. |

## 10. Done When

P0 is done when:

- `docs/map.md` exists and documents the boundary above.
- Overview uses the interactive map component.
- The map shows local lanes, places, latest event pins, and traffic status.
- There is a visible no-live-AIS caveat.
- Fallback SVG map works.
- `npm run lint`, `npm run build`, `npm run audit:legacy`, and `npm run audit:ui` have run, with any failures reported honestly.
