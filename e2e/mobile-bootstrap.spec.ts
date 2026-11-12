import {expect, test} from "@playwright/test";
import {installKakaoMapsMock} from "./kakao-map-mock";

test("서버 초기 데이터로 두 종류 마커를 표시하고 최초 API 중복 조회를 생략한다", async ({page, context}) => {
  test.skip(process.env.E2E_READONLY_DB !== "1", "실제 DB 읽기를 명시한 경우에만 서버 초기 데이터를 검증합니다.");
  const errors: string[] = [];
  const clientQueries: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/rest-areas" || path === "/api/gas-stations") clientQueries.push(path);
  });
  await page.addInitScript({content: installKakaoMapsMock});
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.5, longitude: 127});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.markerCreates)).toBeGreaterThan(0);
  await expect(page.locator(".sheet-summary small")).toContainText("반경 15km");
  await page.locator(".sheet-summary").click();
  await expect(page.locator(".mobile-area-card")).not.toHaveCount(0);
  await page.waitForTimeout(300);
  expect(clientQueries).toEqual([]);
  const titles = await page.evaluate(() => window.__kakaoMapMock.markers.map(marker =>
    (marker as unknown as {options: {title: string}}).options.title));
  expect(titles.some(title => title.includes("주유소"))).toBe(true);
  expect(titles.some(title => !title.includes("주유소"))).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", {name: "전체 노선", exact: true}).click();
  const routeResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/gas-stations");
  await page.locator(".route-options button").filter({hasText: "경부선"}).click();
  await expect.poll(() => clientQueries.length).toBe(1);
  await expect(page.locator(".mobile-filters button").filter({hasText: "경부선"})).toBeVisible();
  expect((await routeResponse).ok()).toBe(true);
  await page.locator(".mobile-filters button").filter({hasText: "경부선"}).click();
  await page.locator(".route-options button").filter({hasText: "전체 노선"}).click();
  await expect(page.locator(".sheet-summary small")).toContainText("반경 15km");
  await page.waitForTimeout(300);
  expect(clientQueries).toEqual(["/api/gas-stations"]);
  expect(errors).toEqual([]);
});

test("초기 마커 표시 후 선택한 휴게소의 상세 정보만 조회한다", async ({page, context}) => {
  test.skip(process.env.E2E_READONLY_DB !== "1", "실제 DB 읽기를 명시한 경우에만 검증합니다.");
  const details: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/api/map-detail") details.push(url.searchParams.get("kind") ?? "");
  });
  await page.addInitScript({content: installKakaoMapsMock});
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.5, longitude: 127});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile");
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.markerCreates)).toBeGreaterThan(0);
  expect(details).toEqual([]);
  await page.locator(".sheet-summary").click();
  await page.locator(".mobile-area-card[aria-label$='상세정보 보기']").first().click();
  await expect(page.getByRole("heading", {name: /.+/}).first()).toBeVisible();
  await expect.poll(() => details.length).toBeGreaterThan(0);
  await expect(page.getByText("상세 정보를 불러오고 있어요")).toHaveCount(0);
  await expect(page.getByText("상세 정보를 불러오지 못했습니다.")).toHaveCount(0);
});
