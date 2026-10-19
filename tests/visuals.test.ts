import test from 'node:test';
import assert from 'node:assert/strict';
import { rawContent } from '../src/content/manifest.ts';
import { catalogSchema, moveSchema } from '../src/content/schemas.ts';
import { validateContent } from '../src/content/validate.ts';
import { resolveVisual } from '../src/content/visuals.ts';
import { attackVisualSchema, effectAssetSchema, visualTrackSchema, visualOverridesSchema } from '../src/content/visual-schema.ts';

const asset = effectAssetSchema.parse({ id: 'spark', label: 'Authored spark', path: 'effects/spark.svg', frameWidth: 16,
  frameHeight: 16, frames: 1, frameSeconds: .08, credit: 'Project artwork', license: 'Project-owned' });
const normal = attackVisualSchema.parse({ id: 'normal', label: 'Normal', tracks: [
  { id: 'impact', trigger: 'hit', kind: 'particles', assetId: 'spark', color: '#abcdef', sizePixels: 40, count: 17,
    durationSeconds: 2, speedTilesPerSecond: 3, offset: { x: .25, y: -.5 } },
  { id: 'trail', trigger: 'projectile', kind: 'trail', assetId: 'spark' },
], sound: { waveform: 'sine', frequencyHz: 500, endFrequencyHz: 120, durationSeconds: .1, gain: .04, trigger: 'hit' } });
function fixture() {
  const candidate = catalogSchema.parse(structuredClone(rawContent));
  for (const move of candidate.moves) { delete move.visualId; delete move.visualOverrides; }
  candidate['effect-assets'] = [structuredClone(asset)]; candidate['attack-visuals'] = [structuredClone(normal)];
  return candidate;
}

test('visual defaults apply to full tracks while sparse move overrides stay genuinely sparse', () => {
  const track = visualTrackSchema.parse({ id: 'base', trigger: 'activate', kind: 'sprite', assetId: 'spark' });
  assert.equal(track.sizePixels, 16); assert.deepEqual(track.offset, { x: 0, y: 0 });
  const overrides = visualOverridesSchema.parse({ impact: { color: '#123456' } });
  assert.deepEqual(overrides, { impact: { color: '#123456' } });
  const resolved = resolveVisual({ visualId: 'normal', visualOverrides: overrides }, [normal])!;
  assert.equal(resolved.tracks[0]!.color, '#123456');
  assert.equal(resolved.tracks[0]!.sizePixels, 40);
  assert.equal(resolved.tracks[0]!.count, 17);
  assert.equal(resolved.tracks[0]!.durationSeconds, 2);
  assert.deepEqual(resolved.tracks[0]!.offset, { x: .25, y: -.5 });
});

test('inheritance replaces tracks by stable ID, keeps untouched tracks and inherits sound', () => {
  const water = attackVisualSchema.parse({ id: 'water', label: 'Water', baseId: 'normal', tracks: [
    { ...normal.tracks[0], color: '#0099ff' }, { id: 'launch', trigger: 'activate', kind: 'sprite', assetId: 'spark' },
  ] });
  const before = structuredClone([normal, water]);
  const resolved = resolveVisual({ visualId: 'water', visualOverrides: { impact: { count: 2 } } }, [normal, water])!;
  assert.deepEqual(resolved.tracks.map(track => track.id), ['impact', 'trail', 'launch']);
  assert.equal(resolved.tracks[0]!.color, '#0099ff'); assert.equal(resolved.tracks[0]!.count, 2);
  assert.deepEqual(resolved.sound, normal.sound);
  resolved.tracks[0]!.offset.x = 10;
  resolved.sound!.frequencyHz = 100;
  assert.deepEqual([normal, water], before, 'Resolving/editing cannot mutate source records');
});

test('normal fallback supports technical fixtures; explicit missing presets never silently fall back', () => {
  assert.equal(resolveVisual({}, []) , null);
  assert.equal(resolveVisual({}, [normal])!.id, 'normal');
  assert.throws(() => resolveVisual({ visualId: 'missing' }, [normal]), /Unknown visual preset/);
  assert.throws(() => resolveVisual({ visualOverrides: { impact: { count: 2 } } }, []), /without a visual preset/);
});

test('unknown bases, cycles, missing tracks and identity overrides are rejected', () => {
  assert.throws(() => resolveVisual({ visualId: 'normal' }, [{ ...normal, baseId: 'missing' }]), /Unknown visual base/);
  assert.throws(() => resolveVisual({ visualId: 'normal' }, [{ ...normal, baseId: 'normal' }]), /inheritance cycle/);
  const child = { ...normal, id: 'child', baseId: 'normal' };
  assert.throws(() => resolveVisual({ visualId: 'normal' }, [{ ...normal, baseId: 'child' }, child]), /inheritance cycle/);
  assert.throws(() => resolveVisual({ visualId: 'normal', visualOverrides: { absent: { count: 2 } } }, [normal]), /Unknown visual override track/);
  assert.equal(visualOverridesSchema.safeParse({ impact: { trigger: 'activate' } }).success, false);
  assert.equal(visualOverridesSchema.safeParse({ impact: { kind: 'sprite' } }).success, false);
  assert.equal(visualOverridesSchema.safeParse({ impact: { id: 'other' } }).success, false);
});

test('catalog validation checks asset refs, override refs, base refs and duplicate records', () => {
  const candidate = fixture(); candidate.moves[0]!.visualId = 'normal';
  assert.doesNotThrow(() => validateContent(candidate));
  candidate['attack-visuals'][0]!.tracks[0]!.assetId = 'unknown';
  assert.throws(() => validateContent(candidate), /Unknown effect asset/);
  candidate['attack-visuals'][0]!.tracks[0]!.assetId = 'spark';
  candidate.moves[0]!.visualOverrides = { impact: { assetId: 'unknown' } };
  assert.throws(() => validateContent(candidate), /Unknown effect asset/);
  candidate.moves[0]!.visualOverrides = { missing: { sizePixels: 40 } };
  assert.throws(() => validateContent(candidate), /Unknown visual override track/);
  delete candidate.moves[0]!.visualOverrides;
  candidate['attack-visuals'][0]!.baseId = 'missing';
  assert.throws(() => validateContent(candidate), /Unknown visual base/);
  delete candidate['attack-visuals'][0]!.baseId;
  candidate['effect-assets'].push(structuredClone(asset));
  assert.throws(() => validateContent(candidate), /Duplicate ID/);
});

test('visual data budgets, local paths and unique identities are validated', () => {
  for (const path of ['https://example.com/spark.svg', '../spark.svg', 'effects/../spark.svg', '/effects/spark.svg', 'effects//spark.svg', 'effects/spark.svg?script=1'])
    assert.equal(effectAssetSchema.safeParse({ ...asset, path }).success, false, path);
  assert.equal(effectAssetSchema.safeParse({ ...asset, frames: 65 }).success, false);
  assert.equal(visualTrackSchema.safeParse({ ...normal.tracks[0], count: 33 }).success, false);
  assert.equal(visualTrackSchema.safeParse({ ...normal.tracks[0], sizePixels: 129 }).success, false);
  assert.equal(visualTrackSchema.safeParse({ ...normal.tracks[0], durationSeconds: 11 }).success, false);
  assert.equal(visualTrackSchema.safeParse({ ...normal.tracks[0], color: 'url(javascript:run())' }).success, false);
  assert.equal(attackVisualSchema.safeParse({ ...normal, tracks: [normal.tracks[0], normal.tracks[0]] }).success, false);
  const full = { ...normal, tracks: Array.from({ length: 12 }, (_, index) => ({ ...normal.tracks[0]!, id: `effect-${index}` })) };
  const child = { ...normal, id: 'child', baseId: 'normal', tracks: [{ ...normal.tracks[0]!, id: 'extra' }] };
  assert.throws(() => resolveVisual({ visualId: 'child' }, [full, child]), /12/);
});

test('move schemas retain visual settings without changing combat definitions', () => {
  const source = fixture().moves.find(move => move.combat)!;
  const parsed = moveSchema.parse({ ...source, visualId: 'normal', visualOverrides: { impact: { sizePixels: 28 } } });
  assert.deepEqual(parsed.combat, source.combat);
  assert.deepEqual(parsed.visualOverrides, { impact: { sizePixels: 28 } });
});
