type KakaoMapMockMetrics = {
  map: {getLevel(): number; setLevel(level: number): void; getMapTypeId(): number; moveBounds(south: number, west: number, north: number, east: number): void} | null;
  mapCreates: number;
  initialViews: Array<{latitude: number; longitude: number; level: number}>;
  markerCreates: number;
  clusterers: number;
  markers: Array<{click(): void}>;
  overlayContents: string[];
  addCalls: boolean[];
  redraws: number;
  boundsFits: number[][][];
  centerFits: number[][];
};

declare global {
  interface Window {
    __kakaoMapMock: KakaoMapMockMetrics;
  }
}

export const installKakaoMapsMock = `
  (() => {
    const listeners = target => (target.__listeners ??= new Map());
    const emit = (target, name) => {
      for (const listener of listeners(target).get(name) ?? []) listener();
    };
    class LatLng {
      constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; }
      getLat() { return this.latitude; }
      getLng() { return this.longitude; }
    }
    class LatLngBounds {
      constructor() { this.points = []; }
      extend(point) { this.points.push(point); }
      getSouthWest() { return this.points[0] ?? new LatLng(35, 126); }
      getNorthEast() { return this.points.at(-1) ?? new LatLng(38, 128); }
    }
    class MapView {
      constructor(_container, options) {
        this.center = options.center;
        this.level = options.level;
        this.mapType = 1;
        this.bounds = new LatLngBounds();
        this.bounds.extend(new LatLng(35, 126));
        this.bounds.extend(new LatLng(38, 128));
        window.__kakaoMapMock.map = this;
        window.__kakaoMapMock.mapCreates++;
        window.__kakaoMapMock.initialViews.push({latitude: options.center.getLat(), longitude: options.center.getLng(), level: options.level});
      }
      setCenter(center) { this.center = center; window.__kakaoMapMock.centerFits.push([center.getLat(), center.getLng()]); }
      panTo(center) { this.center = center; }
      panBy() {}
      getCenter() { return this.center; }
      getBounds() { return this.bounds; }
      setLevel(level) { this.level = level; emit(this, "zoom_changed"); emit(this, "idle"); }
      getLevel() { return this.level; }
      setMapTypeId(type) { this.mapType = type; }
      getMapTypeId() { return this.mapType; }
      setBounds(bounds) { this.bounds = bounds; window.__kakaoMapMock.boundsFits.push(bounds.points.map(point => [point.getLat(), point.getLng()])); emit(this, "idle"); }
      moveBounds(south, west, north, east) {
        emit(this, "dragstart");
        this.bounds = new LatLngBounds();
        this.bounds.extend(new LatLng(south, west));
        this.bounds.extend(new LatLng(north, east));
        emit(this, "dragend");
        emit(this, "idle");
      }
      relayout() {}
    }
    class Marker {
      constructor(options) { this.options = options; this.__listeners = new Map(); window.__kakaoMapMock.markers.push(this); window.__kakaoMapMock.markerCreates++; }
      setMap() {}
      setImage() {}
      setZIndex() {}
      click() { for (const listener of this.__listeners.get("click") ?? []) listener(); }
    }
    class Overlay {
      setContent(content) { window.__kakaoMapMock.overlayContents.push(typeof content === "string" ? content : content?.textContent ?? ""); }
      setPosition() {}
      setMap() {}
    }
    class Circle extends Overlay {
      constructor(options) { super(); this.center = options.center; this.radius = options.radius; }
      setOptions(options) { this.options = {...this.options, ...options}; }
      setPosition(position) { this.center = position; }
      setRadius(radius) { this.radius = radius; }
      getBounds() { const bounds = new LatLngBounds(); bounds.extend(this.center); return bounds; }
    }
    class Clusterer {
      constructor() { window.__kakaoMapMock.clusterers++; }
      addMarkers(_markers, nodraw) { window.__kakaoMapMock.addCalls.push(nodraw); }
      addMarker() {}
      removeMarker() {}
      redraw() { window.__kakaoMapMock.redraws++; }
      setMinLevel() {}
      clear() {}
    }
    window.__kakaoMapMock = {map: null, mapCreates: 0, initialViews: [], markerCreates: 0, clusterers: 0, markers: [], overlayContents: [], addCalls: [], redraws: 0, boundsFits: [], centerFits: []};
    window.kakao = {maps: {
      MapTypeId: {ROADMAP: 1, HYBRID: 3},
      Map: MapView,
      LatLng,
      LatLngBounds,
      Size: class { constructor(width, height) { this.width = width; this.height = height; } },
      Point: class { constructor(x, y) { this.x = x; this.y = y; } },
      MarkerImage: class { constructor(source) { this.source = source; } },
      Marker,
      MarkerClusterer: Clusterer,
      InfoWindow: class { setContent() {} open() {} close() {} },
      CustomOverlay: Overlay,
      Circle,
      Polyline: class extends Overlay {},
      load: callback => callback(),
      event: {
        addListener(target, name, callback) {
          const targetListeners = listeners(target);
          targetListeners.set(name, [...(targetListeners.get(name) ?? []), callback]);
        },
        removeListener(target, name, callback) {
          const targetListeners = listeners(target);
          targetListeners.set(name, (targetListeners.get(name) ?? []).filter(item => item !== callback));
        },
        preventMap() {},
      },
    }};
  })();
`;

