import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const commands = [
  ["node_modules/.bin/tsx", ["apps/game-server/src/main.ts"], process.cwd()],
  ["../../node_modules/.bin/vite", ["--host", "0.0.0.0"], "apps/game-client"],
] as const;
const children = commands.map(([command, args, cwd]) =>
  spawn(command, [...args], { cwd, stdio: "inherit" }),
);
let stopping = false;
for (const child of children)
  child.on("exit", (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
