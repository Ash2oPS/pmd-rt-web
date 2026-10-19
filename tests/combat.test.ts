import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { content, field, movementSettings } from '../src/content/catalog.ts';
import { combatMoveSchema, dungeonSchema, moveSchema, speciesSchema } from '../src/content/schemas.ts';
import { Encounter } from '../src/domain/combat/encounter.ts';
import { createState } from '../src/domain/state.ts';
import { canOccupy } from '../src/domain/movement.ts';
import { clearAttackPath, sector, sectorOutline, touchesGeometry, touchesSector } from '../src/domain/combat/geometry.ts';

const record = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
// M2 legacy records remain regression fixtures; production records now use pattern/effect.
const moves = ['pound', 'vine-whip'].map(id => {
  const move = moveSchema.parse(record(`../content/moves/${id}.json`));
  const rule = move.combat!;
  if ('pattern' in rule && rule.pattern.kind === 'sector') {
    const { pattern, effect: _effect, ...timing } = rule;
    return { ...move, combat: { ...timing, range: pattern.range, angleDegrees: pattern.angleDegrees, damage: id === 'pound' ? 18 : 16 } };
  }
  throw new Error('Expected sector fixture');
});
const species = content.species.map(entry => entry.id === 'jigglypuff'
  ? speciesSchema.parse(record('../content/species/jigglypuff.json')) : entry);
function fixture(damage?: number, enemyDamage?: number) {
  const dungeon = structuredClone(field);
  dungeon.actors = [{ ...dungeon.actors.find(actor => actor.speciesId === 'bulbasaur')!, x: 4, y: 5, facing: 'left' }];
  const state = createState(dungeon); state.facing = 'right';
  const authoredMoves = structuredClone(moves);
  if (damage) authoredMoves[0]!.combat!.damage = damage;
  if (enemyDamage) authoredMoves[1]!.combat!.damage = enemyDamage;
  const encounter = new Encounter({ field: dungeon, species, moves: authoredMoves, movementSettings, state });
  return { encounter, state, dungeon };
}

test('attacks require preparation, lock movement, hit once and respect recovery/cooldown', () => {
  const { encounter } = fixture();
  assert.equal(encounter.requestAttack('missing'), false);
  assert.equal(encounter.requestAttack('vine-whip'), false, 'Species learnsets remain authoritative');
  assert.equal(encounter.requestAttack('pound'), true);
  assert.equal(encounter.requestAttack('pound'), false);
  assert.equal(encounter.playerMovementMultiplier, 0);
  const hp = encounter.actors[0]!.hp;
  encounter.update(.37);
  assert.equal(encounter.actors[0]!.hp, hp, 'No damage during preparation');
  encounter.update(.02);
  assert.equal(encounter.actors[0]!.hp, hp - 18);
  encounter.update(.2);
  assert.equal(encounter.actors[0]!.hp, hp - 18, 'Active overlap does not multiply hits');
  assert.equal(encounter.playerMovementMultiplier, 1, 'Recovery permits repositioning');
  assert.equal(encounter.requestAttack('pound'), false);
  encounter.update(.2);
  assert.equal(encounter.requestAttack('pound'), true);
});

test('enemy briefly tracks then freezes its announced zone and cannot hit before activation', () => {
  const { encounter, state } = fixture();
  encounter.reset(state, 0);
  encounter.update(.01);
  const cast = encounter.snapshot().casts[0]!;
  assert.equal(cast.casterId, 'bulbasaur-visitor');
  assert.equal(cast.phase, 'tracking');
  assert.equal(touchesGeometry(cast.geometry, encounter.player), true, 'The announced zone includes its target');
  state.player = { x: 3, y: 5.2 };
  encounter.update(.32);
  const locked = encounter.snapshot().casts[0]!;
  assert.equal(locked.phase, 'locked');
  const facingAtLock = encounter.actors[0]!.facing;
  state.player = { x: 4, y: 7 };
  encounter.update(.5);
  assert.deepEqual(encounter.snapshot().casts[0]!.geometry, locked.geometry);
  assert.equal(encounter.actors[0]!.facing, facingAtLock);
  assert.equal(encounter.player.hp, 80);
  encounter.update(.2);
  assert.equal(encounter.player.hp, 80, 'Leaving the locked area dodges the hit');
  assert.ok(encounter.takeEvents().some(event => event.type === 'activation'));
});

test('hostile warning geometry is the geometry that contacts the player', () => {
  const { encounter, state } = fixture();
  encounter.reset(state, 0);
  encounter.update(.01);
  const warning = encounter.snapshot().casts.find(cast => cast.casterId !== 'player')!;
  assert.equal(warning.moveId, 'vine-whip');
  assert.equal(touchesGeometry(warning.geometry, encounter.player), true);
  const hp = encounter.player.hp;
  encounter.update(1);
  assert.equal(encounter.player.hp, hp - 16);
  assert.ok(encounter.takeEvents().some(event => event.type === 'hit' && event.casterId === warning.casterId
    && event.targetId === 'player'), 'The announced contact resolves through the same cast');
});

test('zero/invalid simulation time freezes phases, grace, roaming, HP and event counts', () => {
  const { encounter } = fixture();
  encounter.requestAttack('pound'); encounter.update(.1);
  const before = encounter.snapshot();
  for (const dt of [0, -1, NaN, Infinity]) encounter.update(dt);
  assert.deepEqual(encounter.snapshot(), before);
});

test('winning and losing stop casts; reset preserves exploration position and restores a safe fresh fight', () => {
  const { encounter, state } = fixture(999);
  encounter.requestAttack('pound'); encounter.update(.5);
  assert.equal(encounter.result, 'won');
  assert.equal(encounter.snapshot().casts.length, 0);
  assert.equal(encounter.actors[0]!.defeated, true);
  assert.equal(encounter.requestAttack('pound'), false);
  state.player = { x: 3.2, y: 5.1 };
  encounter.reset(state);
  assert.equal(encounter.result, 'playing');
  assert.deepEqual({ x: encounter.player.x, y: encounter.player.y }, state.player);
  assert.equal(encounter.snapshot().graceSeconds, 1);
  const loser = fixture(undefined, 999);
  loser.encounter.reset(loser.state, 0);
  loser.encounter.update(1.2);
  assert.equal(loser.encounter.result, 'lost');
  assert.equal(loser.encounter.player.hp, 0);
  assert.equal(loser.encounter.snapshot().casts.length, 0);
  assert.equal(loser.encounter.playerMovementMultiplier, 0);
});

test('grace prevents enemy casting; cancellation removes telegraphs and future damage', () => {
  const { encounter } = fixture();
  encounter.update(.8);
  assert.equal(encounter.snapshot().casts.length, 0);
  encounter.requestAttack('pound'); encounter.update(.1); encounter.cancelAll();
  const hp = encounter.actors[0]!.hp;
  encounter.update(.09);
  assert.equal(encounter.actors[0]!.hp, hp);
  assert.equal(encounter.snapshot().casts.length, 0);
  assert.ok(encounter.takeEvents().some(event => event.type === 'cast-cancel'));
  assert.deepEqual(encounter.takeEvents(), []);
});

test('only content-marked Bulbasaur is hostile; visitors keep roaming and terrain collision', () => {
  const state = createState(field);
  const encounter = new Encounter({ field, species, moves, movementSettings, state });
  const first = encounter.snapshot();
  for (let i = 0; i < 100; i++) encounter.update(.1);
  assert.equal(encounter.actors.filter(actor => actor.team === 'hostile').length, 1);
  assert.equal(encounter.actors.find(actor => actor.team === 'hostile')?.speciesId, 'bulbasaur');
  const neutrals = encounter.actors.filter(actor => actor.team === 'neutral');
  assert.equal(neutrals.length, 8);
  for (const actor of encounter.actors) assert.equal(canOccupy(field, actor), true);
  assert.ok(neutrals.some(actor => {
    const initial = first.actors.find(entry => entry.id === actor.id)!;
    return Math.hypot(actor.x - initial.x, actor.y - initial.y) > .1;
  }));
  assert.ok(neutrals.every(actor => actor.hp === actor.maxHp));
});

test('hostile awareness starts only on simulation time and pursues after a nearby clear view', () => {
  const state = createState(field);
  const encounter = new Encounter({ field, species, moves, movementSettings, state });
  const before = encounter.snapshot();
  assert.equal(before.actors.find(actor => actor.team === 'hostile')?.behavior, 'idle');
  encounter.update(0);
  assert.deepEqual(encounter.snapshot(), before, 'Idle does not let an enemy notice or move');
  encounter.update(.2);
  const after = encounter.snapshot();
  const hostile = after.actors.find(actor => actor.team === 'hostile')!;
  assert.ok(Math.hypot(hostile.x - before.actors[0]!.x, hostile.y - before.actors[0]!.y) > .01);
  assert.ok(['idle', 'approach'].includes(hostile.behavior), 'It closes distance or waits at its authored move range');
  assert.equal(after.casts.some(cast => cast.casterId === hostile.id), false, 'The initial grace still blocks danger');
});

test('a wall blocks first notice until the explorer reaches a clear view', () => {
  const dungeon = dungeonSchema.parse({ id: 'line-of-sight', label: 'Line of sight', tileSize: 32,
    playerSpeciesId: 'jigglypuff', map: ['########', '#......#', '#..#...#', '#..#...#', '#......#', '#......#', '########'],
    spawn: { x: 1, y: 2 }, collectibles: [], actors: [{ id: 'watcher', speciesId: 'bulbasaur', team: 'hostile', noticeRange: 6,
      x: 5, y: 2, facing: 'left', animation: 'Idle' }] });
  const state = createState(dungeon);
  const encounter = new Encounter({ field: dungeon, species, moves, movementSettings, state });
  encounter.reset(state, 0);
  const actor = encounter.actors[0]!;
  encounter.update(.25);
  assert.equal(actor.behavior, 'idle');
  assert.deepEqual({ x: actor.x, y: actor.y }, { x: 5, y: 2 });
  state.player = { x: 5, y: 5 };
  encounter.update(.1);
  assert.equal(actor.behavior, 'approach');
  assert.ok(actor.y > 2, 'The enemy moves only after its first clear sightline');
});

test('revival resets enemies and transient attacks while keeping neutral positions and player progress', () => {
  const dungeon = structuredClone(field);
  dungeon.playerSpeciesId = 'squirtle';
  const state = createState(dungeon); state.player = { x: 2, y: 4 }; state.facing = 'down'; state.collected = [0];
  const lethalMoves = structuredClone(content.moves.filter(move => ['vine-whip', 'water-gun'].includes(move.id)));
  lethalMoves.find(move => move.id === 'vine-whip')!.power = 999;
  const water = lethalMoves.find(move => move.id === 'water-gun')!;
  if (water.combat && 'pattern' in water.combat && water.combat.pattern.kind === 'projectile') {
    water.combat.pattern.range = 10; water.combat.pattern.speed = 1;
  }
  const encounter = new Encounter({ field: dungeon, species: content.species, moves: lethalMoves, movementSettings, state,
    continueAfterVictory: true });
  encounter.reset(state, 0);
  assert.equal(encounter.requestAttack('water-gun'), true);
  encounter.update(.7);
  assert.equal(encounter.snapshot().projectiles.length, 1, 'The player has a projectile in flight before the K.O.');
  encounter.update(.4);
  assert.equal(encounter.result, 'lost');
  assert.equal(encounter.snapshot().casts.length, 0);
  assert.equal(encounter.snapshot().projectiles.length, 0);
  assert.equal(encounter.snapshot().zones.length, 0);
  const neutralPositions = new Map(encounter.actors.filter(actor => actor.team === 'neutral')
    .map(actor => [actor.id, { x: actor.x, y: actor.y }]));
  encounter.revive();
  const fresh = encounter.snapshot();
  assert.equal(fresh.result, 'playing');
  assert.equal(fresh.player.hp, fresh.player.maxHp);
  assert.equal(fresh.graceSeconds, 1);
  assert.deepEqual(state.player, { x: 2, y: 4 });
  assert.deepEqual(state.collected, [0]);
  assert.equal(fresh.actors.find(actor => actor.team === 'hostile')?.defeated, false);
  for (const actor of fresh.actors.filter(actor => actor.team === 'neutral'))
    assert.deepEqual(neutralPositions.get(actor.id), { x: actor.x, y: actor.y });
  assert.deepEqual(fresh.casts, []); assert.deepEqual(fresh.projectiles, []); assert.deepEqual(fresh.zones, []);
  assert.deepEqual(fresh.statuses, []);
});

test('sector geometry includes collision-radius edges in every direction and respects terrain', () => {
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    const geometry = sector({ x: 3, y: 5 }, angle, 1, 90);
    assert.equal(touchesSector(geometry, { x: 3 + Math.cos(angle) * 1.1, y: 5 + Math.sin(angle) * 1.1 }), true);
    assert.equal(touchesSector(geometry, { x: 3 - Math.cos(angle), y: 5 - Math.sin(angle) }), false);
  }
  assert.equal(clearAttackPath({ map: ['#####', '#.#.#', '#####'] }, { x: 1, y: 1 }, { x: 3, y: 1 }), false);
});

test('combat records require positive preparation and a real locked interval', () => {
  const rule = moves[0]!.combat!;
  assert.equal(combatMoveSchema.safeParse({ ...rule, preparationSeconds: 0 }).success, false);
  assert.equal(combatMoveSchema.safeParse({ ...rule, trackingSeconds: rule.preparationSeconds }).success, false);
  assert.equal(combatMoveSchema.safeParse({ ...rule, movementDuringPreparation: 2 }).success, false);
});

test('a frame crossing a very short active phase still resolves its contact exactly once', () => {
  const { state, dungeon } = fixture();
  const fast = structuredClone(moves);
  Object.assign(fast[0]!.combat!, { preparationSeconds: .004, trackingSeconds: .001, activeSeconds: .002 });
  const encounter = new Encounter({ field: dungeon, species, moves: fast, movementSettings, state });
  encounter.requestAttack('pound');
  encounter.update(.02);
  assert.equal(encounter.actors[0]!.hp, encounter.actors[0]!.maxHp - 18);
  assert.equal(encounter.takeEvents().filter(event => event.type === 'hit').length, 1);
});

test('telegraph contours stop at the same wall that blocks contacts, including floor behind it', () => {
  const world = { map: ['#######', '#.#...#', '#.....#', '#######'] };
  const geometry = sector({ x: 1, y: 1 }, 0, 4, 6);
  const outline = sectorOutline(world, geometry);
  assert.equal(clearAttackPath(world, geometry.origin, { x: 4, y: 1 }), false);
  assert.ok(outline.length >= 4);
  assert.ok(outline.every(point => point.x < 1.5));
  assert.ok(outline.slice(1).every(point => clearAttackPath(world, geometry.origin, point)));
  const open = { map: ['########', '#......#', '#......#', '########'] };
  const clear = sector({ x: 2, y: 1.5 }, 0, 1, 60);
  const clearOutline = sectorOutline(open, clear);
  assert.equal(clearOutline.length, 22);
  for (const point of clearOutline.slice(1)) assert.ok(Math.abs(Math.hypot(point.x - 2, point.y - 1.5) - 1) < 1e-12);
});
