import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
if (existsSync(".env")) process.loadEnvFile(".env");
const rootRequire = createRequire(resolve("package.json"));
const clientRequire = createRequire(resolve("apps/game-client/package.json"));
const commands = [
  [
    rootRequire.resolve("tsx/cli"),
    ["apps/game-server/src/main.ts"],
    process.cwd(),
  ],
  [
    resolve(dirname(clientRequire.resolve("vite/package.json")), "bin/vite.js"),
    ["--host", "0.0.0.0"],
    "apps/game-client",
  ],
] as const;
const children = commands.map(([command, args, cwd]) =>
  spawn(process.execPath, [command, ...args], { cwd, stdio: "inherit" }),
);
let stopping = false;
for (const child of children) {
  child.on("error", (error) => {
    console.error("Không thể khởi động tiến trình dev:", error);
    process.exitCode = 1;
    stop();
  });
  child.on("exit", (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
}
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
