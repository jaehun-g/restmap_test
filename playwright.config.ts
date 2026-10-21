import {defineConfig} from "@playwright/test";

const port = process.env.E2E_PORT ?? "3318";
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", {open: "never"}]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
