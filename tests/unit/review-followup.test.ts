import { it, expect } from "vitest";
import { World } from "../../apps/game-server/src/world.js";
import { Social } from "../../apps/game-server/src/social.js";
import { starterState } from "../../packages/database/src/state.js";
it("asset merge preserves defeated pet health and checkpoints copy it by ID", () => {
  const w = new World(),
    s = starterState("a", "aa", "A");
  s.pets = [
    {
      id: "pet",
      template: "pet-contract",
      quantity: 1,
      petData: { species: "pet-0", level: 1, exp: "0", hp: "120" },
    },
  ];
  s.activePet = "pet";
  w.add(s, 1);
  const db = structuredClone(s);
  w.players.get("a")!.state.pets[0]!.petData!.hp = "0";
  w.players.get("a")!.state.pets[0]!.petData!.recoverAt = 60000;
  w.mergeAssets("a", db);
  expect(w.players.get("a")!.state.pets[0]!.petData!.hp).toBe("0");
  const checkpoint = structuredClone(db);
  w.captureVitals("a", checkpoint);
  expect(checkpoint.pets[0]!.petData!.recoverAt).toBe(60000);
});
it("instance re-entry cannot teleport players during combat and each realm/map gets its own encounter", () => {
  const w = new World(),
    s = starterState("a", "aa", "A");
  w.add(s, 1);
  const social = new Social(w),
    first = social.instance("a").id,
    p = w.players.get("a")!;
  p.motion.x = 900;
  p.combatUntil = 100;
  expect(social.instance("a").id).toBe(first);
  expect(p.motion.x).toBe(900);
  p.state.realm = 1;
  expect(() => social.instance("a")).toThrow("IN_COMBAT");
  p.combatUntil = 0;
  const second = social.instance("a").id;
  expect(second).not.toBe(first);
  expect(
    w.monsters.find((m) => m.instance === second && m.boss)!.trialRealm,
  ).toBe(2);
});
it("confirming an item whose enhancement changed after offering is rejected", () => {
  const w = new World();
  for (const id of ["a", "b"]) w.add(starterState(id, id, id), 1);
  const social = new Social(w),
    id = social.trade("a", "b", "invite")!.id!;
  const item = w.players.get("a")!.state.inventory[0]!;
  item.enhance = 10;
  social.trade("a", id, "offer:" + item.id);
  social.trade("b", id, "confirm:1");
  item.enhance = 0;
  expect(() => social.trade("a", id, "confirm:1")).toThrow("TRADE_CHANGED");
});
it("duplicate session cleanup after removal is harmless", () => {
  const w = new World();
  w.add(starterState("a", "aa", "A"), 1);
  const social = new Social(w);
  w.players.delete("a");
  expect(() => social.party("a", undefined, "leave")).not.toThrow();
});
