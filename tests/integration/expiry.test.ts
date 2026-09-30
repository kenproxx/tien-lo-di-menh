import { it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  pool,
  migrate,
  createCharacter,
  issueTicket,
  consumeTicket,
  executeOperation,
  readCharacter,
} from "../../packages/database/src/index.js";
import {
  listMarket,
  expireMarketActor,
  claimExpired,
} from "../../apps/game-server/src/market.js";
const account = randomUUID();
afterAll(async () => {
  await pool.query('DELETE FROM "user" WHERE id=$1', [account]);
  await pool.end();
});
it("concurrent expiry returns escrow to claims once with its original deadline and an audit record", async () => {
  await migrate();
  await pool.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [
    account,
    "Expiry",
    account + "@example.com",
  ]);
  const s = await createCharacter(account, "Hết Hạn"),
    lease = await consumeTicket(await issueTicket(account, s.id));
  const result = await executeOperation(
    s.id,
    lease.epoch,
    "market-list",
    randomUUID(),
    {},
    (state, db) => listMarket(state, db, state.inventory[0]!.id, "10"),
  );
  await pool.query(
    "UPDATE market SET expires_at=now()-interval '1 hour' WHERE id=$1",
    [result.id],
  );
  const results = await Promise.all(
    Array.from({ length: 10 }, () => expireMarketActor(account, s.id)),
  );
  expect(results.filter(Boolean)).toHaveLength(1);
  const after = await readCharacter(s.id);
  expect(after.claims).toHaveLength(1);
  expect(after.claims[0]!.claimExpiresAt!).toBeGreaterThan(
    Date.now() + 6 * 86400000,
  );
  const row = await pool.query(
    "SELECT count(*) FROM operations WHERE actor=$1 AND type='market-expire'",
    [s.id],
  );
  expect(Number(row.rows[0].count)).toBe(1);
});
it("full claims can drain to inventory before returning expired escrow", async () => {
  await pool.query("UPDATE activity SET mode='idle' WHERE account_id=$1", [
    account,
  ]);
  const s = await createCharacter(account, "Nhận Đồ"),
    lease = await consumeTicket(await issueTicket(account, s.id));
  const result = await executeOperation(
    s.id,
    lease.epoch,
    "market-list",
    randomUUID(),
    {},
    (state, db) => listMarket(state, db, state.inventory[0]!.id, "10"),
  );
  await pool.query(
    "UPDATE market SET expires_at=now()-interval '1 hour' WHERE id=$1",
    [result.id],
  );
  const claims = Array.from({ length: 100 }, () => ({
    id: randomUUID(),
    template: "herb",
    quantity: 1,
    claimExpiresAt: Date.now() + 86400000,
  }));
  await pool.query(
    "UPDATE characters SET state=jsonb_set(state,'{claims}',$2::jsonb) WHERE id=$1",
    [s.id, JSON.stringify(claims)],
  );
  await executeOperation(
    s.id,
    lease.epoch,
    "market-claim",
    randomUUID(),
    {},
    claimExpired,
  );
  const after = await readCharacter(s.id);
  expect(after.inventory).toHaveLength(40);
  expect(after.claims).toHaveLength(100 + s.inventory.length - 40);
  const row = await pool.query("SELECT status FROM market WHERE id=$1", [
    result.id,
  ]);
  expect(row.rows[0].status).toBe("expired");
});
