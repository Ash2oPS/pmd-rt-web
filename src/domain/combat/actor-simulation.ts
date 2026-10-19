import type { Dungeon, Move, MovementSettings, Species } from '../../content/schemas.ts';
import { facingFromVector, movePoint } from '../movement.ts';
import { updateRoamers } from '../roaming.ts';
import { relativeMovementSpeed } from '../speed.ts';
import { clearAttackPath } from './geometry.ts';
import { engagementRange } from './patterns.ts';
import type { CastSnapshot, CombatActor, CombatEntity } from './types.ts';

export interface ActorSimulation {
  actors: CombatActor[];
  casts: readonly CastSnapshot[];
  field: Dungeon;
  graceSeconds: number;
  awareActors: Set<string>;
  player: CombatEntity;
  species: readonly Species[];
  moves: readonly Move[];
  movementSettings: MovementSettings;
  aiEnabled?: boolean;
  isSleeping(id: string): boolean;
  moveReady(actorId: string, moveId: string): boolean;
  beginCast(actor: CombatActor, moveId: string): void;
}

/** Update roaming and hostile behavior only when the caller advances world time. */
export function updateEncounterActors(simulation: ActorSimulation, dt: number): void {
  const speciesFor = (id: string) => {
    const species = simulation.species.find(entry => entry.id === id);
    if (!species) throw new Error(`Unknown combat species: ${id}`);
    return species;
  };
  const neutrals = simulation.actors.filter(actor => actor.team === 'neutral' && !actor.defeated && !simulation.isSleeping(actor.id));
  updateRoamers(neutrals.map(actor => actor.roaming), simulation.field, dt);
  for (const actor of simulation.actors) {
    if (actor.team !== 'hostile' || actor.defeated) continue;
    if (simulation.aiEnabled === false) { actor.behavior = 'idle'; actor.roaming.velocity = { x: 0, y: 0 }; continue; }
    if (simulation.isSleeping(actor.id)) { actor.behavior = 'sleeping'; actor.roaming.velocity = { x: 0, y: 0 }; continue; }
    actor.roaming.velocity = { x: 0, y: 0 };
    const cast = simulation.casts.find(entry => entry.casterId === actor.id);
    if (cast) { actor.behavior = cast.phase === 'recovery' ? 'recovering' : cast.phase === 'active' ? 'active' : 'preparing'; continue; }
    const dx = simulation.player.x - actor.x, dy = simulation.player.y - actor.y, distance = Math.hypot(dx, dy);
    if (!simulation.awareActors.has(actor.id)) {
      if (distance > actor.noticeRange || !clearAttackPath(simulation.field, actor, simulation.player)) { actor.behavior = 'idle'; continue; }
      simulation.awareActors.add(actor.id);
    }
    const learned = simulation.moves.filter(move => move.combat
      && speciesFor(actor.speciesId).learnset.some(entry => entry.moveId === move.id));
    if (!learned.length) { actor.behavior = 'idle'; continue; }
    if (distance > 1e-9) actor.facing = facingFromVector({ x: dx, y: dy });
    const move = simulation.graceSeconds <= 1e-9 && clearAttackPath(simulation.field, actor, simulation.player)
      ? learned.find(candidate => distance <= engagementRange(candidate.combat!) * .85 && simulation.moveReady(actor.id, candidate.id))
      : undefined;
    if (move) { actor.behavior = 'idle'; simulation.beginCast(actor, move.id); continue; }
    if (distance <= Math.min(...learned.map(candidate => engagementRange(candidate.combat!) * .85))) { actor.behavior = 'idle'; continue; }
    const speed = relativeMovementSpeed(speciesFor(actor.speciesId).stats.speed, speciesFor(simulation.player.speciesId).stats.speed,
      simulation.movementSettings, simulation.movementSettings.pursuitMultiplier);
    actor.resolvedSpeed = speed;
    if (distance <= 1e-9) continue;
    const length = Math.min(speed * dt, Math.max(0, distance - .5));
    const point = movePoint(simulation.field, actor, { x: dx / distance * length, y: dy / distance * length });
    actor.roaming.velocity = { x: (point.x - actor.x) / dt, y: (point.y - actor.y) / dt };
    actor.x = point.x; actor.y = point.y; actor.behavior = 'approach';
  }
}
