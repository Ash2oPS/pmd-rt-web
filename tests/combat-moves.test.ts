import test from 'node:test';
import assert from 'node:assert/strict';
import { content, field, movementSettings } from '../src/content/catalog.ts';
import { combatMoveSchema } from '../src/content/combat-schema.ts';
import { createState } from '../src/domain/state.ts';
import { Encounter } from '../src/domain/combat/encounter.ts';
import { moveDamage } from '../src/domain/combat/damage.ts';
import { advanceProjectile } from '../src/domain/combat/projectiles.ts';
import type { Projectile } from '../src/domain/combat/projectiles.ts';
import { clearanceDistance, geometryOutline } from '../src/domain/combat/geometry.ts';

function fixture(playerSpeciesId = 'jigglypuff', enemySpeciesId = 'bulbasaur', enemyX = 4) {
  const dungeon = structuredClone(field); dungeon.playerSpeciesId = playerSpeciesId;
  dungeon.actors = [{ ...field.actors.find(actor => actor.speciesId === enemySpeciesId)!, team: 'hostile', noticeRange: 8, x: enemyX, y: 5, facing: 'left' }];
  const state = createState(dungeon); state.facing = 'right';
  // Keep behavior fixtures independent of additional designer-authored moves/learnset entries.
  const moves = structuredClone(content.moves.filter(move => ['pound', 'sing', 'vine-whip', 'water-gun', 'thunder'].includes(move.id)));
  const encounter = new Encounter({ field: dungeon, state, species: content.species, moves, movementSettings });
  return { encounter, state, dungeon, moves };
}

test('multi-move enemies select a reachable move instead of an unavailable first move', () => {
  const ranged = fixture('jigglypuff', 'bulbasaur', 4.6);
  Object.assign(ranged.moves.find(move => move.id === 'pound')!.combat!, { pattern: { kind: 'sector', range: 1.15, angleDegrees: 95 } });
  ranged.dungeon.actors[0]!.speciesId = 'jigglypuff';
  ranged.encounter.reset(ranged.state, 0);
  ranged.encounter.update(.01);
  assert.equal(ranged.encounter.snapshot().casts[0]?.moveId, 'sing', 'Sing reaches beyond Pound');

  const cooling = fixture('jigglypuff', 'bulbasaur', 3.8);
  cooling.dungeon.actors[0]!.speciesId = 'jigglypuff';
  cooling.moves.find(move => move.id === 'pound')!.combat!.cooldownSeconds = 10;
  cooling.encounter.reset(cooling.state, 0);
  cooling.encounter.update(.01);
  assert.equal(cooling.encounter.snapshot().casts[0]?.moveId, 'pound');
  const firstRule = cooling.moves.find(move => move.id === 'pound')!.combat!;
  cooling.encounter.update(firstRule.preparationSeconds + firstRule.activeSeconds + firstRule.recoverySeconds + .02);
  assert.equal(cooling.encounter.snapshot().casts[0]?.moveId, 'sing', 'A ready second move replaces cooling Pound');
  assert.deepEqual(cooling.encounter.takeEvents().filter(event => event.type === 'cast-start')
    .map(event => event.moveId), ['pound', 'sing']);
});

test('new move definitions use a single pattern/effect source and category-based damage', () => {
  const attacker = structuredClone(content.species.find(species => species.id === 'jigglypuff')!);
  const defender = structuredClone(content.species.find(species => species.id === 'bulbasaur')!);
  const pound = structuredClone(content.moves.find(move => move.id === 'pound')!);
  attacker.stats.attack = 100; attacker.stats.specialAttack = 25;
  defender.stats.defense = 25; defender.stats.specialDefense = 100;
  pound.power = 40;
  assert.equal(moveDamage(pound, attacker, defender), 32);
  pound.category = 'special'; assert.equal(moveDamage(pound, attacker, defender), 8);
  pound.category = 'status'; assert.equal(moveDamage(pound, attacker, defender), 0);
  const rule = content.moves.find(move => move.id === 'water-gun')!.combat!;
  assert.equal(combatMoveSchema.safeParse({ ...rule, damage: 50 }).success, false);
  assert.equal(combatMoveSchema.safeParse({ ...rule, range: 8 }).success, false);
  if ('pattern' in rule && rule.pattern.kind === 'projectile') {
    assert.equal(combatMoveSchema.safeParse({ ...rule, pattern: { ...rule.pattern, width: 1 } }).success, false);
  }
});

test('Berceuse holds its caster, waits for preparation, interrupts and expires only on simulation time', () => {
  const { encounter, moves, state } = fixture();
  const sing = moves.find(move => move.id === 'sing')!.combat!;
  const vine = moves.find(move => move.id === 'vine-whip')!.combat!;
  vine.preparationSeconds = 3;
  encounter.reset(state, 0);
  assert.equal(encounter.requestAttack('sing'), true);
  assert.equal(encounter.playerMovementMultiplier, 0);
  encounter.update(sing.preparationSeconds - .02);
  assert.equal(encounter.snapshot().statuses.length, 0);
  assert.ok(encounter.snapshot().casts.some(cast => cast.casterId !== 'player'));
  encounter.update(.03);
  const sleep = encounter.snapshot().statuses[0]!;
  assert.equal(sleep.kind, 'sleep');
  assert.equal(encounter.actors[0]!.behavior, 'sleeping');
  assert.equal(encounter.snapshot().casts.some(cast => cast.casterId !== 'player'), false);
  const frozen = encounter.snapshot(); encounter.update(0); assert.deepEqual(encounter.snapshot(), frozen);
  encounter.update(1.9);
  assert.equal(encounter.snapshot().statuses.length, 1);
  encounter.update(.15);
  assert.equal(encounter.snapshot().statuses.length, 0);
  const events = encounter.takeEvents();
  assert.ok(events.some(event => event.type === 'cast-cancel' && event.casterId !== 'player'));
  assert.ok(events.some(event => event.type === 'sleep-end'));
});

test('ordinary damage wakes sleep without cancelling an already preparing attack', () => {
  const { encounter, moves, state } = fixture();
  const sing = moves.find(move => move.id === 'sing')!.combat!;
  encounter.reset(state, 100);
  encounter.requestAttack('sing'); encounter.update(sing.preparationSeconds + .02);
  assert.equal(encounter.snapshot().statuses.length, 1);
  encounter.update(sing.activeSeconds + sing.recoverySeconds + .02);
  assert.equal(encounter.requestAttack('pound'), true);
  const pound = moves.find(move => move.id === 'pound')!.combat!;
  encounter.update(pound.preparationSeconds + .01);
  assert.equal(encounter.snapshot().statuses.length, 0);
  assert.ok(encounter.takeEvents().some(event => event.type === 'sleep-end'));
  const other = fixture();
  other.encounter.reset(other.state, 0);
  other.encounter.update(.01);
  const enemyCast = other.encounter.snapshot().casts[0]!.id;
  other.encounter.requestAttack('pound'); other.encounter.update(pound.preparationSeconds + .01);
  assert.ok(other.encounter.snapshot().casts.some(cast => cast.id === enemyCast));
});

test('Pistolet a O launches after preparation then travels before dealing damage', () => {
  const { encounter, moves, state } = fixture('squirtle', 'bulbasaur', 5);
  const water = moves.find(move => move.id === 'water-gun')!.combat!;
  encounter.reset(state, 100);
  assert.equal(encounter.requestAttack('water-gun'), true);
  const initialHp = encounter.actors[0]!.hp;
  encounter.update(water.preparationSeconds - .02);
  assert.equal(encounter.snapshot().projectiles.length, 0);
  encounter.update(.03);
  assert.equal(encounter.snapshot().projectiles.length, 1);
  assert.equal(encounter.actors[0]!.hp, initialHp);
  encounter.update(.5);
  assert.ok(encounter.actors[0]!.hp < initialHp);
  assert.equal(encounter.snapshot().projectiles.length, 0);
  assert.equal(encounter.takeEvents().filter(event => event.type === 'hit').length, 1);
});

const projectile = (): Projectile => ({ id: 1, castId: 1, casterId: 'player', moveId: 'water-gun',
  team: 'player', position: { x: 1, y: 1 }, previousPosition: { x: 1, y: 1 }, radius: .2,
  remainingRange: 8, angleRadians: 0, speed: 40 });
test('projectile sweep cannot tunnel through targets or walls, and corridor uses its actual radius', () => {
  const open = { map: ['##########', '#........#', '#........#', '##########'] };
  const moving = projectile();
  const target = { id: 'enemy', speciesId: 'bulbasaur', team: 'hostile' as const, x: 3, y: 1,
    facing: 'left' as const, hp: 45, maxHp: 45, defeated: false, animation: 'Idle' as const };
  const hit = advanceProjectile(moving, open, [target], .2);
  assert.equal(hit.target?.id, 'enemy'); assert.equal(hit.done, true);
  assert.ok(moving.position.x < 3);
  const wall = { map: ['##########', '#.#......#', '#........#', '##########'] };
  const blocked = projectile();
  const contact = advanceProjectile(blocked, wall, [target], .2);
  assert.equal(contact.done, true); assert.equal(contact.target, undefined);
  assert.ok(blocked.position.x < 1.301);
  const contour = geometryOutline(wall, { kind: 'line', origin: { x: 1, y: 1 }, angleRadians: 0, range: 8, width: .4 });
  assert.ok(contour.every(point => point.x <= 1.50001));
  assert.ok(Math.abs(clearanceDistance(wall, { x: 1, y: 1 }, 0, 8, .2) - (blocked.position.x - 1)) < .001);
});

test('Fatal-Foudre preserves its last reachable aim then locks its delayed disk', () => {
  const { encounter, moves, state, dungeon } = fixture('jigglypuff', 'pikachu', 5);
  encounter.reset(state, 0); encounter.update(.01);
  const thunder = moves.find(move => move.id === 'thunder')!.combat!;
  const initial = encounter.snapshot().casts[0]!;
  assert.equal(initial.geometry.kind, 'disk');
  state.player = { x: 22, y: 12 };
  encounter.update(thunder.trackingSeconds + .01);
  const locked = encounter.snapshot().casts[0]!;
  assert.equal(locked.phase, 'locked');
  assert.deepEqual(locked.geometry, initial.geometry, 'Out-of-range target cannot drag the disk elsewhere');
  state.player = { ...initial.geometry.origin };
  const hp = encounter.player.hp;
  encounter.update(thunder.preparationSeconds - thunder.trackingSeconds - .05);
  assert.equal(encounter.player.hp, hp);
  encounter.update(.1);
  assert.ok(encounter.player.hp < hp);
  assert.equal(dungeon.actors[0]!.speciesId, 'pikachu');
});
