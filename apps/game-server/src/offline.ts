import { randomUUID } from "node:crypto";
import {
  transaction,
  writeState,
  writeLedger,
  assetSnapshot,
  type CharacterState,
} from "../../../packages/database/src/index.js";
import { computeOffline } from "./offline-compute.js";
import { fail } from "./gameplay.js";
import { catalog } from "../../../packages/content/src/index.js";
export async function startOffline(
  accountId: string,
  characterId: string,
  epoch: number,
  plan: { map: string; quest?: string },
) {
  return transaction(async (db) => {
    await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [accountId]);
    const row = await db.query(
      "SELECT state FROM characters WHERE id=$1 AND account_id=$2 FOR UPDATE",
      [characterId, accountId],
    );
    if (!row.rows[0]) fail("NOT_OWNER");
    const s = row.rows[0].state as CharacterState;
    const map = catalog.maps.find((m) => m.id === plan.map);
    if (!map || map.minLevel > s.level) fail("ZONE_LOCKED");
    if (plan.quest && catalog.quests.find((q) => q.id === plan.quest)?.hidden)
      fail("OFFLINE_HIDDEN_FORBIDDEN");
    const a = await db.query(
      "SELECT epoch,mode FROM activity WHERE account_id=$1 FOR UPDATE",
      [accountId],
    );
    if (Number(a.rows[0]?.epoch) !== epoch || a.rows[0]?.mode !== "online")
      fail("STALE_EPOCH");
    const id = randomUUID();
    await db.query(
      "DELETE FROM offline_jobs WHERE character_id=$1 AND settled=true",
      [characterId],
    );
    await db.query(
      "INSERT INTO offline_jobs(id,character_id,epoch,started_at,plan) VALUES($1,$2,$3,now(),$4)",
      [id, characterId, epoch + 1, plan],
    );
    await db.query(
      "UPDATE activity SET mode='offline',epoch=epoch+1,expires_at=now()+interval '8 hours' WHERE account_id=$1",
      [accountId],
    );
    return { id };
  });
}
export async function settleOffline(accountId: string, characterId: string) {
  return transaction(async (db) => {
    await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [accountId]);
    const r = await db.query(
      "SELECT state FROM characters WHERE id=$1 AND account_id=$2 FOR UPDATE",
      [characterId, accountId],
    );
    if (!r.rows[0]) fail("NOT_OWNER");
    const q = await db.query(
      "SELECT *,now() AS server_now FROM offline_jobs WHERE character_id=$1 FOR UPDATE",
      [characterId],
    );
    const job = q.rows[0];
    if (!job) return null;
    if (job.settled) return job.report;
    const state = r.rows[0].state as CharacterState;
    const before = {
      coins: state.coins,
      spirit: state.spirit,
      assets: assetSnapshot(state),
    };
    state.claims = state.claims.filter(
      (i) => !i.claimExpiresAt || i.claimExpiresAt > Date.now(),
    );
    const computed = await computeOffline(
      state,
      new Date(job.server_now).getTime() - new Date(job.started_at).getTime(),
      job.plan,
      job.id,
    );
    Object.assign(state, computed.state);
    const report = computed.report;
    state.offlineReport = report;
    await writeState(db, state);
    await db.query(
      "UPDATE offline_jobs SET settled=true,ended_at=now(),report=$2 WHERE id=$1",
      [job.id, report],
    );
    await db.query(
      "UPDATE activity SET mode='idle',epoch=epoch+1,expires_at=now() WHERE account_id=$1",
      [accountId],
    );
    await db.query(
      "INSERT INTO operations(actor,type,request_id,payload_hash,result) VALUES($1,'offline',$2,$3,$4)",
      [characterId, job.id, job.id, report],
    );
    await writeLedger(db, state, before, "offline", job.id);
    await db.query(
      "INSERT INTO outbox(actor,type,payload) VALUES($1,'offline',$2)",
      [characterId, report],
    );
    return report;
  });
}
