import {expect, test} from "@playwright/test";
import {installKakaoMapsMock} from "./kakao-map-mock";
import {gasStationResponse, restAreaResponse} from "./kakao-map-fixtures";

test("서버 초기 조회 오류를 표시하고 명시적 재시도로 두 종류 데이터를 최신 조회한다", async ({page, context}) => {
  test.skip(process.env.E2E_BOOTSTRAP_FAILURE !== "1", "접속할 수 없는 테스트 DB로 실행할 때만 오류 복구를 검증합니다.");
  const freshRequests: string[] = [];
  await page.addInitScript({content: installKakaoMapsMock});
  await page.route("**/api/rest-areas", route => {
    freshRequests.push(route.request().headers()["x-map-fresh"] ?? "");
    return route.fulfill({json: restAreaResponse});
  });
  await page.route("**/api/gas-stations**", route => {
    freshRequests.push(route.request().headers()["x-map-fresh"] ?? "");
    return route.fulfill({json: gasStationResponse});
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({latitude: 37.5, longitude: 127});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/mobile");
  await page.locator(".sheet-summary").click();
  await expect(page.locator(".sheet-content [role=alert]")).toContainText("휴게소를 불러오지 못했어요");
  expect(freshRequests).toEqual([]);
  expect(await page.evaluate(() => window.__kakaoMapMock.markerCreates)).toBe(0);
  await page.getByRole("button", {name: "다시 조회", exact: true}).click();
  await expect(page.locator(".mobile-area-card")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.markerCreates)).toBe(3);
  expect(freshRequests).toEqual(["1", "1"]);
});
