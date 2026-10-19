import { facingFromVector } from './movement.ts';
import type { Facing, Point } from './movement.ts';

export interface ActionClockInput {
  movement: Point;
  aimOnly: boolean;
  wait: boolean;
  playerBusy: boolean;
  paused: boolean;
}
export interface ActionClockResult {
  worldDt: number;
  movement: Point;
  facing: Facing | null;
}

/** World time follows player intent, never enemy activity or collision success. */
export function resolveActionClock(input: ActionClockInput, dtSeconds: number): ActionClockResult {
  const movement = Number.isFinite(input.movement.x) && Number.isFinite(input.movement.y)
    ? { ...input.movement } : { x: 0, y: 0 };
  const hasIntent = Math.hypot(movement.x, movement.y) > 0;
  const advancing = !input.paused && (input.wait || input.playerBusy || (hasIntent && !input.aimOnly));
  return {
    worldDt: advancing && Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0,
    movement: input.paused || input.aimOnly ? { x: 0, y: 0 } : movement,
    // Composition decides whether an already-locked player cast allows this facing intent.
    facing: !input.paused && hasIntent ? facingFromVector(movement) : null,
  };
}
