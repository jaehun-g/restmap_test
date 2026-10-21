import {expect, test} from "@playwright/test";

test.describe("휴게소·EX 주유소 통합 화면", () => {
  test("모바일에서 경부선 방향을 고르고 EX 주유소 통합 상세를 본다", async ({page}, testInfo) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto("/mobile");

    await expect(page.getByText("휴게소 · EX 주유소")).toBeVisible();
    await page.getByRole("button", {name: "전체 노선"}).click();
    await page.getByRole("button", {name: /^경부선/}).click();
    await expect(page.getByRole("button", {name: "전체 방향"})).toBeVisible();

    await page.getByRole("button", {name: "전체 방향"}).click();
    await expect(page.getByRole("button", {name: "부산 방향"})).toBeVisible();
    await expect(page.getByRole("button", {name: "서울 방향"})).toBeVisible();
    await page.getByRole("button", {name: "서울 방향"}).click();
    await expect(page.getByRole("button", {name: "서울 방향"})).toBeVisible();
    await expect(page.getByText("경부선 · 서울 방향 전체 구간")).toBeVisible();

    await page.locator(".sheet-summary").click();
    await page.getByRole("button", {name: /죽전\(서울 방향\).*상세정보/}).click();
    await expect(page.getByText("EX 주유소", {exact: true})).toBeVisible();
    await expect(page.getByText("죽전(서울)주유소", {exact: true})).toBeVisible();
    await expect(page.getByText("휘발유", {exact: true})).toBeVisible();
    await page.locator(".detail-scroll").evaluate(element => {
      element.scrollTop = element.scrollHeight;
    });
    await page.screenshot({path: testInfo.outputPath("mobile-gyeongbu-seoul-detail.png"), fullPage: true});
  });

  test("관리자에서 노선 선택 뒤 해당 방향만 필터링한다", async ({page}, testInfo) => {
    await page.setViewportSize({width: 1440, height: 960});
    await page.goto("/admin");

    const route = page.getByLabel("노선 필터");
    const direction = page.getByLabel("방향 필터");
    await route.selectOption({label: "경부선"});
    await expect(direction).toBeEnabled();
    await expect(direction.locator("option")).toHaveCount(3);
    await direction.selectOption({label: "서울 방향"});

    await expect(page.getByText("건천(서울 방향)", {exact: true})).toBeVisible();
    await expect(page.getByText("건천(부산 방향)", {exact: true})).toHaveCount(0);
    await page.screenshot({path: testInfo.outputPath("admin-gyeongbu-seoul.png"), fullPage: true});
  });

  test.skip(
    "카카오 지도 SDK가 localhost 테스트 도메인에서 로드되면 개별 마커와 선형을 시각 회귀 대상으로 추가한다.",
    async () => {},
  );
});
