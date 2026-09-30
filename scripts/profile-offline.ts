import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { starterState } from "../packages/database/src/state.js";
import { computeOffline } from "../apps/game-server/src/offline-compute.js";
const s = starterState("profile", "profile", "Profile");
s.level = 60;
s.realm = 3;
s.branch = "body";
s.coins = "1000000";
s.hp = "100000";
s.mp = "100000";
s.equipment.weapon = {
  id: "weapon",
  template: "gear-body-60-weapon",
  quantity: 1,
  slot: "weapon",
  enhance: 10,
};
s.inventory = [
  { id: "hp", template: "pill-0", quantity: 10000 },
  { id: "mp", template: "pill-1", quantity: 10000 },
];
const started = performance.now();
const result = await computeOffline(
  s,
  8 * 3600000,
  { map: "map-0" },
  "local-profile",
);
const report = {
  date: new Date().toISOString(),
  scenario: "one 8-hour offline job, generated local level-60 fixture",
  durationMs: performance.now() - started,
  result: result.report,
  capacityClaim: false,
};
writeFileSync(
  "docs/evidence/offline-profile.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
