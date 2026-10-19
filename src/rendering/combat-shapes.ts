import { geometryOutline } from '../domain/combat/geometry.ts';
import type { AttackGeometry } from '../domain/combat/types.ts';
import type { CollisionWorld, Point } from '../domain/movement.ts';

export const combatRoot = (coordinate: number): number => coordinate * 32 + 16;
const outlines = new WeakMap<readonly string[], Map<string, readonly Point[]>>();

function outline(geometry: AttackGeometry, world?: CollisionWorld): readonly Point[] {
  if (world) {
    let cache = outlines.get(world.map);
    if (!cache) { cache = new Map(); outlines.set(world.map, cache); }
    const key = JSON.stringify(geometry);
    const cached = cache.get(key);
    if (cached) return cached;
    const points = geometryOutline(world, geometry);
    if (cache.size >= 32) cache.clear();
    cache.set(key, points);
    return points;
  }
  const origin = geometry.origin;
  if (geometry.kind === 'line') {
    const dx = Math.cos(geometry.angleRadians), dy = Math.sin(geometry.angleRadians);
    return [[0, -1], [geometry.range, -1], [geometry.range, 1], [0, 1]].map(([distance = 0, side = 0]) => ({
      x: origin.x + dx * distance - dy * geometry.width / 2 * side,
      y: origin.y + dy * distance + dx * geometry.width / 2 * side,
    }));
  }
  const disk = geometry.kind === 'disk';
  const degrees = disk ? 360 : geometry.angleDegrees;
  const half = degrees * Math.PI / 360;
  const angle = disk ? 0 : geometry.angleRadians;
  const range = disk ? geometry.radius : geometry.range;
  const samples = Math.max(4, Math.ceil(degrees / 3));
  const points: Point[] = disk ? [] : [{ ...origin }];
  for (let index = 0; index <= samples; index++) {
    const direction = angle - half + 2 * half * index / samples;
    points.push({ x: origin.x + Math.cos(direction) * range, y: origin.y + Math.sin(direction) * range });
  }
  return points;
}

/** Build only a path; callers own its phase-dependent fill, outline and layer. */
export function attackPath(context: CanvasRenderingContext2D, geometry: AttackGeometry, world?: CollisionWorld): void {
  const points = outline(geometry, world);
  context.beginPath();
  points.forEach((point, index) => {
    const x = Math.round(combatRoot(point.x)), y = Math.round(combatRoot(point.y));
    if (index) context.lineTo(x, y);
    else context.moveTo(x, y);
  });
  context.closePath();
}

export function attackLockPoint(geometry: AttackGeometry, world?: CollisionWorld): Point {
  const points = outline(geometry, world);
  if (geometry.kind === 'sector') return points[Math.floor(points.length / 2)] ?? geometry.origin;
  if (geometry.kind === 'disk') return points.reduce((top, point) => point.y < top.y ? point : top, geometry.origin);
  const dx = Math.cos(geometry.angleRadians), dy = Math.sin(geometry.angleRadians);
  const distance = points.reduce((maximum, point) => Math.max(maximum,
    (point.x - geometry.origin.x) * dx + (point.y - geometry.origin.y) * dy), 0);
  return { x: geometry.origin.x + dx * distance, y: geometry.origin.y + dy * distance };
}
