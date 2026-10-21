import {spawn} from "node:child_process";

// 실제 SDK 테스트는 Kakao에 등록된 주소에서 실행 중인 앱을 사용한다.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const child = spawn(process.execPath, [
  "node_modules/playwright/cli.js", "test", "e2e/marker-visibility.spec.ts", ...process.argv.slice(2),
], {
  stdio: "inherit", windowsHide: true,
  env: {...process.env, E2E_BASE_URL: baseURL, E2E_LIVE_KAKAO: "1"},
});
child.on("error", () => { process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
