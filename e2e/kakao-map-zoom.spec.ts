import {expect, test, type Page} from "@playwright/test";
import type {FoodMenuSummary} from "../lib/food-menus.ts";

type KakaoMapMockMetrics = {
  map: {getLevel(): number; setLevel(level: number): void} | null;
  mapCreates: number;
  markerCreates: number;
  clusterers: number;
  markers: Array<{click(): void}>;
  overlayContents: string[];
  addCalls: boolean[];
  redraws: number;
};

declare global {
  interface Window {
    __kakaoMapMock: KakaoMapMockMetrics;
  }
}

async function waitForMarkerLayerToSettle(page: Page): Promise<number> {
  let previous = -1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const current = await page.evaluate(() => window.__kakaoMapMock.markerCreates);
    if (current > 0 && current === previous) return current;
    previous = current;
    await page.waitForTimeout(300);
  }
  throw new Error("마커 레이어가 데이터 조회 완료 후 안정화되지 않았습니다.");
}

const installKakaoMapsMock = `
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
        this.bounds = new LatLngBounds();
        this.bounds.extend(new LatLng(35, 126));
        this.bounds.extend(new LatLng(38, 128));
        window.__kakaoMapMock.map = this;
        window.__kakaoMapMock.mapCreates++;
      }
      setCenter(center) { this.center = center; }
      panTo(center) { this.center = center; }
      panBy() {}
      getCenter() { return this.center; }
      getBounds() { return this.bounds; }
      setLevel(level) { this.level = level; emit(this, "zoom_changed"); emit(this, "idle"); }
      getLevel() { return this.level; }
      setBounds(bounds) { this.bounds = bounds; emit(this, "idle"); }
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
    window.__kakaoMapMock = {map: null, mapCreates: 0, markerCreates: 0, clusterers: 0, markers: [], overlayContents: [], addCalls: [], redraws: 0};
    window.kakao = {maps: {
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

const gasStationResponse = {
  items: [
    {
      id: 1,
      siteCode: "E2E-EX-1",
      brand: "EX",
      name: "E2E 주유소",
      latitude: 37.5,
      longitude: 127,
      phone: null,
      address: null,
      detailAddress: null,
      openTime: null,
      closeTime: null,
      services: {cargo: null, convenience: null, self: null, lpg: null, carWash: null, ev: null},
      routeName: null,
      direction: null,
      revision: "e".repeat(64),
    },
  ],
  unmappedCount: 0,
  fetchedAt: "2026-10-21T00:00:00.000Z",
};

for (const audience of ["mobile", "admin"] as const) {
  test(`${audience} 양방향 휴게소의 유가 범위와 방향별 주유소 지도 이동`, async ({page, context}) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", error => pageErrors.push(error));
    await page.addInitScript({content: installKakaoMapsMock + `
      window.__testCards = [];
      const BaseOverlay = window.kakao.maps.CustomOverlay;
      window.kakao.maps.CustomOverlay = class extends BaseOverlay {
        setContent(content) {
          super.setContent(content);
          if (content instanceof HTMLElement) window.__testCards.push(content);
        }
      };
    `});
    const area = {...restAreaResponse.items[0], name: "E2E(양방향)", routeName: "경부선", directionLabel: "양방향", routeDirection: "양방향"};
    const stations = ["서울", "부산"].map((direction, index) => ({
      ...gasStationResponse.items[0], id: index + 1, siteCode: `direction-${index}`,
      name: `E2E(${direction})주유소`, direction, routeName: "경부선",
      latitude: 37.4905 + index * 0.0005,
      prices: {gasoline: 1650 + index * 30, diesel: 1520 + index * 20, lpg: null},
      priceUpdatedAt: "2026-10-22T00:00:00Z",
    }));
    await page.route("**/api/rest-areas", route => route.fulfill({json: {...restAreaResponse, items: [area]}}));
    await page.route("**/api/gas-stations**", route => route.fulfill({json: {...gasStationResponse, items: stations}}));
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({latitude: 37.49, longitude: 127});
    await page.setViewportSize(audience === "mobile" ? {width: 390, height: 844} : {width: 1440, height: 1000});
    await page.goto(`/${audience}`);
    await waitForMarkerLayerToSettle(page);
    if (audience === "mobile") {
      // 휴게소 보기에서도 연결 주유소 정보와 지도 이동이 유지되어야 한다.
      await page.getByRole("button", {name: "휴게소", exact: true}).click();
      await page.locator(".sheet-summary").click();
      await page.locator(".mobile-area-card").filter({hasText: area.name}).click();
    } else {
      await page.locator("#area-row-1, #rest-area-row-1, tr").filter({hasText: area.name}).last().click();
      await page.evaluate(() => {
        const cards = (window as unknown as {__testCards: HTMLElement[]}).__testCards;
        const card = cards.findLast(card => card.getAttribute("aria-label") === "E2E(양방향) 요약");
        if (!card?.textContent?.includes("1,650~1,680원/L")) throw new Error("유가 범위 요약 누락");
        card.querySelector<HTMLButtonElement>(".map-card-details")!.click();
      });
    }
    await expect(page.locator(".detail-overview-prices")).toContainText("1,650~1,680원/L");
    await expect(page.locator(".detail-overview-prices")).toContainText("1,520~1,540원/L");
    await page.getByRole("button", {name: "주유소 2곳 · 방향별 가격 확인 →"}).click();
    await expect(page.locator(".detail-gas-content article")).toHaveCount(2);
    await expect(page.locator(".detail-gas-content")).toContainText("서울 방향");
    await expect(page.locator(".detail-gas-content")).toContainText("부산 방향");
    await page.locator(".detail-gas-content article").filter({hasText: "부산 방향"}).getByRole("button", {name: "지도에서 보기 →"}).click();
    await expect(page.locator(".detail-gas-content")).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.overlayContents.at(-1))).toContain("E2E(부산)주유소");
    expect(pageErrors).toEqual([]);
  });
}

const restAreaResponse = {
  items: [
    {
      id: 1,
      name: "E2E 휴게소 A",
      latitude: 37.49,
      longitude: 127,
      phone: null,
      routeName: null,
      routeNumber: null,
      routeDirection: null,
      directionLabel: null,
      restAreaType: null,
      parkingCount: null,
      facilities: {
        has_truck_lounge: false,
        has_gas_station: null,
        has_lpg_station: null,
        has_ev_charger: null,
        has_repair_shop: null,
        has_car_wash: null,
        has_shower: null,
        has_sleeping_room: null,
        has_laundry: null,
        has_restaurant: null,
        has_store: null,
        has_restroom: null,
      },
      revision: "a".repeat(64),
    },
    {
      id: 2,
      name: "E2E 휴게소 B",
      latitude: 37.51,
      longitude: 127,
      phone: null,
      routeName: null,
      routeNumber: null,
      routeDirection: null,
      directionLabel: null,
      restAreaType: null,
      parkingCount: null,
      facilities: {
        has_truck_lounge: false,
        has_gas_station: null,
        has_lpg_station: null,
        has_ev_charger: null,
        has_repair_shop: null,
        has_car_wash: null,
        has_shower: null,
        has_sleeping_room: null,
        has_laundry: null,
        has_restaurant: null,
        has_store: null,
        has_restroom: null,
      },
      revision: "b".repeat(64),
    },
  ],
  unmappedCount: 0,
  fetchedAt: "2026-10-21T00:00:00.000Z",
};

test("지도 레벨 변경 중 EX 재조회는 기존 마커를 유지하고 클러스터를 일괄 렌더링한다", async ({page, context}) => {
  const pageErrors: Error[] = [];
  let stationRequests = 0;
  let delayScopeRefresh = false;
  page.on("pageerror", error => pageErrors.push(error));
  await page.addInitScript({content: installKakaoMapsMock});
  await page.route("**/api/rest-areas", async route => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(restAreaResponse),
    });
  });
  await page.route("**/api/gas-stations**", async route => {
    stationRequests++;
    if (delayScopeRefresh) await new Promise(resolve => setTimeout(resolve, 1_000));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(gasStationResponse),
    });
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.5, longitude: 127});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile");

  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.mapCreates)).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.markerCreates)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.clusterers)).toBeGreaterThan(0);

  await page.waitForTimeout(1_200);
  const before = await waitForMarkerLayerToSettle(page);
  const initial = await page.evaluate(() => window.__kakaoMapMock);
  expect(initial.addCalls).toEqual(expect.arrayContaining([true]));
  expect(initial.redraws).toBeGreaterThanOrEqual(initial.addCalls.length);
  await expect.poll(() => stationRequests).toBeGreaterThan(0);
  const requestsBeforeZoom = stationRequests;
  delayScopeRefresh = true;

  await page.evaluate(() => {
    const map = window.__kakaoMapMock.map;
    if (!map) throw new Error("Kakao map mock was not initialized");
    map.setLevel(map.getLevel() + 1);
  });
  await expect.poll(() => stationRequests).toBeGreaterThan(requestsBeforeZoom);
  await page.waitForTimeout(300);

  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.markerCreates)).toBe(before);
});

test("mobile rest-area details show the linked food menu and its source date", async ({page, context}) => {
  await page.addInitScript({content: installKakaoMapsMock});
  await page.route("**/api/rest-areas", async route => {
    const areas = structuredClone(restAreaResponse);
    const area = structuredClone(areas.items[0]) as typeof areas.items[number] & {foodMenuSummary?: FoodMenuSummary};
    areas.items[0] = area;
    area.foodMenuSummary = {
      count: 1,
      collectedAt: "2026-10-21T00:00:00.000Z",
      featured: [{key: "000001|272", name: "E2E signature udon", price: 9500, recommended: true, best: true}],
    };
    await route.fulfill({contentType: "application/json", body: JSON.stringify(areas)});
  });
  await page.route("**/api/gas-stations**", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({items: [], unmappedCount: 0, fetchedAt: "2026-10-21T00:00:00.000Z"}),
  }));
  await page.route("**/api/rest-areas/1/food-menus", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({items: [{
      key: "000001|272", name: "E2E signature udon", price: 9500,
      recommended: true, best: true, sourceUpdatedAt: "2026-10-21", collectedAt: "2026-10-21T00:00:00.000Z",
    }], collectedAt: "2026-10-21T00:00:00.000Z"}),
  }));
  await page.route("**/api/rest-areas/2/food-menus", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({items: [], collectedAt: null}),
  }));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.49, longitude: 127});
  await page.setViewportSize({width: 390, height: 844});
  const areasResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/rest-areas");
  await page.goto("/mobile");
  expect((await (await areasResponse).json()).items).toHaveLength(2);
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.markers.length)).toBeGreaterThan(0);
  await page.evaluate(() => window.__kakaoMapMock.markers[0].click());
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.overlayContents.length)).toBeGreaterThan(0);
  const mapCardText = await page.evaluate(() => window.__kakaoMapMock.overlayContents.at(-1) ?? "");
  expect(mapCardText).not.toContain("E2E signature udon");
  expect(mapCardText).not.toContain("9,500");
  await page.locator(".sheet-summary").click();
  const restArea = page.locator(".mobile-area-card").filter({hasText: "E2E"}).first();
  await expect(restArea).toBeVisible();
  await restArea.click();
  const foodSection = page.locator(".food-menu-section");
  await expect(foodSection).toBeVisible();
  await expect(foodSection).toContainText("E2E signature udon");
  await expect(foodSection).toContainText("9,500");
  await expect(foodSection).toContainText("\uCD94\uCC9C");
  await expect(foodSection).toContainText("\uC778\uAE30");
  await expect(foodSection).toContainText("2026-10-21");
  await page.locator(".back-to-list").click();
  await page.locator(".mobile-area-card").filter({hasText: "B"}).first().click();
  await expect(page.locator(".food-menu-section")).toContainText("\uB4F1\uB85D\uB41C \uBA54\uB274 \uC815\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
});
