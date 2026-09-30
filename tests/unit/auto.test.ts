import { it, expect } from "vitest";
import { World } from "../../apps/game-server/src/world.js";
import { starterState } from "../../packages/database/src/state.js";
it("automatic movement is not canceled by neutral client input packets", () => {
  const w = new World(),
    s = starterState("a", "aa", "A");
  s.auto = true;
  w.add(s, 1);
  for (let i = 0; i < 20; i++) {
    w.input("a", { seq: i, axis: 0, jump: false });
    w.step();
  }
  expect(w.players.get("a")!.motion.x).toBeGreaterThan(400);
});
it("disconnected characters cannot continue online farming", () => {
  const w = new World(),
    s = starterState("a", "aa", "A");
  s.auto = true;
  w.add(s, 1);
  w.players.get("a")!.connected = false;
  for (let i = 0; i < 100; i++) w.step();
  expect(w.players.get("a")!.motion.x).toBe(320);
});
