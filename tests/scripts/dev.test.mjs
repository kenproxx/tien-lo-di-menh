import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

function runLauncher() {
  const calls = [];
  const children = [];
  const fakeProcess = new EventEmitter();
  Object.assign(fakeProcess, {
    execPath: process.execPath,
    cwd: () => process.cwd(),
  });
  const source = stripTypeScriptTypes(
    readFileSync(new URL("../../scripts/dev.ts", import.meta.url), "utf8"),
  ).replace(/^import .*;\n/gm, "");
  runInNewContext(source, {
    process: fakeProcess,
    existsSync: () => false,
    resolve,
    dirname,
    createRequire: () => ({ resolve: (name) => resolve("node_modules", name) }),
    console: { error() {} },
    spawn(command, args, options) {
      calls.push({ command, args, options });
      const child = new EventEmitter();
      child.killed = false;
      child.kill = () => {
        child.killed = true;
      };
      children.push(child);
      return child;
    },
  });
  return { calls, children, fakeProcess };
}

test("dev launches JavaScript CLIs through Node without platform-specific bin shims", () => {
  const { calls } = runLauncher();
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.command, process.execPath);
    assert.ok(!call.args[0].includes(".bin"));
  }
  assert.equal(calls[0].args[1], "apps/game-server/src/main.ts");
  assert.equal(calls[1].options.cwd, "apps/game-client");
});

test("spawn errors stop sibling processes and mark the launcher as failed", () => {
  const { children, fakeProcess } = runLauncher();
  children[0].emit("error", new Error("spawn ENOENT"));
  assert.equal(fakeProcess.exitCode, 1);
  assert.ok(children.every((child) => child.killed));
});
