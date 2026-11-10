import {expect, test} from "@playwright/test";
import {gasStationResponse, restAreaResponse} from "./kakao-map-fixtures";
import {installKakaoMapsMock} from "./kakao-map-mock";

test("관리자 인증 후 휴게소 수정 저장, EX 주유소 읽기 전용을 확인한다", async ({page}) => {
  await page.addInitScript({content: installKakaoMapsMock});
  const areas = structuredClone(restAreaResponse);
  await page.route("**/api/rest-areas", route => route.fulfill({json: areas}));
  await page.route("**/api/gas-stations**", route => route.fulfill({json: gasStationResponse}));
  await page.route("**/api/admin/rest-area-review", route => route.fulfill({json: {items: []}}));
  await page.route("**/api/admin/session", async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.password !== "test-admin") return route.fulfill({status: 401, json: {error: {message: "인증 실패"}}});
      return route.fulfill({json: {configured: true, authenticated: true, expiresAt: Date.now() + 60_000}});
    }
    return route.fulfill({json: {configured: true, authenticated: false, expiresAt: null}});
  });

  let savedBody: Record<string, unknown> | null = null;
  await page.route("**/api/admin/rest-areas/1", async route => {
    savedBody = route.request().postDataJSON();
    const item = {...areas.items[0], name: "수정된 E2E 휴게소", revision: "c".repeat(64)};
    areas.items[0] = item;
    await route.fulfill({json: {item}});
  });

  await page.setViewportSize({width: 1440, height: 960});
  await page.goto("/admin");
  await page.getByRole("button", {name: /^휴게소 목록/}).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", {name: "E2E 휴게소 A"}).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", {name: "인증 후 수정 가능"})).toBeDisabled();
  await dialog.getByRole("button", {name: "닫기"}).click();

  await page.getByRole("button", {name: "관리자 인증"}).click();
  await page.getByLabel("관리자 암호").fill("test-admin");
  await page.getByRole("button", {name: "잠금 해제"}).click();
  await expect(page.getByRole("button", {name: "편집 잠금"})).toBeVisible();

  await page.getByRole("button", {name: /^휴게소 목록/}).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", {name: "E2E 휴게소 A"}).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", {name: "정보 수정"}).click();
  const editor = page.getByRole("heading", {name: "휴게소 정보 수정"}).locator("xpath=ancestor::form");
  await editor.getByLabel("휴게소명").fill("수정된 E2E 휴게소");
  await editor.getByRole("button", {name: "변경사항 저장"}).click();
  await expect(page.getByText("수정된 E2E 휴게소의 변경사항을 저장했습니다.")).toBeVisible();
  expect(savedBody).toMatchObject({changes: {name: "수정된 E2E 휴게소"}});

  await page.getByRole("dialog").getByRole("button", {name: "상세정보 닫기"}).click();
  await page.getByRole("button", {name: /^주유·충전소 목록/}).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", {name: "E2E 주유소"}).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", {name: "정보 수정"})).toHaveCount(0);
});
