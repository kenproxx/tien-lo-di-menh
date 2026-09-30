import { WebSocket } from "ws";
import { auth } from "../../apps/game-server/src/auth.js";
import { pool } from "../../packages/database/src/index.js";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
if (process.env.NODE_ENV === "production")
  throw new Error("PRODUCTION_LOAD_FIXTURE_FORBIDDEN");
const base = "http://localhost:3001";
const count = Number(process.env.LOAD_CLIENTS ?? 20),
  seconds = Number(process.env.LOAD_SECONDS ?? 60);
if (!Number.isInteger(count) || count < 1 || count > 20)
  throw new Error("SMOKE_CLIENTS_1_TO_20_ONLY");
const clients: {
  socket: WebSocket;
  latest: any;
  frames: number;
  intervals: number[];
  last: number;
  seq: number;
  name: string;
}[] = [];
let errors = 0;
const baselineMetrics = await fetch(base + "/metrics").then((r) => r.json());
for (let i = 0; i < count; i++) {
  const name = `Load ${i}`,
    email = `load-${randomUUID()}@example.com`;
  let cookie = "";
  async function api(path: string, data?: unknown) {
    const r = await fetch(base + "/api" + path, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    for (const value of r.headers.getSetCookie()) cookie = value.split(";")[0]!;
    const result = await r.json();
    if (!r.ok)
      throw new Error(
        result.code ??
          result.message ??
          result.error?.message ??
          result.error ??
          "LOAD_API_FAILED",
      );
    return result;
  }
  const prepared = await auth.api.signUpEmail({
    body: { name, email, password: "Local-load-test-password-2026" },
    asResponse: true,
  });
  if (!prepared.ok) throw new Error("LOAD_FIXTURE_FAILED");
  cookie = prepared.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const character = await api("/characters", { name });
  const { ticket } = await api("/ticket", { characterId: character.id });
  const socket = new WebSocket("ws://localhost:3001");
  const client = {
    socket,
    latest: null as any,
    frames: 0,
    intervals: [] as number[],
    last: 0,
    seq: 0,
    name,
  };
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    socket.on("open", () =>
      socket.send(JSON.stringify({ type: "hello", version: 1, ticket })),
    );
    socket.on("error", reject);
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "error") {
        if (!["COOLDOWN", "TARGET_OUT_OF_RANGE"].includes(message.error))
          errors++;
        return;
      }
      if (message.type === "snapshot") {
        const now = performance.now();
        if (client.last) client.intervals.push(now - client.last);
        client.last = now;
        client.latest = message;
        client.frames++;
        resolve();
      }
    });
  });
  socket.send(
    JSON.stringify({
      type: "action",
      version: 1,
      requestId: randomUUID(),
      action: "auto",
      value: "on",
    }),
  );
}
console.log(`Started ${count} authenticated active clients for ${seconds}s.`);
const timer = setInterval(() => {
  for (const c of clients) {
    if (c.socket.readyState !== WebSocket.OPEN) continue;
    c.socket.send(
      JSON.stringify({
        type: "input",
        version: 1,
        seq: ++c.seq,
        axis: 0,
        jump: false,
      }),
    );
  }
}, 50);
await new Promise((r) => setTimeout(r, seconds * 1000));
clearInterval(timer);
const intervals = clients.flatMap((c) => c.intervals).sort((a, b) => a - b),
  quantile = (p: number) =>
    intervals[Math.floor((intervals.length - 1) * p)] ?? 0;
const report = {
  date: new Date().toISOString(),
  scenario: `${count} authenticated active auto-combat actors; shared village monsters; ${seconds}s smoke only`,
  clients: count,
  seconds,
  snapshots: clients.reduce((n, c) => n + c.frames, 0),
  snapshotIntervalMs: {
    p50: quantile(0.5),
    p95: quantile(0.95),
    p99: quantile(0.99),
  },
  kills: clients.reduce((n, c) => n + (c.latest?.you.kills ?? 0), 0),
  errors,
  notValidated: [
    "500 CCU",
    "30 minute tiers",
    "2h soak",
    "production bandwidth/database cost",
    "mobile devices",
  ],
  serverMetrics: await fetch(base + "/metrics").then((r) => r.json()),
  baselineMetrics,
  capacityClaim: false,
};
for (const c of clients) c.socket.close();
await pool.end();
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(
  "docs/evidence/load-smoke.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (errors || report.kills === 0 || report.snapshots < count * seconds * 5)
  process.exitCode = 1;
