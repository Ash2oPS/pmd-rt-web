import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAnimation, parseAnimationData, resolveAnimation } from '../scripts/import-pokemon/animation.mts';
import { creditsHtml } from '../scripts/import-pokemon/credits.mts';
import { emit, fetchSource, hash } from '../scripts/import-pokemon/source.mts';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readShadowOrigins, shadowMaskPixels } from '../scripts/import-pokemon/anchors.mts';

const xml = (anims: string) => `<AnimData><ShadowSize>1</ShadowSize><Anims>${anims}</Anims></AnimData>`;
const walk = '<Anim><Name>Walk</Name><FrameWidth>24</FrameWidth><FrameHeight>32</FrameHeight><Durations><Duration>6</Duration><Duration>12</Duration></Durations></Anim>';

test('PMD timing converts 60 Hz ticks to milliseconds and checks eight-direction sheets', () => {
  const parsed = parseAnimationData(xml(walk));
  const result = normalizeAnimation(resolveAnimation('Walk', parsed.animations), 48, 256);
  assert.deepEqual(result.durations, [100, 200]);
  assert.deepEqual(result.sourceDurations, [6, 12]);
  assert.equal(result.directions, 8);
  assert.throws(() => normalizeAnimation(resolveAnimation('Walk', parsed.animations), 24, 256), /dimensions/);
  assert.throws(() => normalizeAnimation(resolveAnimation('Walk', parsed.animations), 48, 64), /dimensions/);
});

test('PMD copied animations resolve original frame sizes and timing', () => {
  const parsed = parseAnimationData(xml(walk + '<Anim><Name>Idle</Name><CopyOf>Walk</CopyOf></Anim>'));
  assert.equal(resolveAnimation('Idle', parsed.animations).Name, 'Walk');
  assert.throws(() => resolveAnimation('Hurt', parsed.animations), /Missing/);
  const circular = parseAnimationData(xml('<Anim><Name>Idle</Name><CopyOf>Idle</CopyOf></Anim>'));
  assert.throws(() => resolveAnimation('Idle', circular.animations), /Circular/);
});

test('invalid XML, entities, zero timing, incomplete and duplicate animations are rejected', () => {
  assert.throws(() => parseAnimationData('<broken>'), /Invalid/);
  assert.throws(() => parseAnimationData('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///secret">]>' + xml(walk)), /unsafe/);
  assert.throws(() => parseAnimationData(xml(walk.replace('<Duration>6', '<Duration>0'))));
  assert.throws(() => parseAnimationData(xml(walk + walk)), /Duplicate/);
  const incomplete = parseAnimationData(xml('<Anim><Name>Walk</Name></Anim>'));
  assert.throws(() => resolveAnimation('Walk', incomplete.animations), /Incomplete/);
});

test('credit names are escaped rather than interpreted as executable HTML', () => {
  const html = creditsHtml([{ id: 'pikachu', credits: ['Artist <script>alert("x")</script>'] }], '1234');
  assert.ok(html.includes('Artist &lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('pikachu/sprite-credits.txt'));
});

test('offline source verification rejects tampering and never repairs cached bytes', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'pmd-import-'));
  const path = join(folder, 'source.json'), url = 'https://example.invalid/not-requested';
  try {
    const bytes = Buffer.from('{"original":true}');
    await writeFile(path, bytes);
    const lock = { [path]: { url, sha256: hash(bytes) } }, modified = (await stat(path)).mtimeMs;
    assert.deepEqual(await fetchSource(path, url, lock, true), bytes);
    await emit(path, bytes, true);
    assert.equal((await stat(path)).mtimeMs, modified);
    await assert.rejects(emit(path, 'different', true), /Stale/);
    await writeFile(path, 'tampered');
    await assert.rejects(fetchSource(path, url, lock, true), /integrity/);
    assert.equal(await readFile(path, 'utf8'), 'tampered');
    await assert.rejects(fetchSource(join(folder, 'missing'), url, {}, true), /Missing cached/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('per-frame anchors preserve direction-specific offsets and reject missing/duplicate markers', () => {
  const pixels = Buffer.alloc(4 * 4 * 4);
  const white = (x: number, y: number) => pixels.fill(255, (y * 4 + x) * 4, (y * 4 + x) * 4 + 4);
  white(0, 0); white(3, 1); white(1, 3); white(2, 2);
  assert.deepEqual(readShadowOrigins(pixels, 4, 4, 2, 2), [[{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 1, y: 1 }, { x: 0, y: 0 }]]);
  pixels.fill(0, 0, 4);
  assert.throws(() => readShadowOrigins(pixels, 4, 4, 2, 2), /count 0/);
  white(0, 0); white(1, 0);
  assert.throws(() => readShadowOrigins(pixels, 4, 4, 2, 2), /count 2/);
});

test('shadow size chooses authored RGB mask and preserves its original alpha', () => {
  const pixels = Buffer.from([240, 120, 60, 255, 255, 128, 64, 128]);
  assert.deepEqual([...shadowMaskPixels(pixels, 0)], [0, 0, 0, 120, 0, 0, 0, 64]);
  assert.deepEqual([...shadowMaskPixels(pixels, 1)], [0, 0, 0, 240, 0, 0, 0, 128]);
  assert.deepEqual([...shadowMaskPixels(pixels, 2)], [0, 0, 0, 60, 0, 0, 0, 32]);
  assert.throws(() => shadowMaskPixels(pixels, 3), /Unsupported/);
});
