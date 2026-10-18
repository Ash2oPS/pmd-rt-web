export interface Point { x: number; y: number }
export type Facing = 'down' | 'down-right' | 'right' | 'up-right' | 'up' | 'up-left' | 'left' | 'down-left';
export interface CollisionWorld { map: readonly string[] }
export const PLAYER_RADIUS = 0.22;
export const WALK_SPEED = 3;
const DIRECTIONS: readonly Facing[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];

/** Positions use tile-center indexes: (0,0) is the center of the first tile. */
export function canOccupy(world: CollisionWorld, point: Point, radius = PLAYER_RADIUS): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(radius) || radius < 0) return false;
  const cx = point.x + 0.5, cy = point.y + 0.5;
  if (world.map[Math.floor(cy)]?.[Math.floor(cx)] !== '.'
    || radius > world.map.length || radius > (world.map[Math.floor(cy)]?.length ?? 0)) return false;
  for (let y = Math.floor(cy - radius); y <= Math.floor(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.floor(cx + radius); x++) {
      if (world.map[y]?.[x] === '.') continue;
      const nx = Math.max(x, Math.min(cx, x + 1));
      const ny = Math.max(y, Math.min(cy, y + 1));
      if ((cx - nx) ** 2 + (cy - ny) ** 2 < radius ** 2 - 1e-12 || (radius === 0 && cx >= x && cx < x + 1 && cy >= y && cy < y + 1)) return false;
    }
  }
  return true;
}

export function facingFromVector(vector: Point): Facing {
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || (!vector.x && !vector.y)) return 'down';
  return DIRECTIONS[(Math.round(Math.atan2(vector.y, vector.x) / (Math.PI / 4)) + 8) % 8]!;
}

function slideAxis(world: CollisionWorld, point: Point, delta: Point, radius: number): Point {
  const target = { x: point.x + delta.x, y: point.y + delta.y };
  if (canOccupy(world, target, radius)) return target;
  let clear = 0, blocked = 1;
  // Resolve contact below a thousandth of a rendered pixel instead of leaving
  // a frame-sized gap between the character and a wall.
  for (let i = 0; i < 12; i++) {
    const fraction = (clear + blocked) / 2;
    if (canOccupy(world, { x: point.x + delta.x * fraction, y: point.y + delta.y * fraction }, radius)) clear = fraction;
    else blocked = fraction;
  }
  return { x: point.x + delta.x * clear, y: point.y + delta.y * clear };
}

/** Small swept steps prevent tunneling. Axis fallback slides along solid edges. */
export function movePoint(world: CollisionWorld, point: Point, delta: Point, radius = PLAYER_RADIUS): Point {
  if (!canOccupy(world, point, radius) || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return { ...point };
  const length = Math.hypot(delta.x, delta.y);
  if (!length) return { ...point };
  const count = Math.ceil(length / 0.08);
  const dx = delta.x / count, dy = delta.y / count;
  let next = { ...point };
  for (let i = 0; i < count; i++) {
    const diagonal = { x: next.x + dx, y: next.y + dy };
    if (canOccupy(world, diagonal, radius)) { next = diagonal; continue; }
    if (Math.abs(dx) >= Math.abs(dy)) {
      next = slideAxis(world, next, { x: dx, y: 0 }, radius);
      next = slideAxis(world, next, { x: 0, y: dy }, radius);
    } else {
      next = slideAxis(world, next, { x: 0, y: dy }, radius);
      next = slideAxis(world, next, { x: dx, y: 0 }, radius);
    }
  }
  return next;
}

interface Explorer {
  player: Point;
  facing: Facing;
  distance: number;
  steps: number;
  collected: number[];
}
interface CollectibleWorld extends CollisionWorld { collectibles: readonly Point[] }
export interface MovementResult { moved: boolean; distance: number; collected: number[] }

/** Analog magnitude is preserved; diagonals and oversized input are capped to one. */
export function moveContinuous(state: Explorer, vector: Point, dtSeconds: number, world: CollectibleWorld, speed = WALK_SPEED): MovementResult {
  const result: MovementResult = { moved: false, distance: 0, collected: [] };
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(vector.x) || !Number.isFinite(vector.y)) return result;
  const magnitude = Math.hypot(vector.x, vector.y);
  if (!magnitude) return result;
  state.facing = facingFromVector(vector);
  const scale = speed * dtSeconds / Math.max(1, magnitude);
  const delta = { x: vector.x * scale, y: vector.y * scale };
  const count = Math.ceil(Math.hypot(delta.x, delta.y) / 0.08);
  for (let i = 0; i < count; i++) {
    const next = movePoint(world, state.player, { x: delta.x / count, y: delta.y / count });
    result.distance += Math.hypot(next.x - state.player.x, next.y - state.player.y);
    state.player = next;
    world.collectibles.forEach((item, index) => {
      if (!state.collected.includes(index) && Math.hypot(item.x - next.x, item.y - next.y) <= 0.35) {
        state.collected.push(index);
        result.collected.push(index);
      }
    });
  }
  result.moved = result.distance > 1e-8;
  state.distance += result.distance;
  state.steps = Math.floor(state.distance + 1e-8);
  return result;
}
