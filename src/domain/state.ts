import { canOccupy, facingFromVector, moveContinuous } from './movement.js';
import type { CollisionWorld, Facing, Point } from './movement.js';
export type { Facing, Point } from './movement.js';

export interface GameState {
  version: 2;
  player: Point;
  /** Actual distance traveled in tiles, including the old save's completed steps. */
  distance: number;
  steps: number;
  collected: number[];
  facing: Facing;
}
export interface World extends CollisionWorld {
  spawn: Point;
  collectibles: readonly Point[];
}
export const walkable = (world: CollisionWorld, x: number, y: number): boolean =>
  Number.isInteger(x) && Number.isInteger(y) && world.map[y]?.[x] === '.';

export function createState(world: World): GameState {
  return { version: 2, player: { ...world.spawn }, distance: 0, steps: 0, collected: [], facing: 'down' };
}

/** Compatibility for one-tile scripted actions; live input uses moveContinuous. */
export function move(state: GameState, dx: number, dy: number, world: World): boolean {
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  state.facing = facingFromVector({ x: dx, y: dy });
  if (!canOccupy(world, { x: state.player.x + dx, y: state.player.y + dy })) return false;
  return moveContinuous(state, { x: dx, y: dy }, 1, world, 1).moved;
}

const FACINGS: readonly string[] = ['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right'];

export function restore(raw: string, world: World): GameState | null {
  try {
    const s: unknown = JSON.parse(raw);
    if (!s || typeof s !== 'object' || !('version' in s) || (s.version !== 1 && s.version !== 2)
      || !('player' in s) || !s.player || typeof s.player !== 'object'
      || !('x' in s.player) || !('y' in s.player) || typeof s.player.x !== 'number' || typeof s.player.y !== 'number'
      || !canOccupy(world, { x: s.player.x, y: s.player.y })
      || !('steps' in s) || typeof s.steps !== 'number' || !Number.isSafeInteger(s.steps) || s.steps < 0
      || !('collected' in s) || !Array.isArray(s.collected) || s.collected.length > world.collectibles.length
      || !s.collected.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < world.collectibles.length)
      || new Set(s.collected).size !== s.collected.length
      || !('facing' in s) || typeof s.facing !== 'string' || !FACINGS.includes(s.facing)) return null;
    // Version 1 indexes were exact tile centers. Preserve their coordinates and progress.
    if (s.version === 1 && (!Number.isInteger(s.player.x) || !Number.isInteger(s.player.y)
      || !['up', 'down', 'left', 'right'].includes(s.facing))) return null;
    const distance = s.version === 1 ? s.steps : 'distance' in s ? s.distance : undefined;
    if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0
      || distance > Number.MAX_SAFE_INTEGER || Math.floor(distance + 1e-8) !== s.steps) return null;
    return { version: 2, player: { x: s.player.x, y: s.player.y }, distance,
      steps: s.steps, collected: [...s.collected] as number[], facing: s.facing as Facing };
  } catch { return null; }
}
