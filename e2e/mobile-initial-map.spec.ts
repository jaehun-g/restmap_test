import {expect, test} from "@playwright/test";
import {installKakaoMapsMock} from "./kakao-map-mock";
import {gasStationResponse, restAreaResponse} from "./kakao-map-fixtures";

for (const mode of ["success", "denied", "delayed"] as const) {
  test(`mobile initial map handles location ${mode}`, async ({page}) => {
    await page.addInitScript({content: installKakaoMapsMock});
    await page.addInitScript(mode => {
      Object.defineProperty(navigator, "geolocation", {value: {
        getCurrentPosition(success: PositionCallback, failure: PositionErrorCallback) {
          if (mode === "success") setTimeout(() => success({coords: {latitude: 37.5, longitude: 127}} as GeolocationPosition), 100);
          if (mode === "denied") setTimeout(() => failure({code: 1} as GeolocationPositionError), 100);
          if (mode === "delayed") setTimeout(() => success({coords: {latitude: 37.5, longitude: 127}} as GeolocationPosition), 2500);
        },
      }});
    }, mode);
    await page.route("**/api/rest-areas", route => route.fulfill({json: restAreaResponse}));
    await page.route("**/api/gas-stations**", route => route.fulfill({json: gasStationResponse}));
    await page.setViewportSize({width: 390, height: 844});
    await page.goto("/mobile");
    await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.initialViews.length)).toBe(1);
    const view = await page.evaluate(() => window.__kakaoMapMock.initialViews[0]);
    if (mode === "success") expect(view).toEqual({latitude: 37.5, longitude: 127, level: 10});
    else expect(view).toEqual({latitude: 36.4, longitude: 127.8, level: 13});
    if (mode === "delayed") {
      await expect.poll(() => page.evaluate(() => window.__kakaoMapMock.centerFits.some(([lat, lng]) => lat === 37.5 && lng === 127))).toBe(true);
      expect(await page.evaluate(() => window.__kakaoMapMock.mapCreates)).toBe(1);
    }
  });
}
