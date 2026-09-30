import { it, expect } from "vitest";
import { starterState } from "../../packages/database/src/state.js";
import { unequip, killRewards } from "../../apps/game-server/src/gameplay.js";
import { World } from "../../apps/game-server/src/world.js";
import { Social } from "../../apps/game-server/src/social.js";
it("rejects prototype names as equipment slots without corrupting inventory", () => {
  const s = starterState("a", "aa", "Test");
  expect(() => unequip(s, "constructor")).toThrow("INVALID_SLOT");
  expect(
    JSON.parse(JSON.stringify(s.inventory)).every((i: unknown) => i !== null),
  ).toBe(true);
});
it("solo instance requests reuse a bounded instance", () => {
  const w = new World();
  w.add(starterState("a", "aa", "Test"), 1);
  const social = new Social(w),
    before = w.monsters.length;
  for (let i = 0; i < 100; i++) social.instance("a");
  expect(w.monsters.length).toBe(before + 6);
});
it("expired shields cannot absorb a later attack", () => {
  const w = new World(),
    s = starterState("a", "aa", "Test");
  s.map = "map-1";
  s.x = 700;
  w.add(s, 1);
  w.players.get("a")!.shields = [
    { source: "x", caster: "a", amount: 10000n, expires: 1 },
  ];
  w.tick = 39;
  w.step();
  expect(BigInt(w.players.get("a")!.state.hp)).toBeLessThan(200n);
});
it("asset merging cannot restore stale HP/MP or position on retries", () => {
  const w = new World(),
    s = starterState("a", "aa", "Test");
  w.add(s, 1);
  w.players.get("a")!.state.hp = "50";
  w.players.get("a")!.state.mp = "20";
  const persisted = starterState("a", "aa", "Test");
  w.mergeAssets("a", persisted);
  expect(w.players.get("a")!.state.hp).toBe("50");
  expect(w.players.get("a")!.state.mp).toBe("20");
});
it("auto kill cannot solve a discovered hidden quest", () => {
  const s = starterState("a", "aa", "Test");
  s.quests["hidden-0"] = { progress: 0, claimed: false, discovered: true };
  killRewards(s, 1, false, true);
  expect(s.quests["hidden-0"]!.progress).toBe(0);
});
