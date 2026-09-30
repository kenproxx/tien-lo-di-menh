import { it, expect } from "vitest";
import { World } from "../../apps/game-server/src/world.js";
import { starterState } from "../../packages/database/src/state.js";
it("two players observe one shared monster HP and one kill only", () => {
  const world = new World();
  const a = starterState("a", "aa", "A"),
    b = starterState("b", "bb", "B");
  a.x = b.x = 700;
  world.add(a, 1);
  world.add(b, 1);
  world.players.get("a")!.party = "party";
  world.players.get("b")!.party = "party";
  const target = world.monsters.find((m) => m.map === "map-0")!;
  target.x = 700;
  const before = target.hp;
  world.attack("a", target.id);
  expect(target.hp < before).toBe(true);
  const shared = world.snapshot("b");
  expect(shared.monsters.find((m) => m.id === target.id)?.hp).toBe(
    target.hp.toString(),
  );
  let kills = 0;
  world.onKill = () => {
    kills++;
  };
  target.hp = 1n;
  world.players.get("b")!.nextAttack = 0;
  world.attack("b", target.id);
  world.attack("a", target.id);
  expect(kills).toBe(1);
});
it("ignores stale input and isolates instances", () => {
  const w = new World();
  w.add(starterState("a", "aa", "A"), 1);
  w.input("a", { seq: 2, axis: 1, jump: false });
  w.input("a", { seq: 1, axis: -1, jump: false });
  w.step();
  expect(w.players.get("a")!.motion.x).toBe(328);
  w.add(starterState("b", "bb", "B"), 1);
  w.players.get("b")!.instance = "private";
  expect(w.snapshot("a").players.some((p) => p.id === "b")).toBe(false);
});
