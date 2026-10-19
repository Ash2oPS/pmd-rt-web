import type { Move, Species } from '../../content/schemas.ts';

/** Provisional real-time balance. No accuracy rolls, critical hits, STAB or type chart yet. */
export function moveDamage(move: Move, attacker: Species, defender: Species): number {
  if (move.category === 'status' || move.power <= 0) return 0;
  const offense = move.category === 'physical' ? attacker.stats.attack : attacker.stats.specialAttack;
  const defense = move.category === 'physical' ? defender.stats.defense : defender.stats.specialDefense;
  return Math.max(1, Math.round(move.power * .4 * Math.sqrt(offense / defense)));
}
