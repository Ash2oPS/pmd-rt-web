import { PLAYER_RADIUS, canOccupy } from '../movement.ts';
import type { CollisionWorld, Facing, Point } from '../movement.ts';
import type { AttackGeometry, SectorGeometry } from './types.ts';

const facingAngles: Record<Facing, number> = {
  right: 0, 'down-right': Math.PI / 4, down: Math.PI / 2, 'down-left': 3 * Math.PI / 4,
  left: Math.PI, 'up-left': -3 * Math.PI / 4, up: -Math.PI / 2, 'up-right': -Math.PI / 4,
};
export function facingAngle(facing: Facing): number { return facingAngles[facing]; }
export function sector(origin: Point, angleRadians: number, range: number, angleDegrees: number): SectorGeometry {
  return { kind: 'sector', origin: { x: origin.x, y: origin.y }, angleRadians, range, angleDegrees };
}
/** Exact distance to the circular sector, including target collision radius at edges. */
export function touchesSector(geometry: SectorGeometry, target: Point, radius = PLAYER_RADIUS): boolean {
  const dx = target.x - geometry.origin.x, dy = target.y - geometry.origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance > geometry.range + radius) return false;
  const half = geometry.angleDegrees * Math.PI / 360;
  const angle = Math.atan2(Math.sin(Math.atan2(dy, dx) - geometry.angleRadians), Math.cos(Math.atan2(dy, dx) - geometry.angleRadians));
  if (Math.abs(angle) <= half || half >= Math.PI) return true;
  const boundary = geometry.angleRadians + Math.sign(angle) * half;
  const projection = Math.max(0, Math.min(geometry.range, dx * Math.cos(boundary) + dy * Math.sin(boundary)));
  return Math.hypot(dx - Math.cos(boundary) * projection, dy - Math.sin(boundary) * projection) <= radius;
}
export function clearAttackPath(world: CollisionWorld, origin: Point, target: Point): boolean {
  const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
  const count = Math.max(1, Math.ceil(distance / .05));
  for (let i = 0; i <= count; i++) {
    if (!canOccupy(world, { x: origin.x + (target.x - origin.x) * i / count,
      y: origin.y + (target.y - origin.y) * i / count }, 0)) return false;
  }
  return true;
}

/** Terrain-clipped contour for the same sector/line-of-sight used by contact checks. */
export function sectorOutline(world: CollisionWorld, geometry: SectorGeometry): Point[] {
  const half = geometry.angleDegrees * Math.PI / 360;
  const samples = Math.max(1, Math.ceil(geometry.angleDegrees / 3));
  const origin = { ...geometry.origin };
  const points: Point[] = [origin];
  for (let index = 0; index <= samples; index++) {
    const angle = geometry.angleRadians - half + 2 * half * index / samples;
    const at = (distance: number): Point => ({
      x: origin.x + Math.cos(angle) * distance,
      y: origin.y + Math.sin(angle) * distance,
    });
    let visible = geometry.range;
    if (!clearAttackPath(world, origin, at(visible))) {
      let blocked = visible;
      visible = 0;
      // Less than .1 screen pixel at the maximum authored range and current 32px tiles.
      for (let search = 0; search < 14; search++) {
        const middle = (visible + blocked) / 2;
        if (clearAttackPath(world, origin, at(middle))) visible = middle;
        else blocked = middle;
      }
    }
    points.push(at(visible));
  }
  return points;
}

/** Distance traveled without terrain contact; shared by projectile simulation and its corridor. */
export function clearanceDistance(world: CollisionWorld, origin: Point, angle: number, distance: number, radius = 0): number {
  const at = (length: number): Point => ({ x: origin.x + Math.cos(angle) * length, y: origin.y + Math.sin(angle) * length });
  if (!canOccupy(world, origin, radius)) return 0;
  const steps = Math.max(1, Math.ceil(distance / .025));
  let previous = 0;
  for (let index = 1; index <= steps; index++) {
    const length = distance * index / steps;
    if (!canOccupy(world, at(length), radius)) {
      let blocked = length;
      for (let search = 0; search < 14; search++) {
        const middle = (previous + blocked) / 2;
        if (canOccupy(world, at(middle), radius)) previous = middle; else blocked = middle;
      }
      return previous;
    }
    previous = length;
  }
  return distance;
}
export function touchesGeometry(geometry: AttackGeometry, target: Point, radius = PLAYER_RADIUS): boolean {
  if (geometry.kind === 'sector') return touchesSector(geometry, target, radius);
  if (geometry.kind === 'disk') return Math.hypot(target.x - geometry.origin.x, target.y - geometry.origin.y) <= geometry.radius + radius;
  const dx = target.x - geometry.origin.x, dy = target.y - geometry.origin.y;
  const projection = Math.max(0, Math.min(geometry.range, dx * Math.cos(geometry.angleRadians) + dy * Math.sin(geometry.angleRadians)));
  return Math.hypot(dx - Math.cos(geometry.angleRadians) * projection, dy - Math.sin(geometry.angleRadians) * projection) <= geometry.width / 2 + radius;
}
export function geometryOutline(world: CollisionWorld, geometry: AttackGeometry): Point[] {
  if (geometry.kind === 'sector') return sectorOutline(world, geometry);
  if (geometry.kind === 'disk') return sectorOutline(world, sector(geometry.origin, 0, geometry.radius, 360)).slice(1);
  const { origin, angleRadians: angle, width } = geometry;
  const radius = width / 2;
  const length = clearanceDistance(world, origin, angle, geometry.range, radius);
  const end = { x: origin.x + Math.cos(angle) * length, y: origin.y + Math.sin(angle) * length };
  const points: Point[] = [];
  for (let index = 0; index <= 60; index++) {
    const direction = angle - Math.PI / 2 + Math.PI * index / 60;
    points.push({ x: end.x + Math.cos(direction) * radius, y: end.y + Math.sin(direction) * radius });
  }
  for (let index = 0; index <= 60; index++) {
    const direction = angle + Math.PI / 2 + Math.PI * index / 60;
    points.push({ x: origin.x + Math.cos(direction) * radius, y: origin.y + Math.sin(direction) * radius });
  }
  return points;
}
