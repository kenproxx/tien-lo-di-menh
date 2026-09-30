import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "./schema.js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { starterState, type CharacterState } from "./state.js";
export * from "./state.js";
if (existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
});
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const orm = drizzle(pool, { schema });
export async function migrate() {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(782061001)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
    for (const name of readdirSync(directory)
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const source = readFileSync(directory + name, "utf8"),
        checksum = hash(source);
      const row = await db.query(
        "SELECT checksum FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (row.rows[0]) {
        if (row.rows[0].checksum !== checksum)
          throw new Error("MIGRATION_CHECKSUM_MISMATCH");
        continue;
      }
      await db.query(source);
      await db.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
    }
  });
}
export async function transaction<T>(
  fn: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const value = await fn(db);
    await db.query("COMMIT");
    return value;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function createCharacter(accountId: string, name: string) {
  if (!/^[\p{L}\p{N} _-]{2,24}$/u.test(name)) throw new Error("INVALID_NAME");
  return transaction(async (db) => {
    await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [accountId]);
    await db.query(
      "DELETE FROM characters WHERE account_id=$1 AND deleted_until<=now()",
      [accountId],
    );
    const rows = await db.query(
      "SELECT slot,deleted_until FROM characters WHERE account_id=$1 ORDER BY slot",
      [accountId],
    );
    const used = rows.rows.map((r) => r.slot);
    const slot = [0, 1, 2, 3].find((s) => !used.includes(s));
    if (slot === undefined) throw new Error("CHARACTER_LIMIT");
    const id = randomUUID();
    const state = starterState(id, accountId, name);
    await db.query(
      "INSERT INTO characters(id,account_id,slot,name,state,coins,spirit,exp) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, accountId, slot, name, state, state.coins, state.spirit, state.exp],
    );
    await writeLedger(
      db,
      state,
      {
        coins: "0",
        spirit: "0",
        assets: { inventory: [], equipment: {}, claims: [], pets: [] },
      },
      "character-create",
      id,
    );
    return state;
  });
}
export async function listCharacters(accountId: string) {
  const rows = await orm
    .select({ state: schema.characters.state })
    .from(schema.characters)
    .where(
      and(
        eq(schema.characters.accountId, accountId),
        isNull(schema.characters.deletedUntil),
      ),
    )
    .orderBy(schema.characters.slot);
  return rows.map((r) => r.state);
}
export async function readCharacter(id: string) {
  const rows = await orm
    .select({ state: schema.characters.state })
    .from(schema.characters)
    .where(
      and(eq(schema.characters.id, id), isNull(schema.characters.deletedUntil)),
    )
    .limit(1);
  if (!rows[0]) throw new Error("CHARACTER_NOT_FOUND");
  return rows[0].state;
}
export async function issueTicket(accountId: string, characterId: string) {
  return transaction(async (db) => {
    await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [accountId]);
    const c = await db.query(
      "SELECT id FROM characters WHERE id=$1 AND account_id=$2 AND deleted_until IS NULL",
      [characterId, accountId],
    );
    if (!c.rows[0]) throw new Error("NOT_OWNER");
    const a = await db.query(
      "SELECT * FROM activity WHERE account_id=$1 FOR UPDATE",
      [accountId],
    );
    if (
      a.rows[0] &&
      a.rows[0].character_id !== characterId &&
      (a.rows[0].mode === "offline" ||
        new Date(a.rows[0].expires_at) > new Date()) &&
      a.rows[0].mode !== "idle"
    )
      throw new Error("ACCOUNT_ACTIVE");
    const ticket = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO tickets(hash,account_id,character_id,expires_at) VALUES($1,$2,$3,now()+interval '60 seconds')",
      [hash(ticket), accountId, characterId],
    );
    return ticket;
  });
}
export async function consumeTicket(ticket: string) {
  return transaction(async (db) => {
    const q = await db.query(
      "DELETE FROM tickets WHERE hash=$1 AND expires_at>now() RETURNING *",
      [hash(ticket)],
    );
    const t = q.rows[0];
    if (!t) throw new Error("INVALID_TICKET");
    await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [
      t.account_id,
    ]);
    const a = await db.query(
      "SELECT * FROM activity WHERE account_id=$1 FOR UPDATE",
      [t.account_id],
    );
    if (a.rows[0]?.mode === "offline")
      throw new Error("OFFLINE_SETTLEMENT_REQUIRED");
    if (
      a.rows[0] &&
      a.rows[0].character_id !== t.character_id &&
      a.rows[0].mode === "online" &&
      new Date(a.rows[0].expires_at) > new Date()
    )
      throw new Error("ACCOUNT_ACTIVE");
    const epoch = Number(a.rows[0]?.epoch ?? 0) + 1;
    await db.query(
      "INSERT INTO activity(account_id,character_id,epoch,mode,expires_at) VALUES($1,$2,$3,'online',now()+interval '45 seconds') ON CONFLICT(account_id) DO UPDATE SET character_id=$2,epoch=$3,mode='online',expires_at=now()+interval '45 seconds'",
      [t.account_id, t.character_id, epoch],
    );
    return {
      characterId: t.character_id as string,
      accountId: t.account_id as string,
      epoch,
    };
  });
}
export async function writeState(db: pg.PoolClient, state: CharacterState) {
  state.revision++;
  await db.query(
    "UPDATE characters SET state=$2,coins=$3,spirit=$4,exp=$5,revision=revision+1 WHERE id=$1",
    [state.id, state, state.coins, state.spirit, state.exp],
  );
}
export function assetSnapshot(s: CharacterState) {
  return structuredClone({
    inventory: s.inventory,
    equipment: s.equipment,
    claims: s.claims,
    pets: s.pets,
  });
}
export async function writeLedger(
  db: pg.PoolClient,
  s: CharacterState,
  before: { coins: string; spirit: string; assets: unknown },
  type: string,
  requestId: string,
) {
  await db.query(
    "INSERT INTO ledger(actor,operation_type,request_id,before_coins,after_coins,before_spirit,after_spirit,asset_before,asset_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      s.id,
      type,
      requestId,
      before.coins,
      s.coins,
      before.spirit,
      s.spirit,
      before.assets,
      assetSnapshot(s),
    ],
  );
}
export async function executeOperation<T>(
  actor: string,
  epoch: number,
  type: string,
  requestId: string,
  payload: unknown,
  mutate: (state: CharacterState, db: pg.PoolClient) => T | Promise<T>,
): Promise<T> {
  return transaction(async (db) => {
    const owner = await db.query(
      "SELECT account_id FROM characters WHERE id=$1",
      [actor],
    );
    if (!owner.rows[0]) throw new Error("CHARACTER_NOT_FOUND");
    await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [
      owner.rows[0].account_id,
    ]);
    const row = await db.query(
      "SELECT * FROM characters WHERE id=$1 AND deleted_until IS NULL FOR UPDATE",
      [actor],
    );
    if (!row.rows[0]) throw new Error("CHARACTER_NOT_FOUND");
    const state = row.rows[0].state as CharacterState;
    const a = await db.query(
      "SELECT epoch,expires_at,mode FROM activity WHERE account_id=$1 AND character_id=$2 FOR UPDATE",
      [state.accountId, actor],
    );
    if (
      Number(a.rows[0]?.epoch) !== epoch ||
      a.rows[0]?.mode !== "online" ||
      new Date(a.rows[0].expires_at) < new Date()
    )
      throw new Error("STALE_EPOCH");
    const payloadHash = hash(JSON.stringify(payload));
    const old = await db.query(
      "SELECT payload_hash,result FROM operations WHERE actor=$1 AND type=$2 AND request_id=$3",
      [actor, type, requestId],
    );
    if (old.rows[0]) {
      if (old.rows[0].payload_hash !== payloadHash)
        throw new Error("PAYLOAD_CONFLICT");
      return old.rows[0].result as T;
    }
    const before = {
      coins: state.coins,
      spirit: state.spirit,
      assets: assetSnapshot(state),
    };
    state.claims = state.claims.filter(
      (i) => !i.claimExpiresAt || i.claimExpiresAt > Date.now(),
    );
    for (const item of state.claims)
      item.claimExpiresAt ??= Date.now() + 7 * 86400000;
    const result = await mutate(state, db);
    await writeState(db, state);
    await db.query(
      "INSERT INTO operations(actor,type,request_id,payload_hash,result) VALUES($1,$2,$3,$4,$5)",
      [actor, type, requestId, payloadHash, result],
    );
    await writeLedger(db, state, before, type, requestId);
    await db.query("INSERT INTO outbox(actor,type,payload) VALUES($1,$2,$3)", [
      actor,
      type,
      result,
    ]);
    return result;
  });
}
export async function deleteCharacter(accountId: string, id: string) {
  return transaction(async (db) => {
    await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [accountId]);
    const row = await db.query(
      "SELECT state FROM characters WHERE id=$1 AND account_id=$2 FOR UPDATE",
      [id, accountId],
    );
    if (!row.rows[0]) throw new Error("NOT_OWNER");
    const a = await db.query(
      "SELECT mode,expires_at FROM activity WHERE account_id=$1 AND character_id=$2",
      [accountId, id],
    );
    if (
      a.rows[0] &&
      (a.rows[0].mode === "offline" ||
        (a.rows[0].mode === "online" &&
          new Date(a.rows[0].expires_at) > new Date()))
    )
      throw new Error("CHARACTER_ACTIVE");
    if (row.rows[0].state.claims.length) throw new Error("CLAIMS_PENDING");
    const m = await db.query(
      "SELECT id FROM market WHERE seller=$1 AND status='active'",
      [id],
    );
    if (m.rows.length) throw new Error("LISTINGS_PENDING");
    await db.query(
      "UPDATE characters SET deleted_until=now()+interval '12 hours' WHERE id=$1",
      [id],
    );
  });
}
