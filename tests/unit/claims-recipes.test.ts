import { it, expect } from "vitest";
import { starterState } from "../../packages/database/src/state.js";
import { addItem, craft } from "../../apps/game-server/src/gameplay.js";
it("claim items receive the configured seven day expiry", () => {
  const s = starterState("a", "aa", "A");
  s.inventory = Array.from({ length: 40 }, (_, i) => ({
    id: String(i),
    template: "unique-" + i,
    quantity: 1,
  }));
  const item = addItem(s, "herb", 1, {}, true);
  expect(item.claimExpiresAt).toBeGreaterThan(Date.now() + 6 * 86400000);
});
it("high level forging requires a learned physical recipe", () => {
  const s = starterState("a", "aa", "A");
  s.level = 150;
  s.coins = "1000000";
  s.inventory[2]!.quantity = 1000;
  expect(() => craft(s, "forge-sword-150")).toThrow("RECIPE_REQUIRED");
  s.knownRecipes = ["forge-sword-150"];
  craft(s, "forge-sword-150");
  expect(s.inventory.some((i) => i.template === "gear-sword-150-weapon")).toBe(
    true,
  );
});
