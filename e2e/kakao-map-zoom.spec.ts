import {expect, test, type Page} from "@playwright/test";
import {installKakaoMapsMock} from "./kakao-map-mock";
import {gasStationResponse, restAreaResponse} from "./kakao-map-fixtures";

test("휴게소 요약을 먼저 열어도 늦게 도착한 주유소 가격을 표시한다", async ({page, context}) => {
  await page.addInitScript({content: installKakaoMapsMock});
  const area = {...restAreaResponse.items[0], id: 223, name: "서하남행복드림쉼터", routeName: "수도권제1순환선", directionLabel: "판교 방향", latitude: 37.5258, longitude: 127.193};
  const station = {...gasStationResponse.items[0], siteCode: "1000|B00161|판교|S", name: "서하남(판교)주유소", routeName: "수도권제1순환선", direction: "판교", latitude: 37.525914, longitude: 127.1930451, prices: {gasoline: 1835, diesel: 1825, lpg: null}};
  let releaseStation!: () => void;
  const waitForStation = new Promise<void>(resolve => { releaseStation = resolve; });
  await page.route("**/api/rest-areas", route => route.fulfill({json: {...restAreaResponse, items: [area]}}));
  await page.route("**/api/gas-stations**", async route => {
    await waitForStation;
    await route.fulfill({json: {...gasStationResponse, items: [station]}});
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.5258, longitude: 127.193});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile", {waitUntil: "domcontentloaded"});
  try {
    await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.markerCreates)).toBeGreaterThan(0);
    await page.evaluate(() => window.__kakaoMapMock.markers[0].click());
    await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.overlayContents.at(-1))).toContain("서하남행복드림쉼터");
    releaseStation();
    await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.overlayContents.at(-1))).toContain("1,835원/L");
    await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.overlayContents.at(-1))).toContain("1,825원/L");
  } finally {
    releaseStation();
  }
});

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

test("모바일에서 연결 주유소가 한 곳이면 주유 탭에서 바로 지도 정보를 연다", async ({page, context}) => {
  const area = {...restAreaResponse.items[0], name: "E2E(부산)", routeName: "경부선", directionLabel: "부산 방향", latitude: 37.49, longitude: 127};
  const station = {...gasStationResponse.items[0], name: "E2E(부산)주유소", routeName: "경부선", direction: "부산", latitude: 37.4905, longitude: 127};
  await page.addInitScript({content: installKakaoMapsMock + `
    const markerSetMap = window.kakao.maps.Marker.prototype.setMap;
    window.kakao.maps.Marker.prototype.setMap = function(map) {
      this.__testMap = map;
      markerSetMap.call(this, map);
    };
  `});
  await page.route("**/api/rest-areas", route => route.fulfill({json: {...restAreaResponse, items: [area]}}));
  await page.route("**/api/gas-stations**", route => route.fulfill({json: {...gasStationResponse, items: [station]}}));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.49, longitude: 127});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile");
  await waitForMarkerLayerToSettle(page);
  await page.locator(".sheet-summary").click();
  await page.locator(".mobile-area-card").filter({hasText: area.name}).click();
  await page.getByRole("tab", {name: "주유", exact: true}).click();
  await expect(page.locator(".sheet-summary")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.overlayContents.at(-1))).toContain(station.name);
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.panPositions.some(([lat]) => Math.abs(lat - 37.4905) < 0.000001))).toBe(true);
  const pinnedMarker = () => page.evaluate(() => {
    const markers = window.__kakaoMapMock.markers as unknown as {options: {position: {getLat(): number}}; __testMap?: unknown}[];
    return markers.some(marker => Math.abs(marker.options.position.getLat() - 37.4905) < 0.000001 && !!marker.__testMap);
  });
  await expect.poll(pinnedMarker).toBe(true);
  await page.getByRole("button", {name: "내 위치로 이동"}).click();
  await expect.poll(pinnedMarker).toBe(false);
});

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
    await page.route("**/api/rest-areas/*/food-menus", route => route.fulfill({json: {items: [], collectedAt: null}}));
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({latitude: 37.49, longitude: 127});
    await page.setViewportSize(audience === "mobile" ? {width: 390, height: 844} : {width: 1440, height: 1000});
    await page.goto(`/${audience}`);
    await waitForMarkerLayerToSettle(page);
    if (audience === "mobile") {
      // 휴게소 보기에서도 연결 주유소 정보와 지도 이동이 유지되어야 한다.
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
    await page.getByRole("tab", {name: "시설", exact: true}).click();
    await expect(page.locator(".detail-section-heading")).toBeVisible();
    const headingPosition = async () => page.locator(".detail-section-heading").evaluate(element => {
      const heading = element.getBoundingClientRect();
      const panel = element.closest("[role=tabpanel]")!.getBoundingClientRect();
      return {x: heading.x - panel.x, y: heading.y - panel.y};
    });
    const facilityPosition = await headingPosition();
    await page.getByRole("tab", {name: "음식", exact: true}).click();
    await expect.poll(headingPosition).toEqual(facilityPosition);
    await page.getByRole("button", {name: "주유소 2곳 · 방향별 가격 확인 →"}).click();
    await expect.poll(headingPosition).toEqual(facilityPosition);
    await expect(page.locator(".detail-gas-content article")).toHaveCount(2);
    await expect(page.locator(".detail-gas-content")).toContainText("서울 방향");
    await expect(page.locator(".detail-gas-content")).toContainText("부산 방향");
    await page.locator(".detail-gas-content article").filter({hasText: "부산 방향"}).getByRole("button", {name: "지도에서 보기 →"}).click();
    await expect(page.locator(".detail-gas-content")).not.toBeVisible();
    if (audience === "mobile") {
      await expect(page.locator(".sheet-summary")).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.panPositions.some(([lat]) => Math.abs(lat - 37.491) < 0.000001))).toBe(true);
      await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.overlayContents.at(-1))).toContain("E2E(부산)주유소");
    } else {
      await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.overlayContents.at(-1))).toContain("E2E(부산)주유소");
    }
    expect(pageErrors).toEqual([]);
  });
}

for (const delayed of ["rest-areas", "gas-stations"] as const) {
test(`${delayed} 응답이 늦어도 두 종류 마커를 함께 표시하고 위치 확인에도 요청을 유지한다`, async ({page}) => {
  const queries: string[] = [];
  let releaseResponse!: () => void;
  const responseReady = new Promise<void>(resolve => { releaseResponse = resolve; });
  await page.addInitScript({content: installKakaoMapsMock + `
    Object.defineProperty(navigator, "geolocation", {value: {
      getCurrentPosition(success) {
        window.__resolveTestLocation = () => success({coords: {latitude: 37.5, longitude: 127}});
      },
    }});
  `});
  await page.route("**/api/rest-areas", async route => {
    if (delayed === "rest-areas") await responseReady;
    await route.fulfill({json: restAreaResponse});
  });
  await page.route("**/api/gas-stations**", async route => {
    queries.push(new URL(route.request().url()).search);
    if (delayed === "gas-stations") await responseReady;
    await route.fulfill({json: gasStationResponse});
  });
  await page.setViewportSize({width: 390, height: 844});
  try {
    const firstResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === `/api/${delayed === "rest-areas" ? "gas-stations" : "rest-areas"}`,
    );
    await page.goto("/mobile");
    await firstResponse;
    await expect.poll(() => queries.length).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.mapCreates)).toBe(1);
    await page.evaluate(() => (window as unknown as {__resolveTestLocation(): void}).__resolveTestLocation());
    await expect(page.locator(".sheet-summary small")).toContainText("내 위치 기준 15km");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__kakaoMapMock.markerCreates)).toBe(0);
    releaseResponse();
    await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.markerCreates)).toBe(3);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__kakaoMapMock.addCalls)).toEqual([true]);
    expect(queries).toEqual(["?source=ex"]);
  } finally {
    releaseResponse();
  }
});
}

test("지도 영역이 자동으로 목록에 반영된다", async ({page, context}) => {
  let stationRequests = 0;
  const outside = {...gasStationResponse.items[0], id: 2, siteCode: "E2E-EX-2", name: "Outside Station", latitude: 37.7, longitude: 127};
  await page.addInitScript({content: installKakaoMapsMock});
  await page.route("**/api/rest-areas", route => route.fulfill({json: restAreaResponse}));
  await page.route("**/api/gas-stations**", route => {
    stationRequests++;
    return route.fulfill({json: {...gasStationResponse, items: [...gasStationResponse.items, outside]}});
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.5, longitude: 127});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.mapCreates)).toBeGreaterThan(0);
  await expect.poll(() => stationRequests).toBe(1);
  await page.evaluate(() => window.__kakaoMapMock.map!.moveBounds(37.69, 126.99, 37.71, 127.01));
  await page.locator(".sheet-summary").click();
  await expect(page.locator(".mobile-area-card")).toHaveCount(1);
  await expect(page.locator(".mobile-area-card")).toContainText(outside.name);
  await expect(page.getByRole("button", {name: "지도 내 재검색"})).toHaveCount(0);
  expect(stationRequests).toBe(1);
});

test("검색으로 일부 장소를 제외해도 남아 있는 마커를 재생성하지 않는다", async ({page, context}) => {
  await page.addInitScript({content: installKakaoMapsMock});
  await page.route("**/api/rest-areas", route => route.fulfill({json: restAreaResponse}));
  await page.route("**/api/gas-stations**", route => route.fulfill({json: gasStationResponse}));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.5, longitude: 127});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile");
  const before = await waitForMarkerLayerToSettle(page);
  await page.getByRole("searchbox").fill("휴게소 A");
  await page.getByRole("searchbox").press("Enter");
  await page.locator(".sheet-summary").click();
  await expect(page.locator(".mobile-area-card")).toHaveCount(1);
  await expect(page.locator(".mobile-area-card")).toContainText("E2E 휴게소 A");
  expect(await page.evaluate(() => window.__kakaoMapMock.markerCreates)).toBe(before);
});

test("전국 주유소 조회 실패 후 재시도는 최신 조회하고 이후 줌은 응답을 재사용한다", async ({page, context}) => {
  let requests = 0;
  let freshRequests = 0;
  let failRequest = true;
  await page.addInitScript({content: installKakaoMapsMock});
  await page.route("**/api/rest-areas", route => route.fulfill({json: restAreaResponse}));
  await page.route("**/api/gas-stations**", route => {
    requests++;
    if (route.request().headers()["x-map-fresh"] === "1") freshRequests++;
    if (failRequest) return route.fulfill({status: 503, json: {error: {message: "테스트 조회 실패"}}});
    return route.fulfill({json: gasStationResponse});
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.5, longitude: 127});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile");
  await expect(page.getByText("테스트 조회 실패", {exact: true})).toBeVisible();
  expect(requests).toBe(1);
  failRequest = false;
  await page.getByRole("button", {name: "주유소 다시 조회", exact: true}).click();
  await expect(page.getByText("테스트 조회 실패", {exact: true})).toHaveCount(0);
  await waitForMarkerLayerToSettle(page);
  expect(requests).toBe(2);
  expect(freshRequests).toBe(1);
  const initialLevel = await page.evaluate(() => window.__kakaoMapMock.map!.getLevel());
  await page.evaluate(level => window.__kakaoMapMock.map!.setLevel(level + 1), initialLevel);
  await page.waitForTimeout(300);
  await page.evaluate(level => window.__kakaoMapMock.map!.setLevel(level), initialLevel);
  await page.waitForTimeout(300);
  expect(requests).toBe(2);
});

test("노선 선택은 서버 검색을 유지하고 전체 노선 복귀 시 전국 목록을 재사용한다", async ({page, context}) => {
  const queries: URLSearchParams[] = [];
  const area = {...restAreaResponse.items[0], routeName: "경부선"};
  const station = {...gasStationResponse.items[0], routeName: "경부선"};
  await page.addInitScript({content: installKakaoMapsMock});
  await page.route("**/api/rest-areas", route => route.fulfill({json: {...restAreaResponse, items: [area]}}));
  await page.route("**/api/gas-stations**", route => {
    queries.push(new URL(route.request().url()).searchParams);
    return route.fulfill({json: {...gasStationResponse, items: [station]}});
  });
  await page.route("**/api/highway-routes**", route => route.fulfill({status: 404, json: {error: {message: "테스트 경로 없음"}}}));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.5, longitude: 127});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile");
  await waitForMarkerLayerToSettle(page);
  await page.getByRole("button", {name: "전체 노선", exact: true}).click();
  await page.locator(".route-options button").filter({hasText: "경부선"}).click();
  await expect.poll(() => queries.length).toBe(2);
  expect([...queries[1]]).toEqual([["source", "ex"], ["routeName", "경부선"]]);
  await expect(page.locator(".mobile-filters button").filter({hasText: "경부선"})).toBeVisible();
  await expect(page.getByText(/전체 구간/)).toHaveCount(0);
  await waitForMarkerLayerToSettle(page);
  await page.evaluate(() => window.__kakaoMapMock.map!.setBoundsSilent(37.48, 126.99, 37.50, 127.01));
  await page.locator(".mobile-filters button").filter({hasText: "경부선"}).click();
  await page.locator(".route-options button").filter({hasText: "전체 노선"}).click();
  await expect(page.locator(".sheet-summary small")).toContainText("현재 지도 영역");
  await page.locator(".sheet-summary").click();
  await expect(page.locator(".mobile-area-card").filter({hasText: area.name})).toBeVisible();
  expect(queries).toHaveLength(2);
  expect([...queries[0]]).toEqual([["source", "ex"]]);
});

test("mobile rest-area details load food menus independently of the map response", async ({page, context}) => {
  await page.addInitScript({content: installKakaoMapsMock});
  await page.route("**/api/rest-areas", async route => {
    await route.fulfill({contentType: "application/json", body: JSON.stringify(restAreaResponse)});
  });
  await page.route("**/api/gas-stations**", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({items: [], unmappedCount: 0, fetchedAt: "2026-10-21T00:00:00.000Z"}),
  }));
  let releaseMenus!: () => void;
  const menuGate = new Promise<void>(resolve => { releaseMenus = resolve; });
  await page.route("**/api/rest-areas/1/food-menus", async route => {
    await menuGate;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({items: Array.from({length: 4}, (_, index) => ({
        key: `000001|${272 + index}`, name: index === 0 ? "E2E signature udon" : `E2E menu ${index}`,
        price: 9500, recommended: index === 0, best: index === 0,
        sourceUpdatedAt: "2026-10-21", collectedAt: "2026-10-21T00:00:00.000Z",
      })), collectedAt: "2026-10-21T00:00:00.000Z"}),
    });
  });
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
  const menusResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/rest-areas/1/food-menus");
  await page.getByRole("tab", {name: "음식", exact: true}).click();
  const foodSection = page.locator(".food-menu-section");
  await expect(foodSection).toHaveAttribute("aria-busy", "true");
  await expect(foodSection.getByRole("status")).toContainText("메뉴 정보를 불러오는 중입니다.");
  await expect(foodSection.locator(".food-menu-skeleton")).toHaveCount(3);
  await expect(foodSection.locator(".food-menu-skeleton").first()).toBeVisible();
  releaseMenus();
  expect((await (await menusResponse).json()).collectedAt).toBe("2026-10-21T00:00:00.000Z");
  await expect(foodSection).toHaveAttribute("aria-busy", "false");
  await expect(foodSection.locator(".food-menu-skeleton")).toHaveCount(0);
  await expect(foodSection).toBeVisible();
  await expect(foodSection).toContainText("E2E signature udon");
  await expect(foodSection).toContainText("9,500");
  await expect(foodSection).toContainText("\uCD94\uCC9C");
  await expect(foodSection).toContainText("\uC778\uAE30");
  await expect(foodSection.locator(".food-menu-heading")).toContainText("4개");
  const more = foodSection.getByRole("button", {name: "전체 메뉴 보기 (4개)"});
  await expect(more).toBeVisible();
  await more.click();
  await expect(foodSection.getByRole("button", {name: "접기"})).toHaveAttribute("aria-expanded", "true");
  await page.locator(".back-to-list").click();
  await page.locator(".mobile-area-card").filter({hasText: "B"}).first().click();
  await page.getByRole("tab", {name: "음식", exact: true}).click();
  await expect(page.locator(".food-menu-section")).toContainText("\uB4F1\uB85D\uB41C \uBA54\uB274 \uC815\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
});
