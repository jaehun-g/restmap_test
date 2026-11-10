import {expect, test} from "@playwright/test";
import {gasStationResponse, restAreaResponse} from "./kakao-map-fixtures";
import {installKakaoMapsMock} from "./kakao-map-mock";

test("관리자 목록 버튼이 각 목록 모달을 열고 닫는다", async ({page}) => {
  await page.addInitScript({content: installKakaoMapsMock});
  const allAreas = structuredClone(restAreaResponse);
  for (let id = 3; id <= 58; id++)
    allAreas.items.push({...allAreas.items[1], id, name: `E2E 휴게소 ${id}`});
  await page.route("**/api/rest-areas", route => route.fulfill({json: allAreas}));
  const allStations = structuredClone(gasStationResponse);
  allStations.items.push({...allStations.items[0], id: 2, siteCode: "E2E-EX-2", name: "E2E 전체목록 주유소"});
  for (let id = 3; id <= 58; id++)
    allStations.items.push({...allStations.items[0], id, siteCode: `E2E-EX-${id}`, name: `E2E 주유소 ${id}`});
  const stationRequests: string[] = [];
  await page.route("**/api/gas-stations**", route => {
    const url = new URL(route.request().url());
    stationRequests.push(url.searchParams.get("source") ?? "all");
    return route.fulfill({json: url.searchParams.toString() === "source=ex" ? allStations : gasStationResponse});
  });
  await page.route("**/api/admin/session", route => route.fulfill({json: {
    configured: false, authenticated: false, expiresAt: null,
  }}));
  await page.setViewportSize({width: 1440, height: 960});
  await page.goto("/admin");

  const dialogs = page.getByRole("dialog");
  await expect(dialogs).toHaveCount(0);
  const mapSearch = page.getByRole("searchbox", {name: "휴게소명·노선명·주유소명·주소 검색"});
  await mapSearch.fill("E2E 휴게소 A");
  await mapSearch.press("Enter");
  await page.getByRole("button", {name: /^휴게소 목록/}).click();
  await expect(dialogs).toHaveCount(1);
  await expect(dialogs).toContainText("휴게소 목록 58");
  const restSearch = dialogs.getByRole("searchbox", {name: "휴게소 목록 검색"});
  await restSearch.pressSequentially("E2E", {delay: 30});
  await expect(restSearch).toHaveValue("E2E");
  await expect(restSearch).toBeFocused();
  await restSearch.fill("");
  const restCells = dialogs.locator("tbody tr").first().locator("td");
  const restBefore = await restCells.evaluateAll(cells => cells.map(cell => ({text: cell.textContent, x: cell.getBoundingClientRect().x, y: cell.getBoundingClientRect().y, width: cell.getBoundingClientRect().width, height: cell.getBoundingClientRect().height})));
  await dialogs.getByRole("button", {name: "전체 컬럼 보기"}).click();
  const restAfter = await restCells.evaluateAll(cells => cells.slice(0, 9).map(cell => ({text: cell.textContent, x: cell.getBoundingClientRect().x, y: cell.getBoundingClientRect().y, width: cell.getBoundingClientRect().width, height: cell.getBoundingClientRect().height})));
  expect(restAfter).toEqual(restBefore);
  await dialogs.getByRole("button", {name: "기본 컬럼 보기"}).click();
  await dialogs.getByRole("searchbox", {name: "휴게소 목록 검색"}).fill("휴게소 B");
  await expect(dialogs).toContainText("휴게소 목록 1");
  await expect(dialogs).toContainText("E2E 휴게소 B");
  await dialogs.getByRole("button", {name: "E2E 휴게소 B"}).click();
  await expect(page.getByRole("dialog")).toContainText("E2E 휴게소 B");
  await page.getByRole("dialog").getByRole("button", {name: "상세정보 닫기"}).click();

  await page.getByRole("button", {name: /^휴게소 목록/}).click();
  await expect(dialogs.getByRole("searchbox", {name: "휴게소 목록 검색"})).toHaveValue("휴게소 B");
  await dialogs.getByRole("searchbox", {name: "휴게소 목록 검색"}).fill("");
  await expect(dialogs).toContainText("휴게소 목록 58");
  await expect(dialogs).toContainText("아래로 스크롤하면 목록을 더 불러옵니다");
  await dialogs.locator(".table-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(dialogs.getByRole("button", {name: "E2E 휴게소 58"})).toBeVisible();
  await dialogs.getByRole("button", {name: "닫기"}).click();
  await expect(dialogs).toHaveCount(0);

  await page.getByRole("button", {name: /^주유·충전소 목록/}).click();
  await expect(dialogs).toHaveCount(1);
  await expect(dialogs).toContainText("주유·충전소 58");
  expect(stationRequests.length).toBeGreaterThan(0);
  expect(stationRequests.every(source => source === "ex")).toBe(true);
  const stationSearch = dialogs.getByRole("searchbox", {name: "주유·충전소 목록 검색"});
  await stationSearch.pressSequentially("E2E", {delay: 30});
  await expect(stationSearch).toHaveValue("E2E");
  await expect(stationSearch).toBeFocused();
  await stationSearch.fill("");
  const stationCells = dialogs.locator("tbody tr").first().locator("td");
  const stationBefore = await stationCells.evaluateAll(cells => cells.map(cell => ({text: cell.textContent, x: cell.getBoundingClientRect().x, y: cell.getBoundingClientRect().y, width: cell.getBoundingClientRect().width, height: cell.getBoundingClientRect().height})));
  await dialogs.getByRole("button", {name: "전체 컬럼 보기"}).click();
  const stationAfter = await stationCells.evaluateAll(cells => cells.slice(0, 7).map(cell => ({text: cell.textContent, x: cell.getBoundingClientRect().x, y: cell.getBoundingClientRect().y, width: cell.getBoundingClientRect().width, height: cell.getBoundingClientRect().height})));
  expect(stationAfter).toEqual(stationBefore);
  await dialogs.getByRole("button", {name: "기본 컬럼 보기"}).click();
  await dialogs.getByRole("searchbox", {name: "주유·충전소 목록 검색"}).fill("전체목록");
  await expect(dialogs).toContainText("주유·충전소 1");
  await dialogs.getByRole("button", {name: "E2E 전체목록 주유소"}).click();
  await expect(page.getByRole("dialog")).toContainText("E2E 전체목록 주유소");
  await page.getByRole("dialog").getByRole("button", {name: "상세정보 닫기"}).click();

  await page.getByRole("button", {name: /^주유·충전소 목록/}).click();
  await dialogs.getByRole("searchbox", {name: "주유·충전소 목록 검색"}).fill("");
  await expect(dialogs).toContainText("주유·충전소 58");
  await expect(dialogs).toContainText("아래로 스크롤하면 목록을 더 불러옵니다");
  await dialogs.locator(".table-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(dialogs.getByRole("button", {name: "E2E 주유소 58"})).toBeVisible();
  await dialogs.getByRole("button", {name: "닫기"}).click();
  await expect(dialogs).toHaveCount(0);
});

