import { catalog } from "../../../packages/content/src/index.js";
import { randomUUID } from "node:crypto";
import {
  type CharacterState,
  type Item,
  writeState,
  writeLedger,
  assetSnapshot,
  hash,
} from "../../../packages/database/src/index.js";
import type pg from "pg";
import { type World } from "./world.js";
import { fail } from "./gameplay.js";
export interface Trade {
  id: string;
  a: string;
  b: string;
  revision: number;
  offers: Record<
    string,
    { item: string | null; coins: string; snapshot: Item | null }
  >;
  confirmed: Set<string>;
  locked: boolean;
  expires: number;
}
export class Social {
  parties = new Map<
    string,
    { leader: string; members: Set<string>; invites: Set<string> }
  >();
  trades = new Map<string, Trade>();
  blocks = new Map<string, Set<string>>();
  muted = new Set<string>();
  block(actor: string, target: string, enabled = true) {
    const blocked = this.blocks.get(actor) ?? new Set<string>();
    if (enabled) {
      if (blocked.size >= 100) fail("BLOCK_LIMIT");
      blocked.add(target);
    } else blocked.delete(target);
    this.blocks.set(actor, blocked);
  }
  canReceive(actor: string, sender: string) {
    return !this.muted.has(actor) && !this.blocks.get(actor)?.has(sender);
  }
  history: {
    actor: string;
    name: string;
    text: string;
    channel: string;
    party: string | null;
  }[] = [];
  constructor(readonly world: World) {}
  party(actor: string, target: string | undefined, value: string | undefined) {
    const p = this.world.players.get(actor);
    if (!p) {
      if (value === "leave") return;
      fail("PLAYER_NOT_FOUND");
    }
    if (value === "leave") {
      const group = p.party ? this.parties.get(p.party) : null;
      if (group) {
        group.members.delete(actor);
        if (group.leader === actor) group.leader = [...group.members][0] ?? "";
        if (!group.members.size) this.parties.delete(p.party!);
      }
      p.party = null;
      return;
    }
    if (value === "accept") {
      const group = this.parties.get(target ?? "");
      if (!group?.invites.has(actor)) fail("NO_INVITATION");
      if (group.members.size >= 4 || p.party) fail("PARTY_FULL");
      group.members.add(actor);
      group.invites.delete(actor);
      p.party = target!;
      return;
    }
    if (!target || !this.world.players.has(target) || target === actor)
      fail("PLAYER_NOT_FOUND");
    if (!p.party) {
      p.party = randomUUID();
      this.parties.set(p.party, {
        leader: actor,
        members: new Set([actor]),
        invites: new Set(),
      });
    }
    const group = this.parties.get(p.party)!;
    if (group.leader !== actor || group.members.size >= 4)
      fail("PARTY_PERMISSION");
    group.invites.add(target);
    return { invited: target, party: p.party };
  }
  instance(actor: string) {
    const p = this.world.players.get(actor)!;
    const id = `${p.party ? "party:" + p.party : "personal:" + actor}:realm-${p.state.realm + 1}:${p.state.map}`;
    if (p.party && this.parties.get(p.party)?.leader !== actor)
      fail("PARTY_PERMISSION");
    const members = p.party ? [...this.parties.get(p.party)!.members] : [actor];
    if (
      members.every((member) => this.world.players.get(member)?.instance === id)
    )
      return { id };
    if (
      members.some((member) => {
        const q = this.world.players.get(member);
        return !q?.connected || q.state.map !== p.state.map;
      })
    )
      fail("PARTY_NOT_READY");
    if (
      members.some(
        (member) =>
          (this.world.players.get(member)?.combatUntil ?? Infinity) >
          this.world.tick,
      )
    )
      fail("IN_COMBAT");
    for (const member of members) {
      const q = this.world.players.get(member);
      if (q) {
        q.instance = id;
        q.state.auto = false;
        q.motion.x = 500;
      }
    }
    if (!this.world.monsters.some((m) => m.instance === id))
      for (let i = 0; i < 6; i++) {
        const monster = this.world.makeMonster(p.state.map, id, i);
        const realm = catalog.realms[p.state.realm + 1];
        if (realm) {
          monster.level = Math.max(monster.level, realm.minLevel);
          monster.hp = monster.maxHp =
            BigInt(100 + monster.level * 35) * (monster.boss ? 12n : 1n);
          monster.trialRealm = p.state.realm + 1;
        }
        this.world.monsters.push(monster);
      }
    return { id };
  }
  trade(actor: string, target: string | undefined, value: string | undefined) {
    if (value === "invite") {
      if (!target || !this.world.players.has(target) || target === actor)
        fail("PLAYER_NOT_FOUND");
      const a = this.world.players.get(actor)!,
        b = this.world.players.get(target)!;
      if (
        a.state.map !== b.state.map ||
        a.instance !== b.instance ||
        Math.abs(a.motion.x - b.motion.x) > 150
      )
        fail("TRADE_TOO_FAR");
      if (
        [...this.trades.values()].some(
          (t) => [t.a, t.b].includes(actor) || [t.a, t.b].includes(target),
        )
      )
        fail("TRADE_BUSY");
      const t: Trade = {
        id: randomUUID(),
        a: actor,
        b: target,
        revision: 0,
        offers: {
          [actor]: { item: null, coins: "0", snapshot: null },
          [target]: { item: null, coins: "0", snapshot: null },
        },
        confirmed: new Set(),
        locked: false,
        expires: Date.now() + 300000,
      };
      this.trades.set(t.id, t);
      return { id: t.id };
    }
    const trade = this.trades.get(target ?? "");
    if (!trade || ![trade.a, trade.b].includes(actor)) fail("TRADE_NOT_FOUND");
    if (trade.locked) fail("TRADE_COMMITTING");
    if (trade.expires <= Date.now()) {
      this.trades.delete(trade.id);
      fail("TRADE_EXPIRED");
    }
    if (value === "cancel") {
      this.trades.delete(trade.id);
      return;
    }
    if (value?.startsWith("offer:")) {
      const item = value.slice(6);
      const snapshot = item
        ? this.world.players
            .get(actor)
            ?.state.inventory.find((i) => i.id === item)
        : null;
      if (item && !snapshot) fail("ITEM_NOT_FOUND");
      trade.offers[actor] = {
        item: item || null,
        coins: "0",
        snapshot: snapshot ? structuredClone(snapshot) : null,
      };
      trade.revision++;
      trade.confirmed.clear();
    } else if (value?.startsWith("confirm:")) {
      if (value !== `confirm:${trade.revision}`) fail("TRADE_CHANGED");
      for (const key of [trade.a, trade.b])
        this.validateOfferedItem(
          trade,
          key,
          this.world.players
            .get(key)
            ?.state.inventory.find((i) => i.id === trade.offers[key]?.item),
        );
      trade.confirmed.add(actor);
    }
    return { trade, ready: trade.confirmed.size === 2 };
  }
  validateOfferedItem(t: Trade, actor: string, current?: Item) {
    const offered = t.offers[actor];
    if (!offered?.item) return;
    const canonical = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, canonical(v)]),
            )
          : value;
    if (
      !current ||
      hash(JSON.stringify(canonical(current))) !==
        hash(JSON.stringify(canonical(offered.snapshot)))
    )
      fail("TRADE_CHANGED");
  }
  async exchange(actor: CharacterState, db: pg.PoolClient, t: Trade) {
    if (t.confirmed.size !== 2 || !t.locked || this.trades.get(t.id) !== t)
      fail("TRADE_UNCONFIRMED");
    const revision = t.revision,
      offers = structuredClone(t.offers);
    const otherId = t.a === actor.id ? t.b : t.a;
    const owner = await db.query(
      "SELECT account_id FROM characters WHERE id=$1",
      [otherId],
    );
    if (!owner.rows[0]) fail("PLAYER_NOT_FOUND");
    await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE NOWAIT', [
      owner.rows[0].account_id,
    ]);
    const other = await db.query(
      "SELECT state FROM characters WHERE id=$1 FOR UPDATE NOWAIT",
      [otherId],
    );
    if (t.revision !== revision || !t.locked || this.trades.get(t.id) !== t)
      fail("TRADE_CHANGED");
    const state = other.rows[0]?.state as CharacterState;
    const before = state
      ? {
          coins: state.coins,
          spirit: state.spirit,
          assets: assetSnapshot(state),
        }
      : null;
    if (!state) fail("PLAYER_NOT_FOUND");
    const p = this.world.players.get(actor.id),
      q = this.world.players.get(otherId);
    if (
      !p ||
      !q ||
      !q.connected ||
      p.state.map !== q.state.map ||
      p.instance !== q.instance ||
      Math.abs(p.motion.x - q.motion.x) > 150
    )
      fail("TRADE_TOO_FAR");
    const lease = await db.query(
      "SELECT epoch,mode,expires_at FROM activity WHERE account_id=$1 AND character_id=$2 FOR UPDATE NOWAIT",
      [state.accountId, otherId],
    );
    if (
      Number(lease.rows[0]?.epoch) !== q.epoch ||
      lease.rows[0]?.mode !== "online" ||
      new Date(lease.rows[0].expires_at) < new Date()
    )
      fail("STALE_EPOCH");
    this.validateOfferedItem(
      t,
      actor.id,
      actor.inventory.find((i) => i.id === offers[actor.id]!.item),
    );
    this.validateOfferedItem(
      t,
      otherId,
      state.inventory.find((i) => i.id === offers[otherId]!.item),
    );
    const own = offers[actor.id]!.item,
      foreign = offers[otherId]!.item;
    const a = own ? actor.inventory.find((i) => i.id === own) : null,
      b = foreign ? state.inventory.find((i) => i.id === foreign) : null;
    if ((own && !a) || (foreign && !b)) fail("TRADE_ITEM_UNAVAILABLE");
    if (
      actor.inventory.length - (a ? 1 : 0) + (b ? 1 : 0) > 40 ||
      state.inventory.length - (b ? 1 : 0) + (a ? 1 : 0) > 40
    )
      fail("BAG_FULL");
    actor.inventory = actor.inventory.filter((i) => i.id !== own);
    state.inventory = state.inventory.filter((i) => i.id !== foreign);
    if (b) actor.inventory.push(b);
    if (a) state.inventory.push(a);
    await writeState(db, state);
    await writeLedger(db, state, before!, "trade-receive", t.id);
    await db.query(
      "INSERT INTO operations(actor,type,request_id,payload_hash,result) VALUES($1,'trade-receive',$2,$3,$4)",
      [
        state.id,
        t.id,
        hash(t.id),
        { trade: t.id, received: a?.id ?? null, sent: b?.id ?? null },
      ],
    );
    await db.query(
      "INSERT INTO outbox(actor,type,payload) VALUES($1,'trade-receive',$2)",
      [state.id, { trade: t.id }],
    );
    return { trade: t.id, other: otherId };
  }
  chat(actor: string, text: string, channel = "map") {
    const p = this.world.players.get(actor)!;
    if (!["map", "party"].includes(channel)) fail("INVALID_CHANNEL");
    if (text.length > 200 || !text.trim()) fail("INVALID_CHAT");
    if (channel === "party" && !p.party) fail("NOT_IN_PARTY");
    const event = { actor, name: p.state.name, text, channel, party: p.party };
    this.history.push(event);
    if (this.history.length > 100) this.history.shift();
    return event;
  }
}
