import test from 'node:test';
import assert from 'node:assert/strict';
import { content, movementSettings } from '../src/content/catalog.ts';
import { dungeonSchema, moveSchema } from '../src/content/schemas.ts';
import { zonePatternSchema } from '../src/content/zone-schema.ts';
import type { ZonePattern } from '../src/content/zone-schema.ts';
import { Encounter } from '../src/domain/combat/encounter.ts';
import { createState } from '../src/domain/state.ts';
import { geometryOutline, touchesGeometry } from '../src/domain/combat/geometry.ts';
import { resolveOffsets } from '../src/domain/combat/zone-placement.ts';

const basePattern = (): ZonePattern => ({ kind: 'zones', shape: { kind: 'disk', radius: .65 },
  placement: { kind: 'target', targetingRange: 6 }, distribution: { kind: 'single' }, motion: { kind: 'fixed' },
  waves: { count: 1, intervalSeconds: 0, activeSeconds: .8 }, hitPolicy: { kind: 'once-per-cast' } });
function fixture(pattern = basePattern(), seed = 1, target = { x: 8, y: 6 }) {
  const dungeon = dungeonSchema.parse({ id: 'zone-test', label: 'Technical zones fixture', tileSize: 32, playerSpeciesId: 'jigglypuff',
    map: ['####################', ...Array.from({ length: 12 }, () => '#..................#'), '####################'],
    spawn: { x: 6, y: 6 }, collectibles: [], actors: [{ id: 'test-target', speciesId: 'bulbasaur', ...target, facing: 'left', animation: 'Idle' }] });
  const move = moveSchema.parse({ id: 'technical-zones', label: 'Technical fixture only', type: 'normal', category: 'physical', power: 1,
    accuracy: 100, pp: 10, effectId: 'damage', combat: { preparationSeconds: .3, trackingSeconds: .1, activeSeconds: .05,
      recoverySeconds: .05, cooldownSeconds: .4, movementDuringPreparation: 0, pattern, effect: { kind: 'damage' } } });
  const species = structuredClone(content.species);
  species.find(entry => entry.id === 'jigglypuff')!.learnset.push({ level: 1, moveId: move.id });
  species.find(entry => entry.id === 'bulbasaur')!.stats.hp = 999;
  const state = createState(dungeon); state.facing = 'right';
  const encounter = new Encounter({ field: dungeon, state, species, moves: [move], movementSettings,
    hostileIds: ['test-target'], aiEnabled: false, seed });
  return { encounter, state, dungeon, move };
}

test('seeded positions for every random wave resolve before previews and exactly match later activation', () => {
  const pattern = basePattern(); pattern.distribution = { kind: 'random-disk', count: 4, radius: 2 };
  pattern.waves = { count: 2, intervalSeconds: .4, activeSeconds: .2 };
  const first = fixture(pattern, 42), same = fixture(pattern, 42), other = fixture(pattern, 43);
  for (const { encounter } of [first, same, other]) assert.equal(encounter.requestAttack('technical-zones'), true);
  const initial = first.encounter.snapshot().zones;
  assert.equal(initial.length, 8); assert.ok(initial.every(zone => zone.phase === 'pending'));
  assert.deepEqual(initial, same.encounter.snapshot().zones);
  assert.notDeepEqual(initial.map(zone => zone.geometry), other.encounter.snapshot().zones.map(zone => zone.geometry));
  first.encounter.update(.31);
  for (const zone of first.encounter.snapshot().zones) assert.deepEqual(zone.geometry, initial.find(entry => entry.id === zone.id)!.geometry);
  const activations = first.encounter.takeEvents().filter(event => event.type === 'zone-activation');
  assert.equal(activations.length, 4);
  for (const event of activations) assert.ok(initial.some(zone => Math.hypot(zone.geometry.origin.x - event.position.x, zone.geometry.origin.y - event.position.y) < 1e-9));
  assert.equal(first.encounter.snapshot().casts[0]!.zoneIds!.length, 8);
});

test('waves keep their own times after caster recovery and once-per-cast contacts never multiply', () => {
  const pattern = basePattern(); pattern.waves = { count: 3, intervalSeconds: .25, activeSeconds: .1 };
  const { encounter } = fixture(pattern);
  encounter.requestAttack('technical-zones'); encounter.update(.41);
  assert.equal(encounter.snapshot().casts.length, 0);
  assert.equal(encounter.snapshot().zones.length, 2, 'Later waves remain scheduled after recovery');
  encounter.update(.6);
  assert.equal(encounter.snapshot().zones.length, 0);
  const events = encounter.takeEvents();
  assert.equal(events.filter(event => event.type === 'zone-activation').length, 3);
  assert.equal(events.filter(event => event.type === 'zone-expiration').length, 3);
  assert.equal(events.filter(event => event.type === 'hit').length, 1);
});

test('once-per-zone and bounded periodic policies remain independent of frame rate and overlap', () => {
  const once = basePattern(); once.distribution = { kind: 'offsets', offsets: [{ x: 0, y: 0 }, { x: 0, y: 0 }] };
  once.hitPolicy = { kind: 'once-per-zone' };
  const isolated = fixture(once); isolated.encounter.requestAttack('technical-zones'); isolated.encounter.update(1.2);
  assert.equal(isolated.encounter.takeEvents().filter(event => event.type === 'hit').length, 2);
  const periodic = basePattern(); periodic.distribution = once.distribution;
  periodic.hitPolicy = { kind: 'periodic', intervalSeconds: .15, maxHitsPerTarget: 3 };
  const coarse = fixture(periodic), fine = fixture(periodic);
  coarse.encounter.requestAttack('technical-zones'); fine.encounter.requestAttack('technical-zones');
  coarse.encounter.update(1.2);
  for (let i = 0; i < 1200; i++) fine.encounter.update(.001);
  assert.equal(coarse.encounter.takeEvents().filter(event => event.type === 'hit').length, 3);
  assert.equal(fine.encounter.takeEvents().filter(event => event.type === 'hit').length, 3);
  assert.equal(coarse.encounter.actors[0]!.hp, fine.encounter.actors[0]!.hp);
});

test('orbit objects announce their full trajectory and swept contacts cannot miss a crossed target', () => {
  const orbit = basePattern(); orbit.shape = { kind: 'disk', radius: .1 };
  orbit.placement = { kind: 'caster' }; orbit.distribution = { kind: 'circle', count: 1, radius: 2 };
  orbit.motion = { kind: 'orbit', angularSpeedDegrees: 720, followCaster: true };
  orbit.waves.activeSeconds = 1.2;
  const { encounter, state } = fixture(orbit, 1, { x: 6, y: 8 });
  encounter.requestAttack('technical-zones');
  const pending = encounter.snapshot().zones[0]!;
  assert.equal(pending.trajectory!.kind, 'ring');
  assert.ok(Math.abs(pending.trajectory!.innerRadius - 1.9) < 1e-12);
  assert.ok(Math.abs(pending.trajectory!.outerRadius - 2.1) < 1e-12);
  const before = encounter.snapshot(); encounter.update(0); assert.deepEqual(encounter.snapshot(), before);
  encounter.update(.55);
  assert.equal(encounter.takeEvents().filter(event => event.type === 'hit').length, 1);
  const zone = encounter.snapshot().zones[0]!;
  assert.ok(Math.abs(zone.geometry.origin.x - 4) < .001);
  assert.ok(Math.abs(zone.geometry.origin.y - 6) < .001);
  state.player = { x: 7, y: 6 }; encounter.update(.01);
  assert.equal(encounter.snapshot().zones[0]!.trajectory!.origin.x, 7);
});

test('annular sectors preserve their safe hole, angle boundaries and clipped contour', () => {
  const ring = { kind: 'ring' as const, origin: { x: 6, y: 6 }, innerRadius: 1.5, outerRadius: 2.5, angleRadians: 0, angleDegrees: 90 };
  assert.equal(touchesGeometry(ring, { x: 6, y: 6 }), false);
  assert.equal(touchesGeometry(ring, { x: 7, y: 6 }), false);
  assert.equal(touchesGeometry(ring, { x: 8, y: 6 }), true);
  assert.equal(touchesGeometry(ring, { x: 4, y: 6 }), false);
  assert.equal(touchesGeometry(ring, { x: 7.4, y: 6 }), true, 'Target radius overlaps inner edge');
  const { dungeon } = fixture(); const contour = geometryOutline(dungeon, ring);
  assert.ok(contour.length >= 60);
  assert.ok(contour.every(point => Math.hypot(point.x - 6, point.y - 6) >= 1.49));
});

test('new schemas reject excessive counts, inverted rings and unsafe repeated-hit frequency', () => {
  const pattern = basePattern();
  assert.equal(zonePatternSchema.safeParse({ ...pattern, shape: { kind: 'ring', innerRadius: 2, outerRadius: 1 } }).success, false);
  assert.equal(zonePatternSchema.safeParse({ ...pattern, distribution: { kind: 'circle', count: 16, radius: 2 },
    waves: { count: 8, intervalSeconds: .1, activeSeconds: .1 } }).success, false);
  assert.equal(zonePatternSchema.safeParse({ ...pattern, hitPolicy: { kind: 'periodic', intervalSeconds: .001, maxHitsPerTarget: 3 } }).success, false);
  assert.equal(zonePatternSchema.safeParse({ ...pattern, distribution: { kind: 'circle', count: 16, radius: 2 },
    waves: { count: 4, intervalSeconds: .1, activeSeconds: .1 } }).success, true);
});

test('placement failures are finite and explicit; cancellation/reset remove pending and active zones', () => {
  const bad = basePattern(); bad.distribution = { kind: 'offsets', offsets: [{ x: 12, y: 12 }] };
  const invalid = fixture(bad);
  assert.equal(invalid.encounter.requestAttack('technical-zones'), false);
  assert.match(invalid.encounter.snapshot().lastFailure!, /blocked|outside/);
  assert.equal(invalid.encounter.snapshot().zones.length, 0);
  assert.ok(invalid.encounter.takeEvents().some(event => event.type === 'cast-rejected' && event.reason));
  const tiny = { map: ['###', '#.#', '###'] }, random = basePattern();
  random.distribution = { kind: 'random-disk', count: 16, radius: 12 };
  const offsets = resolveOffsets(random, { x: 1, y: 1 }, 0, tiny, 1);
  assert.equal(offsets[0]!.length, 16);
  assert.throws(() => resolveOffsets(random, { x: 0, y: 0 }, 0, tiny, 1), /walkable/);
  const valid = fixture(); valid.encounter.requestAttack('technical-zones'); valid.encounter.update(.4);
  assert.ok(valid.encounter.snapshot().zones.length > 0);
  valid.encounter.cancelAll(); assert.equal(valid.encounter.snapshot().zones.length, 0);
  valid.encounter.reset(valid.state); assert.equal(valid.encounter.snapshot().lastFailure, null);
});

test('aiEnabled false leaves hostile actors hittable while preventing movement and casts', () => {
  const { encounter } = fixture(); const actor = { ...encounter.snapshot().actors[0]! };
  encounter.update(5);
  assert.equal(encounter.snapshot().casts.length, 0);
  assert.equal(encounter.actors[0]!.x, actor.x); assert.equal(encounter.actors[0]!.y, actor.y);
  encounter.requestAttack('technical-zones'); encounter.update(.4);
  assert.ok(encounter.actors[0]!.hp < actor.hp);
});

test('orbit objects hidden by a wall cannot damage targets outside the announced sweep', () => {
  const orbit = basePattern(); orbit.shape = { kind: 'disk', radius: .1 };
  orbit.placement = { kind: 'caster' }; orbit.distribution = { kind: 'circle', count: 1, radius: 2 };
  orbit.motion = { kind: 'orbit', angularSpeedDegrees: 90, followCaster: false };
  orbit.waves.activeSeconds = 2;
  const { encounter, dungeon } = fixture(orbit, 1, { x: 6, y: 8 });
  const row = dungeon.map[7]!; dungeon.map[7] = row.slice(0, 6) + '#' + row.slice(7);
  assert.equal(encounter.requestAttack('technical-zones'), true);
  assert.equal(encounter.snapshot().zones[0]!.occluded, false);
  encounter.update(1.3);
  const zone = encounter.snapshot().zones[0]!;
  assert.ok(Math.hypot(zone.geometry.origin.x - 6, zone.geometry.origin.y - 8) < .001);
  assert.equal(zone.occluded, true);
  encounter.update(.2);
  assert.equal(encounter.takeEvents().filter(event => event.type === 'hit').length, 0);
  assert.equal(encounter.actors[0]!.hp, encounter.actors[0]!.maxHp);
});
