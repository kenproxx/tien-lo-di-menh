import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  pool,
  migrate,
  createCharacter,
  issueTicket,
  consumeTicket,
  executeOperation,
  readCharacter,
  type CharacterState,
} from "../../packages/database/src/index.js";
import { listMarket, buyMarket } from "../../apps/game-server/src/market.js";
import {
  startOffline,
  settleOffline,
} from "../../apps/game-server/src/offline.js";
const a = randomUUID(),
  b = randomUUID();
let ca: CharacterState, cb: CharacterState, ea: number, eb: number;
beforeAll(async () => {
  await migrate();
  for (const id of [a, b])
    await pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,\'test\',$2,false,now(),now())',
      [id, `${id}@example.com`],
    );
  ca = await createCharacter(a, "Người Bán");
  cb = await createCharacter(b, "Người Mua");
  ea = (await consumeTicket(await issueTicket(a, ca.id))).epoch;
  eb = (await consumeTicket(await issueTicket(b, cb.id))).epoch;
  await executeOperation(cb.id, eb, "fixture", randomUUID(), {}, (s) => {
    s.spirit = "100";
    return { ok: true };
  });
});
afterAll(async () => {
  for (const id of [a, b])
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  await pool.end();
});
it("escrows item, buys once under race, charges ceil fee and preserves assets", async () => {
  const item = ca.inventory[0]!;
  const result = await executeOperation(
    ca.id,
    ea,
    "list",
    randomUUID(),
    {},
    (s, db) => listMarket(s, db, item.id, "11"),
  );
  expect(
    (await readCharacter(ca.id)).inventory.some((i) => i.id === item.id),
  ).toBe(false);
  const request = randomUUID();
  await Promise.all(
    Array.from({ length: 20 }, () =>
      executeOperation(cb.id, eb, "buy", request, { id: result.id }, (s, db) =>
        buyMarket(s, db, result.id),
      ),
    ),
  );
  const buyer = await readCharacter(cb.id),
    seller = await readCharacter(ca.id);
  expect(buyer.spirit).toBe("89");
  expect(seller.spirit).toBe("10");
  expect(buyer.inventory.filter((i) => i.id === item.id)).toHaveLength(1);
});
it("offline transition fences old writer and settles once after server-clock elapsed time", async () => {
  await startOffline(a, ca.id, ea, { map: "map-0" });
  await expect(
    executeOperation(ca.id, ea, "reward", randomUUID(), {}, () => ({})),
  ).rejects.toThrow("STALE_EPOCH");
  await pool.query(
    "UPDATE offline_jobs SET started_at=now()-interval '10 minutes' WHERE character_id=$1",
    [ca.id],
  );
  const results = await Promise.all(
    Array.from({ length: 10 }, () => settleOffline(a, ca.id)),
  );
  for (const report of results) expect(report).toEqual(results[0]);
  const q = await pool.query(
    "SELECT count(*) FROM operations WHERE actor=$1 AND type='offline'",
    [ca.id],
  );
  expect(Number(q.rows[0].count)).toBe(1);
  expect(results[0].seconds).toBeGreaterThanOrEqual(600);
});
