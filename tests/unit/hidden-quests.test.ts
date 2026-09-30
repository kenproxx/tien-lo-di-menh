import { it, expect } from "vitest";
import { starterState } from "../../packages/database/src/state.js";
import {
  discoverQuest,
  solveHidden,
  claimQuest,
  killRewards,
} from "../../apps/game-server/src/gameplay.js";
import { catalog } from "../../packages/content/src/index.js";
it("hidden dialogue requires proximity, manual discovery and correct answer; reward claimed once", () => {
  const s = starterState("a", "aa", "A");
  const q = catalog.hiddenQuests.find((q) => q.condition === "dialog")!;
  s.level = 100;
  s.map = q.map;
  s.x = q.location!;
  discoverQuest(s, q.id);
  killRewards(s, 1);
  expect(s.quests[q.id]!.progress).toBe(0);
  expect(() => solveHidden(s, q.id, String((q.answer! + 1) % 3))).toThrow(
    "WRONG_ANSWER",
  );
  solveHidden(s, q.id, String(q.answer));
  claimQuest(s, q.id);
  expect(() => claimQuest(s, q.id)).toThrow("ALREADY_CLAIMED");
});
it("hidden offering consumes the actual required material once and cannot be solved by auto", () => {
  const s = starterState("a", "aa", "A");
  const q = catalog.hiddenQuests.find((q) => q.condition === "item")!;
  s.level = 100;
  s.map = q.map;
  s.x = q.location!;
  s.inventory[2]!.quantity = 100;
  discoverQuest(s, q.id);
  s.auto = true;
  expect(() => solveHidden(s, q.id)).toThrow("HIDDEN_REQUIREMENT");
  s.auto = false;
  solveHidden(s, q.id);
  expect(s.inventory[2]!.quantity).toBe(100 - q.itemCount!);
  expect(() => solveHidden(s, q.id)).toThrow("ALREADY_SOLVED");
});
