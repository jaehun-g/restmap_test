import {expect, test, type Page} from "@playwright/test";
import {gasStationResponse, restAreaResponse} from "./kakao-map-fixtures";
import {installKakaoMapsMock} from "./kakao-map-mock";

async function setup(page: Page, mode: "success" | "denied" | "delayed") {
  await page.addInitScript({content: installKakaoMapsMock});
  await page.addInitScript(mode => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(success: PositionCallback, failure: PositionErrorCallback) {
          if (mode !== "denied")
            setTimeout(
              () => success({coords: {latitude: 37.5, longitude: 127}} as GeolocationPosition),
              mode === "delayed" ? 5000 : 100,
            );
          else setTimeout(() => failure({code: 1} as GeolocationPositionError), 100);
        },
      },
    });
  }, mode);
  const areas = {
    ...structuredClone(restAreaResponse),
    items: restAreaResponse.items.map((area, index) => ({
      ...area,
      routeName: index === 0 ? "경부선" : "남해선",
    })),
  };
  await page.route("**/api/rest-areas", route => route.fulfill({json: areas}));
  await page.route("**/api/gas-stations**", route => route.fulfill({json: gasStationResponse}));
  await page.route("**/api/highway-routes?**", route => {
    const routeName = new URL(route.request().url()).searchParams.get("routeName");
    return route.fulfill({
      json: {
        route: {
          id: 1,
          routeName,
          routeNumber: "1",
          bounds: {south: 37.4, west: 126.9, north: 37.6, east: 127.1},
          paths: [
            [
              [37.4, 126.9],
              [37.6, 127.1],
            ],
          ],
        },
      },
    });
  });
  await page.setViewportSize({width: 390, height: 844});
}

test("지도 준비 전에도 모바일 마커 색상 안내가 표시된다", async ({page}) => {
  await setup(page, "delayed");
  await page.goto("/mobile");
  const legend = page.locator(".map-legend");
  await expect(legend).toBeVisible();
  expect(await page.evaluate(() => window.__kakaoMapMock.mapCreates)).toBe(0);
  await expect(legend).toContainText("화물차 라운지");
  await expect(legend).not.toContainText("일반");
  await expect(legend).not.toContainText("고속도로 주유소");
  await expect(legend).not.toContainText("휴게소+주유소");
});

test("위치가 확인되면 가까운 노선과 휴게소 및 선을 표시한다", async ({page}) => {
  await setup(page, "success");
  let received: unknown;
  await page.route("**/api/highway-routes/nearest", async route => {
    received = route.request().postDataJSON();
    await route.fulfill({json: {routeName: "경부선"}});
  });
  await page.goto("/mobile");
  await expect(page.locator(".mobile-filters button").first()).toContainText("경부선");
  expect(received).toEqual({latitude: 37.5, longitude: 127});
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__kakaoMapMock.overlayEvents.filter(event => event === "line").length,
      ),
    )
    .toBe(2);
  expect(await page.evaluate(() => window.__kakaoMapMock.boundsFits)).toHaveLength(0);
  await page.locator(".sheet-summary").click();
  await expect(page.locator(".mobile-area-card").filter({hasText: "E2E 휴게소 A"})).toBeVisible();
  await expect(page.locator(".mobile-area-card").filter({hasText: "E2E 휴게소 B"})).toHaveCount(0);
});

test("초기 노선 조회가 지연되어도 반경 원과 전체 마커를 먼저 그리지 않는다", async ({page}) => {
  await setup(page, "success");
  let release!: () => void;
  let requested = false;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/highway-routes/nearest", async route => {
    requested = true;
    await pending;
    await route.fulfill({json: {routeName: "경부선"}});
  });
  await page.goto("/mobile");
  await expect.poll(() => requested).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.mapCreates)).toBe(1);
  const before = await page.evaluate(() => window.__kakaoMapMock.overlayEvents);
  expect(before).not.toContain("circle-attach");
  expect(before).not.toContain("markers");
  release();
  await expect(page.locator(".mobile-filters button").first()).toContainText("경부선");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.overlayEvents.filter(event => event === "line").length)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.overlayEvents.includes("markers"))).toBe(true);
  expect(await page.evaluate(() => window.__kakaoMapMock.overlayEvents)).not.toContain("circle-attach");
});

test("초기 결과가 준비될 때까지 전체 장소 수를 표시하지 않는다", async ({page}) => {
  await setup(page, "success");
  await page.addInitScript(() => {
    const state = window as unknown as {__summaryTexts: string[]};
    state.__summaryTexts = [];
    document.addEventListener("DOMContentLoaded", () => {
      const record = () => {
        const text = document.querySelector(".sheet-summary strong")?.textContent;
        if (text) state.__summaryTexts.push(text);
      };
      new MutationObserver(record).observe(document.body, {subtree: true, childList: true, characterData: true});
      record();
    });
  });
  let releaseRoute!: () => void;
  let releaseStations!: () => void;
  let nearestRequested = false;
  let stationsRequested = false;
  const routePending = new Promise<void>(resolve => { releaseRoute = resolve; });
  const stationsPending = new Promise<void>(resolve => { releaseStations = resolve; });
  await page.route("**/api/highway-routes/nearest", async route => {
    nearestRequested = true;
    await routePending;
    await route.fulfill({json: {routeName: "경부선"}});
  });
  await page.route("**/api/gas-stations**", async route => {
    if (new URL(route.request().url()).searchParams.has("routeName")) {
      stationsRequested = true;
      await stationsPending;
      await route.fulfill({json: {...gasStationResponse, items: []}});
      return;
    }
    await route.fulfill({json: gasStationResponse});
  });
  await page.goto("/mobile");
  await expect.poll(() => nearestRequested).toBe(true);
  await expect(page.locator(".sheet-summary strong")).toHaveText("주변 장소를 찾고 있어요");
  await expect(page.locator(".sheet-summary small")).toHaveCount(0);
  releaseRoute();
  await expect.poll(() => stationsRequested).toBe(true);
  await expect(page.locator(".sheet-summary strong")).toHaveText("주변 장소를 찾고 있어요");
  releaseStations();
  await expect(page.locator(".sheet-summary strong")).toHaveText("휴게소·주유소 1곳");
  await expect(page.locator(".sheet-summary small")).toHaveCount(0);
  const texts = await page.evaluate(() => (window as unknown as {__summaryTexts: string[]}).__summaryTexts);
  expect(texts).not.toContain("휴게소를 찾고 있어요");
  expect([...new Set(texts.filter(text => /\d+곳/.test(text)))]).toEqual(["휴게소·주유소 1곳"]);
});

test("위치 권한을 거부하면 기존 전체 노선 상태를 유지한다", async ({page}) => {
  await setup(page, "denied");
  let requested = false;
  await page.route("**/api/highway-routes/nearest", route => {
    requested = true;
    return route.fulfill({json: {routeName: "경부선"}});
  });
  await page.goto("/mobile");
  await expect(page.getByText("위치 권한이 꺼져 있어요", {exact: false})).toBeVisible();
  await expect(page.locator(".mobile-filters button").first()).toContainText("전체 노선");
  expect(requested).toBe(false);
});

test("가까운 노선 조회가 실패하면 기존 전체 노선 상태를 유지한다", async ({page}) => {
  await setup(page, "success");
  await page.route("**/api/highway-routes/nearest", route =>
    route.fulfill({status: 503, json: {error: {message: "조회 실패"}}}),
  );
  const response = page.waitForResponse(response =>
    response.url().endsWith("/api/highway-routes/nearest"),
  );
  await page.goto("/mobile");
  expect((await response).status()).toBe(503);
  await expect(page.locator(".mobile-filters button").first()).toContainText("전체 노선");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.overlayEvents.includes("circle-attach"))).toBe(true);
});

test("늦게 도착한 자동 선택은 사용자가 선택한 노선을 바꾸지 않는다", async ({page}) => {
  await setup(page, "success");
  let release!: () => void;
  let requested = false;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/highway-routes/nearest", async route => {
    requested = true;
    await pending;
    await route.fulfill({json: {routeName: "경부선"}});
  });
  await page.goto("/mobile");
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", {name: "전체 노선", exact: true}).click();
  await page.locator(".route-options button").filter({hasText: "남해선"}).click();
  release();
  await expect(page.locator(".mobile-filters button").first()).toContainText("남해선");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__kakaoMapMock.overlayEvents.filter(event => event === "line").length,
      ),
    )
    .toBe(2);
  await expect(page.locator(".mobile-filters button").first()).toContainText("남해선");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.boundsFits.length)).toBeGreaterThan(0);
});
