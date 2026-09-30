import { it, expect } from "vitest";
import { World } from "../../apps/game-server/src/world.js";
import { Social } from "../../apps/game-server/src/social.js";
import { starterState } from "../../packages/database/src/state.js";
it("blocked senders are filtered and chat only supports the named channels", () => {
  const w = new World();
  w.add(starterState("a", "aa", "A"), 1);
  w.add(starterState("b", "bb", "B"), 1);
  const s = new Social(w);
  s.block("a", "b");
  expect(s.canReceive("a", "b")).toBe(false);
  expect(s.canReceive("b", "a")).toBe(true);
  expect(() => s.chat("b", "x", "private-secret")).toThrow("INVALID_CHANNEL");
  s.block("a", "b", false);
  expect(s.canReceive("a", "b")).toBe(true);
});
