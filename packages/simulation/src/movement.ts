export interface MotionState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
}
export interface MovementInput {
  axis: -1 | 0 | 1;
  jump: boolean;
}
export interface MapBounds {
  width: number;
  ground: number;
}
export function stepMovement(
  s: MotionState,
  input: MovementInput,
  map: MapBounds,
  dt: number,
): MotionState {
  dt = Math.min(0.05, Math.max(0, dt));
  const vx = input.axis * 160;
  let vy = s.grounded && input.jump ? -420 : s.vy;
  let y = s.y + vy * dt;
  vy += 1200 * dt;
  const grounded = y >= map.ground;
  if (grounded) {
    y = map.ground;
    vy = 0;
  }
  return {
    x: Math.min(map.width - 16, Math.max(16, s.x + vx * dt)),
    y: Math.max(16, y),
    vx,
    vy,
    grounded,
  };
}
