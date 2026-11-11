import {expect, test, type Page} from "@playwright/test";
import {gasStationResponse, restAreaResponse} from "./kakao-map-fixtures";
import {installKakaoMapsMock} from "./kakao-map-mock";

function searchAreas() {
  const result = structuredClone(restAreaResponse);
  Object.assign(result.items[0], {routeName: "경부선", routeNumber: "1", latitude: 35.2, longitude: 126.3});
  Object.assign(result.items[1], {routeName: "경부선", routeNumber: "1", latitude: 38.2, longitude: 129.2});
  return result;
}

async function mockMapData(page: Page) {
  await page.addInitScript({content: installKakaoMapsMock});
  await page.route("**/api/rest-areas", route => route.fulfill({json: searchAreas()}));
  await page.route("**/api/gas-stations**", route => route.fulfill({json: gasStationResponse}));
}

for (const audience of ["mobile", "admin"] as const) test(`${audience} 지도에서 위성 보기를 전환하고 내 위치는 아이콘으로 표시한다`, async ({page}) => {
  await mockMapData(page);
  await page.route("**/api/admin/session", route => route.fulfill({json: {configured: false, authenticated: false, expiresAt: null}}));
  await page.setViewportSize(audience === "mobile" ? {width: 390, height: 844} : {width: 1440, height: 960});
  await page.goto(`/${audience}`, {waitUntil: "domcontentloaded"});
  const satellite = page.getByRole("button", {name: "위성 보기"});
  const location = page.getByRole("button", {name: "내 위치로 이동"});
  await expect(satellite).toBeVisible();
  await expect(location).toBeVisible();
  await expect(location).toHaveText("");
  await satellite.click();
  await expect(satellite).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.map?.getMapTypeId())).toBe(3);
  await satellite.click();
  await expect(satellite).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.map?.getMapTypeId())).toBe(1);
});

test("모바일 상세 시트는 요약으로 열리고 탭 또는 위로 스와이프하면 확장된다", async ({page}) => {
  await mockMapData(page);
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile", {waitUntil: "domcontentloaded"});
  await page.locator(".sheet-summary").click();
  await page.locator(".mobile-area-card").first().click();
  const sheet = page.locator(".mobile-sheet");
  await expect(sheet).toHaveClass(/is-detail-preview/);
  const headerActions = sheet.locator(".back-to-list").locator("..");
  await expect(headerActions.getByRole("button", {name: "상세정보 닫기"})).toBeVisible();
  await expect(page.getByRole("tab", {name: "시설"})).toBeVisible();
  await expect(page.locator("#detail-tabpanel")).toBeHidden();
  await page.getByRole("tab", {name: "시설"}).click();
  await expect(sheet).toHaveClass(/is-detail-full/);
  await expect(page.locator("#detail-tabpanel")).toBeVisible();
  await page.getByRole("button", {name: "상세정보 닫기"}).click();
  await page.locator(".sheet-summary").click();
  await page.locator(".mobile-area-card").first().click();
  await expect(sheet).toHaveClass(/is-detail-preview/);
  await sheet.dispatchEvent("touchstart", {touches: [{identifier: 1, clientX: 100, clientY: 600}]});
  await sheet.dispatchEvent("touchend", {changedTouches: [{identifier: 1, clientX: 100, clientY: 500}]});
  await expect(sheet).toHaveClass(/is-detail-full/);
  await sheet.dispatchEvent("touchstart", {touches: [{identifier: 1, clientX: 100, clientY: 300}]});
  await sheet.dispatchEvent("touchend", {changedTouches: [{identifier: 1, clientX: 100, clientY: 400}]});
  await expect(sheet).toHaveClass(/is-detail-preview/);
  await expect(page.locator("#detail-tabpanel")).toBeHidden();
  await sheet.dispatchEvent("touchstart", {touches: [{identifier: 1, clientX: 100, clientY: 300}]});
  await sheet.dispatchEvent("touchend", {changedTouches: [{identifier: 1, clientX: 100, clientY: 400}]});
  await expect(page.locator(".sheet-summary")).toBeVisible();
});

test("모바일 장소 보기와 필터가 한 줄에서 가로 스크롤로 동작한다", async ({page}) => {
  await mockMapData(page);
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile");
  const row = page.locator(".mobile-filters");
  const stationToggle = row.getByRole("button", {name: "주유소만 보기"});
  const route = row.getByRole("button", {name: "전체 노선", exact: true});
  const lounge = row.getByRole("button", {name: /라운지 OFF/});
  await expect(route).toBeEnabled();
  const geometry = await row.evaluate(element => {
    const route = element.querySelectorAll(".filter-chip")[0].getBoundingClientRect();
    const toggle = element.querySelectorAll(".filter-chip")[2].getBoundingClientRect();
    return {overflow: element.scrollWidth > element.clientWidth, sameRow: toggle.top < route.bottom && route.top < toggle.bottom};
  });
  expect(geometry).toEqual({overflow: true, sameRow: true});
  await lounge.scrollIntoViewIfNeeded();
  await expect.poll(() => row.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await lounge.click();
  await expect(row.getByRole("button", {name: /라운지 ON/})).toHaveAttribute("aria-pressed", "true");
  await stationToggle.click();
  await expect(stationToggle).toHaveAttribute("aria-pressed", "true");
  await expect(row.getByRole("button", {name: /라운지/})).toBeDisabled();
  await stationToggle.click();
  await expect(stationToggle).toHaveAttribute("aria-pressed", "false");
});

test("관리자 검색은 현재 검색 결과 전체로 지도를 맞춘다", async ({page}) => {
  await mockMapData(page);
  await page.route("**/api/admin/session", route => route.fulfill({json: {configured: false, authenticated: false, expiresAt: null}}));
  await page.setViewportSize({width: 1440, height: 960});
  await page.goto("/admin");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.markerCreates)).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.__kakaoMapMock.boundsFits.length + window.__kakaoMapMock.centerFits.length);
  const search = page.getByRole("searchbox", {name: "휴게소명·노선명·주유소명·주소 검색"});
  await search.fill("E2E 휴게소");
  await search.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.boundsFits.length + window.__kakaoMapMock.centerFits.length)).toBeGreaterThan(before);
  const lastBounds = await page.evaluate(() => window.__kakaoMapMock.boundsFits.at(-1)?.sort((a, b) => a[0] - b[0]));
  expect(lastBounds).toEqual([[35.2, 126.3], [38.2, 129.2]]);
});

test("모바일은 선택 노선과 내 위치 범위를 건너뛰고 검색 결과 전체를 맞춘다", async ({page, context}) => {
  await mockMapData(page);
  await page.route("**/api/highway-routes**", route => route.fulfill({json: {route: {
    id: 1, routeName: "경부선", routeNumber: "1",
    bounds: {south: 35, west: 126, north: 39, east: 130},
    paths: [[[35, 126], [39, 130]]],
  }}}));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.5, longitude: 127});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile");
  await expect(page.locator(".sheet-summary small")).toContainText("반경 15km");
  await page.locator(".mobile-filters button").filter({hasText: "전체 노선"}).click();
  await page.locator(".route-options button").filter({hasText: "경부선"}).click();
  await expect(page.locator(".map-scope-label")).toContainText("경부선");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.activeClusterers)).toBe(1);
  const before = await page.evaluate(() => window.__kakaoMapMock.boundsFits.length + window.__kakaoMapMock.centerFits.length);
  const search = page.getByRole("searchbox", {name: "휴게소명·노선명·주유소명·주소 검색"});
  await search.fill("E2E 휴게소");
  await search.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.boundsFits.length + window.__kakaoMapMock.centerFits.length)).toBeGreaterThan(before);
  const lastBounds = await page.evaluate(() => window.__kakaoMapMock.boundsFits.at(-1)?.sort((a, b) => a[0] - b[0]));
  expect(lastBounds).toEqual([[35.2, 126.3], [38.2, 129.2]]);
});
