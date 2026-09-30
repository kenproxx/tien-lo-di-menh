import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import { computeOffline } from "../../apps/game-server/src/offline-compute.js";
import { offlineSimulation } from "../../apps/game-server/src/gameplay.js";
import { starterState } from "../../packages/database/src/state.js";
it("worker uses the deterministic combat reducer without mutating the uncommitted input", async () => {
  const state = starterState("a", "aa", "A"),
    original = structuredClone(state),
    expected = structuredClone(state);
  let index = 0;
  const rng = () =>
    createHash("sha256")
      .update(`server-seed:${index++}`)
      .digest()
      .readUInt32BE(0) / 4294967296;
  const report = offlineSimulation(expected, 600000, { map: "map-0" }, rng);
  const actual = await computeOffline(
    state,
    600000,
    { map: "map-0" },
    "server-seed",
  );
  expect(state).toEqual(original);
  expect(actual.report).toEqual(report);
  expect(actual.state).toEqual(expected);
});
