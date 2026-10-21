import {expect, test, type Page} from "@playwright/test";
import {normalizeRestAreas} from "../lib/rest-areas.ts";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";

test.skip(process.env.E2E_LIVE_KAKAO !== "1", "실제 Kakao SDK 검증은 npm run e2e:marker-visibility로 실행합니다.");

const parsedAreas = normalizeRestAreas([
  {id: 901, name: "검증A(부산)", latitude: 37.5, longitude: 127, route_name: "경부선", direction_label: "부산 방향", has_truck_lounge: true},
  {id: 902, name: "검증B(부산)", latitude: 37.5001, longitude: 127.0001, route_name: "경부선", direction_label: "부산 방향"},
  {id: 903, name: "검증C(서울)", latitude: 37.5002, longitude: 127.0002, route_name: "경부선", direction_label: "서울 방향"},
  {id: 904, name: "검증D(서울)", latitude: 37.5003, longitude: 127.0003, route_name: "경부선", direction_label: "서울 방향"},
]);
const parsedStations = normalizeExGasStations([
  {id: 901, source_key: "LIVE-A", service_area_name: "검증A(부산)주유소", latitude: 37.5, longitude: 127.00001, route_name: "경부선", direction: "부산"},
  {id: 902, source_key: "LIVE-E", service_area_name: "검증E(부산)주유소", latitude: 37.5004, longitude: 127.0004, route_name: "경부선", direction: "부산"},
]);
if (!parsedAreas.ok || !parsedStations.ok) throw new Error("Invalid visibility fixtures");
const areas = parsedAreas.value;
const stations = parsedStations.value;

// 실제 SDK의 getMap/clustered 결과로 표시 상태를 검사한다. SDK 메서드의 동작은 바꾸지 않는다.
const instrument = `
  (() => {
    const sdk = window.kakao.maps;
    const load = sdk.load;
    sdk.load = function(callback) {
      return load.call(this, () => {
        const state = window.__markerVisibility = {markers: [], clusters: [], maps: [], clusterers: []};
        for (const name of ['Map', 'Marker', 'MarkerClusterer']) {
          const Original = sdk[name];
          function Wrapped(...args) {
            const instance = new Original(...args);
            if (name === 'Marker') state.markers.push({instance, title: args[0].title});
            if (name === 'Map') state.maps.push(instance);
            if (name === 'MarkerClusterer') {
              state.clusterers.push(instance);
              sdk.event.addListener(instance, 'clustered', clusters => state.clusters.push(...clusters));
            }
            return instance;
          }
          Wrapped.prototype = Original.prototype;
          sdk[name] = Wrapped;
        }
        callback();
      });
    };
  })();
`;

async function setup(page: Page) {
  const control = {failStations: false, stationRequests: 0};
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js?**", async route => {
    const response = await route.fetch();
    await route.fulfill({response, body: `${await response.text()}\n${instrument}`});
  });
  await page.route("**/api/rest-areas", route => route.fulfill({json: {items: areas, unmappedCount: 0, fetchedAt: "visibility-test"}}));
  await page.route("**/api/gas-stations**", route => {
    control.stationRequests++;
    return control.failStations
      ? route.fulfill({status: 503, json: {error: {message: "검증용 일시적 조회 실패"}}})
      : route.fulfill({json: {items: stations, unmappedCount: 0, fetchedAt: "visibility-test"}});
  });
  await page.route("**/api/rest-areas/*/food-menus", route => route.fulfill({json: {items: [], collectedAt: null}}));
  await page.route("**/api/highway-routes**", route => route.fulfill({json: {route: {
    id: 1, routeName: "경부선", routeNumber: "1", bounds: {south: 37.49, west: 126.99, north: 37.51, east: 127.01},
    paths: [[[37.49, 126.99], [37.51, 127.01]]],
  }}}));
  return control;
}

async function visibility(page: Page) {
  return page.evaluate(() => {
    const state = (window as unknown as {__markerVisibility: {
      markers: {instance: {getMap(): unknown}; title: string}[];
      clusters: {getClusterMarker(): {getMap(): unknown} | null; getMarkers(): unknown[]}[];
    }}).__markerVisibility;
    if (!state) return {represented: [] as string[], hidden: [] as string[]};
    const clustered = new Set(state.clusters.flatMap(cluster =>
      cluster.getClusterMarker()?.getMap() ? cluster.getMarkers() : []));
    const latest = new Map(state.markers.map(item => [item.title, item]));
    return {
      represented: [...latest.values()].filter(({instance}) => instance.getMap() || clustered.has(instance)).map(item => item.title).sort(),
      hidden: [...latest.values()].filter(({instance}) => !instance.getMap() && !clustered.has(instance)).map(item => item.title).sort(),
    };
  });
}

async function level(page: Page, value: number) {
  await page.evaluate(value => {
    const state = (window as unknown as {__markerVisibility: {maps: {setLevel(level: number): void}[]}}).__markerVisibility;
    state.maps.at(-1)!.setLevel(value);
  }, value);
  await page.waitForTimeout(350);
}

async function selectedMarkerVisible(page: Page) {
  return page.evaluate(() => {
    const pin = document.querySelector('.map-canvas img[src*="marker-lounge-selected.svg"]')?.getBoundingClientRect();
    if (!pin || !pin.width || !pin.height) return false;
    const canvas = document.querySelector('.map-canvas')!.getBoundingClientRect();
    const header = document.querySelector('.mobile-header')?.getBoundingClientRect();
    const sheet = document.querySelector('.mobile-sheet')?.getBoundingClientRect();
    return pin.left >= canvas.left && pin.right <= canvas.right &&
      pin.top >= Math.max(canvas.top, header?.bottom ?? canvas.top) &&
      pin.bottom <= Math.min(canvas.bottom, sheet?.top ?? canvas.bottom) - 10;
  });
}

for (const mode of ["admin", "mobile"] as const) {
  test(`${mode}: 줌 재조회가 실패해도 범위 안 기존 마커를 유지하고 재시도한다`, async ({page, context}) => {
    await page.setViewportSize(mode === "admin" ? {width: 1440, height: 960} : {width: 390, height: 844});
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({latitude: 37.5, longitude: 127});
    const control = await setup(page);
    await page.goto(`/${mode}`);
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    if (mode === 'admin') await page.getByRole('button', {name: '내 위치로 이동'}).click();
    await expect(page.getByRole('img', {name: /내 위치 기준 반경/})).toBeVisible();
    await page.waitForTimeout(500);
    const requests = control.stationRequests;
    control.failStations = true;
    const nextLevel = await page.evaluate(() => {
      const state = (window as unknown as {__markerVisibility: {maps: {getLevel(): number}[]}}).__markerVisibility;
      return state.maps.at(-1)!.getLevel() + 1;
    });
    await level(page, nextLevel);
    await expect.poll(() => control.stationRequests).toBeGreaterThan(requests);
    await expect(page.getByText('검증용 일시적 조회 실패', {exact: true})).toBeVisible();
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    control.failStations = false;
    await page.getByRole('button', {name: '주유소 다시 조회', exact: true}).click();
    await expect(page.getByText('검증용 일시적 조회 실패', {exact: true})).toHaveCount(0);
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
  });

  test(`${mode}: 기본 목록에서 선택 후 줌과 화면 크기를 바꿔도 마커를 유지한다`, async ({page, context}, testInfo) => {
    await page.setViewportSize(mode === "admin" ? {width: 1440, height: 960} : {width: 390, height: 844});
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({latitude: 37.5, longitude: 127});
    await setup(page);
    await page.goto(`/${mode}`);
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    if (mode === 'admin') {
      await page.getByRole('button', {name: '내 위치로 이동'}).click();
      await page.locator('#rest-area-row-901').click();
    } else {
      await page.locator('.sheet-summary').click();
      await page.getByRole('button', {name: '검증A(부산) 상세정보 보기', exact: true}).click();
    }
    for (const value of [8, 4, 6, 7]) {
      await level(page, value);
      await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
      await expect.poll(() => selectedMarkerVisible(page)).toBe(true);
    }
    await page.setViewportSize(mode === 'admin' ? {width: 1280, height: 800} : {width: 430, height: 900});
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    await expect.poll(() => selectedMarkerVisible(page)).toBe(true);
    await page.screenshot({path: testInfo.outputPath(`${mode}-list-selection-zoom.png`)});
  });

  test(`${mode}: 실제 SDK에서 줌·마커 선택·해제 후 모든 장소가 표시된다`, async ({page, context}, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize(mode === "admin" ? {width: 1440, height: 960} : {width: 390, height: 844});
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({latitude: 37.5, longitude: 127});
    await setup(page);
    await page.goto(`/${mode}`);
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    for (const value of [8, 6, 4, 7, 5, 8]) {
      await level(page, value);
      await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    }
    // 실제 마커 클릭 이벤트와 React 선택 상태 갱신을 모두 거친다.
    await level(page, 4);
    await page.evaluate(() => {
      const state = (window as unknown as {__markerVisibility: {markers: {instance: unknown; title: string}[]}}).__markerVisibility;
      const marker = state.markers.findLast(item => item.title.startsWith("검증A"));
      (window.kakao!.maps.event as unknown as {trigger(target: unknown, name: string): void}).trigger(marker!.instance, "click");
    });
    for (const value of [8, 4, 7]) {
      await level(page, value);
      await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    }
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    await page.evaluate(() => {
      const state = (window as unknown as {__markerVisibility: {maps: unknown[]}}).__markerVisibility;
      const event = window.kakao!.maps.event as unknown as {trigger(target: unknown, name: string): void};
      event.trigger(state.maps.at(-1), 'click');
      event.trigger(state.maps.at(-1), 'dragstart');
      event.trigger(state.maps.at(-1), 'dragend');
      event.trigger(state.maps.at(-1), 'idle');
    });
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    await page.screenshot({path: testInfo.outputPath(`${mode}-markers.png`)});
  });

  test(`${mode}: 클러스터 목록 선택 후 줌·검색·방향 필터에서도 장소를 잃지 않는다`, async ({page, context}) => {
    test.setTimeout(60_000);
    await page.setViewportSize(mode === "admin" ? {width: 1440, height: 960} : {width: 390, height: 844});
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({latitude: 37.5, longitude: 127});
    await setup(page);
    await page.goto(`/${mode}`);
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    await level(page, 8);
    await page.locator('.place-cluster-pin').first().click();
    await page.locator('.cluster-popover-list button').filter({hasText: '검증A'}).click();
    for (const value of [7, 4, 8]) {
      await level(page, value);
      await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    }
    await page.keyboard.press('Escape');
    const search = page.locator('input[type="search"]').first();
    await search.fill('경부선');
    await search.press('Enter');
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    await search.fill('검증A 주유소');
    await search.press('Enter');
    await expect.poll(async () => (await visibility(page)).represented).toEqual(['검증A(부산) · 화물차 라운지']);
    await search.fill('없는 장소');
    await search.press('Enter');
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(0);
    await page.getByRole('button', {name: '검색어 지우기'}).click();
    await expect.poll(async () => (await visibility(page)).represented.length).toBe(5);
    if (mode === 'admin') {
      await page.getByLabel('노선 필터').selectOption({label: '경부선'});
      await page.getByLabel('방향 필터').selectOption({label: '서울 방향'});
    } else {
      await page.getByRole('button', {name: '전체 노선', exact: true}).click();
      await page.getByRole('button', {name: /^경부선/}).click();
      await page.getByRole('button', {name: '전체 방향', exact: true}).click();
      await page.getByRole('button', {name: '서울 방향', exact: true}).click();
    }
    await expect.poll(async () => (await visibility(page)).represented).toEqual(['검증C(서울)', '검증D(서울)']);
  });

  test(`${mode}: 동일 좌표 다중 마커에서 장소 선택·줌·검색 해제 후에도 그룹을 유지한다`, async ({page, context}) => {
    await page.setViewportSize(mode === 'admin' ? {width: 1440, height: 960} : {width: 390, height: 844});
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({latitude: 37.5, longitude: 127});
    await setup(page);
    await page.route('**/api/rest-areas', route => route.fulfill({json: {
      items: areas.map(area => ({...area, latitude: 37.5, longitude: 127})), unmappedCount: 0, fetchedAt: 'same-coordinate',
    }}));
    await page.route('**/api/gas-stations**', route => route.fulfill({json: {items: [], unmappedCount: 0, fetchedAt: 'same-coordinate'}}));
    await page.goto(`/${mode}`);
    await expect.poll(async () => (await visibility(page)).represented).toEqual(['이 위치의 장소 4개']);
    await page.evaluate(() => {
      const state = (window as unknown as {__markerVisibility: {markers: {instance: unknown}[]}}).__markerVisibility;
      (window.kakao!.maps.event as unknown as {trigger(target: unknown, name: string): void}).trigger(state.markers.at(-1)!.instance, 'click');
    });
    await page.locator('.cluster-popover-list button').filter({hasText: '검증B'}).click();
    for (const value of [8, 4, 7]) {
      await level(page, value);
      await expect.poll(async () => (await visibility(page)).represented).toEqual(['이 위치의 장소 4개']);
    }
    const search = page.locator('input[type="search"]').first();
    await search.fill('검증B');
    await search.press('Enter');
    await expect.poll(async () => (await visibility(page)).represented).toEqual(['검증B(부산)']);
    await page.getByRole('button', {name: '검색어 지우기'}).click();
    await expect.poll(async () => (await visibility(page)).represented).toEqual(['이 위치의 장소 4개']);
  });
}
