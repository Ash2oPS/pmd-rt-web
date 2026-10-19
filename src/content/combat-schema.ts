import { z } from 'zod';

export const combatMoveSchema = z.strictObject({
  preparationSeconds: z.number().positive().max(10),
  trackingSeconds: z.number().nonnegative().max(10),
  activeSeconds: z.number().positive().max(5),
  recoverySeconds: z.number().nonnegative().max(10),
  cooldownSeconds: z.number().nonnegative().max(30),
  movementDuringPreparation: z.number().min(0).max(1),
  range: z.number().min(.1).max(12),
  angleDegrees: z.number().min(1).max(360),
  damage: z.number().int().min(1).max(999),
}).refine(move => move.trackingSeconds < move.preparationSeconds, {
  message: 'Tracking must end before preparation so a positive locked interval remains',
});
export type CombatMoveDefinition = z.infer<typeof combatMoveSchema>;
