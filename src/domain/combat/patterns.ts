import type { AttackEffect, AttackPattern, CombatMoveDefinition } from '../../content/combat-schema.ts';
import type { CollisionWorld, Point } from '../movement.ts';
import { clearanceDistance } from './geometry.ts';
import { shapeGeometry, shapeRadius, zoneAnchor } from './zone-placement.ts';
import type { AttackGeometry } from './types.ts';

export function patternFor(rule: CombatMoveDefinition): AttackPattern {
  return 'pattern' in rule ? rule.pattern : { kind: 'sector', range: rule.range, angleDegrees: rule.angleDegrees };
}
export function effectFor(rule: CombatMoveDefinition): AttackEffect {
  return 'effect' in rule ? rule.effect : { kind: 'damage' };
}
export function engagementRange(rule: CombatMoveDefinition): number {
  const pattern = patternFor(rule);
  if (pattern.kind === 'zones') return pattern.placement.kind === 'target' ? pattern.placement.targetingRange
    : (pattern.placement.kind === 'forward' ? pattern.placement.distance : 0) + shapeRadius(pattern.shape);
  return pattern.kind === 'self-disk' ? pattern.radius : pattern.kind === 'target-disk' ? pattern.targetingRange : pattern.range;
}
export function resolveGeometry(rule: CombatMoveDefinition, caster: Point, aim: Point, world: CollisionWorld): AttackGeometry {
  const pattern = patternFor(rule);
  const angleRadians = Math.atan2(aim.y - caster.y, aim.x - caster.x);
  const origin = { x: caster.x, y: caster.y };
  if (pattern.kind === 'zones') return shapeGeometry(pattern.shape, zoneAnchor(pattern, caster, aim), angleRadians);
  if (pattern.kind === 'sector') return { ...pattern, origin, angleRadians };
  if (pattern.kind === 'projectile') return { kind: 'line', origin, angleRadians, range: pattern.range, width: pattern.width };
  if (pattern.kind === 'self-disk') return { kind: 'disk', origin, radius: pattern.radius };
  const range = Math.min(pattern.targetingRange, Math.hypot(aim.x - caster.x, aim.y - caster.y));
  const visible = clearanceDistance(world, origin, angleRadians, range);
  // Keep a ground target slightly within floor, never just inside a blocking cell.
  const length = visible < range ? Math.max(0, visible - .001) : range;
  return { kind: 'disk', origin: { x: origin.x + Math.cos(angleRadians) * length,
    y: origin.y + Math.sin(angleRadians) * length }, radius: pattern.radius };
}
