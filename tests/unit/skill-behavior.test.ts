import { it, expect } from "vitest";
import { World } from "../../apps/game-server/src/world.js";
import { starterState } from "../../packages/database/src/state.js";
it("Liên Hoàn Kiếm makes three bounded hits on one target rather than hitting nearby enemies", () => {
  const w = new World(),
    s = starterState("a", "aa", "A");
  s.level = 20;
  s.realm = 1;
  s.branch = "sword";
  s.skills = ["sword-2"];
  s.mp = "1000";
  s.x = 700;
  w.add(s, 1);
  const [a, b] = w.monsters.filter((m) => m.map === "map-0");
  a!.x = 700;
  a!.hp = 10000n;
  b!.x = 720;
  const before = b!.hp;
  w.attack("a", a!.id, "sword-2");
  expect(
    w.events.filter((e) => e.type === "hit" && e.target === a!.id),
  ).toHaveLength(3);
  expect(b!.hp).toBe(before);
});
it("artifact activation requires an equipped artifact and uses the shared cooldown", () => {
  const w = new World(),
    s = starterState("a", "aa", "A");
  s.level = 10;
  s.realm = 1;
  s.branch = "sword";
  s.x = 700;
  s.mp = "1000";
  w.add(s, 1);
  const target = w.monsters.find((m) => m.map === "map-0")!;
  target.hp = 10000n;
  expect(() => w.attack("a", target.id, "artifact")).toThrow(
    "SKILL_NOT_LEARNED",
  );
  s.equipment.artifact = {
    id: "artifact",
    template: "gear-sword-10-artifact",
    quantity: 1,
    slot: "artifact",
  };
  w.attack("a", target.id, "artifact");
  expect(s.mp).toBe("990");
  w.tick = 20;
  expect(() => w.attack("a", target.id, "artifact")).toThrow("COOLDOWN");
});
it("ram respects boss knockback immunity", () => {
  for (const boss of [false, true]) {
    const w = new World(),
      s = starterState("a", "aa", "A");
    s.level = 30;
    s.realm = 2;
    s.branch = "body";
    s.skills = ["body-1"];
    s.mp = "1000";
    s.x = 700;
    w.add(s, 1);
    const target = w.monsters.find((m) => m.map === "map-0")!;
    target.x = 750;
    target.hp = 10000n;
    target.boss = boss;
    w.attack("a", target.id, "body-1");
    expect(target.x).toBe(boss ? 750 : 870);
  }
});
it("private trials do not inherit public safe-zone healing", () => {
  const w = new World(),
    s = starterState("a", "aa", "A");
  s.hp = "50";
  w.add(s, 1);
  w.players.get("a")!.instance = "private-trial";
  w.tick = 19;
  w.step();
  expect(s.hp).toBe("50");
});
