import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { performance } from "node:perf_hooks";
import { randomInt, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import { clientIP } from "./client-ip.js";
import {
  pool,
  migrate,
  createCharacter,
  listCharacters,
  readCharacter,
  issueTicket,
  consumeTicket,
  executeOperation,
  deleteCharacter,
  type CharacterState,
} from "../../../packages/database/src/index.js";
import { catalog } from "../../../packages/content/src/index.js";
import {
  parseClientMessage,
  encodeServerMessage,
  type ClientMessage,
} from "../../../packages/protocol/src/index.js";
import { World } from "./world.js";
import { Social } from "./social.js";
import { CraftTiming } from "./craft-timing.js";
const craftTiming = new CraftTiming();
const elements = [
  "none",
  "metal",
  "wood",
  "water",
  "fire",
  "earth",
  "wind",
  "lightning",
  "ice",
  "light",
  "dark",
];
import {
  stats,
  gameplayDiagnostics,
  addItem,
  spend,
  consume,
  killRewards,
  changeBranch,
  learnSkill,
  awaken,
  chooseSystem,
  claimQuest,
  discoverQuest,
  solveHidden,
  craft,
  enhance,
  transferEnhance,
  equip,
  unequip,
  usePotion,
  upgradeQuality,
  breakthrough,
  systemClaim,
  bonus,
  fail,
} from "./gameplay.js";
import { startOffline, settleOffline } from "./offline.js";
import {
  listMarket,
  buyMarket,
  claimExpired,
  expireMarkets,
} from "./market.js";
import { clampU64 } from "../../../packages/simulation/src/index.js";
await migrate();
const world = new World(),
  social = new Social(world),
  sockets = new Map<string, WebSocket>(),
  queues = new Map<string, Promise<unknown>>(),
  queueDepth = new Map<string, number>();
const origins = new Set(
  (process.env.WEB_ORIGIN ?? "http://localhost:5173").split(","),
);
const budgets = new Map<string, { since: number; n: number }>();
function budget(key: string, limit: number, period = 1000) {
  const now = Date.now();
  const b = budgets.get(key);
  if (!b || now - b.since >= period) {
    budgets.set(key, { since: now, n: 1 });
    return true;
  }
  return ++b.n <= limit;
}
const send = (socket: WebSocket, data: unknown) => {
  if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 1048576) {
    const encoded = encodeServerMessage(data);
    metrics.bytesSent += Buffer.byteLength(encoded);
    socket.send(encoded);
  }
};
const sendState = (id: string) => {
  const p = world.players.get(id);
  if (p && sockets.has(id)) send(sockets.get(id)!, world.snapshot(id));
};
async function session(req: IncomingMessage) {
  const s = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!s) fail("UNAUTHORIZED");
  return s.user.id;
}
async function body(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16384) fail("PAYLOAD_TOO_LARGE");
  }
  return raw ? JSON.parse(raw) : {};
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(encodeServerMessage(value));
}
const authHandler = toNodeHandler(auth);
let draining = false;
const metrics = {
    ticks: 0,
    maxTickMs: 0,
    commands: 0,
    errors: 0,
    bytesSent: 0,
  },
  tickSamples: number[] = [];
function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
  );
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://server");
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(origin && origins.has(origin) ? 204 : 403);
      res.end();
      return;
    }
    if (req.method !== "GET" && origin && !origins.has(origin))
      fail("ORIGIN_DENIED");
    if (
      !budget(
        clientIP(req.socket.remoteAddress ?? "unknown", req.headers),
        120,
        60000,
      )
    )
      fail("RATE_LIMIT");
    if (url.pathname.startsWith("/api/auth/")) {
      req.headers["x-real-ip"] = clientIP(
        req.socket.remoteAddress ?? "unknown",
        req.headers,
      );
      await authHandler(req, res);
      return;
    }
    if (url.pathname === "/healthz") {
      json(res, 200, { ok: true, players: world.players.size });
      return;
    }
    if (url.pathname === "/metrics") {
      if (
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress ?? "",
        )
      )
        fail("UNAUTHORIZED");
      json(res, 200, {
        ...metrics,
        saturations: gameplayDiagnostics.saturations,
        tickMs: {
          p50: percentile(tickSamples, 0.5),
          p95: percentile(tickSamples, 0.95),
          p99: percentile(tickSamples, 0.99),
        },
        players: sockets.size,
        monsters: world.monsters.length,
        heapBytes: process.memoryUsage().heapUsed,
        db: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
        pendingCommands: [...queueDepth.values()].reduce((a, b) => a + b, 0),
      });
      return;
    }
    if (url.pathname === "/readyz") {
      await pool.query("SELECT 1");
      json(res, draining ? 503 : 200, { ok: !draining });
      return;
    }
    if (url.pathname === "/api/content") {
      json(res, 200, catalog);
      return;
    }
    const account = await session(req);
    if (url.pathname === "/api/characters" && req.method === "GET") {
      json(res, 200, await listCharacters(account));
      return;
    }
    if (url.pathname === "/api/characters" && req.method === "POST") {
      const data = await body(req);
      json(res, 201, await createCharacter(account, String(data.name ?? "")));
      return;
    }
    if (url.pathname === "/api/ticket" && req.method === "POST") {
      const data = await body(req);
      await settleOffline(account, String(data.characterId));
      const ticket = await issueTicket(account, String(data.characterId));
      json(res, 200, { ticket });
      return;
    }
    if (url.pathname === "/api/offline" && req.method === "POST") {
      const data = await body(req);
      json(res, 200, await settleOffline(account, String(data.characterId)));
      return;
    }
    if (url.pathname === "/api/characters" && req.method === "DELETE") {
      const data = await body(req);
      await deleteCharacter(account, String(data.characterId));
      json(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/api/market") {
      const q = await pool.query(
        "SELECT id,item,price,expires_at FROM market WHERE status='active' AND expires_at>now() ORDER BY expires_at LIMIT 200",
      );
      json(res, 200, q.rows);
      return;
    }
    json(res, 404, { error: "NOT_FOUND" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    json(res, message === "UNAUTHORIZED" ? 401 : 400, { error: message });
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
server.on("upgrade", (req, socket, head) => {
  if (draining || (req.headers.origin && !origins.has(req.headers.origin))) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});
function enqueue(id: string, work: () => Promise<unknown>) {
  queueDepth.set(id, (queueDepth.get(id) ?? 0) + 1);
  const prior = queues.get(id) ?? Promise.resolve();
  const next = prior
    .catch(() => {})
    .then(work)
    .catch((e) => {
      metrics.errors++;
      const socket = sockets.get(id);
      if (socket)
        send(socket, {
          type: "error",
          error: e instanceof Error ? e.message : "UNKNOWN",
        });
    });
  queues.set(id, next);
  void next.finally(() => {
    const depth = (queueDepth.get(id) ?? 1) - 1;
    if (depth) queueDepth.set(id, depth);
    else queueDepth.delete(id);
    if (queues.get(id) === next) queues.delete(id);
  });
  return next;
}
world.onKill = (id, monster, killId) => {
  const recipients = world.lootRecipients(id, monster),
    divisor = monster.boss ? 1 : Math.max(1, recipients.length);
  for (const p of recipients) {
    const actor = p.state.id,
      epoch = p.epoch,
      auto = p.state.auto,
      privateChallenge = p.instance !== "public",
      cultivationBonus = world.formationBonus(p, "cultivation"),
      boss = monster.boss,
      level = monster.level,
      trialRealm = monster.trialRealm;
    void enqueue(actor, async () => {
      await executeOperation(
        actor,
        epoch,
        "kill",
        killId,
        { monster: monster.id },
        (s) => {
          killRewards(
            s,
            level,
            false,
            auto,
            privateChallenge,
            boss && privateChallenge ? trialRealm : undefined,
            divisor,
            cultivationBonus,
          );
          if (boss) {
            const recipes = catalog.recipes.filter(
              (r) =>
                r.kind === "forge" &&
                r.requiredLevel > 100 &&
                r.requiredLevel <= s.level + 50,
            );
            if (recipes.length)
              addItem(
                s,
                "recipe:" + recipes[randomInt(recipes.length)]!.id,
                1,
                {},
                true,
              );
            addItem(s, "spirit-stone", 3, {}, true);
            s.spirit = clampU64(BigInt(s.spirit) + 5n).toString();
            addItem(s, "element-stone", 1, {}, true);
            if (randomInt(5) === 0) addItem(s, "branch-token", 1, {}, true);
          }
          const gear = catalog.gear.filter(
            (g) =>
              g.level <= s.level &&
              (!g.branch || g.branch === s.branch) &&
              g.level >= Math.max(1, s.level - 30),
          );
          if (gear.length && (boss || randomInt(20) === 0)) {
            const g = gear[randomInt(gear.length)]!;
            addItem(
              s,
              g.id,
              1,
              {
                slot: g.slot,
                branch: g.branch ?? undefined,
                level: g.level,
                quality: boss ? 1 : 0,
                enhance: 0,
                element: catalog.maps.find((m) => m.id === s.map)?.element,
              },
              true,
            );
          }
          return { kill: killId };
        },
      );
      world.mergeAssets(actor, await readCharacter(actor));
      sendState(actor);
    });
  }
};

world.onAutoClaim = (id, quest) => {
  const p = world.players.get(id);
  if (!p) return;
  void enqueue(id, async () => {
    await executeOperation(
      id,
      p.epoch,
      "quest",
      randomUUID(),
      { quest },
      (s) => {
        if (p.motion.x > 500) fail("NPC_TOO_FAR");
        claimQuest(s, quest);
        return { ok: true };
      },
    );
    world.mergeAssets(id, await readCharacter(id));
  });
};
world.onAutoPotion = (id, template) => {
  const p = world.players.get(id);
  if (!p) return;
  void enqueue(id, async () => {
    let dh = 0n,
      dm = 0n;
    await executeOperation(
      id,
      p.epoch,
      "auto-potion",
      randomUUID(),
      { template },
      (s) => {
        world.captureVitals(id, s);
        s.hp = p.state.hp;
        s.mp = p.state.mp;
        const h = BigInt(s.hp),
          m = BigInt(s.mp);
        usePotion(s, template);
        dh = BigInt(s.hp) - h;
        dm = BigInt(s.mp) - m;
        return { ok: true };
      },
    );
    world.mergeAssets(id, await readCharacter(id), dh, dm);
  });
};

function publishTrade(id: string, closed?: string) {
  const t = social.trades.get(id);
  if (!t) return;
  for (const actor of [t.a, t.b]) {
    const ws = sockets.get(actor);
    if (ws)
      send(ws, {
        type: "trade",
        id,
        revision: t.revision,
        closed,
        offers: [t.a, t.b].map((key) => ({
          name: world.players.get(key)?.state.name ?? "Người chơi",
          item: t.offers[key]?.snapshot ?? null,
          confirmed: t.confirmed.has(key),
          self: key === actor,
        })),
      });
  }
}
async function action(
  id: string,
  message: Extract<ClientMessage, { type: "action" }>,
) {
  const p = world.players.get(id);
  if (!p) return;
  if ((queueDepth.get(id) ?? 0) >= 32) fail("COMMAND_QUEUE_FULL");
  metrics.commands++;
  const commandEpoch = p.epoch;
  const { action, target, value, requestId } = message;
  if (action === "craft" && value?.startsWith("manual:")) {
    const element = value.slice(7),
      r = catalog.recipes.find((r) => r.id === target);
    if (
      !elements.includes(element) ||
      !r ||
      r.requiredLevel > p.state.level ||
      (r.branch && r.branch !== p.state.branch)
    )
      fail("RECIPE_REQUIREMENT");
    if (p.state.auto || p.motion.x >= 500 || p.combatUntil > world.tick)
      fail("NPC_TOO_FAR");
    const c = craftTiming.begin(id, r.id, element);
    send(sockets.get(id)!, {
      type: "craft-challenge",
      token: c.token,
      recipe: r.id,
      name: r.name,
      targetMs: 2000,
      windowMs: 300,
    });
    return;
  }
  if (action === "attack" || action === "cast") {
    world.attack(id, target, action === "cast" ? value : undefined);
    return;
  }
  if (action === "chat") {
    if (!budget(`${id}:chat`, 5, 10000)) fail("CHAT_RATE_LIMIT");
    if (target === "mute") {
      if (value === "on") social.muted.add(id);
      else social.muted.delete(id);
      return;
    }
    if (target?.startsWith("block:") || target?.startsWith("unblock:")) {
      const other = target.split(":")[1]!;
      if (!world.players.has(other)) fail("PLAYER_NOT_FOUND");
      social.block(id, other, target.startsWith("block:"));
      return;
    }
    if (target?.startsWith("report:")) {
      const other = target.slice(7);
      if (!world.players.has(other) || other === id) fail("PLAYER_NOT_FOUND");
      await enqueue(id, () =>
        executeOperation(
          id,
          p.epoch,
          "chat-report",
          requestId,
          { target: other },
          async (s, db) => {
            await db.query(
              "INSERT INTO reports(id,reporter,target,evidence) VALUES($1,$2,$3,$4)",
              [
                requestId,
                id,
                other,
                social.history.filter((e) => e.actor === other).slice(-20),
              ],
            );
            return { reported: true };
          },
        ),
      );
      send(sockets.get(id)!, {
        type: "notice",
        text: "Đã lưu báo cáo để quản trị viên kiểm tra.",
      });
      return;
    }
    const event = social.chat(id, value ?? "", target ?? "map");
    for (const [key, ws] of sockets) {
      const q = world.players.get(key);
      if (
        q &&
        social.canReceive(key, id) &&
        (event.channel === "party"
          ? q.party === event.party
          : q.state.map === p.state.map && q.instance === p.instance)
      )
        send(ws, { type: "chat", ...event });
    }
    return;
  }
  if (action === "party") {
    const result = social.party(id, target, value);
    if (result?.invited && sockets.has(result.invited))
      send(sockets.get(result.invited)!, {
        type: "invite",
        from: p.state.name,
        party: result.party,
      });
    return;
  }
  if (action === "instance") {
    social.instance(id);
    return;
  }
  if (action === "trade") {
    if (value === "cancel" && target) publishTrade(target, "Giao dịch đã hủy.");
    const result = social.trade(id, target, value);
    if (result?.id) {
      publishTrade(result.id);
      return;
    }
    if (result?.trade) publishTrade(result.trade.id);
    if (result?.ready && result.trade) {
      const t = result.trade;
      t.locked = true;
      try {
        await executeOperation(
          id,
          p.epoch,
          "trade",
          t.id,
          { revision: t.revision },
          (s, db) => social.exchange(s, db, t),
        );
        publishTrade(t.id, "Đã hoàn tất giao dịch.");
        social.trades.delete(t.id);
        world.mergeAssets(t.a, await readCharacter(t.a));
        world.mergeAssets(t.b, await readCharacter(t.b));
      } finally {
        t.locked = false;
      }
    }
    return;
  }
  if (action === "offline") {
    if (p.combatUntil > world.tick) fail("IN_COMBAT");
    await enqueue(id, async () => {
      await executeOperation(
        id,
        p.epoch,
        "checkpoint",
        randomUUID(),
        {},
        (s) => {
          world.captureVitals(id, s);
          s.hp = p.state.hp;
          s.mp = p.state.mp;
          s.map = p.state.map;
          s.cooldownUntil = p.state.cooldownUntil;
          s.x = p.motion.x;
          return { ok: true };
        },
      );
      await startOffline(p.state.accountId, id, p.epoch, {
        map: target ?? p.state.map,
        quest: value,
      });
      sockets.get(id)?.close(1000, "offline");
      world.players.delete(id);
    });
    return;
  }
  await enqueue(id, async () => {
    const live = world.players.get(id);
    if (!live) return;
    if (live.epoch !== commandEpoch) fail("STALE_EPOCH");
    let deltaHp = 0n,
      deltaMp = 0n,
      travel = false,
      auto: boolean | undefined,
      newBoard: typeof live.board | undefined,
      craftComplete = false,
      craftMessage: string | undefined,
      potionReady: number | undefined;
    await executeOperation(
      id,
      live.epoch,
      action,
      requestId,
      { target, value },
      async (s, db) => {
        const beforeHp = BigInt(live.state.hp),
          beforeMp = BigInt(live.state.mp);
        world.captureVitals(id, s);
        s.hp = live.state.hp;
        s.mp = live.state.mp;
        s.auto = live.state.auto;
        s.cooldownUntil = live.state.cooldownUntil;
        s.map = live.state.map;
        s.x = live.motion.x;
        s.y = live.motion.y;
        const nearNpc = s.x < 500;
        if (
          [
            "branch",
            "craft",
            "enhance",
            "quality",
            "element",
            "breakthrough",
          ].includes(action) &&
          live.combatUntil > world.tick
        )
          fail("IN_COMBAT");
        switch (action) {
          case "auto":
            if (value?.startsWith("threshold:")) {
              const threshold = Number(value.slice(10));
              if (
                !Number.isInteger(threshold) ||
                threshold < 1 ||
                threshold > 99
              )
                fail("INVALID_THRESHOLD");
              s.potionThreshold = threshold;
            } else s.auto = value === "on";
            auto = s.auto;
            break;
          case "branch":
            if (!nearNpc) fail("NPC_TOO_FAR");
            changeBranch(s, value ?? "");
            break;
          case "learn":
            if (value === "recipe") {
              const item = s.inventory.find((i) => i.id === target),
                recipe = catalog.recipes.find(
                  (r) => item?.template === "recipe:" + r.id,
                );
              if (!item || !recipe) fail("RECIPE_REQUIREMENT");
              s.knownRecipes ??= [];
              if (s.knownRecipes.includes(recipe.id)) fail("ALREADY_LEARNED");
              consume(s, item.template, 1);
              s.knownRecipes.push(recipe.id);
              break;
            }
            if (value?.startsWith("slot:")) {
              const slot = Number(value.slice(5));
              if (
                !Number.isInteger(slot) ||
                slot < 0 ||
                slot > 3 ||
                !target ||
                !s.skills.includes(target) ||
                !catalog.allSkills.some(
                  (k) => k.id === target && k.branch === s.branch,
                )
              )
                fail("LOADOUT_INVALID");
              s.loadout = Array.from({ length: 4 }, (_, i) =>
                s.loadout[i] === target ? "" : (s.loadout[i] ?? ""),
              );
              s.loadout[slot] = target;
            } else if (
              value?.endsWith("-attack") ||
              value?.endsWith("-defense")
            ) {
              if (s.level < 20 || !s.branch || !value.startsWith(s.branch))
                fail("MANUAL_REQUIREMENT");
              consume(s, "skill-manual", 1);
              if (!s.passives.includes(value)) s.passives.push(value);
            } else learnSkill(s, value ?? "");
            break;
          case "equip":
            if (value === "unequip") unequip(s, target ?? "");
            else equip(s, target ?? "");
            break;
          case "potion":
            if ((live.cooldowns.get("potion") ?? 0) > world.tick)
              fail("POTION_COOLDOWN");
            usePotion(s, target ?? "pill-0");
            potionReady = world.tick + 100;
            s.cooldownUntil = { ...s.cooldownUntil, potion: Date.now() + 5000 };
            break;
          case "awaken":
            if (!nearNpc || s.map !== "map-3") fail("RITUAL_LOCATION");
            awaken(s, () => randomInt(1000000) / 1000000);
            break;
          case "system":
            if (value === "claim") systemClaim(s);
            else if (value === "checkin") {
              if (s.system !== "system-0") fail("NO_SYSTEM");
              const day = new Date().toISOString().slice(0, 10);
              if (s.lastCheckin === day) fail("ALREADY_CHECKED_IN");
              s.lastCheckin = day;
              s.systemProgress++;
            } else chooseSystem(s, target ?? "");
            break;
          case "quest":
            if (!nearNpc) fail("NPC_TOO_FAR");
            claimQuest(s, target ?? "");
            break;
          case "craft":
            if (!nearNpc) fail("NPC_TOO_FAR");
            if (value?.startsWith("finish:")) {
              if (s.auto) fail("CRAFT_EXPIRED");
              const assessed = craftTiming.assess(
                id,
                target ?? "",
                value.slice(7),
              );
              craft(s, target ?? "", assessed.manual, assessed.element);
              craftComplete = true;
              craftMessage = assessed.manual
                ? "Đúng thời điểm! Thành phẩm được cải thiện."
                : "Chưa đúng thời điểm; nhận thành phẩm tiêu chuẩn.";
            } else {
              const element = value?.startsWith("element:")
                ? value.slice(8)
                : "none";
              if (!elements.includes(element)) fail("INVALID_ELEMENT");
              craft(s, target ?? "", false, element);
            }
            break;
          case "enhance":
            if (!nearNpc) fail("NPC_TOO_FAR");
            if (value?.startsWith("transfer:"))
              transferEnhance(s, target ?? "", value.slice(9));
            else enhance(s, target ?? "");
            break;
          case "quality":
            if (!nearNpc) fail("NPC_TOO_FAR");
            upgradeQuality(s, target ?? "");
            break;
          case "element": {
            if (!nearNpc) fail("NPC_TOO_FAR");
            const item =
              s.inventory.find((i) => i.id === target) ??
              Object.values(s.equipment).find((i) => i.id === target);
            if (!item) fail("ITEM_NOT_FOUND");
            if (
              ![
                "none",
                "metal",
                "wood",
                "water",
                "fire",
                "earth",
                "wind",
                "lightning",
                "ice",
                "light",
                "dark",
              ].includes(value ?? "")
            )
              fail("INVALID_ELEMENT");
            consume(s, "element-stone", 1);
            item.element = value;
            break;
          }
          case "pet":
            if (value === "buy") {
              const pet = catalog.pets.find((p) => p.id === target);
              if (!pet || !nearNpc) fail("PET_REQUIREMENT");
              spend(s, BigInt(pet.price));
              addItem(s, "pet-contract", 1, {
                petData: { species: pet.id, level: 1, exp: "0" },
              });
            } else if (value === "activate") {
              const contract = s.inventory.find(
                (i) => i.id === target && i.petData,
              );
              if (!contract) fail("CONTRACT_REQUIRED");
              s.inventory = s.inventory.filter((i) => i.id !== contract.id);
              s.pets.push(contract);
              s.activePet = contract.id;
              s.bondedSpecies ??= [];
              if (
                contract.petData &&
                !s.bondedSpecies.includes(contract.petData.species)
              ) {
                s.bondedSpecies.push(contract.petData.species);
                if (s.system === "system-6") s.systemProgress++;
              }
            } else if (value === "withdraw") {
              const pet = s.pets.find((i) => i.id === target);
              if (!pet || s.inventory.length >= 40) fail("PET_REQUIREMENT");
              s.pets = s.pets.filter((i) => i.id !== pet.id);
              s.inventory.push(pet);
              if (s.activePet === pet.id) s.activePet = null;
            } else {
              s.activePet = s.pets.some((p) => p.id === target)
                ? target!
                : null;
            }
            break;
          case "board": {
            const b = catalog.boards.find((b) => b.id === target);
            if (!b) fail("BOARD_NOT_FOUND");
            consume(s, b.id, 1);
            s.placedBoard = {
              id: b.id,
              x: live.motion.x,
              map: s.map,
              instance: live.instance,
              expires: Date.now() + b.duration * 50,
            };
            newBoard = {
              id: b.id,
              expires: world.tick + b.duration,
              x: live.motion.x,
            };
            break;
          }
          case "market-list":
            return listMarket(s, db, target ?? "", value ?? "");
          case "market-buy":
            return buyMarket(s, db, target ?? "");
          case "market-claim":
            return claimExpired(s, db);
          case "breakthrough":
            if (!nearNpc) fail("NPC_TOO_FAR");
            breakthrough(s);
            break;
          case "interact":
            if (value === "travel") {
              if (!nearNpc && s.x < 2300) fail("GATE_TOO_FAR");
              const map = catalog.maps.find((m) => m.id === target);
              if (!map || map.minLevel > s.level) fail("ZONE_LOCKED");
              s.map = map.id;
              s.x = 320;
              s.y = 420;
              travel = true;
              const quest = catalog.quests.find(
                (q) => !q.hidden && q.map === map.id,
              );
              if (quest)
                s.quests[quest.id] ??= {
                  progress: 0,
                  claimed: false,
                  discovered: true,
                };
            } else if (value?.startsWith("solve:")) {
              solveHidden(s, target ?? "", value.slice(6));
            } else if (value === "discover") {
              discoverQuest(s, target ?? "");
            } else if (value === "buy") {
              if (!nearNpc) fail("NPC_TOO_FAR");
              const gear = catalog.gear.find((g) => g.id === target && g.npc);
              if (gear) {
                if (gear.branch && gear.branch !== s.branch)
                  fail("BRANCH_REQUIREMENT");
                spend(s, BigInt(gear.price));
                addItem(s, gear.id, 1, {
                  quality: 0,
                  enhance: 0,
                  slot: gear.slot,
                  element: "none",
                  affixes: [],
                });
              } else {
                const allowed: { [key: string]: number } = {
                  "pill-0": 20,
                  "pill-1": 20,
                  herb: 5,
                  "skill-manual": 300,
                  "element-stone": 200,
                  "branch-token": 1000,
                  "breakthrough-pill": 200,
                };
                if (!target || !allowed[target]) fail("SHOP_ITEM_NOT_FOUND");
                spend(s, BigInt(allowed[target]));
                addItem(s, target, 1);
              }
            } else if (value === "sell") {
              if (!nearNpc) fail("NPC_TOO_FAR");
              const item = s.inventory.find((i) => i.id === target);
              if (!item) fail("ITEM_NOT_FOUND");
              s.inventory = s.inventory.filter((i) => i.id !== target);
              s.coins = clampU64(
                BigInt(s.coins) +
                  (BigInt(5 * item.quantity) *
                    BigInt(10000 + bonus(s, "trade"))) /
                    10000n,
              ).toString();
            } else if (value === "convert") {
              consume(s, "spirit-stone", 1);
              s.spirit = clampU64(BigInt(s.spirit) + 10n).toString();
            }
            break;
          default:
            fail("ACTION_UNSUPPORTED");
        }
        const st = stats(s);
        s.hp = (BigInt(s.hp) > st.maxHp ? st.maxHp : BigInt(s.hp)).toString();
        s.mp = (BigInt(s.mp) > st.maxMp ? st.maxMp : BigInt(s.mp)).toString();
        deltaHp = BigInt(s.hp) - beforeHp;
        deltaMp = BigInt(s.mp) - beforeMp;
        return { ok: true };
      },
    );
    if (potionReady !== undefined) {
      live.cooldowns.set("potion", potionReady);
      live.state.cooldownUntil.potion =
        Date.now() + (potionReady - world.tick) * 50;
    }
    if (newBoard) live.board = newBoard;
    if (craftComplete) {
      craftTiming.challenges.delete(id);
      if (craftMessage)
        send(sockets.get(id)!, { type: "notice", text: craftMessage });
    }
    world.mergeAssets(
      id,
      await readCharacter(id),
      deltaHp,
      deltaMp,
      travel,
      auto,
    );
    sendState(id);
  });
}
wss.on("connection", (socket, req) => {
  let identity: string | null = null,
    lastSeen = Date.now(),
    authenticating = false;
  const ip = clientIP(req.socket.remoteAddress ?? "unknown", req.headers);
  if (!budget(`ws:${ip}`, 30, 60000)) {
    socket.close(1008, "rate limit");
    return;
  }
  const helloTimeout = setTimeout(() => {
    if (!identity) socket.close(1008, "hello timeout");
  }, 5000);
  socket.on("pong", () => {
    lastSeen = Date.now();
  });
  socket.on("error", () => {});
  socket.on("message", (raw) => {
    lastSeen = Date.now();
    void (async () => {
      try {
        if (!budget(identity ?? `hello:${ip}`, 30)) fail("RATE_LIMIT");
        const message = parseClientMessage(raw.toString());
        if (!identity) {
          if (authenticating) fail("AUTHENTICATING");
          if (message.type !== "hello") fail("HELLO_REQUIRED");
          if (sockets.size >= Number(process.env.MAX_PLAYERS ?? 100))
            fail("WORLD_FULL");
          authenticating = true;
          const session = await consumeTicket(message.ticket);
          identity = session.characterId;
          clearTimeout(helloTimeout);
          const old = sockets.get(identity);
          old?.close(1000, "session takeover");
          sockets.set(identity, socket);
          world.add(await readCharacter(identity), session.epoch);
          sendState(identity);
          return;
        }
        const p = world.players.get(identity);
        if (!p || sockets.get(identity) !== socket) fail("STALE_EPOCH");
        if (message.type === "hello") fail("ALREADY_CONNECTED");
        if (message.type === "input") world.input(identity, message);
        else await action(identity, message);
      } catch (e) {
        send(socket, {
          type: "error",
          error: e instanceof Error ? e.message : "UNKNOWN",
        });
      }
    })();
  });
  socket.on("close", () => {
    clearTimeout(helloTimeout);
    if (identity && sockets.get(identity) === socket) {
      sockets.delete(identity);
      craftTiming.challenges.delete(identity);
      for (const t of social.trades.values())
        if ([t.a, t.b].includes(identity) && !t.locked) {
          publishTrade(t.id, "Giao dịch đã hủy vì mất kết nối.");
          social.trades.delete(t.id);
        }
      const id = identity,
        p = world.players.get(id);
      if (p) {
        p.input = { axis: 0, jump: false };
        p.connected = false;
        p.state.auto = false;
        void enqueue(id, async () => {
          await executeOperation(
            id,
            p.epoch,
            "checkpoint",
            randomUUID(),
            {},
            (s) => {
              world.captureVitals(id, s);
              s.hp = p.state.hp;
              s.mp = p.state.mp;
              s.x = p.motion.x;
              s.map = p.state.map;
              s.cooldownUntil = p.state.cooldownUntil;
              return { ok: true };
            },
          );
        });
        setTimeout(() => {
          if (!sockets.has(id) && world.players.get(id) === p) {
            social.party(id, undefined, "leave");
            world.players.delete(id);
            void pool.query(
              "UPDATE activity SET mode='idle',expires_at=now() WHERE character_id=$1 AND epoch=$2 AND mode='online'",
              [id, p.epoch],
            );
          }
        }, 60000).unref();
      }
    }
  });
  const heartbeat = setInterval(() => {
    if (Date.now() - lastSeen > 45000) {
      socket.terminate();
      clearInterval(heartbeat);
    } else if (socket.readyState === WebSocket.OPEN) socket.ping();
    else clearInterval(heartbeat);
  }, 15000);
  heartbeat.unref();
});
let previous = performance.now();
const timer = setInterval(() => {
  const now = performance.now();
  const count = Math.min(5, Math.floor((now - previous) / 50));
  if (count < 1) return;
  previous += count * 50;
  if (now - previous > 250) previous = now;
  const started = performance.now();
  for (let i = 0; i < count; i++) world.step();
  metrics.ticks += count;
  const tickMs = (performance.now() - started) / count;
  tickSamples.push(tickMs);
  if (tickSamples.length > 1200) tickSamples.shift();
  metrics.maxTickMs = Math.max(metrics.maxTickMs, tickMs);
  if (world.tick % 2 === 0) for (const id of sockets.keys()) sendState(id);
}, 10);
const renew = setInterval(() => {
  for (const [id, p] of world.players) {
    if (!sockets.has(id)) continue;
    void pool
      .query(
        "UPDATE activity SET expires_at=now()+interval '45 seconds' WHERE character_id=$1 AND epoch=$2 AND mode='online' RETURNING epoch",
        [id, p.epoch],
      )
      .then((result) => {
        if (!result.rows.length) {
          sockets.get(id)?.close(1008, "stale epoch");
          world.players.delete(id);
        }
      })
      .catch(() => {
        sockets.get(id)?.close(1011, "lease renewal failed");
        world.players.delete(id);
      });
  }
  for (const [id] of social.blocks)
    if (!world.players.has(id)) {
      social.blocks.delete(id);
      social.muted.delete(id);
    }
  for (const t of social.trades.values())
    if (t.expires <= Date.now() && !t.locked) {
      publishTrade(t.id, "Giao dịch hết thời gian.");
      social.trades.delete(t.id);
    }
  for (const [key, b] of budgets)
    if (Date.now() - b.since > 120000) budgets.delete(key);
}, 10000);
const checkpoint = setInterval(() => {
  for (const [id, p] of world.players)
    if (sockets.has(id))
      void enqueue(id, () =>
        executeOperation(id, p.epoch, "checkpoint", randomUUID(), {}, (s) => {
          world.captureVitals(id, s);
          s.hp = p.state.hp;
          s.mp = p.state.mp;
          s.map = p.state.map;
          s.cooldownUntil = p.state.cooldownUntil;
          s.x = p.motion.x;
          return { ok: true };
        }),
      );
}, 30000);
let maintenanceWork: Promise<void> | null = null;
const maintenance = setInterval(() => {
  if (maintenanceWork) return;
  maintenanceWork = (async () => {
    for (const actor of await expireMarkets())
      if (world.players.has(actor)) {
        world.mergeAssets(actor, await readCharacter(actor));
        sendState(actor);
      }
    const jobs = await pool.query(
      "SELECT c.account_id,j.character_id FROM offline_jobs j JOIN characters c ON c.id=j.character_id WHERE j.settled=false AND j.started_at<=now()-interval '8 hours' LIMIT 20",
    );
    for (const job of jobs.rows) {
      try {
        await settleOffline(job.account_id, job.character_id);
      } catch {
        metrics.errors++;
      }
    }
  })()
    .catch(() => {
      metrics.errors++;
    })
    .finally(() => {
      maintenanceWork = null;
    });
}, 60000);
maintenance.unref();
server.listen(Number(process.env.GAME_PORT ?? 3001), "0.0.0.0", () =>
  console.log("Tiên Lộ world listening on port", process.env.GAME_PORT ?? 3001),
);
async function shutdown() {
  if (draining) return;
  draining = true;
  clearInterval(timer);
  clearInterval(renew);
  clearInterval(checkpoint);
  clearInterval(maintenance);
  if (maintenanceWork) await maintenanceWork;
  for (const [id, p] of world.players)
    await enqueue(id, () =>
      executeOperation(id, p.epoch, "checkpoint", randomUUID(), {}, (s) => {
        world.captureVitals(id, s);
        s.hp = p.state.hp;
        s.mp = p.state.mp;
        s.x = p.motion.x;
        s.map = p.state.map;
        s.cooldownUntil = p.state.cooldownUntil;
        return { ok: true };
      }),
    );
  for (const socket of sockets.values()) socket.close(1001, "server drain");
  await Promise.allSettled([...queues.values()]);
  server.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
