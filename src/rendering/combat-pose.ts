import type { Move } from '../content/schemas.ts';
import type { SpriteManifest } from '../content/sprite-schema.ts';
import type { CombatEntity, EncounterSnapshot } from '../domain/combat/types.ts';
import { attackAnimationTimeMs } from './combat-animation.ts';
import { animationPhase } from '../domain/animation.ts';

/** Align authored Attack frames to semantic contact without rescaling their durations or roots. */
export function combatPose(actor: CombatEntity, view: EncounterSnapshot, manifest: SpriteManifest | undefined, moves: readonly Move[], idleTimeSeconds = view.time) {
  const cast = view.casts.find(cast => cast.casterId === actor.id);
  const source = manifest?.species.find(species => species.id === actor.speciesId)?.animations.Attack;
  const rule = cast ? moves.find(move => move.id === cast.moveId)?.combat : undefined;
  const attacking = !!cast && actor.animation !== 'Hurt' && !actor.defeated;
  return { ...actor, animation: attacking ? 'Attack' as const : actor.animation,
    animationTimeMs: attacking && source && rule ? attackAnimationTimeMs(source, cast.elapsedSeconds, rule.preparationSeconds)
      : actor.animation === 'Idle' || actor.animation === 'Walk' ? idleTimeSeconds * 1000 + animationPhase(actor.id) : view.time * 1000 };
}
