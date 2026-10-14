export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

export interface KakaoBounds {
  extend(position: KakaoLatLng): void;
  getSouthWest(): KakaoLatLng;
  getNorthEast(): KakaoLatLng;
}

export interface KakaoMap {
  setCenter(position: KakaoLatLng): void;
  panTo(position: KakaoLatLng): void;
  panBy(x: number, y: number): void;
  getCenter(): KakaoLatLng;
  getBounds(): KakaoBounds;
  setLevel(level: number): void;
  getLevel(): number;
  setBounds(
    bounds: KakaoBounds,
    top?: number,
    right?: number,
    bottom?: number,
    left?: number,
  ): void;
  relayout(): void;
}

export interface KakaoMarker {
  setMap(map: KakaoMap | null): void;
  setImage(image: KakaoMarkerImage): void;
  setZIndex(index: number): void;
}

export interface KakaoMarkerImage {
  readonly image?: unknown;
}

export interface KakaoInfoWindow {
  setContent(content: HTMLElement): void;
  open(map: KakaoMap, marker: KakaoMarker): void;
  close(): void;
}

export interface KakaoOverlay {
  setContent(content: HTMLElement | string): void;
  setPosition(position: KakaoLatLng): void;
  setMap(map: KakaoMap | null): void;
}

export interface KakaoCircle {
  setMap(map: KakaoMap | null): void;
  setPosition(position: KakaoLatLng): void;
  setRadius(radius: number): void;
  getBounds(): KakaoBounds;
}

export interface KakaoPolyline {
  setMap(map: KakaoMap | null): void;
}

export interface KakaoCluster {
  getMarkers(): KakaoMarker[];
  getBounds(): KakaoBounds;
  getClusterMarker(): KakaoOverlay;
}
export interface KakaoClusterer {
  addMarkers(markers: KakaoMarker[], nodraw?: boolean): void;
  addMarker(marker: KakaoMarker, nodraw?: boolean): void;
  removeMarker(marker: KakaoMarker, nodraw?: boolean): void;
  redraw(): void;
  clear(): void;
}

export interface KakaoMaps {
  MarkerClusterer?: new (options: {
    map: KakaoMap;
    gridSize: number;
    minLevel: number;
    minClusterSize: number;
    averageCenter: boolean;
    disableClickZoom: boolean;
    styles?: Record<string, string>[];
  }) => KakaoClusterer;
  load(callback: () => void): void;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoBounds;
  Size: new (width: number, height: number) => object;
  Point: new (x: number, y: number) => object;
  MarkerImage: new (source: string, size: object, options?: { offset: object }) => KakaoMarkerImage;
  Marker: new (options: {
    map?: KakaoMap;
    position: KakaoLatLng;
    title: string;
    image: KakaoMarkerImage;
  }) => KakaoMarker;
  InfoWindow: new (options: { zIndex: number }) => KakaoInfoWindow;
  CustomOverlay: new (options: {
    content: HTMLElement | string;
    clickable: boolean;
    xAnchor: number;
    yAnchor: number;
    zIndex: number;
  }) => KakaoOverlay;
  Circle: new (options: {
    center: KakaoLatLng;
    radius: number;
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    fillColor: string;
    fillOpacity: number;
    zIndex: number;
  }) => KakaoCircle;
  Polyline: new (options: {
    map: KakaoMap;
    path: KakaoLatLng[][];
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    strokeStyle: string;
    zIndex: number;
  }) => KakaoPolyline;
  event: {
    addListener<T = never>(
      target: KakaoMarker | KakaoMap | KakaoClusterer,
      name: string,
      callback: (event: T) => void,
    ): void;
    removeListener<T = never>(
      target: KakaoMarker | KakaoMap | KakaoClusterer,
      name: string,
      callback: (event: T) => void,
    ): void;
  };
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

let loading: Promise<KakaoMaps> | null = null;

export function loadKakaoMaps(appKey: string): Promise<KakaoMaps> {
  if (window.kakao?.maps.Map && window.kakao.maps.MarkerClusterer)
    return Promise.resolve(window.kakao.maps);
  if (loading) return loading;

  loading = new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => fail(), 15_000);
    let settled = false;
    function fail() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.remove();
      reject(
        new Error(
          "카카오맵을 불러오지 못했습니다. JavaScript 키, 카카오맵 활성화, 현재 주소의 도메인 등록과 네트워크 연결을 확인해주세요.",
        ),
      );
    }
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=clusterer`;
    script.onerror = fail;
    script.onload = () => {
      if (settled) return;
      const maps = window.kakao?.maps;
      if (!maps) return fail();
      try {
        maps.load(() => {
          if (settled) return;
          if (!maps.Map) return fail();
          settled = true;
          window.clearTimeout(timer);
          resolve(maps);
        });
      } catch {
        fail();
      }
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}
