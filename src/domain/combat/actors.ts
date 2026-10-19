import { createRoamers } from '../roaming.ts';
import { relativeMovementSpeed } from '../speed.ts';
import type { CastSnapshot, CombatActor, EncounterOptions } from './types.ts';

/** Every field actor reads and writes the same authoritative roaming position. */
export function createEncounterActors(options: EncounterOptions): CombatActor[] {
  const speciesFor = (id: string) => {
    const species = options.species.find(entry => entry.id === id);
    if (!species) throw new Error(`Unknown combat species: ${id}`);
    return species;
  };
  const playerStat = speciesFor(options.field.playerSpeciesId).stats.speed;
  return createRoamers(options.field.actors, definition => relativeMovementSpeed(
    speciesFor(definition.speciesId).stats.speed, playerStat, options.movementSettings,
    definition.roaming?.behaviorMultiplier ?? 0,
  )).map(roaming => {
    const definition = options.field.actors.find(actor => actor.id === roaming.id);
    if (!definition) throw new Error(`Unknown field actor: ${roaming.id}`);
    const maxHp = speciesFor(roaming.speciesId).stats.hp;
    return { id: roaming.id, speciesId: roaming.speciesId, roaming,
      team: definition.team,
      get x() { return roaming.x; }, set x(value: number) { roaming.x = value; },
      get y() { return roaming.y; }, set y(value) { roaming.y = value; },
      get facing() { return roaming.facing; }, set facing(value) { roaming.facing = value; },
      hp: maxHp, maxHp, defeated: false, animation: roaming.animation,
      behavior: 'idle', resolvedSpeed: roaming.resolvedSpeed };
  });
}

export function syncActorAnimations(actors: readonly CombatActor[], casts: readonly CastSnapshot[],
  hurtUntil: ReadonlyMap<string, number>, isSleeping: (id: string) => boolean, time: number): void {
  for (const actor of actors) {
    const cast = casts.find(entry => entry.casterId === actor.id);
    if (actor.defeated) { actor.behavior = 'defeated'; actor.animation = 'Idle'; actor.roaming.velocity = { x: 0, y: 0 }; continue; }
    if (isSleeping(actor.id)) { actor.behavior = 'sleeping'; actor.animation = 'Idle'; continue; }
    if (cast) actor.behavior = cast.phase === 'recovery' ? 'recovering' : cast.phase === 'active' ? 'active' : 'preparing';
    if (actor.team === 'neutral') actor.behavior = actor.roaming.behavior === 'Roaming' ? 'roaming' : 'idle';
    actor.animation = (hurtUntil.get(actor.id) ?? 0) > time ? 'Hurt'
      : cast && cast.phase !== 'recovery' ? 'Attack' : Math.hypot(actor.roaming.velocity.x, actor.roaming.velocity.y) > .001 ? 'Walk' : 'Idle';
  }
}
