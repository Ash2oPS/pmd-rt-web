import type { MovementSettings } from '../content/schemas.ts';

/** All NPC movement refers to the player's maximum, never current stick deflection. */
export function relativeMovementSpeed(actorStat: number, playerStat: number, settings: MovementSettings, behaviorMultiplier = 1): number {
  if (!Number.isFinite(actorStat) || actorStat <= 0 || !Number.isFinite(playerStat) || playerStat <= 0
    || !Number.isFinite(behaviorMultiplier) || behaviorMultiplier < 0) throw new Error('Invalid movement speed inputs');
  const ratio = Math.min(settings.maxSpeedRatio, Math.max(settings.minSpeedRatio,
    (actorStat / playerStat) ** settings.relativeSpeedExponent));
  return settings.playerMaxSpeed * ratio * behaviorMultiplier;
}
