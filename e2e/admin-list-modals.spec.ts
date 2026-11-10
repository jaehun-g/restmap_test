import {expect, test} from "@playwright/test";
import {gasStationResponse, restAreaResponse} from "./kakao-map-fixtures";
import {installKakaoMapsMock} from "./kakao-map-mock";

test("관리자 목록 버튼이 각 목록 모달을 열고 닫는다", async ({page}) => {
  await page.addInitScript({content: installKakaoMapsMock});
  await page.route("**/api/rest-areas", route => route.fulfill({json: restAreaResponse}));
  await page.route("**/api/gas-stations**", route => route.fulfill({json: gasStationResponse}));
  await page.route("**/api/admin/session", route => route.fulfill({json: {
    configured: false, authenticated: false, expiresAt: null,
  }}));
  await page.setViewportSize({width: 1440, height: 960});
  await page.goto("/admin");

  const dialogs = page.getByRole("dialog");
  await expect(dialogs).toHaveCount(0);
  await page.getByRole("button", {name: /^휴게소 목록/}).click();
  await expect(dialogs).toHaveCount(1);
  await expect(dialogs).toContainText("E2E 휴게소 A");
  await dialogs.getByRole("button", {name: "닫기"}).click();
  await expect(dialogs).toHaveCount(0);

  await page.getByRole("button", {name: /^주유·충전소 목록/}).click();
  await expect(dialogs).toHaveCount(1);
  await expect(dialogs).toContainText("E2E 주유소");
  await dialogs.getByRole("button", {name: "닫기"}).click();
  await expect(dialogs).toHaveCount(0);
});
