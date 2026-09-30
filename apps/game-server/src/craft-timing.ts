import { randomUUID } from "node:crypto";
import { fail } from "./gameplay.js";
export interface CraftChallenge {
  token: string;
  recipe: string;
  element: string;
  started: number;
}
export class CraftTiming {
  challenges = new Map<string, CraftChallenge>();
  begin(actor: string, recipe: string, element: string, now = Date.now()) {
    const old = this.challenges.get(actor);
    if (old && now - old.started < 5000) fail("CRAFT_PENDING");
    const challenge = { token: randomUUID(), recipe, element, started: now };
    this.challenges.set(actor, challenge);
    return challenge;
  }
  assess(actor: string, recipe: string, token: string, now = Date.now()) {
    const c = this.challenges.get(actor);
    if (
      !c ||
      c.recipe !== recipe ||
      c.token !== token ||
      now - c.started > 5000 ||
      now < c.started
    )
      fail("CRAFT_EXPIRED");
    return {
      manual: Math.abs(now - c.started - 2000) <= 300,
      element: c.element,
    };
  }
}
