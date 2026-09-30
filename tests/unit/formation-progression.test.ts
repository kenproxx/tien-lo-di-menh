import { it, expect } from "vitest";
import { World } from "../../apps/game-server/src/world.js";
import { starterState } from "../../packages/database/src/state.js";
import {
  breakthrough,
  transferEnhance,
} from "../../apps/game-server/src/gameplay.js";
it("same-type formations do not stack, expire and respect range", () => {
  const w = new World();
  w.add(starterState("a", "aa", "A"), 1);
  w.add(starterState("b", "bb", "B"), 1);
  const a = w.players.get("a")!,
    b = w.players.get("b")!;
  a.party = b.party = "party";
  a.board = { id: "board-0", expires: 100, x: 320 };
  b.board = { id: "board-0", expires: 100, x: 320 };
  expect(w.formationBonus(a, "attack")).toBe(1500);
  w.tick = 101;
  expect(w.formationBonus(a, "attack")).toBe(0);
});
it("enhancement transfer moves ownership of enhancement without duplication", () => {
  const s = starterState("a", "aa", "A");
  s.coins = "100000";
  s.inventory[2]!.quantity = 10000;
  s.inventory.push(
    { id: "old", template: "gear-sword-10-weapon", quantity: 1, enhance: 5 },
    { id: "new", template: "gear-sword-20-weapon", quantity: 1, enhance: 0 },
  );
  transferEnhance(s, "old", "new");
  expect(s.inventory.find((i) => i.id === "old")!.enhance).toBe(0);
  expect(s.inventory.find((i) => i.id === "new")!.enhance).toBe(5);
});
it("ordinary kills are insufficient for direct realm challenge", () => {
  const s = starterState("a", "aa", "A");
  s.level = 10;
  s.cultivation = "1000";
  s.challengeKills = 100;
  s.inventory.push({ id: "pill", template: "breakthrough-pill", quantity: 10 });
  expect(() => breakthrough(s)).toThrow("TRIAL_REQUIRED");
});
