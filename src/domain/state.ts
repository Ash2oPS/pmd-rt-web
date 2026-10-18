export interface Point {
  x: number;
  y: number;
}
export type Facing = "up" | "down" | "left" | "right";
export interface GameState {
  version: 1;
  player: Point;
  steps: number;
  collected: number[];
  facing: Facing;
}
export interface World {
  map: readonly string[];
  spawn: Point;
  collectibles: readonly Point[];
}
export const walkable = (world: World, x: number, y: number): boolean =>
  Number.isInteger(x) && Number.isInteger(y) && world.map[y]?.[x] === ".";
export function createState(world: World): GameState {
  return {
    version: 1,
    player: { ...world.spawn },
    steps: 0,
    collected: [],
    facing: "down",
  };
}
export function move(
  state: GameState,
  dx: number,
  dy: number,
  world: World,
): boolean {
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  state.facing = dx ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  const x = state.player.x + dx,
    y = state.player.y + dy;
  if (!walkable(world, x, y)) return false;
  state.player = { x, y };
  state.steps++;
  const index = world.collectibles.findIndex((c) => c.x === x && c.y === y);
  if (index >= 0 && !state.collected.includes(index))
    state.collected.push(index);
  return true;
}
export function restore(raw: string, world: World): GameState | null {
  try {
    const s: unknown = JSON.parse(raw);
    if (
      !s ||
      typeof s !== "object" ||
      !("version" in s) ||
      s.version !== 1 ||
      !("player" in s) ||
      !s.player ||
      typeof s.player !== "object" ||
      !("x" in s.player) ||
      !("y" in s.player) ||
      typeof s.player.x !== "number" ||
      typeof s.player.y !== "number" ||
      !walkable(world, s.player.x, s.player.y) ||
      !("steps" in s) ||
      typeof s.steps !== "number" ||
      !Number.isSafeInteger(s.steps) ||
      s.steps < 0 ||
      !("collected" in s) ||
      !Array.isArray(s.collected) ||
      s.collected.length > world.collectibles.length ||
      !s.collected.every(
        (n: unknown) =>
          typeof n === "number" &&
          Number.isInteger(n) &&
          n >= 0 &&
          n < world.collectibles.length,
      ) ||
      new Set(s.collected).size !== s.collected.length ||
      !("facing" in s) ||
      !["up", "down", "left", "right"].includes(String(s.facing))
    )
      return null;
    return {
      version: 1,
      player: { x: s.player.x, y: s.player.y },
      steps: s.steps,
      collected: [...s.collected] as number[],
      facing: s.facing as Facing,
    };
  } catch {
    return null;
  }
}
