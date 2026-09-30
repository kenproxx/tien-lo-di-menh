import { it, expect } from "vitest";
import { World } from "../../apps/game-server/src/world.js";
import { Social } from "../../apps/game-server/src/social.js";
import { starterState } from "../../packages/database/src/state.js";
it("committing trade cannot change offers or cancel confirmations", () => {
  const w = new World();
  w.add(starterState("a", "aa", "A"), 1);
  w.add(starterState("b", "bb", "B"), 1);
  const s = new Social(w);
  const result = s.trade("a", "b", "invite")!;
  const t = s.trades.get(result.id!)!;
  const item = w.players.get("a")!.state.inventory[0]!.id;
  s.trade("a", t.id, "offer:" + item);
  s.trade("a", t.id, "confirm:1");
  s.trade("b", t.id, "confirm:1");
  t.locked = true;
  expect(() => s.trade("b", t.id, "offer:item-2")).toThrow("TRADE_COMMITTING");
  expect(() => s.trade("b", t.id, "cancel")).toThrow("TRADE_COMMITTING");
  expect(t.offers.a?.item).toBe(item);
  expect(t.confirmed.size).toBe(2);
});

it("stale trade confirmation cannot approve a changed offer", () => {
  const w = new World();
  w.add(starterState("a", "aa", "A"), 1);
  w.add(starterState("b", "bb", "B"), 1);
  const s = new Social(w),
    id = s.trade("a", "b", "invite")!.id!;
  s.trade("a", id, "offer:" + w.players.get("a")!.state.inventory[0]!.id);
  expect(() => s.trade("a", id, "confirm:0")).toThrow("TRADE_CHANGED");
  expect(s.trades.get(id)!.confirmed.size).toBe(0);
});
