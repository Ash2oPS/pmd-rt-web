import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { content } from '../src/content/catalog.ts';
import { applyAttackBundle } from '../scripts/apply-attack-bundle.mts';
import { parseAttackDocument } from '../src/content/attack-document.ts';

async function temporaryProject(t: { after(callback: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'pmd-attack-apply-'));
  await cp(fileURLToPath(new URL('../content', import.meta.url)), path.join(root, 'content'), { recursive: true });
  t.after(async () => {
    if (path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('pmd-attack-apply-'))
      throw new Error('Unsafe test cleanup path');
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

async function bundle() {
  const move = structuredClone(content.moves.find(move => move.id === 'pound')!);
  move.label = 'Edited Pound'; move.visualId = 'editor-proof';
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toBuffer();
  return parseAttackDocument({ formatVersion: 1, move, sourceMoveId: 'pound', assignTo: { speciesId: 'jigglypuff', level: 8 },
    visuals: [{ id: 'editor-proof', label: 'Editor proof', tracks: [{ id: 'impact', trigger: 'hit', kind: 'sprite', assetId: 'editor-proof' }] }],
    assets: [{ id: 'editor-proof', label: 'Editor proof', path: 'effects/editor-proof.png', frameWidth: 2, frameHeight: 2,
      frames: 1, frameSeconds: .1, credit: 'Test fixture', license: 'CC0' }],
    files: [{ assetId: 'editor-proof', mimeType: 'image/png', dataBase64: bytes.toString('base64') }] }, content).document;
}

test('attack apply dry run leaves sources untouched; apply writes exact bundle, backup and species assignment', async t => {
  const root = await temporaryProject(t), document = await bundle();
  const sourcePath = path.join(root, 'content/moves/pound.json');
  const original = await readFile(sourcePath), other = await readFile(path.join(root, 'content/moves/sing.json'));
  const dry = await applyAttackBundle(document, root);
  assert.equal(dry.applied, false); assert.equal(dry.changes.length, 5);
  assert.deepEqual(await readFile(sourcePath), original);
  await assert.rejects(stat(path.join(root, 'output')));
  const applied = await applyAttackBundle(document, root, true);
  assert.equal(applied.applied, true); assert.ok(applied.backup);
  assert.equal(JSON.parse(await readFile(sourcePath, 'utf8')).label, 'Edited Pound');
  assert.deepEqual(await readFile(path.join(root, applied.backup!, 'content/moves/pound.json')), original);
  assert.deepEqual(await readFile(path.join(root, 'content/moves/sing.json')), other);
  const species = JSON.parse(await readFile(path.join(root, 'content/species/jigglypuff.json'), 'utf8')) as typeof content.species[number];
  assert.equal(species.learnset.find(entry => entry.moveId === 'pound')?.level, 8);
  assert.deepEqual(await readFile(path.join(root, 'public/effects/editor-proof.png')), Buffer.from(document.files[0]!.dataBase64, 'base64'));
  assert.deepEqual((await applyAttackBundle(document, root)).changes, [], 'A second application has no changes');
});

test('invalid references, missing assets and path escapes fail before project writes', async t => {
  const root = await temporaryProject(t), document = await bundle();
  const original = await readFile(path.join(root, 'content/moves/pound.json'));
  const badReference = structuredClone(document); badReference.move.visualId = 'missing-preset';
  await assert.rejects(applyAttackBundle(badReference, root, true));
  const escaped = structuredClone(document); escaped.assets[0]!.path = '../outside.png';
  await assert.rejects(applyAttackBundle(escaped, root, true));
  const missing = structuredClone(document); missing.files = [];
  await assert.rejects(applyAttackBundle(missing, root, true));
  const dimensions = structuredClone(document); dimensions.assets[0]!.frameWidth = 3;
  await assert.rejects(applyAttackBundle(dimensions, root, true), /dimensions/);
  assert.deepEqual(await readFile(path.join(root, 'content/moves/pound.json')), original);
  await assert.rejects(stat(path.join(root, 'output')));
});
