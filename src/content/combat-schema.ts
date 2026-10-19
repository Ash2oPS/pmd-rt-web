import { z } from 'zod';
import { zonePatternSchema } from './zone-schema.ts';

const reach = z.number().min(.1).max(12);
export const attackPatternSchema = z.discriminatedUnion('kind', [
  zonePatternSchema,
  z.strictObject({ kind: z.literal('sector'), range: reach, angleDegrees: z.number().min(1).max(360) }),
  z.strictObject({ kind: z.literal('self-disk'), radius: reach }),
  z.strictObject({ kind: z.literal('target-disk'), radius: reach, targetingRange: reach }),
  z.strictObject({ kind: z.literal('projectile'), range: reach, width: z.number().min(.05).max(4),
    speed: z.number().min(.1).max(40), radius: z.number().min(.025).max(2) }),
]);
export const attackEffectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('damage') }),
  z.strictObject({ kind: z.literal('sleep'), durationSeconds: z.number().positive().max(20), wakeOnHit: z.boolean() }),
]);
const timing = {
  preparationSeconds: z.number().positive().max(10),
  trackingSeconds: z.number().nonnegative().max(10),
  activeSeconds: z.number().positive().max(5),
  recoverySeconds: z.number().nonnegative().max(10),
  cooldownSeconds: z.number().nonnegative().max(30),
  movementDuringPreparation: z.number().min(0).max(1),
};
/** Legacy sectors are accepted separately; an attack can never have competing dimensions/damage sources. */
export const combatMoveSchema = z.union([
  z.strictObject({ ...timing, pattern: attackPatternSchema, effect: attackEffectSchema }),
  z.strictObject({ ...timing, range: reach, angleDegrees: z.number().min(1).max(360), damage: z.number().int().min(1).max(999) }),
]).superRefine((move, context) => {
  if (move.trackingSeconds >= move.preparationSeconds) context.addIssue({ code: 'custom',
    message: 'Tracking must end before preparation so a positive locked interval remains' });
  if ('pattern' in move && move.pattern.kind === 'projectile' && Math.abs(move.pattern.width - 2 * move.pattern.radius) > 1e-8)
    context.addIssue({ code: 'custom', message: 'Projectile corridor width must equal twice its contact radius', path: ['pattern', 'width'] });
});
export type CombatMoveDefinition = z.infer<typeof combatMoveSchema>;
export type AttackPattern = z.infer<typeof attackPatternSchema>;
export type AttackEffect = z.infer<typeof attackEffectSchema>;
