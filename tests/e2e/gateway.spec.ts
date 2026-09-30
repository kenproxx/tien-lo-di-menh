import { test, expect, request } from "@playwright/test";
import { authFixture } from "../helpers/auth-fixture.js";
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
test("overlapping hello cannot attach two tickets to one socket", async () => {
  const fixture = await authFixture("Gateway");
  const api = await request.newContext({
    baseURL: "http://localhost:3001",
    extraHTTPHeaders: {
      Cookie: fixture.cookie,
      Origin: "http://localhost:5173",
    },
  });
  const c = await (
    await api.post("/api/characters", { data: { name: "Handshake" } })
  ).json();
  const one = await (
      await api.post("/api/ticket", { data: { characterId: c.id } })
    ).json(),
    two = await (
      await api.post("/api/ticket", { data: { characterId: c.id } })
    ).json();
  const ws = new WebSocket("ws://localhost:3001");
  const messages: any[] = [];
  ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => {
      ws.send(
        JSON.stringify({ type: "hello", version: 1, ticket: one.ticket }),
      );
      ws.send(
        JSON.stringify({ type: "hello", version: 1, ticket: two.ticket }),
      );
      resolve();
    });
    ws.once("error", reject);
  });
  await expect
    .poll(() => messages.some((m) => m.type === "snapshot"))
    .toBe(true);
  expect(messages.some((m) => m.error === "AUTHENTICATING")).toBe(true);
  ws.close();
  await api.dispose();
});
test("cached free action retry does not increment persisted revision", async () => {
  const fixture = await authFixture("Gateway");
  const api = await request.newContext({
    baseURL: "http://localhost:3001",
    extraHTTPHeaders: {
      Cookie: fixture.cookie,
      Origin: "http://localhost:5173",
    },
  });
  const c = await (
    await api.post("/api/characters", { data: { name: "Retry" } })
  ).json();
  const ticket = await (
    await api.post("/api/ticket", { data: { characterId: c.id } })
  ).json();
  const ws = new WebSocket("ws://localhost:3001");
  let latest: any;
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "snapshot") latest = m;
  });
  await new Promise<void>((resolve) =>
    ws.once("open", () => {
      ws.send(
        JSON.stringify({ type: "hello", version: 1, ticket: ticket.ticket }),
      );
      resolve();
    }),
  );
  await expect.poll(() => Boolean(latest)).toBe(true);
  const id = randomUUID();
  const command = {
    type: "action",
    version: 1,
    requestId: id,
    action: "auto",
    value: "off",
  };
  ws.send(JSON.stringify(command));
  await expect.poll(() => latest.you.revision).toBeGreaterThan(0);
  const before = latest.you.revision;
  ws.send(JSON.stringify(command));
  await expect.poll(() => latest.you.revision).toBe(before);
  expect(latest.you.auto).toBe(false);
  ws.close();
  await api.dispose();
});
