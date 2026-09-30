import { beforeAll, afterAll, it, expect } from "vitest";
import {
  pool,
  migrate,
  createCharacter,
  issueTicket,
  consumeTicket,
  executeOperation,
  readCharacter,
  deleteCharacter,
} from "../../packages/database/src/index.js";
import { randomUUID } from "node:crypto";
const account = randomUUID();
let character: string;
let epoch: number;
beforeAll(async () => {
  await migrate();
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now())',
    [account, "test", `${account}@example.com`],
  );
  character = (await createCharacter(account, "Kiếm khách")).id;
  const t = await issueTicket(account, character);
  epoch = (await consumeTicket(t)).epoch;
});
afterAll(async () => {
  await pool.query('DELETE FROM "user" WHERE id=$1', [account]);
  await pool.end();
});
it("retries concurrent operation 20 times and grants once", async () => {
  const request = randomUUID();
  await Promise.all(
    Array.from({ length: 20 }, () =>
      executeOperation(
        character,
        epoch,
        "reward",
        request,
        { quest: "test" },
        (s) => {
          s.coins = (BigInt(s.coins) + 10n).toString();
          return { coins: s.coins };
        },
      ),
    ),
  );
  expect((await readCharacter(character)).coins).toBe("210");
});
it("rejects conflicting payload and stale session fence", async () => {
  const r = randomUUID();
  await executeOperation(character, epoch, "reward", r, { a: 1 }, () => ({
    ok: true,
  }));
  await expect(
    executeOperation(character, epoch, "reward", r, { a: 2 }, () => ({
      ok: true,
    })),
  ).rejects.toThrow("PAYLOAD_CONFLICT");
  await expect(
    executeOperation(
      character,
      epoch - 1,
      "reward",
      randomUUID(),
      {},
      () => ({}),
    ),
  ).rejects.toThrow("STALE_EPOCH");
});
it("single-use ticket and cross-character account activity", async () => {
  const b = await createCharacter(account, "Pháp khách");
  const ticket = await issueTicket(account, character);
  await consumeTicket(ticket);
  await expect(consumeTicket(ticket)).rejects.toThrow("INVALID_TICKET");
  await expect(issueTicket(account, b.id)).rejects.toThrow("ACCOUNT_ACTIVE");
});
it("concurrent create cannot exceed 4 slots", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => createCharacter(account, "Thể khách")),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
});
it("database rejects numeric overflows", async () => {
  await expect(
    pool.query("UPDATE characters SET coins=$1 WHERE id=$2", [
      "18446744073709551616",
      character,
    ]),
  ).rejects.toThrow();
});
it("takeover waits for in-flight mutation before changing the epoch", async () => {
  const ticket = await issueTicket(account, character);
  const current = (
    await pool.query("SELECT epoch FROM activity WHERE account_id=$1", [
      account,
    ])
  ).rows[0].epoch;
  let release!: () => void, started!: () => void;
  const began = new Promise<void>((r) => (started = r)),
    gate = new Promise<void>((r) => (release = r));
  const operation = executeOperation(
    character,
    Number(current),
    "gated",
    randomUUID(),
    {},
    async () => {
      started();
      await gate;
      return { ok: true };
    },
  );
  await began;
  let consumed = false;
  const takeover = consumeTicket(ticket).then((r) => {
    consumed = true;
    return r;
  });
  await new Promise((r) => setTimeout(r, 50));
  const beforeRelease = consumed;
  release();
  await operation;
  await takeover;
  expect(beforeRelease).toBe(false);
});
it("deleted slots become reusable after twelve hours", async () => {
  const id = (
    await pool.query(
      "SELECT id FROM characters WHERE account_id=$1 AND id<>$2 LIMIT 1",
      [account, character],
    )
  ).rows[0].id;
  await pool.query(
    "UPDATE characters SET deleted_until=now()-interval '1 second' WHERE id=$1",
    [id],
  );
  const c = await createCharacter(account, "Tái Sinh");
  expect(c.id).not.toBe(id);
});
