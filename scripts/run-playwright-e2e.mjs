import {spawn, spawnSync} from "node:child_process";
import net from "node:net";
import {setTimeout as delay} from "node:timers/promises";

const port = process.env.E2E_PORT ?? "3318";
if (!/^\d{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
  throw new Error("E2E_PORT must be an available TCP port from 1024 to 65535.");
const baseURL = `http://127.0.0.1:${port}`;
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(Number(port), "127.0.0.1", () => probe.close(error => error ? reject(error) : resolve()));
});
const server = spawn(process.execPath, [
  "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port,
], {cwd: process.cwd(), env: process.env, stdio: "inherit", windowsHide: true});
const ownedListenerPids = new Set();

function listenerPids() {
  if (process.platform !== "win32") return [];
  const result = spawnSync("netstat.exe", ["-ano", "-p", "tcp"], {encoding: "utf8", windowsHide: true});
  return (result.stdout ?? "").split(/\r?\n/).flatMap(line => {
    const fields = line.trim().split(/\s+/);
    return fields[0] === "TCP" && fields[1]?.endsWith(`:${port}`) && fields[3] === "LISTENING"
      ? [Number(fields.at(-1))]
      : [];
  });
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd: process.cwd(), env, stdio: "inherit", windowsHide: true});
    child.once("error", reject);
    child.once("close", code => resolve(code ?? 1));
  });
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next server exited early (${server.exitCode}).`);
    try {
      const response = await fetch(`${baseURL}/mobile`, {signal: AbortSignal.timeout(2_000)});
      if (response.ok) {
        for (const pid of listenerPids()) ownedListenerPids.add(pid);
        return;
      }
    } catch {
      // The production server is still starting.
    }
    await delay(250);
  }
  throw new Error(`Next server did not become ready at ${baseURL}.`);
}

let exitCode = 1;
try {
  await waitForServer();
  exitCode = await run(
    process.execPath,
    ["node_modules/playwright/cli.js", "test", ...process.argv.slice(2)],
    {...process.env, E2E_BASE_URL: baseURL},
  );
} finally {
  if (process.platform === "win32" && server.pid) {
    spawnSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], {stdio: "ignore", windowsHide: true});
    for (const pid of listenerPids()) ownedListenerPids.add(pid);
    const pids = [...new Set([server.pid, ...ownedListenerPids])].filter(Number.isSafeInteger);
    if (pids.length) {
      spawnSync("powershell.exe", ["-NoProfile", "-Command", `Stop-Process -Id ${pids.join(",")} -Force -ErrorAction SilentlyContinue`], {stdio: "ignore", windowsHide: true});
    }
  } else if (server.exitCode === null) {
    server.kill("SIGTERM");
  }
}
process.exitCode = exitCode;
