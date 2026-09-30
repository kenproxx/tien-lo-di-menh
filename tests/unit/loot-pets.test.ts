import { it, expect } from "vitest";
import { World } from "../../apps/game-server/src/world.js";
import { starterState } from "../../packages/database/src/state.js";
import {
  advancePet,
  defeatPet,
  recoverPet,
  stats,
} from "../../apps/game-server/src/gameplay.js";
it("boss eligibility uses contribution and proximity rather than the last attacker", () => {
  const w = new World();
  for (const id of ["a", "b", "idle"]) {
    const s = starterState(id, id, id);
    s.x = 700;
    w.add(s, 1);
  }
  const m = w.makeMonster("map-0", "public", 5);
  m.boss = true;
  m.x = 700;
  m.contributions = { a: "500", b: "300" };
  expect(
    w
      .lootRecipients("b", m)
      .map((p) => p.state.id)
      .sort(),
  ).toEqual(["a", "b"]);
  w.players.get("a")!.motion.x = 2300;
  expect(w.lootRecipients("b", m).map((p) => p.state.id)).toEqual(["b"]);
});
it("pet retains progression through defeat, recovers after delay and affects owner stats only while alive", () => {
  const s = starterState("a", "aa", "A");
  s.pets = [
    {
      id: "pet",
      template: "pet-contract",
      quantity: 1,
      petData: { species: "pet-0", level: 1, exp: "0" },
    },
  ];
  s.activePet = "pet";
  advancePet(s, 1000n);
  const level = s.pets[0]!.petData!.level;
  expect(level).toBeGreaterThan(1);
  const attack = stats(s).attack;
  defeatPet(s, 100);
  expect(stats(s).attack).toBeLessThan(attack);
  expect(recoverPet(s, 1000)).toBe(false);
  expect(recoverPet(s, 60100)).toBe(true);
  expect(s.pets[0]!.petData!.level).toBe(level);
  expect(stats(s).attack).toBe(attack);
});
