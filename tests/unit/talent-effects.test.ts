import { it, expect } from "vitest";
import { catalog } from "../../packages/content/src/index.js";
import { starterState } from "../../packages/database/src/state.js";
import { bonus, boosted, stats } from "../../apps/game-server/src/gameplay.js";
it("every one of 120 talent records has an active effect applied without branch filtering", () => {
  for (const talent of catalog.talents) {
    const s = starterState("a", "aa", "A");
    s.branch = "body";
    s.talent = talent.id;
    for (const effect of talent.effects) {
      expect(bonus(s, effect.stat), talent.id).toBe(effect.bps);
      expect(boosted(s, 10000n, effect.stat), talent.id).toBe(
        BigInt(10000 + effect.bps),
      );
    }
  }
});
