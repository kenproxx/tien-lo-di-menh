import { it, expect } from "vitest";
import { World } from "../../apps/game-server/src/world.js";
import { starterState } from "../../packages/database/src/state.js";
it("support shields earn only actual absorption contribution", () => {
  const w = new World();
  for (const id of ["a", "b"]) {
    const s = starterState(id, id, id);
    s.map = "map-1";
    s.x = 700;
    s.level = 60;
    s.realm = 3;
    s.branch = "mage";
    s.skills = ["mage-5"];
    s.mp = "1000";
    w.add(s, 1);
    w.players.get(id)!.party = "party";
  }
  const boss = w.monsters.find((m) => m.map === "map-1" && m.boss)!;
  boss.x = 700;
  boss.owner = "a";
  w.attack("b", "a", "mage-5");
  expect(boss.contributions.b).toBeUndefined();
  w.tick = 39;
  w.step();
  expect(BigInt(boss.contributions.b ?? "0")).toBeGreaterThan(0n);
});
