import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spriteManifestSchema } from '../src/content/sprite-schema.ts';
import type { SpriteSpecies } from '../src/content/sprite-schema.ts';
import { animationPhase, sampleAnimation, SPRITE_DIRECTIONS } from '../src/domain/animation.ts';
import { createPokemonRenderer } from '../src/rendering/pokemon.ts';

const animation = {
  sheet: 'pokemon/example/Idle-Anim.png', frameWidth: 24, frameHeight: 32,
  durations: [100, 200], sourceDurations: [6, 12], directions: 8 as const,
  origin: { x: 12, y: 16 }, sourceName: 'Idle',
  offsetsSheet: 'pokemon/example/Idle-Offsets.png', shadowSheet: 'pokemon/example/Idle-Shadow.png',
  origins: Array.from({ length: 8 }, (_, row) => [{ x: row + 1, y: 13 }, { x: row + 2, y: 14 }]),
};
const species: SpriteSpecies = {
  id: 'example', dexNumber: 25, label: 'Example', shadowSize: 1,
  sourceAnimData: 'pokemon/example/AnimData.xml', credits: ['Artist'],
  animations: { Idle: animation, Sleep: { ...animation, copyOf: 'Idle' } },
};

test('animation honors varying duration edges, loops and milliseconds', () => {
  for (const [time, frame] of [[0, 0], [99.99, 0], [100, 1], [299.99, 1], [300, 0], [400, 1]]) {
    assert.equal(sampleAnimation(species, 'Idle', 'down', time!)?.frame, frame);
  }
  assert.equal(sampleAnimation(species, 'Idle', 'down', -1)?.frame, 0);
  assert.equal(sampleAnimation(species, 'Idle', 'down', Number.NaN)?.frame, 0);
});

test('all eight direction rows preserve separate sprite roots and moving shadow anchors', () => {
  for (const [direction, facing] of SPRITE_DIRECTIONS.entries()) {
    const frame = sampleAnimation(species, 'Idle', facing, 100)!;
    assert.equal(frame.direction, direction);
    assert.equal(frame.sourceX, 24);
    assert.equal(frame.sourceY, direction * 32);
    assert.deepEqual(frame.origin, animation.origin);
    assert.deepEqual(frame.shadowOrigin, { x: direction + 2, y: 14 });
  }
});

test('aliases use their normalized source sheet; missing actions fall back safely', () => {
  assert.equal(sampleAnimation(species, 'Sleep', 'down', 0)?.sheet, animation.sheet);
  assert.equal(sampleAnimation(species, 'Attack', 'down', 0)?.animation, 'Idle');
  assert.equal(sampleAnimation({ ...species, animations: {} }, 'Idle', 'down', 0), null);
  const oneRow = { ...species, animations: { Idle: { ...animation, directions: 1 as const, origins: undefined } } };
  assert.deepEqual(sampleAnimation(oneRow, 'Idle', 'up', 0)?.origin, animation.origin);
  assert.equal(sampleAnimation(oneRow, 'Idle', 'up', 0)?.direction, 0);
});

test('renderer exposes deterministic per-instance animation and unavailable assets stay nonfatal', () => {
  const manifest = { version: 1 as const, species: [species], source: { provider: 'SpriteCollab' as const, commit: 'a'.repeat(40) } };
  const renderer = createPokemonRenderer(manifest, () => undefined);
  const actor = { id: 'actor-a', speciesId: 'example', x: 32, y: 32, facing: 'down', animation: 'Idle' };
  assert.deepEqual(renderer.snapshot(actor, 50), sampleAnimation(species, 'Idle', 'down', 50 + animationPhase(actor.id)));
  assert.equal(renderer.snapshot({ ...actor, speciesId: 'absent' }, 0), null);
});

test('drawing preserves tile center and authored motion independently of moving shadow marker', () => {
  const manifest = { version: 1 as const, species: [species], source: { provider: 'SpriteCollab' as const, commit: 'a'.repeat(40) } };
  const sheet = {} as CanvasImageSource;
  const renderer = createPokemonRenderer(manifest, () => sheet);
  const actor = { id: 'flying', speciesId: 'example', x: 80, y: 96, facing: 'right', animation: 'Idle' };
  const calls: unknown[][] = [];
  const context = {
    save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {},
    drawImage(...args: unknown[]) { calls.push(args); },
  } as unknown as CanvasRenderingContext2D;
  const frame = renderer.snapshot(actor, 0)!;
  assert.equal(renderer.draw(context, actor, 0), true);
  assert.deepEqual(calls[0], [sheet, frame.sourceX, frame.sourceY, 24, 32,
    80 - frame.origin.x, 96 - frame.origin.y, 24, 32]);
  assert.notDeepEqual(frame.origin, frame.shadowOrigin);
});

test('renderer draws imported shadow mask with the same source root and crop as artwork', () => {
  const masked = { ...species, animations: { Idle: { ...animation, shadowMask: 'pokemon/example/Idle-Mask.png' } } };
  const manifest = { version: 1 as const, species: [masked], source: { provider: 'SpriteCollab' as const, commit: 'a'.repeat(40) } };
  const art = {} as CanvasImageSource, shadow = {} as CanvasImageSource;
  const renderer = createPokemonRenderer(manifest, path => path.endsWith('Mask.png') ? shadow : art);
  const actor = { id: 'flying', speciesId: 'example', x: 80, y: 96, facing: 'right', animation: 'Idle' };
  const calls: { alpha: number; args: unknown[] }[] = [];
  const context = {
    globalAlpha: 1, save() {}, restore() {},
    drawImage(this: { globalAlpha: number }, ...args: unknown[]) { calls.push({ alpha: this.globalAlpha, args }); },
  } as unknown as CanvasRenderingContext2D;
  assert.equal(renderer.draw(context, actor, 0), true);
  assert.equal(calls[0]?.alpha, 0.23);
  assert.equal(calls[1]?.alpha, 1);
  assert.equal(calls[0]?.args[0], shadow);
  assert.equal(calls[1]?.args[0], art);
  assert.deepEqual(calls[0]?.args.slice(1), calls[1]?.args.slice(1));
});

test('real imported manifest validates ten species, copied animations and safe asset paths', async () => {
  const input: unknown = JSON.parse(await readFile('public/pokemon/manifest.json', 'utf8'));
  const manifest = spriteManifestSchema.parse(input);
  assert.equal(manifest.species.length, 10);
  for (const entry of manifest.species) {
    assert.ok(entry.animations.Idle);
    assert.ok(entry.animations.Walk);
    for (const [name, value] of Object.entries(entry.animations)) {
      assert.equal(value.origins?.length, value.directions);
      assert.ok(value.origins?.every(row => row.length === value.durations.length));
      assert.deepEqual(value.durations, value.sourceDurations.map(tick => tick * 1000 / 60));
      assert.deepEqual(value.origin, { x: value.frameWidth / 2, y: value.frameHeight / 2 });
      assert.ok(value.shadowMask, `${entry.id}/${name} requires its source shadow mask`);
      for (let direction = 0; direction < value.directions; direction++) {
        let elapsed = 0;
        for (let frame = 0; frame < value.durations.length; frame++) {
          const sampled = sampleAnimation(entry, name, SPRITE_DIRECTIONS[direction]!, elapsed + value.durations[frame]! / 2)!;
          assert.equal(sampled.frame, frame);
          assert.equal(sampled.sourceX, frame * value.frameWidth);
          assert.equal(sampled.sourceY, direction * value.frameHeight);
          assert.deepEqual(sampled.origin, value.origin);
          const shadow: { x: number; y: number } = value.origins![direction]![frame]!;
          assert.deepEqual(sampled.shadowOrigin, shadow);
          assert.ok(shadow.x >= 0 && shadow.x < value.frameWidth);
          assert.ok(shadow.y >= 0 && shadow.y < value.frameHeight);
          elapsed += value.durations[frame]!;
        }
      }
    }
  }
  const unsafe = structuredClone(manifest);
  unsafe.species[0]!.animations.Idle!.sheet = '../private.png';
  assert.equal(spriteManifestSchema.safeParse(unsafe).success, false);
  const duplicate = structuredClone(manifest);
  duplicate.species.push(duplicate.species[0]!);
  assert.equal(spriteManifestSchema.safeParse(duplicate).success, false);
});
