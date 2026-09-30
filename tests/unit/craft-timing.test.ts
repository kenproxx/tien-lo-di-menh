import { it, expect } from "vitest";
import { CraftTiming } from "../../apps/game-server/src/craft-timing.js";
it("manual crafting bonus requires the issued token, recipe and timing window", () => {
  const c = new CraftTiming(),
    ticket = c.begin("actor", "pill-0", "fire", 1000);
  expect(() => c.assess("other", "pill-0", ticket.token, 3000)).toThrow(
    "CRAFT_EXPIRED",
  );
  expect(() => c.assess("actor", "pill-1", ticket.token, 3000)).toThrow(
    "CRAFT_EXPIRED",
  );
  expect(c.assess("actor", "pill-0", ticket.token, 3000)).toEqual({
    manual: true,
    element: "fire",
  });
  expect(c.assess("actor", "pill-0", ticket.token, 1100).manual).toBe(false);
  expect(() => c.begin("actor", "pill-0", "fire", 1200)).toThrow(
    "CRAFT_PENDING",
  );
  expect(() => c.assess("actor", "pill-0", ticket.token, 6001)).toThrow(
    "CRAFT_EXPIRED",
  );
});
