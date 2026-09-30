import { randomUUID, randomInt } from "node:crypto";
import { catalog } from "../../../packages/content/src/index.js";
import {
  clampU64,
  stepMovement,
  resolveHit,
  durationTicks,
  adjustCost,
  applyShield,
  consumeShields,
  applyStatus,
  type MotionState,
  type Shield,
  type Status,
  type Element,
} from "../../../packages/simulation/src/index.js";
import type { CharacterState } from "../../../packages/database/src/state.js";
import {
  stats,
  bonus,
  boosted,
  fail,
  recoverPet,
  defeatPet,
  petMaxHp,
} from "./gameplay.js";
export interface Monster {
  id: string;
  map: string;
  instance: string;
  name: string;
  x: number;
  y: number;
  hp: bigint;
  maxHp: bigint;
  level: number;
  boss: boolean;
  respawn: number;
  owner: string | null;
  lastHit: number;
  statuses: Status[];
  contributions: Record<string, string>;
  armorBreakBps: number;
  breakUntil: number;
  castingUntil: number;
  dots: { caster: string; damage: bigint; next: number; remaining: number }[];
  trialRealm?: number;
}
export interface Player {
  state: CharacterState;
  epoch: number;
  motion: MotionState;
  seq: number;
  input: { axis: -1 | 0 | 1; jump: boolean };
  lastInput: number;
  instance: string;
  nextAttack: number;
  cooldowns: Map<string, number>;
  castUntil: number;
  pendingCast: {
    skill: string;
    target?: string;
    map: string;
    instance: string;
  } | null;
  shields: Shield[];
  statuses: Status[];
  defenseBuff: { bps: number; expires: number };
  party: string | null;
  connected: boolean;
  combatUntil: number;
  autoPendingUntil: number;
  board: { id: string; expires: number; x: number } | null;
}
export class World {
  tick = 0;
  players = new Map<string, Player>();
  monsters: Monster[] = [];
  events: {
    id: string;
    type: string;
    actor: string;
    target?: string;
    value?: string;
    x?: number;
    y?: number;
    tick: number;
  }[] = [];
  onKill: (actor: string, monster: Monster, killId: string) => void = () => {};
  onAutoClaim: (id: string, quest: string) => void = () => {};
  onAutoPotion: (id: string, template: string) => void = () => {};
  constructor() {
    for (const map of catalog.maps)
      for (let i = 0; i < 6; i++)
        this.monsters.push(this.makeMonster(map.id, "public", i));
  }
  makeMonster(map: string, instance: string, i: number): Monster {
    const m = catalog.maps.find((m) => m.id === map)!;
    const boss = i === 5 && (!m.safe || instance !== "public");
    const maxHp = BigInt(100 + m.minLevel * 35) * (boss ? 12n : 1n);
    return {
      id: randomUUID(),
      map,
      instance,
      name: boss
        ? "Hộ Giới Linh Thú"
        : ["Trúc Yêu", "Linh Lang", "Thạch Quái"][i % 3]!,
      x: 700 + i * 260,
      y: 420,
      hp: maxHp,
      maxHp,
      level: m.minLevel,
      boss,
      respawn: 0,
      owner: null,
      lastHit: 0,
      statuses: [],
      contributions: {},
      armorBreakBps: 0,
      breakUntil: 0,
      castingUntil: 0,
      dots: [],
    };
  }
  add(state: CharacterState, epoch: number) {
    const old = this.players.get(state.id);
    state.cooldownUntil ??= {};
    state.trialVictories ??= [];
    if (old)
      state = {
        ...state,
        hp: old.state.hp,
        mp: old.state.mp,
        map: old.state.map,
        x: old.motion.x,
        y: old.motion.y,
        cooldownUntil: old.state.cooldownUntil,
      };
    const restored = new Map(
      Object.entries(state.cooldownUntil)
        .filter(([, expires]) => expires > Date.now())
        .map(([key, expires]) => [
          key,
          this.tick + Math.max(1, Math.ceil((expires - Date.now()) / 50)),
        ]),
    );
    this.players.set(state.id, {
      state,
      epoch,
      motion: old?.motion ?? {
        x: state.x,
        y: state.y,
        vx: 0,
        vy: 0,
        grounded: true,
      },
      seq: old?.seq ?? -1,
      input: { axis: 0, jump: false },
      lastInput: this.tick,
      instance: old?.instance ?? "public",
      nextAttack: old?.nextAttack ?? restored.get("basic-attack") ?? 0,
      cooldowns: old?.cooldowns ?? restored,
      castUntil: old?.castUntil ?? 0,
      pendingCast: null,
      shields: old?.shields ?? [],
      statuses: old?.statuses ?? [],
      defenseBuff: old?.defenseBuff ?? { bps: 0, expires: 0 },
      party: old?.party ?? null,
      connected: true,
      combatUntil: old?.combatUntil ?? 0,
      autoPendingUntil: 0,
      board:
        old?.board ??
        (state.placedBoard &&
        state.placedBoard.expires > Date.now() &&
        state.placedBoard.map === state.map &&
        state.placedBoard.instance === "public"
          ? {
              id: state.placedBoard.id,
              x: state.placedBoard.x,
              expires:
                this.tick +
                Math.ceil((state.placedBoard.expires - Date.now()) / 50),
            }
          : null),
    });
  }
  input(id: string, input: { seq: number; axis: -1 | 0 | 1; jump: boolean }) {
    const p = this.players.get(id);
    if (!p || input.seq <= p.seq) return;
    p.seq = input.seq;
    if (p.state.auto && input.axis === 0 && !input.jump) {
      p.lastInput = this.tick;
      return;
    }
    if (p.state.auto) p.state.auto = false;
    p.input = { axis: input.axis, jump: input.jump };
    p.lastInput = this.tick;
  }
  sync(id: string, state: CharacterState) {
    const p = this.players.get(id);
    if (!p) return;
    const mapChanged = p.state.map !== state.map;
    p.state = state;
    if (mapChanged) {
      p.motion = { x: state.x, y: 420, vx: 0, vy: 0, grounded: true };
      p.input = { axis: 0, jump: false };
      p.instance = "public";
    }
  }
  captureVitals(id: string, state: CharacterState) {
    const p = this.players.get(id);
    if (!p) return;
    state.hp = p.state.hp;
    state.mp = p.state.mp;
    state.map = p.state.map;
    state.x = p.motion.x;
    state.y = p.motion.y;
    state.cooldownUntil = p.state.cooldownUntil;
    for (const item of state.pets) {
      const current = p.state.pets.find((i) => i.id === item.id)?.petData;
      if (item.petData && current) {
        item.petData.hp = current.hp;
        item.petData.recoverAt = current.recoverAt;
      }
    }
  }
  mergeAssets(
    id: string,
    state: CharacterState,
    deltaHp = 0n,
    deltaMp = 0n,
    travel = false,
    auto?: boolean,
  ) {
    const p = this.players.get(id);
    if (!p) return;
    for (const item of state.pets) {
      const current = p.state.pets.find((i) => i.id === item.id)?.petData;
      if (item.petData && current) {
        item.petData.hp = current.hp;
        item.petData.recoverAt = current.recoverAt;
      }
    }
    const incoming = state;
    if (state.revision < p.state.revision) state = p.state;
    const st = stats(state);
    const hp = clampU64(BigInt(p.state.hp) + deltaHp),
      mp = clampU64(BigInt(p.state.mp) + deltaMp);
    this.sync(id, {
      ...state,
      auto: auto ?? p.state.auto,
      cooldownUntil: p.state.cooldownUntil,
      hp: (hp > st.maxHp ? st.maxHp : hp).toString(),
      mp: (mp > st.maxMp ? st.maxMp : mp).toString(),
      map: travel ? incoming.map : p.state.map,
      x: travel ? incoming.x : p.motion.x,
      y: travel ? incoming.y : p.motion.y,
    });
  }
  formationBonus(p: Player, effect: string): number {
    let best = 0;
    for (const owner of this.players.values()) {
      const board = owner.board;
      if (
        !board ||
        board.expires <= this.tick ||
        owner.state.map !== p.state.map ||
        owner.instance !== p.instance ||
        (owner !== p && (!p.party || p.party !== owner.party))
      )
        continue;
      const def = catalog.boards.find((b) => b.id === board.id);
      if (
        !def ||
        def.effect !== effect ||
        Math.abs(p.motion.x - board.x) > def.radius
      )
        continue;
      best = Math.max(
        best,
        Math.floor((def.bps * (10000 + bonus(owner.state, "board"))) / 10000),
      );
    }
    return best;
  }
  formationOwner(p: Player, effect: string) {
    let best: Player | null = null,
      value = -1;
    for (const owner of this.players.values()) {
      const board = owner.board,
        def = catalog.boards.find((b) => b.id === board?.id);
      if (
        !board ||
        !def ||
        board.expires <= this.tick ||
        def.effect !== effect ||
        owner.state.map !== p.state.map ||
        owner.instance !== p.instance ||
        (owner !== p && (!p.party || owner.party !== p.party)) ||
        Math.abs(p.motion.x - board.x) > def.radius
      )
        continue;
      const strength = Math.floor(
        (def.bps * (10000 + bonus(owner.state, "board"))) / 10000,
      );
      if (strength > value) {
        value = strength;
        best = owner;
      }
    }
    return best;
  }
  monsterSlow(m: Monster) {
    let strength = 0,
      source: Player | null = null;
    for (const p of this.players.values()) {
      const board = p.board,
        def = catalog.boards.find((b) => b.id === board?.id);
      if (
        !p.connected ||
        !board ||
        !def ||
        board.expires <= this.tick ||
        def.effect !== "slow" ||
        p.state.map !== m.map ||
        p.instance !== m.instance ||
        Math.abs(m.x - board.x) > def.radius
      )
        continue;
      const value = Math.floor(
        (def.bps * (10000 + bonus(p.state, "board"))) / 10000,
      );
      if (value > strength) {
        strength = value;
        source = p;
      }
    }
    if (source && m.boss && this.tick % 20 === 0)
      m.contributions[source.state.id] = clampU64(
        BigInt(m.contributions[source.state.id] ?? "0") + m.maxHp / 1000n,
      ).toString();
    return strength;
  }
  event(
    type: string,
    actor: string,
    target?: string,
    value?: string,
    x?: number,
    y?: number,
  ) {
    this.events.push({
      id: randomUUID(),
      type,
      actor,
      target,
      value,
      x,
      y,
      tick: this.tick,
    });
    if (this.events.length > 100) this.events.shift();
  }
  targets(p: Player, range = 800) {
    return this.monsters
      .filter(
        (m) =>
          m.map === p.state.map &&
          m.instance === p.instance &&
          m.hp > 0n &&
          (m.boss ||
            !m.owner ||
            m.owner === p.state.id ||
            m.lastHit + 300 <= this.tick ||
            (p.party && p.party === this.players.get(m.owner)?.party)) &&
          Math.abs(m.x - p.motion.x) <= range,
      )
      .sort((a, b) => Math.abs(a.x - p.motion.x) - Math.abs(b.x - p.motion.x));
  }
  lootRecipients(killer: string, m: Monster) {
    const first = this.players.get(m.owner ?? killer),
      near = [...this.players.values()].filter(
        (p) =>
          p.connected &&
          p.state.map === m.map &&
          p.instance === m.instance &&
          Math.abs(p.motion.x - m.x) <= 800 &&
          BigInt(p.state.hp) > 0n,
      );
    return m.boss
      ? near.filter(
          (p) => BigInt(m.contributions[p.state.id] ?? "0") * 100n >= m.maxHp,
        )
      : near.filter(
          (p) => p === first || (first?.party && p.party === first.party),
        );
  }
  contributeHeal(p: Player, effective: bigint) {
    if (effective <= 0n) return;
    for (const m of this.targets(p, 800))
      if (
        m.boss &&
        Object.keys(m.contributions).some(
          (id) =>
            id === p.state.id ||
            (p.party && this.players.get(id)?.party === p.party),
        )
      )
        m.contributions[p.state.id] = (
          BigInt(m.contributions[p.state.id] ?? "0") + effective
        ).toString();
  }
  skillFor(p: Player, id?: string) {
    if (id === "artifact") {
      const item = p.state.equipment.artifact,
        g = catalog.gear.find((g) => g.id === item?.template);
      if (
        !item ||
        !g ||
        g.slot !== "artifact" ||
        (g.branch && g.branch !== p.state.branch)
      )
        return undefined;
      return {
        id: "artifact",
        name: "Kích hoạt pháp bảo",
        branch: p.state.branch ?? "",
        manual: false,
        requiredRealm: g.realm,
        level: g.level,
        mana: "10",
        cooldown: 200,
        castTicks: 0,
        range: 300,
        damageBps: 17500,
        effect: "damage",
        element: item.element ?? "weapon",
        cultivation: "0",
      };
    }
    return catalog.allSkills.find((k) => k.id === id);
  }
  friendly(p: Player, range: number) {
    return [...this.players.values()].filter(
      (q) =>
        q.connected &&
        q.state.map === p.state.map &&
        q.instance === p.instance &&
        BigInt(q.state.hp) > 0n &&
        Math.abs(q.motion.x - p.motion.x) <= range &&
        (q === p || (p.party && q.party === p.party)),
    );
  }
  attack(id: string, targetId?: string, skillId?: string) {
    const p = this.players.get(id);
    if (
      !p ||
      BigInt(p.state.hp) === 0n ||
      this.tick < p.nextAttack ||
      this.tick < p.castUntil ||
      p.statuses.some((s) => ["stun", "freeze"].includes(s.kind))
    )
      return;
    const st = stats(p.state);
    const skill = this.skillFor(p, skillId);
    if (
      skillId &&
      (!skill ||
        (skillId !== "artifact" && !p.state.skills.includes(skillId)) ||
        skill.branch !== p.state.branch)
    )
      fail("SKILL_NOT_LEARNED");
    if (skill && p.statuses.some((s) => s.kind === "silence")) fail("SILENCED");
    if (skill && (p.cooldowns.get(skill.id) ?? 0) > this.tick) fail("COOLDOWN");
    const range = skill?.range ?? 130;
    const targets = this.targets(p, range);
    let target = targetId ? targets.find((t) => t.id === targetId) : targets[0];
    if (skill && ["shield", "defense", "dash", "heal"].includes(skill.effect)) {
      target = undefined;
    } else if (!target) fail("TARGET_OUT_OF_RANGE");
    if (skill) {
      const mana = adjustCost(
        BigInt(skill.mana),
        bonus(p.state, "manaReduction"),
      );
      if (BigInt(p.state.mp) < mana) fail("NOT_ENOUGH_MP");
      p.state.mp = (BigInt(p.state.mp) - mana).toString();
      p.cooldowns.set(
        skill.id,
        this.tick +
          Math.max(
            1,
            Math.ceil(
              (skill.cooldown *
                (10000 - Math.min(9900, bonus(p.state, "cooldownReduction")))) /
                10000,
            ),
          ),
      );
      p.castUntil = this.tick + skill.castTicks;
    }
    p.nextAttack =
      this.tick +
      durationTicks(
        16,
        bonus(p.state, "attackSpeed") +
          (catalog.pets.find(
            (t) =>
              t.id ===
              p.state.pets.find((i) => i.id === p.state.activePet)?.petData
                ?.species,
          )?.skill === "speed" &&
          p.state.pets.find((i) => i.id === p.state.activePet)?.petData?.hp !==
            "0"
            ? 1000
            : 0),
      );
    p.state.cooldownUntil["basic-attack"] =
      Date.now() + (p.nextAttack - this.tick) * 50;
    if (skill)
      p.state.cooldownUntil[skill.id] =
        Date.now() +
        ((p.cooldowns.get(skill.id) ?? this.tick) - this.tick) * 50;
    if (skill && skill.castTicks > 0) {
      p.pendingCast = {
        skill: skill.id,
        target: target?.id,
        map: p.state.map,
        instance: p.instance,
      };
      this.event("cast", id, target?.id, String(skill.castTicks));
      return;
    }
    this.impact(id, target?.id ?? targetId, skill?.id);
  }
  impact(id: string, targetId?: string, skillId?: string) {
    const p = this.players.get(id);
    if (!p || !p.connected || BigInt(p.state.hp) === 0n) return;
    const st = stats(p.state),
      skill = this.skillFor(p, skillId);
    const targets = this.targets(p, skill?.range ?? 130),
      target = targetId ? targets.find((m) => m.id === targetId) : targets[0];
    if (skill?.effect === "dash" || skill?.effect === "ram") {
      const map = catalog.maps.find((m) => m.id === p.state.map)!;
      p.motion.x = Math.max(16, Math.min(map.width - 16, p.motion.x + 180));
      this.event("dash", id);
      if (skill.effect === "dash") return;
      if (target && !target.boss) {
        target.x = Math.max(16, Math.min(map.width - 16, target.x + 120));
      }
    }
    if (skill?.effect === "heal") {
      const ally =
        this.friendly(p, skill.range).find((q) => q.state.id === targetId) ?? p;
      const before = BigInt(ally.state.hp),
        max = stats(ally.state).maxHp,
        value = before + boosted(p.state, max / 5n, "heal");
      ally.state.hp = (value > max ? max : value).toString();
      this.contributeHeal(p, BigInt(ally.state.hp) - before);
      this.event(
        "heal",
        id,
        ally.state.id,
        (BigInt(ally.state.hp) - before).toString(),
      );
      return;
    }
    if (skill?.effect === "defense") {
      p.defenseBuff = { bps: 3000, expires: this.tick + 200 };
      this.event("defense", id);
      return;
    }
    if (skill && ["shield"].includes(skill.effect)) {
      const recipients =
        skill.branch === "body"
          ? this.friendly(p, skill.range)
              .sort((a, b) =>
                a === p
                  ? -1
                  : b === p
                    ? 1
                    : Math.abs(a.motion.x - p.motion.x) -
                      Math.abs(b.motion.x - p.motion.x),
              )
              .slice(0, 4)
          : [
              skill.branch === "mage"
                ? (this.friendly(p, skill.range).find(
                    (q) => q.state.id === targetId,
                  ) ?? p)
                : p,
            ];
      for (const ally of recipients)
        ally.shields = applyShield(ally.shields, {
          source: skill.id,
          caster: id,
          amount: boosted(p.state, st.maxHp / 3n, "shield"),
          expires: this.tick + 200,
        });
      this.event("shield", id, undefined, st.maxHp.toString());
      return;
    }
    if (!target) return;
    const list =
      skill?.effect === "triple"
        ? [target, target, target]
        : skill &&
            ["aoe", "fusion", "multi", "pierce", "stun"].includes(skill.effect)
          ? targets.slice(0, skill.effect === "multi" ? 3 : 8)
          : [target];
    for (const [hitIndex, m] of list.entries()) {
      if (m.hp === 0n) continue;
      p.combatUntil = this.tick + 100;
      if (m.owner && m.owner !== id && m.lastHit + 300 > this.tick && !m.boss) {
        const owner = this.players.get(m.owner);
        if (!p.party || p.party !== owner?.party) continue;
      }
      if (m.owner && m.lastHit + 300 <= this.tick) m.owner = null;
      m.owner ??= id;
      m.lastHit = this.tick;
      const map = catalog.maps.find((x) => x.id === m.map)!;
      let raw = (st.attack * BigInt(skill?.damageBps ?? 10000)) / 10000n;
      if (skill?.effect === "triple")
        raw = raw / 3n + (hitIndex === 0 ? raw % 3n : 0n);
      raw = (raw * BigInt(10000 + this.formationBonus(p, "attack"))) / 10000n;
      const elements: Element[] =
        skill?.effect === "fusion"
          ? ["metal", "wood", "water", "fire", "earth"]
          : [
              (skill?.element === "weapon" || !skill
                ? st.weaponElement
                : skill.element) as Element,
            ];
      let total = 0n;
      for (const [index, element] of elements.entries()) {
        const part =
          raw / BigInt(elements.length) +
          (index === 0 ? raw % BigInt(elements.length) : 0n);
        const r = resolveHit({
          raw: part,
          level: p.state.level,
          defense: BigInt(m.level * 2),
          armorBreak: (BigInt(m.level * 2) * BigInt(m.armorBreakBps)) / 10000n,
          hp: m.hp,
          shield: 0n,
          attackElement: element,
          bodyElement: map.element as Element,
          crit: randomInt(10000) < st.crit,
          lifestealBps: st.lifesteal,
          reductionBps: 0,
        });
        m.hp -= r.hpDamage;
        total += r.hpDamage;
        p.state.hp = (
          BigInt(p.state.hp) + r.lifesteal > st.maxHp
            ? st.maxHp
            : BigInt(p.state.hp) + r.lifesteal
        ).toString();
      }
      m.contributions[id] = (
        BigInt(m.contributions[id] ?? "0") + total
      ).toString();
      if (skill?.effect === "break") {
        m.armorBreakBps = Math.max(m.armorBreakBps, 3000);
        m.breakUntil = this.tick + 200;
      }
      if (skill?.effect === "interrupt" && m.castingUntil > this.tick) {
        m.castingUntil = 0;
        if (m.boss)
          m.contributions[id] = clampU64(
            BigInt(m.contributions[id] ?? "0") + m.maxHp / 200n,
          ).toString();
      }
      if (skill?.effect === "stun")
        m.statuses = applyStatus(
          m.statuses,
          { kind: "stun", expires: this.tick + 40 },
          m.boss,
        );
      if (skill?.effect === "burn")
        m.dots = [
          ...m.dots.filter((d) => d.caster !== id),
          {
            caster: id,
            damage: st.attack / 5n,
            next: this.tick + 20,
            remaining: 3,
          },
        ];
      if (skill?.effect === "taunt") m.owner = id;
      const companion = p.state.pets.find(
          (i) => i.id === p.state.activePet,
        )?.petData,
        petDef = catalog.pets.find((t) => t.id === companion?.species);
      if (companion && companion.hp !== "0" && petDef?.skill === "burn")
        m.dots = [
          ...m.dots.filter((d) => d.caster !== id),
          {
            caster: id,
            damage: boosted(p.state, st.attack / 10n, "pet"),
            next: this.tick + 20,
            remaining: 3,
          },
        ];
      if (
        companion &&
        companion.hp !== "0" &&
        petDef?.skill === "stun" &&
        this.tick % 100 < 20
      )
        m.statuses = applyStatus(
          m.statuses,
          { kind: "stun", expires: this.tick + 20 },
          m.boss,
        );
      if (
        skill?.effect === "slow" ||
        skill?.effect === "root" ||
        skill?.id === "body-2"
      )
        m.statuses = applyStatus(
          m.statuses,
          {
            kind: skill.effect === "root" ? "root" : "slow",
            expires: this.tick + 60,
          },
          m.boss,
        );
      this.event("hit", id, m.id, total.toString(), m.x, m.y - 70);
      if (m.hp === 0n) {
        m.respawn = this.tick + (m.boss ? 1200 : 160);
        const killId = randomUUID();
        this.onKill(id, m, killId);
        this.event("kill", id, m.id);
      }
    }
  }
  step() {
    this.tick++;
    if (this.tick % 200 === 0) {
      const live = new Set([...this.players.values()].map((p) => p.instance));
      this.monsters = this.monsters.filter(
        (m) => m.instance === "public" || live.has(m.instance),
      );
    }

    for (const p of this.players.values()) {
      p.statuses = p.statuses.filter((s) => s.expires > this.tick);
      if (!p.connected) {
        p.pendingCast = null;
        continue;
      }
      if (p.pendingCast && this.tick >= p.castUntil) {
        const pending = p.pendingCast;
        p.pendingCast = null;
        if (pending.map === p.state.map && pending.instance === p.instance)
          this.impact(p.state.id, pending.target, pending.skill);
      }

      const map = catalog.maps.find((m) => m.id === p.state.map)!;
      if (!p.state.auto && this.tick - p.lastInput > 20)
        p.input = { axis: 0, jump: false };
      const held = p.statuses.some((s) =>
        ["root", "stun", "freeze"].includes(s.kind),
      );
      p.motion = stepMovement(
        p.motion,
        held ? { axis: 0, jump: false } : p.input,
        map,
        0.05,
      );
      p.input.jump = false;
      p.state.x = p.motion.x;
      p.state.y = p.motion.y;
      if (p.state.auto && this.tick % 4 === 0) {
        const q = catalog.quests.find(
          (q) =>
            !q.hidden &&
            q.map === p.state.map &&
            p.state.quests[q.id] &&
            !p.state.quests[q.id]!.claimed &&
            p.state.quests[q.id]!.progress >= q.required,
        );
        if (q) {
          p.input.axis = p.motion.x > 400 ? -1 : 0;
          if (p.motion.x <= 400 && p.autoPendingUntil < this.tick) {
            p.autoPendingUntil = this.tick + 40;
            this.onAutoClaim(p.state.id, q.id);
          }
          continue;
        }
        const target = this.targets(p, map.width)[0];
        if (target) {
          if (Math.abs(target.x - p.motion.x) > 100)
            p.input.axis = target.x > p.motion.x ? 1 : -1;
          else {
            p.input.axis = 0;
            try {
              const skill = p.state.loadout.find(
                (id) =>
                  (p.cooldowns.get(id) ?? 0) <= this.tick &&
                  catalog.allSkills.find((k) => k.id === id)?.branch ===
                    p.state.branch,
              );
              this.attack(p.state.id, target.id, skill);
            } catch {
              try {
                this.attack(p.state.id, target.id);
              } catch {}
            }
          }
        }
      }
      if (this.tick % 20 === 0) {
        const st = stats(p.state);
        recoverPet(p.state);
        const companion = p.state.pets.find(
            (i) => i.id === p.state.activePet,
          )?.petData,
          petDef = catalog.pets.find((t) => t.id === companion?.species);
        const boardHeal = this.formationBonus(p, "heal"),
          boardCaster = this.formationOwner(p, "heal"),
          petHeal =
            companion && companion.hp !== "0" && petDef?.skill === "heal"
              ? 1000 + bonus(p.state, "pet")
              : 0;
        for (const [bps, caster] of [
          [boardHeal, boardCaster ?? p],
          [petHeal, p],
        ] as const)
          if (bps) {
            const before = BigInt(p.state.hp),
              value =
                before +
                boosted(
                  caster.state,
                  (st.maxHp * BigInt(bps)) / 100000n,
                  "heal",
                );
            p.state.hp = (value > st.maxHp ? st.maxHp : value).toString();
            this.contributeHeal(caster, BigInt(p.state.hp) - before);
          }
        if (
          companion &&
          companion.hp !== "0" &&
          petDef?.skill === "shield" &&
          this.tick % 200 === 0
        )
          p.shields = applyShield(p.shields, {
            source: "pet-shield",
            caster: p.state.id,
            amount: petMaxHp(p.state) / 3n,
            expires: this.tick + 100,
          });
        if (p.state.auto && (p.cooldowns.get("potion") ?? 0) <= this.tick) {
          const template =
            BigInt(p.state.hp) * 100n <
            st.maxHp * BigInt(p.state.potionThreshold)
              ? "pill-0"
              : BigInt(p.state.mp) * 100n <
                  st.maxMp * BigInt(p.state.potionThreshold)
                ? "pill-1"
                : null;
          if (
            template &&
            p.state.inventory.some((i) => i.template === template)
          ) {
            p.cooldowns.set("potion", this.tick + 100);
            p.state.cooldownUntil.potion = Date.now() + 5000;
            this.onAutoPotion(p.state.id, template);
          }
        }
        p.state.mp = (
          BigInt(p.state.mp) + 3n > st.maxMp
            ? st.maxMp
            : BigInt(p.state.mp) + 3n
        ).toString();
        if (map.safe && p.instance === "public")
          p.state.hp = (
            BigInt(p.state.hp) + st.maxHp / 20n > st.maxHp
              ? st.maxHp
              : BigInt(p.state.hp) + st.maxHp / 20n
          ).toString();
      }
    }
    for (const m of this.monsters) {
      if (m.breakUntil <= this.tick) m.armorBreakBps = 0;
      m.statuses = m.statuses.filter((s) => s.expires > this.tick);
      if (m.hp === 0n) {
        if (this.tick >= m.respawn) {
          m.hp = m.maxHp;
          m.owner = null;
          m.contributions = {};
          m.armorBreakBps = 0;
          m.dots = [];
        }
        continue;
      }
      for (const dot of m.dots) {
        if (dot.remaining && dot.next <= this.tick && m.hp > 0n) {
          dot.remaining--;
          dot.next = this.tick + 20;
          const r = resolveHit({
            raw: dot.damage,
            level: m.level,
            defense: BigInt(m.level * 2),
            hp: m.hp,
            shield: 0n,
            attackElement: "fire",
            bodyElement: catalog.maps.find((x) => x.id === m.map)!
              .element as Element,
            crit: false,
            secondary: true,
          });
          m.hp -= r.hpDamage;
          m.contributions[dot.caster] = (
            BigInt(m.contributions[dot.caster] ?? "0") + r.hpDamage
          ).toString();
          this.event(
            "hit",
            dot.caster,
            m.id,
            r.hpDamage.toString(),
            m.x,
            m.y - 70,
          );
          if (m.hp === 0n) {
            m.respawn = this.tick + (m.boss ? 1200 : 160);
            this.onKill(dot.caster, m, randomUUID());
            this.event("kill", dot.caster, m.id);
          }
        }
      }
      m.dots = m.dots.filter((d) => d.remaining > 0);
      if (m.hp === 0n) continue;
      if (m.boss && this.tick % 200 === 180) {
        m.castingUntil = this.tick + 20;
        this.event("boss-cast", m.owner ?? "", m.id);
      }
      if (m.owner && this.tick - m.lastHit > 300) m.owner = null;
      const pursued = m.owner ? this.players.get(m.owner) : undefined;
      if (
        pursued?.connected &&
        Math.abs(m.x - pursued.motion.x) > 65 &&
        pursued.state.map === m.map &&
        pursued.instance === m.instance &&
        Math.abs(m.x - pursued.motion.x) < 800 &&
        !m.statuses.some((s) => ["root", "stun", "freeze"].includes(s.kind)) &&
        (!catalog.maps.find((x) => x.id === m.map)?.safe ||
          m.instance !== "public")
      ) {
        const slow = Math.min(
          9900,
          Math.max(
            m.statuses.some((s) => s.kind === "slow") ? 5000 : 0,
            this.monsterSlow(m),
          ),
        );
        if (Math.abs(m.x - pursued.motion.x) > 65)
          m.x +=
            (Math.sign(pursued.motion.x - m.x) * 3 * (10000 - slow)) / 10000;
      }
      if (this.tick % 40 !== 0) continue;
      const candidates = [...this.players.values()].sort((a, b) =>
        a.state.id === m.owner
          ? -1
          : b.state.id === m.owner
            ? 1
            : Math.abs(a.motion.x - m.x) - Math.abs(b.motion.x - m.x),
      );
      const target = candidates.find(
        (p) =>
          p.connected &&
          p.state.map === m.map &&
          p.instance === m.instance &&
          Math.abs(p.motion.x - m.x) < 100,
      );
      if (
        !target ||
        (catalog.maps.find((x) => x.id === m.map)?.safe &&
          m.instance === "public") ||
        m.statuses.some((s) => ["stun", "freeze"].includes(s.kind))
      )
        continue;
      target.combatUntil = this.tick + 100;
      if (m.castingUntil > 0 && m.castingUntil <= this.tick) {
        const reduction = Math.min(
          9900,
          this.formationBonus(target, "ccResist") +
            (target.defenseBuff.expires > this.tick ? 5000 : 0),
        );
        target.statuses = applyStatus(
          target.statuses,
          {
            kind: "stun",
            expires:
              this.tick +
              Math.max(1, Math.ceil((40 * (10000 - reduction)) / 10000)),
          },
          false,
        );
        target.pendingCast = null;
      }
      target.shields = target.shields.filter(
        (layer) => layer.expires > this.tick,
      );
      const st = stats(target.state);
      const special = m.castingUntil > 0 && m.castingUntil <= this.tick;
      if (special) m.castingUntil = 0;
      const r = resolveHit({
        raw: BigInt(m.level * 4 + 8) * (special ? 2n : 1n),
        level: m.level,
        defense:
          (st.defense *
            BigInt(
              10000 +
                this.formationBonus(target, "defense") +
                (target.defenseBuff.expires > this.tick
                  ? target.defenseBuff.bps
                  : 0),
            )) /
          10000n,
        hp: BigInt(target.state.hp),
        shield: clampU64(target.shields.reduce((n, s) => n + s.amount, 0n)),
        attackElement: "physical",
        bodyElement: st.bodyElement,
        crit: false,
        reflectBps: st.reflection,
        reductionBps: bonus(target.state, "resistance"),
      });
      const beforeShields = target.shields;
      target.shields = consumeShields(
        target.shields,
        r.damage,
        this.tick,
      ).layers;
      if (m.boss)
        for (const layer of beforeShields) {
          const remaining =
              target.shields.find(
                (s) => s.source === layer.source && s.caster === layer.caster,
              )?.amount ?? 0n,
            absorbed = layer.amount - remaining;
          if (absorbed > 0n)
            m.contributions[layer.caster] = clampU64(
              BigInt(m.contributions[layer.caster] ?? "0") + absorbed,
            ).toString();
        }
      target.state.hp = (BigInt(target.state.hp) - r.hpDamage).toString();
      const pet = target.state.pets.find(
        (i) => i.id === target.state.activePet,
      )?.petData;
      if (pet && pet.hp !== "0") {
        const hp = BigInt(pet.hp ?? petMaxHp(target.state).toString()),
          damage = r.hpDamage / 3n;
        pet.hp = (hp > damage ? hp - damage : 0n).toString();
        if (pet.hp === "0") defeatPet(target.state);
      }

      m.hp = m.hp > r.reflection ? m.hp - r.reflection : 0n;
      if (r.reflection > 0n)
        m.contributions[target.state.id] = (
          BigInt(m.contributions[target.state.id] ?? "0") + r.reflection
        ).toString();
      if (m.hp === 0n) {
        m.respawn = this.tick + (m.boss ? 1200 : 160);
        this.onKill(target.state.id, m, randomUUID());
        this.event("kill", target.state.id, m.id);
      }
      this.event("hurt", target.state.id, m.id, r.hpDamage.toString());
      if (target.state.hp === "0") {
        target.motion.x = 320;
        target.state.map = "map-0";
        target.instance = "public";
        target.pendingCast = null;
        target.state.hp = st.maxHp.toString();
        target.state.auto = false;
        this.event("death", target.state.id);
      }
    }
  }
  snapshot(id: string) {
    const p = this.players.get(id)!;
    return {
      type: "snapshot",
      version: 1,
      contentVersion: catalog.balance.version,
      tick: this.tick,
      epoch: p.epoch,
      ack: p.seq,
      you: p.state,
      stats: stats(p.state),
      instance: p.instance,
      party: p.party
        ? {
            members: [...this.players.values()]
              .filter((q) => q.party === p.party)
              .map((q) => ({
                name: q.state.name,
                level: q.state.level,
                connected: q.connected,
              })),
          }
        : null,
      cooldowns: Object.fromEntries(p.cooldowns),
      players: [...this.players.values()]
        .filter(
          (q) =>
            q.connected &&
            q.state.map === p.state.map &&
            q.instance === p.instance &&
            Math.abs(q.motion.x - p.motion.x) <= 800,
        )
        .map((q) => ({
          id: q.state.id,
          name: q.state.name,
          branch: q.state.branch,
          level: q.state.level,
          x: q.motion.x,
          y: q.motion.y,
          hp: q.state.hp,
        })),
      monsters: this.monsters
        .filter(
          (m) =>
            m.map === p.state.map &&
            m.instance === p.instance &&
            Math.abs(m.x - p.motion.x) <= 800,
        )
        .map((m) => ({ ...m, hp: m.hp.toString(), maxHp: m.maxHp.toString() })),
      events: this.events.filter(
        (e) =>
          this.tick - e.tick < 20 &&
          (() => {
            const q = this.players.get(e.actor);
            return (
              q &&
              q.instance === p.instance &&
              q.state.map === p.state.map &&
              Math.abs((e.x ?? q.motion.x) - p.motion.x) <= 800
            );
          })(),
      ),
    };
  }
}
