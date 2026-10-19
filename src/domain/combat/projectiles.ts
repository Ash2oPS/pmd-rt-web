import { PLAYER_RADIUS } from '../movement.ts';
import type { CollisionWorld, Point } from '../movement.ts';
import { clearanceDistance } from './geometry.ts';
import type { CombatEntity, ProjectileSnapshot } from './types.ts';

export interface Projectile extends ProjectileSnapshot { team: CombatEntity['team']; angleRadians: number; speed: number }
/** Earliest moving-circle contact against a stationary circle along the swept segment. */
function contactDistance(origin: Point, angle: number, target: Point, radius: number): number | null {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const projection = dx * Math.cos(angle) + dy * Math.sin(angle);
  const perpendicularSquared = dx * dx + dy * dy - projection * projection;
  if (perpendicularSquared > radius * radius) return null;
  const span = Math.sqrt(Math.max(0, radius * radius - perpendicularSquared));
  if (projection + span < 0) return null;
  return Math.max(0, projection - span);
}
export function advanceProjectile(projectile: Projectile, world: CollisionWorld, targets: readonly CombatEntity[], dt: number): { done: boolean; target?: CombatEntity } {
  const desired = Math.min(projectile.remainingRange, projectile.speed * dt);
  const clear = clearanceDistance(world, projectile.position, projectile.angleRadians, desired, projectile.radius);
  let traveled = clear;
  let target: CombatEntity | undefined;
  for (const candidate of targets) {
    if (candidate.defeated) continue;
    const distance = contactDistance(projectile.position, projectile.angleRadians, candidate, projectile.radius + PLAYER_RADIUS);
    if (distance !== null && distance <= traveled) { traveled = distance; target = candidate; }
  }
  projectile.previousPosition = { ...projectile.position };
  projectile.position = { x: projectile.position.x + Math.cos(projectile.angleRadians) * traveled,
    y: projectile.position.y + Math.sin(projectile.angleRadians) * traveled };
  projectile.remainingRange = Math.max(0, projectile.remainingRange - traveled);
  return { done: !!target || clear < desired - 1e-8 || projectile.remainingRange <= 1e-8, target };
}
