import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  type CharacterState,
  transaction,
  pool,
  writeState,
  writeLedger,
  assetSnapshot,
  hash,
} from "../../../packages/database/src/index.js";
import {
  parseU64,
  mulRatio,
  clampU64,
} from "../../../packages/simulation/src/index.js";
import { spend, fail } from "./gameplay.js";
export async function listMarket(
  s: CharacterState,
  db: pg.PoolClient,
  itemId: string,
  price: string,
) {
  const p = parseU64(price);
  if (p === 0n) fail("INVALID_PRICE");
  await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [s.accountId]);
  const active = await db.query(
    "SELECT count(*) FROM market WHERE account_id=$1 AND status='active'",
    [s.accountId],
  );
  if (Number(active.rows[0].count) >= 20) fail("LISTING_LIMIT");
  const item = s.inventory.find((i) => i.id === itemId);
  if (!item) fail("ITEM_NOT_FOUND");
  s.inventory = s.inventory.filter((i) => i.id !== itemId);
  const id = randomUUID();
  await db.query(
    "INSERT INTO market(id,account_id,seller,item,price,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '48 hours')",
    [id, s.accountId, s.id, item, p.toString()],
  );
  return { id };
}
export async function buyMarket(
  s: CharacterState,
  db: pg.PoolClient,
  id: string,
) {
  const row = await db.query(
    "SELECT * FROM market WHERE id=$1 AND status='active' AND expires_at>now() FOR UPDATE NOWAIT",
    [id],
  );
  const m = row.rows[0];
  if (!m) fail("LISTING_UNAVAILABLE");
  if (m.account_id === s.accountId) fail("OWN_LISTING");
  if (s.inventory.length >= 40) fail("BAG_FULL");
  const sellerRow = await db.query(
    "SELECT state FROM characters WHERE id=$1 FOR UPDATE NOWAIT",
    [m.seller],
  );
  if (!sellerRow.rows[0]) fail("SELLER_UNAVAILABLE");
  const seller = sellerRow.rows[0].state as CharacterState;
  const before = {
    coins: seller.coins,
    spirit: seller.spirit,
    assets: assetSnapshot(seller),
  };
  const price = parseU64(m.price);
  spend(s, price, "spirit");
  const fee = mulRatio(price, 5n, 100n, "ceil");
  seller.spirit = clampU64(BigInt(seller.spirit) + price - fee).toString();
  s.inventory.push(m.item);
  await writeState(db, seller);
  await writeLedger(db, seller, before, "market-credit", id);
  await db.query(
    "INSERT INTO operations(actor,type,request_id,payload_hash,result) VALUES($1,'market-credit',$2,$3,$4)",
    [
      seller.id,
      id,
      hash(id),
      { listing: id, received: (price - fee).toString() },
    ],
  );
  await db.query("UPDATE market SET status='sold',buyer=$2 WHERE id=$1", [
    id,
    s.id,
  ]);
  await db.query(
    "INSERT INTO outbox(actor,type,payload) VALUES($1,'market-sale',$2)",
    [
      seller.id,
      { listing: id, received: (price - fee).toString(), fee: fee.toString() },
    ],
  );
  if (s.system === "system-3") s.systemProgress++;
  return { purchased: id, fee: fee.toString() };
}
export async function expireListings(s: CharacterState, db: pg.PoolClient) {
  s.claims = s.claims.filter(
    (i) => !i.claimExpiresAt || i.claimExpiresAt > Date.now(),
  );
  const rows = await db.query(
    "SELECT id,item,expires_at FROM market WHERE seller=$1 AND status='active' AND expires_at<=now() ORDER BY expires_at FOR UPDATE",
    [s.id],
  );
  const expired: string[] = [];
  for (const r of rows.rows) {
    const deadline = new Date(r.expires_at).getTime() + 7 * 86400000;
    if (deadline > Date.now() && s.claims.length >= 100) continue;
    if (deadline > Date.now())
      s.claims.push({ ...r.item, claimExpiresAt: deadline });
    await db.query("UPDATE market SET status='expired' WHERE id=$1", [r.id]);
    expired.push(String(r.id));
  }
  return expired;
}
function drainClaims(s: CharacterState) {
  s.claims = s.claims.filter(
    (i) => !i.claimExpiresAt || i.claimExpiresAt > Date.now(),
  );
  while (s.inventory.length < 40 && s.claims.length) {
    const item = s.claims.shift()!;
    delete item.claimExpiresAt;
    s.inventory.push(item);
  }
}
export async function claimExpired(s: CharacterState, db: pg.PoolClient) {
  drainClaims(s);
  await expireListings(s, db);
  drainClaims(s);
  return { claims: s.claims.length };
}

export async function expireMarketActor(accountId: string, actor: string) {
  return transaction(async (db) => {
    await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [accountId]);
    const row = await db.query(
      "SELECT state FROM characters WHERE id=$1 AND account_id=$2 AND deleted_until IS NULL FOR UPDATE",
      [actor, accountId],
    );
    const s = row.rows[0]?.state as CharacterState | undefined;
    if (!s) return false;
    const before = {
        coins: s.coins,
        spirit: s.spirit,
        assets: assetSnapshot(s),
      },
      ids = await expireListings(s, db);
    if (!ids.length) return false;
    const key = hash(ids.sort().join(":"));
    await writeState(db, s);
    await writeLedger(db, s, before, "market-expire", key);
    await db.query(
      "INSERT INTO operations(actor,type,request_id,payload_hash,result) VALUES($1,'market-expire',$2,$2,$3)",
      [actor, key, { expired: ids }],
    );
    await db.query(
      "INSERT INTO outbox(actor,type,payload) VALUES($1,'market-expire',$2)",
      [actor, { expired: ids }],
    );
    return true;
  });
}
export async function expireMarkets() {
  const rows = await pool.query(
    "SELECT DISTINCT seller,account_id FROM market WHERE status='active' AND expires_at<=now() LIMIT 100",
  );
  const actors: string[] = [];
  for (const row of rows.rows) {
    try {
      if (await expireMarketActor(row.account_id, row.seller))
        actors.push(row.seller);
    } catch {
      console.error("MARKET_EXPIRY_FAILED");
    }
  }
  return actors;
}
