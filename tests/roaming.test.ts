import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dungeonSchema } from '../src/content/schemas.ts';
import { content, movementSettings } from '../src/content/catalog.ts';
import { relativeMovementSpeed } from '../src/domain/speed.ts';
import { canOccupy } from '../src/domain/movement.ts';
import { createRoamers, updateRoamers } from '../src/domain/roaming.ts';

const dungeon = dungeonSchema.parse(JSON.parse(readFileSync(
  new URL('../content/dungeons/awakening-woods.json', import.meta.url), 'utf8',
)));

const speedFor = (actor: typeof dungeon.actors[number]) => relativeMovementSpeed(
  content.species.find(species => species.id === actor.speciesId)!.stats.speed,
  content.species.find(species => species.id === dungeon.playerSpeciesId)!.stats.speed,
  movementSettings, actor.roaming?.behaviorMultiplier ?? 0,
);

test('every authored Pokémon alternates rest and coherent local roaming without crossing walls or water', () => {
  const actors = createRoamers(dungeon.actors, speedFor);
  const observed = actors.map(() => new Set<string>());
  const traveled = actors.map(() => 0);
  for (let frame = 0; frame < 60 * 180; frame++) {
    const previous = actors.map(({ x, y }) => ({ x, y }));
    updateRoamers(actors, dungeon, 1 / 60);
    for (const [index, actor] of actors.entries()) {
      const profile = actor.profile!;
      observed[index]!.add(actor.behavior);
      assert.equal(actor.animation, actor.behavior === 'Roaming' ? 'Walk' : 'Idle');
      assert.ok(canOccupy(dungeon, actor), `${actor.id} crossed blocked terrain`);
      assert.ok(Math.hypot(actor.x - actor.home.x, actor.y - actor.home.y) <= profile.radius + 0.00001);
      const distance = Math.hypot(actor.x - previous[index]!.x, actor.y - previous[index]!.y);
      traveled[index]! += distance;
      assert.ok(distance <= actor.resolvedSpeed / 60 + 0.00001, `${actor.id} teleported`);
      if (actor.animation === 'Walk') assert.ok(distance > 0);
      if (actor.behavior === 'Idle') assert.deepEqual(actor.velocity, { x: 0, y: 0 });
    }
  }
  for (const [index, states] of observed.entries()) {
    assert.deepEqual([...states].sort(), ['Idle', 'Roaming']);
    assert.ok(traveled[index]! > 10, actors[index]!.id);
  }
  assert.ok(new Set(actors.map(({ x, y }) => `${x.toFixed(3)},${y.toFixed(3)}`)).size > 5);
});

test('roaming is seeded per instance and frozen when no simulation time passes', () => {
  const first = createRoamers(dungeon.actors, speedFor), second = createRoamers(dungeon.actors, speedFor);
  for (let frame = 0; frame < 1200; frame++) {
    updateRoamers(first, dungeon, 0.025);
    updateRoamers(second, dungeon, 0.025);
  }
  assert.deepEqual(first, second);
  const snapshot = structuredClone(first);
  for (const dt of [0, -1, Infinity, NaN]) updateRoamers(first, dungeon, dt);
  assert.deepEqual(first, snapshot);
  const reordered = createRoamers([...dungeon.actors].reverse(), speedFor);
  for (let frame = 0; frame < 1200; frame++) updateRoamers(reordered, dungeon, 0.025);
  assert.deepEqual(reordered.reverse(), first);
});

test('unconfigured actors remain authored poses and enclosed actors retry without jitter or teleportation', () => {
  const definition = dungeon.actors[0]!;
  const staticActors = createRoamers([{ ...definition, roaming: undefined }], speedFor);
  const original = structuredClone(staticActors);
  updateRoamers(staticActors, dungeon, 30);
  assert.deepEqual(staticActors, original);
  const actors = createRoamers([{ ...definition, x: 1, y: 1 }], speedFor);
  const tinyWorld = { map: ['###', '#.#', '###'] };
  for (let frame = 0; frame < 1200; frame++) {
    updateRoamers(actors, tinyWorld, 0.025);
    assert.ok(canOccupy(tinyWorld, actors[0]!));
    assert.ok(Math.hypot(actors[0]!.x - 1, actors[0]!.y - 1) < 0.4);
  }
});

test('roaming duration ranges reject inverted values', () => {
  const invalid = structuredClone(dungeon);
  invalid.actors[0]!.roaming!.idleMinSeconds = 10;
  invalid.actors[0]!.roaming!.idleMaxSeconds = 1;
  assert.equal(dungeonSchema.safeParse(invalid).success, false);
});

test('slow roamers receive enough travel time to reach their selected destination', () => {
  const actors = createRoamers([dungeon.actors[0]!], () => .05);
  const actor = actors[0]!;
  actor.remaining = 0;
  updateRoamers(actors, dungeon, .025);
  const target = { ...actor.target! };
  const start = { x: actor.x, y: actor.y };
  assert.ok(actor.remaining >= Math.hypot(target.x - start.x, target.y - start.y) / .05);
  for (let i = 0; i < 10000 && actor.behavior === 'Roaming'; i++) updateRoamers(actors, dungeon, .025);
  assert.ok(Math.hypot(actor.x - target.x, actor.y - target.y) < .02);
});
