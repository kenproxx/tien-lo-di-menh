type CombatEvent = { type: string; actor: string; target?: string };

export function combatCue(event: CombatEvent) {
  if (!event.target) return null;
  if (event.type === "hit")
    return {
      attacker: event.actor,
      victim: event.target,
      monsterAttack: false,
    };
  if (event.type === "hurt")
    return { attacker: event.target, victim: event.actor, monsterAttack: true };
  return null;
}

export function attackDirection(x: number, targetX: number, flipped: boolean) {
  return targetX === x ? (flipped ? -1 : 1) : targetX < x ? -1 : 1;
}
