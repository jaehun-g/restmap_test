import {mkdir, writeFile} from "node:fs/promises";
import {chromium} from "playwright";

const label = process.argv[2] ?? "current";
const port = process.env.MAP_MEASURE_PORT ?? "3318";
if (!/^[a-z0-9-]+$/i.test(label) || !/^\d{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
  throw new Error("측정 이름과 프로덕션 서버 포트를 확인해주세요.");

// SDK에 등록된 origin은 유지하면서 측정용 서버로만 연결한다. 실행 중인 개발 서버는 변경하지 않는다.
const browser = await chromium.launch({
  headless: true,
  args: [`--host-resolver-rules=MAP localhost:3000 127.0.0.1:${port}`],
});
const results = [];
await mkdir(".map-performance", {recursive: true});
try {
  for (let session = 0; session < 3; session++) {
    const context = await browser.newContext({
      viewport: {width: 390, height: 844},
      geolocation: {latitude: 37.5, longitude: 127},
      permissions: ["geolocation"],
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__markerTiming = {visibleMs: null};
      function check() {
        const pins = document.querySelectorAll(
          '.map-canvas .place-cluster-pin img, .map-canvas img[src*="/marker"], .map-canvas img[src^="data:image/svg+xml"]',
        );
        const visible = [...pins].some(pin => {
          const rect = pin.getBoundingClientRect();
          return pin.complete && pin.naturalWidth > 0 && rect.width > 0 && rect.height > 0 &&
            rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth &&
            getComputedStyle(pin).visibility !== "hidden";
        });
        // 이미지 로드와 표시를 확인한 다음 프레임을 실제 표시 시간의 근사값으로 사용한다.
        if (visible) requestAnimationFrame(() => { window.__markerTiming.visibleMs = performance.now(); });
        else requestAnimationFrame(check);
      }
      requestAnimationFrame(check);
    });
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.goto("http://localhost:3000/", {waitUntil: "domcontentloaded"});
      await page.waitForFunction(() => window.__markerTiming.visibleMs !== null, null, {timeout: 30_000});
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        return {
          visibleMs: window.__markerTiming.visibleMs,
          ttfbMs: nav.responseStart,
          domContentLoadedMs: nav.domContentLoadedEventEnd,
          resources: performance.getEntriesByType("resource")
            .filter(entry => /\/api\/(rest-areas|gas-stations)|sdk\.js/.test(entry.name))
            .map(entry => ({
              path: new URL(entry.name).pathname,
              startMs: entry.startTime,
              endMs: entry.responseEnd,
              durationMs: entry.duration,
              serverTiming: entry.serverTiming,
            })),
          summary: document.querySelector(".sheet-summary")?.textContent,
        };
      });
      const row = {session: session + 1, browserCache: repeat ? "warm" : "empty", ...timing};
      results.push(row);
      console.log(JSON.stringify(row));
    }
    if (errors.length) throw new Error(errors.join("\n"));
    if (session === 2) await page.screenshot({path: `.map-performance/marker-timing-${label}.png`});
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`.map-performance/marker-timing-${label}.json`, JSON.stringify({
    label, measuredAt: new Date().toISOString(),
    environment: {mode: "production", viewport: "390x844", geolocation: "37.5,127", throttling: "none", port},
    results,
  }, null, 2));
}
