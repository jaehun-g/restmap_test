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
  const before = await page.evaluate(() => window.__kakaoMapMock.boundsFits.length + window.__kakaoMapMock.centerFits.length);
  const search = page.getByRole("searchbox", {name: "휴게소명·노선명·주유소명·주소 검색"});
  await search.fill("E2E 휴게소");
  await search.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.boundsFits.length + window.__kakaoMapMock.centerFits.length)).toBeGreaterThan(before);
  const lastBounds = await page.evaluate(() => window.__kakaoMapMock.boundsFits.at(-1)?.sort((a, b) => a[0] - b[0]));
  expect(lastBounds).toEqual([[35.2, 126.3], [38.2, 129.2]]);
});
