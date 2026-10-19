import type { ZonePattern, ZoneShape } from '../../content/zone-schema.ts';
import { canOccupy } from '../movement.ts';
import type { CollisionWorld, Point } from '../movement.ts';
import { clearAttackPath } from './geometry.ts';
import type { AttackGeometry } from './types.ts';

export function shapeRadius(shape: ZoneShape): number {
  return shape.kind === 'disk' ? shape.radius : shape.kind === 'ring' ? shape.outerRadius
    : shape.kind === 'sector' ? shape.range : shape.length + shape.width / 2;
}
export function zoneAnchor(pattern: ZonePattern, caster: Point, aim: Point): Point {
  const dx = aim.x - caster.x, dy = aim.y - caster.y, distance = Math.hypot(dx, dy);
  const length = pattern.placement.kind === 'target' ? Math.min(distance, pattern.placement.targetingRange)
    : pattern.placement.kind === 'forward' ? pattern.placement.distance : 0;
  return { x: caster.x + (distance ? dx / distance * length : length), y: caster.y + (distance ? dy / distance * length : 0) };
}
export function shapeGeometry(shape: ZoneShape, origin: Point, angleRadians: number): AttackGeometry {
  if (shape.kind === 'disk') return { ...shape, origin };
  if (shape.kind === 'ring') return { ...shape, origin, angleRadians };
  if (shape.kind === 'sector') return { ...shape, origin, angleRadians };
  return { kind: 'line', origin, angleRadians, range: shape.length, width: shape.width };
}
export function rotatePoint(point: Point, angle: number): Point {
  return { x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle) };
}
/** Dedicated per-cast RNG: cosmetics, roaming and hit processing never consume it. */
export function resolveOffsets(pattern: ZonePattern, anchor: Point, angle: number, world: CollisionWorld, seed: number): Point[][] {
  const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const valid = (offset: Point): boolean => {
    const rotated = rotatePoint(offset, angle), point = { x: anchor.x + rotated.x, y: anchor.y + rotated.y };
    return canOccupy(world, point, 0) && clearAttackPath(world, anchor, point);
  };
  if (!canOccupy(world, anchor, 0)) throw new Error('Zone anchor must be on walkable floor');
  const waves: Point[][] = [];
  for (let wave = 0; wave < pattern.waves.count; wave++) {
    const distribution = pattern.distribution;
    let offsets: Point[];
    if (distribution.kind === 'single') offsets = [{ x: 0, y: 0 }];
    else if (distribution.kind === 'offsets') offsets = distribution.offsets.map(offset => ({ ...offset }));
    else if (distribution.kind === 'circle') offsets = Array.from({ length: distribution.count }, (_, index) => ({
      x: Math.cos(index * Math.PI * 2 / distribution.count) * distribution.radius,
      y: Math.sin(index * Math.PI * 2 / distribution.count) * distribution.radius,
    }));
    else offsets = Array.from({ length: distribution.count }, () => {
      for (let attempt = 0; attempt < 32; attempt++) {
        const phase = random() * Math.PI * 2, radius = Math.sqrt(random()) * distribution.radius;
        const offset = { x: Math.cos(phase) * radius, y: Math.sin(phase) * radius };
        if (valid(offset)) return offset;
      }
      // A valid anchor is the explicit finite fallback if its surrounding disk is obstructed.
      return { x: 0, y: 0 };
    });
    if (offsets.some(offset => !valid(offset))) throw new Error('Zone placement is blocked or outside walkable floor');
    waves.push(offsets);
  }
  return waves;
}
