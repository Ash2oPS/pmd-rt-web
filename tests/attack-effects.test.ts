import assert from 'node:assert/strict';
import test from 'node:test';
import type { SpriteAnimation } from '../src/content/sprite-schema.ts';
import { attackAnimationTimeMs } from '../src/rendering/combat-animation.ts';
import { createAttackPresentation, visualTriggerForEvent } from '../src/rendering/attack-effects.ts';
import type { PresentationOptions } from '../src/rendering/attack-effects.ts';
import type { CombatEvent, EncounterSnapshot } from '../src/domain/combat/types.ts';
import type { VisualTrack } from '../src/content/visuals.ts';

const animation: SpriteAnimation = {
  sheet: 'attack.png', frameWidth: 32, frameHeight: 32,
  durations: [80, 100, 120, 160], sourceDurations: [4, 5, 6, 8], directions: 8,
  origin: { x: 16, y: 16 }, sourceName: 'Attack', offsetsSheet: 'offsets.png', shadowSheet: 'shadow.png', hitFrame: 2,
};

test('combat animation holds before the authored hit frame until actual activation', () => {
  assert.equal(attackAnimationTimeMs(animation, .1, 1), 100);
  assert.equal(attackAnimationTimeMs(animation, .9, 1), 179.999);
  assert.equal(attackAnimationTimeMs(animation, 1, 1), 180);
  assert.ok(Math.abs(attackAnimationTimeMs(animation, 1.05, 1) - 230) < 1e-9);
});

test('combat animation never loops in recovery or rewrites source duration/origin metadata', () => {
  const before = structuredClone(animation);
  assert.equal(attackAnimationTimeMs(animation, 20, 1), 459.999);
  assert.equal(attackAnimationTimeMs(animation, -.1, 1), 0);
  assert.equal(attackAnimationTimeMs(animation, NaN, 1), 0);
  assert.deepEqual(animation, before);
  assert.equal(attackAnimationTimeMs({ ...animation, hitFrame: 0 }, .8, 1), 0);
});

const entity = { id: 'player', speciesId: 'jigglypuff', team: 'player' as const, x: 2, y: 3,
  facing: 'right' as const, hp: 80, maxHp: 80, defeated: false, animation: 'Idle' as const };
const scene: EncounterSnapshot = { time: .2, result: 'playing', player: entity, actors: [], casts: [],
  projectiles: [], statuses: [], zones: [], lastFailure: null, graceSeconds: 0, cooldowns: {} };
const track: VisualTrack = { id: 'burst', trigger: 'hit', kind: 'particles', assetId: 'spark', color: '#ffffff',
  sizePixels: 8, offset: { x: 0, y: 0 }, delaySeconds: 0, durationSeconds: .5, count: 32,
  speedTilesPerSecond: 1, spreadDegrees: 360, trailLengthTiles: .5, layer: 'ground' };
const image = {} as CanvasImageSource;
function options(tracks: VisualTrack[], reducedMotion = false): PresentationOptions {
  return { moves: [{ id: 'move', label: 'Example', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 20,
    effectId: 'damage', visualId: 'normal' }], visuals: [{ id: 'normal', label: 'Normal', tracks }],
    assets: [{ id: 'spark', label: 'Spark', path: 'spark.svg', frameWidth: 16, frameHeight: 16, frames: 1,
      frameSeconds: .08, credit: 'Project', license: 'Project' }], getImage: () => image, reducedMotion };
}
function drawing() {
  const calls: unknown[][] = [];
  const context = { save() {}, restore() {}, setLineDash() {}, beginPath() {},
    drawImage(...args: unknown[]) { calls.push(['sprite', ...args.slice(1)]); },
    moveTo(...args: unknown[]) { calls.push(['move', ...args]); }, lineTo(...args: unknown[]) { calls.push(['line', ...args]); },
    stroke(this: { strokeStyle: string }) { calls.push(['stroke', this.strokeStyle]); }, strokeStyle: '', canvas: {} } as unknown as CanvasRenderingContext2D;
  return { context, calls };
}
const events: CombatEvent[] = Array.from({ length: 40 }, (_, index) => ({ id: index + 1, time: 0, type: 'hit',
  casterId: 'player', moveId: 'move', position: { x: 2, y: 3 }, amount: 5 }));

test('presentation bounds both layers together and identical redraws preserve cosmetic positions without mutating state', () => {
  const engine = createAttackPresentation(options([track, { ...track, id: 'sprite', kind: 'sprite', layer: 'overlay' },
    { ...track, id: 'trail', kind: 'trail', layer: 'overlay', color: '#12abef' }]));
  const before = JSON.stringify({ scene, events });
  const first = drawing(), second = drawing();
  const ground = engine.draw(first.context, scene, events, .2, 'ground');
  const overlay = engine.draw(first.context, scene, events, .2, 'overlay');
  assert.equal(ground.particles, 256);
  assert.equal(overlay.sprites + overlay.trails, 64);
  engine.draw(second.context, scene, events, .2, 'ground');
  engine.draw(second.context, scene, events, .2, 'overlay');
  assert.deepEqual(first.calls, second.calls);
  assert.ok(first.calls.some(call => call[0] === 'stroke' && call[1] === '#12abef'));
  assert.equal(JSON.stringify({ scene, events }), before);
});

test('human timing changes and reduced motion affect visuals without changing mechanical state', () => {
  const delayed = createAttackPresentation(options([{ ...track, delaySeconds: 1 }]));
  assert.equal(delayed.draw(drawing().context, scene, events.slice(0, 1), .5, 'ground').particles, 0);
  assert.equal(delayed.draw(drawing().context, scene, events.slice(0, 1), 1.2, 'ground').particles, 32);
  assert.equal(delayed.draw(drawing().context, scene, events.slice(0, 1), 1.6, 'ground').particles, 0);
  const reduced = createAttackPresentation(options([track], true));
  assert.equal(reduced.draw(drawing().context, scene, events.slice(0, 1), .2, 'ground').particles, 4);
});

test('continuous projectile/zone tracks use actual positions and hide occluded orbital objects', () => {
  const current = structuredClone(scene);
  current.projectiles = [{ id: 1, castId: 1, casterId: 'player', moveId: 'move', position: { x: 4, y: 5 },
    previousPosition: { x: 3.9, y: 5 }, radius: .2, remainingRange: 2 }];
  current.zones = [{ id: 2, castId: 2, casterId: 'player', moveId: 'move', phase: 'active',
    geometry: { kind: 'disk', origin: { x: 7, y: 8 }, radius: .2 }, activationTime: 0, expirationTime: 5, occluded: true }];
  const engine = createAttackPresentation(options([{ ...track, kind: 'sprite', trigger: 'projectile' },
    { ...track, id: 'zone', kind: 'sprite', trigger: 'zone' }]));
  const draw = drawing();
  assert.equal(engine.draw(draw.context, current, [], .2, 'ground').sprites, 1);
  const sprite = draw.calls.find(call => call[0] === 'sprite')!;
  assert.equal(sprite[5], 140); // Actual x=4 -> world pixel144, minus half the authored8px sprite.
  assert.equal(sprite[6], 172);
});

test('directional activation trails extend forward from caster while projectile trails extend behind actual position', () => {
  const engine = createAttackPresentation(options([{ ...track, kind: 'trail', layer: 'overlay' },
    { ...track, id: 'projectile-tail', kind: 'trail', trigger: 'projectile', layer: 'overlay' }]));
  const forward = drawing();
  engine.draw(forward.context, scene, events.slice(0, 1), .2, 'overlay');
  assert.deepEqual(forward.calls.slice(0, 2), [['move', 80, 112], ['line', 80, 96]]);
  const growing = drawing();
  engine.draw(growing.context, scene, events.slice(0, 1), .025, 'overlay');
  assert.deepEqual(growing.calls.slice(0, 2), [['move', 80, 112], ['line', 80, 110]]);
  const current = structuredClone(scene);
  current.projectiles = [{ id: 1, castId: 1, casterId: 'player', moveId: 'move', position: { x: 4, y: 5 },
    previousPosition: { x: 3.9, y: 5 }, radius: .2, remainingRange: 2, spawnTime: 0 }];
  const behind = drawing();
  engine.draw(behind.context, current, [], .2, 'overlay');
  assert.deepEqual(behind.calls.slice(0, 2), [['move', 128, 176], ['line', 144, 176]]);
});

test('projectile track delays begin at launch even when encounter time is already large', () => {
  const current = structuredClone(scene);
  current.time = 10.5;
  current.projectiles = [{ id: 1, castId: 1, casterId: 'player', moveId: 'move', position: { x: 4, y: 5 },
    previousPosition: { x: 3.9, y: 5 }, radius: .2, remainingRange: 2, spawnTime: 10 }];
  const engine = createAttackPresentation(options([{ ...track, kind: 'sprite', trigger: 'projectile', delaySeconds: 1 }]));
  assert.equal(engine.draw(drawing().context, current, [], 10.5, 'ground').sprites, 0);
  current.time = 11.1;
  assert.equal(engine.draw(drawing().context, current, [], 11.1, 'ground').sprites, 1);
});

test('semantic retention uses exactly the same trigger mapping as presentation', () => {
  assert.equal(visualTriggerForEvent('cast-start'), 'prepare');
  assert.equal(visualTriggerForEvent('aim-lock'), 'lock');
  assert.equal(visualTriggerForEvent('activation'), 'activate');
  assert.equal(visualTriggerForEvent('cast-cancel'), 'cancel');
  assert.equal(visualTriggerForEvent('projectile-launch'), undefined, 'Projectiles use continuous physical snapshots');
});
