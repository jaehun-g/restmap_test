import {devices, expect, test} from "@playwright/test";

test.skip(
  process.env.E2E_LIVE_KAKAO !== "1",
  "실제 Kakao SDK와 노선 데이터를 사용하는 검증입니다.",
);

for (const device of ["Pixel 7", "iPhone 13"])
  test.describe(device, () => {
    const {viewport, userAgent, deviceScaleFactor, isMobile, hasTouch} = devices[device];
    test.use({viewport, userAgent, deviceScaleFactor, isMobile, hasTouch});
    test("노선 선택과 전환 직후 폴리라인이 표시된다", async ({page}) => {
      test.setTimeout(180_000);
      await page.goto("/mobile");
      const filter = page.locator(".mobile-filters button").first();
      let previousId = "";
      await filter.click();
      const names = await page
        .getByRole("region", {name: "노선 필터"})
        .locator("li button")
        .evaluateAll(buttons =>
          buttons
            .slice(1)
            .map(button => button.querySelector("span")?.childNodes[0]?.textContent?.trim() ?? "")
            .filter(Boolean),
        );
      await page.getByRole("button", {name: "필터 선택창 닫기"}).click();
      expect(names).toContain("경부선");
      expect(names).toContain("남해선");
      for (const name of [
        "경부선",
        "남해선",
        "경부선",
        ...names.filter(name => name !== "경부선"),
      ]) {
        await filter.click();
        await page
          .getByRole("region", {name: "노선 필터"})
          .getByRole("button", {name: new RegExp(`^${name} `)})
          .click();
        await expect(filter).toContainText(name);
        const line = page.locator('.map-canvas svg path[style*="rgb(8, 101, 255)"]');
        await expect(line).toHaveCount(1, {timeout: 15000});
        await expect(line).toBeVisible();
        await expect(line).toHaveAttribute("d", /L/);
        await expect.poll(() => line.getAttribute("id")).not.toBe(previousId);
        await expect
          .poll(() =>
            line.evaluate(element => {
              const lineBounds = element.getBoundingClientRect();
              const mapBounds = element.closest(".map-canvas")!.getBoundingClientRect();
              return (
                lineBounds.width > 0 &&
                lineBounds.height > 0 &&
                lineBounds.right > mapBounds.left &&
                lineBounds.left < mapBounds.right &&
                lineBounds.bottom > mapBounds.top &&
                lineBounds.top < mapBounds.bottom
              );
            }),
          )
          .toBe(true);
        previousId = (await line.getAttribute("id"))!;
      }
    });
  });
