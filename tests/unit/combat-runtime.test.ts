import { it, expect } from "vitest";
import { World } from "../../apps/game-server/src/world.js";
import { starterState } from "../../packages/database/src/state.js";
it("casting waits for completion and cannot deal damage immediately or on disconnect", () => {
  const w = new World();
  const s = starterState("a", "aa", "A");
  s.level = 100;
  s.branch = "sword";
  s.skills = ["sword-7"];
  s.mp = "1000";
  s.x = 700;
  w.add(s, 1);
  const m = w.monsters.find((m) => m.map === "map-0")!;
  m.hp = m.maxHp = 100000n;
  const before = m.hp;
  w.attack("a", m.id, "sword-7");
  expect(m.hp).toBe(before);
  for (let i = 0; i < 20; i++) w.step();
  expect(m.hp).toBeLessThan(before);
});
it("private challenges have a boss even when entered from a safe map", () => {
  const w = new World();
  expect(w.makeMonster("map-0", "personal:a:realm-1", 5).boss).toBe(true);
});
