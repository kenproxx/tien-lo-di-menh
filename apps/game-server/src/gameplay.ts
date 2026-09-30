import { randomUUID } from "node:crypto";
import {
  catalog,
  levelExp,
  rollAwakening,
  type Branch,
} from "../../../packages/content/src/index.js";
import {
  clampU64 as rawClamp,
  U64_MAX,
  adjustCost,
  type Element,
} from "../../../packages/simulation/src/index.js";
import type {
  CharacterState,
  Item,
} from "../../../packages/database/src/state.js";
export const gameplayDiagnostics = { saturations: 0 };
let lastSaturationLog = 0;
export function clampU64(value: bigint) {
  if (value > U64_MAX) {
    gameplayDiagnostics.saturations++;
    if (Date.now() - lastSaturationLog > 60000) {
      lastSaturationLog = Date.now();
      console.warn("UINT64_SATURATION", {
        count: gameplayDiagnostics.saturations,
      });
    }
  }
  return rawClamp(value);
}
export function fail(message: string): never {
  throw new Error(message);
}
export function bonus(s: CharacterState, key: string): number {
  const talent = catalog.talents.find((t) => t.id === s.talent);
  let amount =
    talent?.effects
      .filter((e) => e.stat === key)
      .reduce((sum, e) => sum + e.bps, 0) ?? 0;
  for (const buff of s.buffs ?? [])
    if (buff.stat === key && buff.expires > Date.now()) amount += buff.bps;
  for (const item of Object.values(s.equipment))
    for (const affix of item.affixes ?? [])
      if (affix.stat === key) amount += affix.bps;
  for (const p of s.passives) {
    if (p === `${s.branch}-attack` && key === "attack") amount += 500;
    if (p === `${s.branch}-defense` && key === "defense") amount += 500;
  }
  return amount;
}
export function boosted(s: CharacterState, value: bigint, key: string) {
  return clampU64((value * BigInt(10000 + bonus(s, key))) / 10000n);
}
export function stats(s: CharacterState) {
  let attack = 20n + BigInt(s.level) * 6n,
    defense = BigInt(s.level) * 2n,
    maxHp = 200n + BigInt(s.level) * 35n,
    maxMp = 100n + BigInt(s.level) * 8n;
  for (const item of Object.values(s.equipment)) {
    const g = catalog.gear.find((g) => g.id === item.template);
    if (g && (!g.branch || g.branch === s.branch)) {
      const scale = BigInt(
        (catalog.balance.qualityMultipliersBps[item.quality ?? 0] ?? 10000) +
          1000 * (item.enhance ?? 0),
      );
      attack += (BigInt(g.attack) * scale) / 10000n;
      defense += (BigInt(g.defense) * scale) / 10000n;
      maxHp += (BigInt(g.maxHp) * scale) / 10000n;
    }
  }
  const realm = BigInt(catalog.realms[s.realm]?.statBps ?? 10000);
  const pet = s.pets.find((p) => p.id === s.activePet);
  const species = catalog.pets.find((p) => p.id === pet?.petData?.species);
  if (species && pet?.petData?.hp !== "0")
    attack +=
      (attack *
        BigInt(
          species.attackBps +
            bonus(s, "pet") +
            100 * (pet?.petData?.level ?? 1),
        )) /
      10000n;
  return {
    attack: boosted(s, (attack * realm) / 10000n, "attack"),
    defense: boosted(s, (defense * realm) / 10000n, "defense"),
    maxHp: boosted(s, (maxHp * realm) / 10000n, "maxHp"),
    maxMp: boosted(s, (maxMp * realm) / 10000n, "maxMp"),
    crit: Math.min(10000, 500 + bonus(s, "crit")),
    lifesteal: bonus(s, "lifesteal"),
    reflection: bonus(s, "reflect"),
    weaponElement: (s.equipment.weapon?.element &&
    s.equipment.weapon.element !== "none"
      ? s.equipment.weapon.element
      : "physical") as Element,
    bodyElement: (s.equipment.body?.element ?? "none") as Element,
  };
}
export function addItem(
  s: CharacterState,
  template: string,
  quantity = 1,
  extra: Partial<Item> = {},
  claim = false,
) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) fail("INVALID_QUANTITY");
  const stack = s.inventory.find(
    (i) => i.template === template && !i.slot && !i.petData,
  );
  if (stack && !extra.slot && !extra.petData) {
    if (!Number.isSafeInteger(stack.quantity + quantity)) fail("STACK_LIMIT");
    stack.quantity += quantity;
    return stack;
  }
  const item: Item = { id: randomUUID(), template, quantity, ...extra };
  if (s.inventory.length >= catalog.balance.bagSlots) {
    if (!claim) fail("BAG_FULL");
    if (s.claims.length >= catalog.balance.claimBoxSlots)
      fail("CLAIM_BOX_FULL");
    item.claimExpiresAt =
      Date.now() + catalog.balance.claimBoxExpiryDays * 86400000;
    s.claims.push(item);
  } else s.inventory.push(item);
  return item;
}
export function consume(s: CharacterState, template: string, count: number) {
  const items = s.inventory.filter((i) => i.template === template);
  if (items.reduce((n, i) => n + i.quantity, 0) < count)
    fail("MATERIAL_REQUIRED");
  let left = count;
  for (const i of items) {
    const amount = Math.min(left, i.quantity);
    i.quantity -= amount;
    left -= amount;
  }
  s.inventory = s.inventory.filter((i) => i.quantity > 0);
}
export function spend(
  s: CharacterState,
  value: bigint,
  currency: "coins" | "spirit" = "coins",
) {
  if (value < 0n || BigInt(s[currency]) < value) fail("INSUFFICIENT_BALANCE");
  s[currency] = (BigInt(s[currency]) - value).toString();
}
export function addReward(
  s: CharacterState,
  reward: { exp: bigint; coins: bigint; cultivation: bigint },
) {
  s.exp = clampU64(BigInt(s.exp) + boosted(s, reward.exp, "exp")).toString();
  s.coins = clampU64(BigInt(s.coins) + reward.coins).toString();
  s.cultivation = clampU64(
    BigInt(s.cultivation) + boosted(s, reward.cultivation, "cultivation"),
  ).toString();
  let count = 0;
  while (BigInt(s.exp) >= levelExp(s.level) && count++ < 10000) {
    s.exp = (BigInt(s.exp) - levelExp(s.level)).toString();
    s.level++;
    const st = stats(s);
    s.hp = st.maxHp.toString();
    s.mp = st.maxMp.toString();
  }
  if (s.realm > 0)
    s.subRealm = Math.min(
      3,
      Number(
        (BigInt(s.cultivation) * 4n) /
          BigInt(
            catalog.realms[s.realm + 1]?.cultivation ?? "18446744073709551615",
          ),
      ),
    );
}
export function changeBranch(s: CharacterState, branch: string) {
  if (!["sword", "mage", "body"].includes(branch)) fail("INVALID_BRANCH");
  if (s.level < 10) fail("LEVEL_10_REQUIRED");
  if (s.branch === branch) return;
  const incompatible = Object.entries(s.equipment).filter(([, item]) => {
    const g = catalog.gear.find((g) => g.id === item.template);
    return g?.branch && g.branch !== branch;
  });
  if (s.inventory.length + incompatible.length > 40) fail("BAG_FULL");
  if (s.branch) {
    if (s.talent && !s.branchChangeFree) s.branchChangeFree = true;
    else {
      if (
        !s.inventory.some(
          (i) => i.template === "branch-token" && i.quantity > 0,
        )
      )
        fail("CHANGE_TOKEN_REQUIRED");
      consume(s, "branch-token", 1);
    }
  }
  for (const [slot, item] of incompatible) {
    s.inventory.push(item);
    delete s.equipment[slot];
  }
  s.branch = branch as Branch;
  s.loadout = s.skills
    .filter(
      (id) => catalog.allSkills.find((k) => k.id === id)?.branch === branch,
    )
    .slice(0, 4);
}
export function learnSkill(s: CharacterState, id: string) {
  const def = catalog.allSkills.find((k) => k.id === id);
  if (
    !def ||
    def.branch !== s.branch ||
    def.level > s.level ||
    def.requiredRealm > s.realm ||
    BigInt(s.cultivation) < BigInt(def.cultivation)
  )
    fail("SKILL_REQUIREMENT");
  if (!s.skills.includes(id)) {
    if (def.manual) consume(s, "skill-manual", 1);
    s.skills.push(id);
  }
  if (!s.loadout.includes(id)) {
    const empty = s.loadout.indexOf("");
    if (empty >= 0) s.loadout[empty] = id;
    else if (s.loadout.length < 4) s.loadout.push(id);
  }
}
export function awaken(s: CharacterState, rng: () => number) {
  if (s.level < 18) fail("LEVEL_18_REQUIRED");
  if (s.talent) fail("ALREADY_AWAKENED");
  const roll = rollAwakening(rng);
  s.talent = roll.talent;
  s.systemOffers = roll.systemOffers;
}
export function chooseSystem(s: CharacterState, id: string) {
  if (s.system) fail("SYSTEM_ALREADY_CHOSEN");
  if (!s.systemOffers.includes(id)) fail("NOT_OFFERED");
  s.system = id;
}
export function claimQuest(s: CharacterState, id: string) {
  const def = catalog.quests.find((q) => q.id === id);
  const progress = s.quests[id];
  if (!def || !progress || progress.progress < def.required)
    fail("QUEST_INCOMPLETE");
  if (progress.claimed) fail("ALREADY_CLAIMED");
  progress.claimed = true;
  addReward(s, {
    exp: BigInt(def.exp),
    coins: BigInt(def.coins),
    cultivation: BigInt(def.cultivation),
  });
  if (id === "main-0" && !s.equipment.weapon)
    addItem(
      s,
      "gear-starter-1-weapon",
      1,
      { slot: "weapon", level: 1, quality: 0, enhance: 0, element: "none" },
      true,
    );
  if (def.hidden) addItem(s, "spirit-stone", 3, {}, true);
}
export function discoverQuest(s: CharacterState, id: string) {
  if (s.auto) fail("HIDDEN_REQUIREMENT");
  const q = catalog.hiddenQuests.find((q) => q.id === id);
  if (
    !q ||
    q.map !== s.map ||
    s.level < q.minLevel ||
    Math.abs(s.x - (q.location ?? -1000)) > 100
  )
    fail("CLUE_NOT_NEAR");
  if (q.branch && q.branch !== s.branch) fail("BRANCH_REQUIREMENT");
  if (q.system && q.system !== s.system) fail("SYSTEM_REQUIREMENT");
  if (
    q.talentStat &&
    !catalog.talents
      .find((t) => t.id === s.talent)
      ?.effects.some((e) => q.talentStats.includes(e.stat))
  )
    fail("TALENT_REQUIREMENT");
  if (!s.quests[id] && s.system === "system-7") s.systemProgress++;
  s.quests[id] ??= { progress: 0, claimed: false, discovered: true };
}
export function killRewards(
  s: CharacterState,
  level: number,
  offline = false,
  auto = false,
  challenge = false,
  trialRealm?: number,
  rewardDivisor = 1,
  cultivationBps = 0,
) {
  s.kills++;
  advancePet(s, BigInt(10 + level * 5));
  if (trialRealm === s.realm + 1 && !auto && !offline) {
    s.trialVictories ??= [];
    if (!s.trialVictories.includes(trialRealm))
      s.trialVictories.push(trialRealm);
  }
  if (!offline && !auto && challenge) s.challengeKills++;
  addReward(s, {
    exp: BigInt(35 + level * 15) / BigInt(rewardDivisor),
    coins: BigInt(8 + level * 3),
    cultivation: (BigInt(2 + level) * BigInt(10000 + cultivationBps)) / 10000n,
  });
  const gatherBudget = 10000 + bonus(s, "gather") + (s.gatherRemainder ?? 0);
  s.gatherRemainder = gatherBudget % 10000;
  addItem(
    s,
    "herb",
    Math.max(1, Math.floor(gatherBudget / 10000)),
    {},
    !offline,
  );
  for (const [id, q] of Object.entries(s.quests)) {
    const def = catalog.quests.find((d) => d.id === id);
    if (
      !q.claimed &&
      def?.map === s.map &&
      (!(offline || auto) || !def.hidden) &&
      (!def.hidden || def.condition === "combat") &&
      (!def.branch || def.branch === s.branch)
    )
      q.progress = Math.min(def.required, q.progress + 1);
  }
  if (
    (s.system && ["system-1", "system-5"].includes(s.system)) ||
    (s.system === "system-2" && challenge && !auto)
  )
    s.systemProgress++;
}
export function equip(s: CharacterState, id: string) {
  const i = s.inventory.find((i) => i.id === id);
  if (!i) fail("ITEM_NOT_FOUND");
  const g = catalog.gear.find((g) => g.id === i.template);
  if (!g) fail("NOT_EQUIPMENT");
  if (
    g.level > s.level ||
    g.realm > s.realm ||
    (g.branch && g.branch !== s.branch)
  )
    fail("GEAR_REQUIREMENT");
  const old = s.equipment[g.slot];
  s.inventory = s.inventory.filter((x) => x.id !== id);
  if (old) s.inventory.push(old);
  s.equipment[g.slot] = {
    ...i,
    slot: g.slot,
    branch: g.branch ?? undefined,
    level: g.level,
  };
}
export function unequip(s: CharacterState, slot: string) {
  if (
    ![
      "weapon",
      "head",
      "body",
      "hands",
      "feet",
      "ring",
      "pendant",
      "artifact",
    ].includes(slot) ||
    !Object.hasOwn(s.equipment, slot)
  )
    fail("INVALID_SLOT");
  const item = s.equipment[slot];
  if (!item) fail("ITEM_NOT_FOUND");
  if (s.inventory.length >= 40) fail("BAG_FULL");
  delete s.equipment[slot];
  s.inventory.push(item);
}
export function usePotion(s: CharacterState, id: string) {
  const item = s.inventory.find((i) => i.id === id || i.template === id);
  if (!item) fail("ITEM_NOT_FOUND");
  const def = catalog.recipes.find(
    (r) => r.id === item.template && r.kind === "alchemy",
  );
  if (!def) fail("NOT_POTION");
  const st = stats(s);
  const amount = boosted(s, BigInt(def.amount), "heal");
  if (def.effect === "hp")
    s.hp = clampU64(
      BigInt(s.hp) + amount > st.maxHp ? st.maxHp : BigInt(s.hp) + amount,
    ).toString();
  else if (def.effect === "mp")
    s.mp = (
      BigInt(s.mp) + amount > st.maxMp ? st.maxMp : BigInt(s.mp) + amount
    ).toString();
  else if (def.effect === "cultivation")
    s.cultivation = clampU64(BigInt(s.cultivation) + amount).toString();
  else if (def.effect === "defense") {
    s.buffs = (s.buffs ?? []).filter(
      (b) => b.stat !== "defense" && b.expires > Date.now(),
    );
    s.buffs.push({
      stat: "defense",
      bps: Number(def.amount),
      expires: Date.now() + 300000,
    });
  } else fail("POTION_CONTEXT_REQUIRED");
  consume(s, item.template, 1);
}
export function craft(
  s: CharacterState,
  id: string,
  manual = false,
  element = "none",
) {
  const r = catalog.recipes.find((r) => r.id === id);
  if (!r || s.level < r.requiredLevel) fail("RECIPE_REQUIREMENT");
  if (
    r.kind === "forge" &&
    r.requiredLevel > 100 &&
    !s.knownRecipes?.includes(r.id)
  )
    fail("RECIPE_REQUIRED");
  if (
    s.inventory.length >= 40 &&
    !s.inventory.some((i) => i.template === r.output)
  )
    fail("BAG_FULL");
  consume(s, "herb", r.materialCount);
  spend(s, BigInt(r.coins));
  const budget = 10000 + bonus(s, "craft") + (s.craftRemainder ?? 0);
  const output = Math.max(1, Math.floor(budget / 10000)) + (manual ? 1 : 0);
  s.craftRemainder = budget % 10000;
  const g = catalog.gear.find((g) => g.id === r.output);
  addItem(
    s,
    r.output,
    g ? 1 : output,
    g
      ? {
          quality: manual ? Math.min(1, g.qualityCeiling) : 0,
          enhance: 0,
          slot: g.slot,
          element,
          affixes: bonus(s, "craft")
            ? [{ stat: "attack", bps: Math.floor(bonus(s, "craft") / 2) }]
            : [],
        }
      : {},
  );
  s.profession[r.kind === "alchemy" ? "alchemy" : "forge"]++;
  if (s.system === "system-4" && r.kind === "alchemy") s.systemProgress++;
}
export function enhance(s: CharacterState, id: string) {
  const item =
    s.inventory.find((i) => i.id === id) ??
    Object.values(s.equipment).find((i) => i.id === id);
  if (!item || !catalog.gear.some((g) => g.id === item.template))
    fail("ITEM_NOT_FOUND");
  if ((item.enhance ?? 0) >= 10) fail("ENHANCE_MAX");
  const next = (item.enhance ?? 0) + 1;
  consume(s, "herb", next * 2);
  spend(s, BigInt(next * next * 50));
  item.enhance = next;
}
export function upgradeQuality(s: CharacterState, id: string) {
  const item =
    s.inventory.find((i) => i.id === id) ??
    Object.values(s.equipment).find((i) => i.id === id);
  const g = catalog.gear.find((g) => g.id === item?.template);
  if (!item || !g) fail("ITEM_NOT_FOUND");
  const next = (item.quality ?? 0) + 1;
  if (next > g.qualityCeiling) fail("QUALITY_CEILING");
  consume(s, "herb", 10 * next);
  spend(s, BigInt(200 * next));
  item.quality = next;
  item.affixes ??= [];
  item.affixes.push({ stat: next % 2 ? "attack" : "defense", bps: 200 * next });
}
export function breakthrough(s: CharacterState) {
  const next = catalog.realms[s.realm + 1];
  if (!next) fail("FINAL_REALM");
  if (
    s.level < next.minLevel ||
    BigInt(s.cultivation) < BigInt(next.cultivation) ||
    (s.realm > 0 && s.subRealm < 3) ||
    s.challengeKills < next.challengeKills
  )
    fail("BREAKTHROUGH_REQUIREMENT");
  if (!(s.trialVictories ?? []).includes(s.realm + 1)) fail("TRIAL_REQUIRED");
  consume(s, next.material, next.materialCount);
  s.realm++;
  s.subRealm = 0;
  s.challengeKills = 0;
}
export function systemClaim(s: CharacterState) {
  if (!s.system) fail("NO_SYSTEM");
  const sys = catalog.systems.find((x) => x.id === s.system)!;
  const level = sys.levels[s.systemLevel - 1];
  if (
    !level ||
    s.systemClaims.includes(s.systemLevel) ||
    s.systemProgress < level.required
  )
    fail("SYSTEM_OBJECTIVE_INCOMPLETE");
  s.systemPoints += level.points;
  s.coins = clampU64(BigInt(s.coins) + BigInt(level.rewardCoins)).toString();
  addItem(s, level.rewardItem, s.systemLevel, {}, true);
  s.systemClaims.push(s.systemLevel);
  s.systemLevel = Math.min(5, s.systemLevel + 1);
  s.systemProgress = 0;
}
export function offlineSimulation(
  s: CharacterState,
  elapsedMs: number,
  plan: { map: string; quest?: string },
  rng: () => number,
) {
  const seconds = Math.min(28800, Math.max(0, Math.floor(elapsedMs / 1000)));
  const map = catalog.maps.find((m) => m.id === plan.map);
  if (!map || map.minLevel > s.level) fail("ZONE_LOCKED");
  const beforeExp = BigInt(s.exp),
    beforeCoins = BigInt(s.coins);
  s.map = map.id;
  const st = stats(s);
  const enemyHp = BigInt(90 + map.minLevel * 30);
  const combatSeconds = Math.max(
    2,
    Math.ceil(Number((enemyHp * 10n) / st.attack) / 10) * 1.2,
  );
  let earnedExp = 0n;
  let events = 0,
    kills = 0,
    reason = "time";
  const rewardFactor = 7000n;
  for (let time = 0; time + combatSeconds <= seconds; time += combatSeconds) {
    if (s.inventory.length >= 40) {
      reason = "bag";
      break;
    }
    const damage =
      BigInt(Math.max(1, map.minLevel * 3)) *
      BigInt(Math.ceil(combatSeconds / 2));
    if (BigInt(s.hp) <= damage) {
      const potion = s.inventory.find((i) => i.template === "pill-0");
      if (potion) usePotion(s, potion.id);
      if (BigInt(s.hp) <= damage) {
        s.hp = "0";
        reason = "death";
        break;
      }
    }
    s.hp = (BigInt(s.hp) > damage ? BigInt(s.hp) - damage : 0n).toString();
    earnedExp += boosted(
      s,
      (BigInt(35 + map.minLevel * 15) * rewardFactor) / 10000n,
      "exp",
    );
    addReward(s, {
      exp: (BigInt(35 + map.minLevel * 15) * rewardFactor) / 10000n,
      coins: (BigInt(8 + map.minLevel * 3) * rewardFactor) / 10000n,
      cultivation: (BigInt(2 + map.minLevel) * rewardFactor) / 10000n,
    });
    if (rng() < 0.7) addItem(s, "herb", 1);
    for (const [id, p] of Object.entries(s.quests)) {
      const def = catalog.quests.find((q) => q.id === id);
      if (!def?.hidden && def?.map === map.id && !p.claimed)
        p.progress = Math.min(def.required, p.progress + 1);
    }
    kills++;
    events++;
    advancePet(s, BigInt(10 + map.minLevel * 5));
    if (events >= 15000) {
      reason = "event-budget";
      break;
    }
  }
  s.kills += kills;
  if (s.system && ["system-1", "system-5"].includes(s.system))
    s.systemProgress += kills;
  s.map = "map-0";
  s.x = 320;
  s.hp = stats(s).maxHp.toString();
  return {
    seconds,
    kills,
    events,
    reason,
    exp: clampU64(earnedExp).toString(),
    coins: (BigInt(s.coins) - beforeCoins).toString(),
    efficiency: 70,
  };
}

export function transferEnhance(
  s: CharacterState,
  sourceId: string,
  targetId: string,
) {
  const source = s.inventory.find((i) => i.id === sourceId),
    target = s.inventory.find((i) => i.id === targetId);
  const a = catalog.gear.find((g) => g.id === source?.template),
    b = catalog.gear.find((g) => g.id === target?.template);
  if (
    !source ||
    !target ||
    sourceId === targetId ||
    !a ||
    !b ||
    a.slot !== b.slot
  )
    fail("TRANSFER_INVALID");
  const enhance = source.enhance ?? 0;
  if (!enhance || enhance <= (target.enhance ?? 0)) fail("TRANSFER_NOT_NEEDED");
  const material = Math.max(
    1,
    Math.ceil((Math.max(0, b.level - a.level) * enhance) / 5),
  );
  consume(s, "herb", material);
  spend(s, BigInt(50 * enhance));
  source.enhance = 0;
  target.enhance = enhance;
}
export function solveHidden(s: CharacterState, id: string, answer?: string) {
  const q = catalog.hiddenQuests.find((q) => q.id === id),
    progress = s.quests[id];
  if (
    !q ||
    !progress ||
    progress.claimed ||
    s.auto ||
    s.map !== q.map ||
    Math.abs(s.x - (q.location ?? -1000)) > 100
  )
    fail("HIDDEN_REQUIREMENT");
  if (progress.progress >= q.required) fail("ALREADY_SOLVED");
  if (q.condition === "dialog") {
    if (answer !== String(q.answer)) fail("WRONG_ANSWER");
    progress.progress = q.required;
  } else if (q.condition === "item") {
    consume(s, q.item ?? "herb", q.itemCount ?? 1);
    progress.progress = q.required;
  } else fail("COMBAT_OBJECTIVE");
}

export function advancePet(s: CharacterState, exp: bigint) {
  const pet = s.pets.find((p) => p.id === s.activePet)?.petData;
  if (!pet || pet.hp === "0") return;
  pet.exp = clampU64(BigInt(pet.exp) + exp).toString();
  let count = 0;
  while (BigInt(pet.exp) >= BigInt(pet.level * 100) && count++ < 10000) {
    pet.exp = (BigInt(pet.exp) - BigInt(pet.level * 100)).toString();
    pet.level++;
  }
}
export function petMaxHp(s: CharacterState) {
  const pet = s.pets.find((p) => p.id === s.activePet)?.petData,
    def = catalog.pets.find((p) => p.id === pet?.species);
  return pet && def
    ? (BigInt(def.hp) *
        BigInt(10000 + (pet.level - 1) * 1000 + bonus(s, "pet"))) /
        10000n
    : 0n;
}
export function defeatPet(s: CharacterState, now = Date.now()) {
  const pet = s.pets.find((p) => p.id === s.activePet)?.petData;
  if (pet) {
    pet.hp = "0";
    pet.recoverAt = now + 60000;
  }
}
export function recoverPet(s: CharacterState, now = Date.now()) {
  const pet = s.pets.find((p) => p.id === s.activePet)?.petData;
  if (!pet || pet.hp !== "0" || (pet.recoverAt ?? Infinity) > now) return false;
  pet.hp = petMaxHp(s).toString();
  delete pet.recoverAt;
  return true;
}
