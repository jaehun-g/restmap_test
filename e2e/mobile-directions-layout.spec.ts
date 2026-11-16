import {expect, test} from "@playwright/test";
import {installKakaoMapsMock} from "./kakao-map-mock";
import {gasStationResponse, restAreaResponse} from "./kakao-map-fixtures";

test.use({isMobile: true, hasTouch: true, deviceScaleFactor: 3});

for (const viewport of [{width: 320, height: 568}, {width: 375, height: 812}, {width: 390, height: 844}, {width: 430, height: 932}]) {
  test(`모바일 ${viewport.width}px에서 검색과 경로 카드가 화면 안에 표시된다`, async ({page, context}) => {
    await page.setViewportSize(viewport);
    await page.addInitScript({content: installKakaoMapsMock});
    await page.route("**/api/rest-areas**", route => route.fulfill({json: restAreaResponse}));
    await page.route("**/api/gas-stations**", route => route.fulfill({json: gasStationResponse}));
    await page.route("**/api/places?**", route => route.fulfill({json: {items: [{id: "destination", name: "검증 목적지", address: "서울시 목적지", category: "장소", latitude: 37.4, longitude: 127}]}}));
    await page.route("**/api/directions?**", route => route.fulfill({json: {routes: [{
      id: "route-0", label: "추천 경로", summaryRoad: "경부고속도로", distanceMeters: 120000,
      durationSeconds: 8400, tollFare: 12300, bounds: {south: 36.5, west: 127, north: 37.5, east: 127.1},
      path: [[37.5, 127], [36.5, 127.1]], trafficSegments: [],
    }]}}));
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({latitude: 37.5, longitude: 127});
    await page.goto("/mobile");
    await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.mapCreates)).toBeGreaterThan(0);
    await expect(page.locator(".sheet-summary")).toBeVisible();
    const assertInViewport = async (selector: string) => {
      const box = await page.locator(selector).first().boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-0.5);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(box!.y).toBeGreaterThanOrEqual(-0.5);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 0.5);
    };
    await assertInViewport(".mobile-header .search-box");
    await page.getByRole("searchbox").fill("검증 목적지");
    expect(await page.getByRole("searchbox").evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.getByRole("listbox", {name: "통합 검색 자동완성"}).getByRole("button", {name: /검증 목적지/}).click();
    await page.getByRole("region", {name: "검증 목적지 길찾기"}).getByRole("button", {name: "길찾기", exact: true}).click();
    await expect(page.locator(".directions-swipe-card").first()).toBeVisible();
    await assertInViewport(".directions-top-header");
    await assertInViewport(".directions-place-input");
    await assertInViewport(".directions-swipe-card");
    await assertInViewport(".directions-card-start-btn");
    expect(await page.locator(".directions-input-wrap").first().evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const input of await page.locator(".directions-place-input").all()) {
      await input.focus();
      expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    }
    const buttonUnobscured = await page.locator(".directions-card-start-btn").first().evaluate(el => {
      const box = el.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return !!top && (top === el || el.contains(top));
    });
    expect(buttonUnobscured).toBe(true);
    const keyboardHeight = viewport.height - 180;
    await page.evaluate(height => {
      const visual = window.visualViewport!;
      Object.defineProperty(visual, "height", {configurable: true, value: height});
      Object.defineProperty(visual, "offsetTop", {configurable: true, value: 0});
      visual.dispatchEvent(new Event("resize"));
    }, keyboardHeight);
    await expect.poll(async () => (await page.locator(".directions-card-start-btn").first().boundingBox())!.y).toBeLessThan(keyboardHeight);
    const keyboardButton = await page.locator(".directions-card-start-btn").first().boundingBox();
    expect(keyboardButton!.y + keyboardButton!.height).toBeLessThanOrEqual(keyboardHeight + 0.5);
    await page.evaluate(() => {
      const visual = window.visualViewport!;
      Reflect.deleteProperty(visual, "height");
      Reflect.deleteProperty(visual, "offsetTop");
      visual.dispatchEvent(new Event("resize"));
    });
    await page.getByRole("button", {name: "길찾기 닫기"}).click();
    await expect(page.locator(".sheet-summary")).toBeVisible();
  });
}

test("길찾기 오류에 맞는 안내와 출발지·목적지 변경을 제공한다", async ({page, context}) => {
  await page.setViewportSize({width: 375, height: 812});
  await page.addInitScript({content: installKakaoMapsMock});
  await page.route("**/api/rest-areas**", route => route.fulfill({json: restAreaResponse}));
  await page.route("**/api/gas-stations**", route => route.fulfill({json: gasStationResponse}));
  await page.route("**/api/places?**", route => route.fulfill({json: {items: [{id: "destination", name: "검증 목적지", address: "서울시 목적지", category: "장소", latitude: 37.4, longitude: 127}]}}));
  let error = {code: "DIRECTIONS_DESTINATION_ROAD", message: "목적지 주변에서 도로를 찾지 못했습니다."};
  await page.route("**/api/directions?**", route => route.fulfill({status: 422, json: {error}}));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.5, longitude: 127});
  await page.goto("/mobile");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.mapCreates)).toBeGreaterThan(0);
  await page.getByRole("searchbox").fill("검증 목적지");
  await page.getByRole("listbox", {name: "통합 검색 자동완성"}).getByRole("button", {name: /검증 목적지/}).click();
  await page.getByRole("region", {name: "검증 목적지 길찾기"}).getByRole("button", {name: "길찾기", exact: true}).click();
  await expect(page.getByText("목적지 주변 도로를 찾지 못했어요")).toBeVisible();
  await expect(page.getByRole("button", {name: "다시 탐색"})).toHaveCount(0);
  await page.getByRole("button", {name: "목적지 변경"}).click();
  await expect(page.getByRole("searchbox", {name: "목적지"})).toBeFocused();
  error = {code: "DIRECTIONS_ORIGIN_INCIDENT", message: "출발지 주변에 교통 장애가 있습니다."};
  await page.getByRole("searchbox", {name: "목적지"}).fill("");
  await page.getByRole("searchbox", {name: "목적지"}).fill("검증 목적지");
  await page.getByRole("listbox", {name: "장소 검색 결과"}).getByRole("button", {name: /검증 목적지/}).click();
  await expect(page.getByText("출발지 주변에 교통 장애가 있어요")).toBeVisible();
  await expect(page.getByRole("button", {name: "다시 탐색"})).toBeVisible();
  await page.getByRole("button", {name: "출발지 변경"}).click();
  await expect(page.getByRole("searchbox", {name: "출발지"})).toBeFocused();
});
