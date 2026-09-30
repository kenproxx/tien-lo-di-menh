import { it, expect } from "vitest";
import { starterState } from "../../packages/database/src/state.js";
import {
  craft,
  usePotion,
  stats,
} from "../../apps/game-server/src/gameplay.js";
it("breakthrough recipe yields usable breakthrough materials", () => {
  const s = starterState("a", "aa", "A");
  s.coins = "100000";
  s.inventory[2]!.quantity = 100;
  craft(s, "pill-4");
  expect(s.inventory.some((i) => i.template === "breakthrough-pill")).toBe(
    true,
  );
});
it("defense elixir provides a timed effect and does not stack on duplicate doses", () => {
  const s = starterState("a", "aa", "A");
  s.inventory.push({ id: "buff", template: "pill-3", quantity: 2 });
  s.level = 100;
  const before = stats(s).defense;
  usePotion(s, "buff");
  const first = stats(s).defense;
  expect(first).toBeGreaterThan(before);
  usePotion(s, "buff");
  expect(stats(s).defense).toBe(first);
});
