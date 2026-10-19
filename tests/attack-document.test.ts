import test from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/catalog.ts';
import { attackDocumentSchema, documentRecords, parseAttackDocument } from '../src/content/attack-document.ts';
import { decodeDocumentFile, validateDocumentFile } from '../src/content/document-files.ts';
import type { EffectAsset } from '../src/content/visual-schema.ts';

const baseMove = content.moves.find(move => move.id === 'pound')!;
const document = () => attackDocumentSchema.parse({ formatVersion: 1, sourceMoveId: 'pound', move: structuredClone(baseMove),
  visuals: structuredClone(content['attack-visuals']), assets: structuredClone(content['effect-assets']) });
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="4" fill="#ffffff"/></svg>';
const asset: EffectAsset = { id: 'custom-effect', label: 'User effect', path: 'effects/custom-effect.svg', frameWidth: 16, frameHeight: 16,
  frames: 1, frameSeconds: .08, credit: 'User artwork', license: 'User-owned' };
const file = (text = svg) => ({ assetId: asset.id, mimeType: 'image/svg+xml' as const, dataBase64: Buffer.from(text).toString('base64') });

test('portable bundles round-trip, merge dependencies and species assignments without touching source', () => {
  const before = structuredClone(content), original = document();
  original.move.id = 'custom-pound'; original.move.label = 'Personal variant';
  original.assignTo = { speciesId: 'jigglypuff', level: 3 };
  original.assets.push(asset); original.files.push(file());
  const parsed = parseAttackDocument(JSON.parse(JSON.stringify(original)), content);
  assert.deepEqual(parsed.document, original);
  assert.ok(parsed.content.moves.some(move => move.id === 'custom-pound'));
  assert.ok(parsed.content.species.find(species => species.id === 'jigglypuff')!.learnset.some(entry => entry.moveId === 'custom-pound' && entry.level === 3));
  assert.deepEqual(content, before);
  const records = documentRecords(parsed);
  assert.ok(records.some(record => record.path === 'content/moves/custom-pound.json'));
  assert.ok(records.some(record => record.path === 'content/species/jigglypuff.json'));
  (records[0]!.data as { label: string }).label = 'Changed exported copy';
  assert.equal(parsed.document.move.label, 'Personal variant');
  assert.deepEqual(Buffer.from(decodeDocumentFile(file())).toString(), svg);
});

test('schemas default optional dependency lists and reject future versions and duplicate identities', () => {
  const minimal = attackDocumentSchema.parse({ formatVersion: 1, move: baseMove });
  assert.deepEqual(minimal.files, []); assert.deepEqual(minimal.visuals, []); assert.deepEqual(minimal.assets, []);
  assert.throws(() => parseAttackDocument({ ...minimal, formatVersion: 2 }, content));
  const duplicate = document(); duplicate.assets.push(structuredClone(duplicate.assets[0]!));
  assert.throws(() => parseAttackDocument(duplicate, content), /Duplicate assets/);
  const repeatedFile = document(); repeatedFile.assets.push(asset); repeatedFile.files.push(file(), file());
  assert.throws(() => parseAttackDocument(repeatedFile, content), /Duplicate files/);
});

test('unknown references, inherited visual cycles and invalid assignments fail before preview', () => {
  const missing = document(); missing.move.visualId = 'missing';
  assert.throws(() => parseAttackDocument(missing, content), /Unknown visual preset/);
  const cycle = document(); cycle.visuals[0]!.baseId = cycle.visuals[0]!.id;
  assert.throws(() => parseAttackDocument(cycle, content), /inheritance cycle/);
  const assignment = document(); assignment.assignTo = { speciesId: 'missing', level: 1 };
  assert.throws(() => parseAttackDocument(assignment, content), /Unknown assignment species/);
  const unknownFile = document(); unknownFile.files.push(file());
  assert.throws(() => parseAttackDocument(unknownFile, content), /Unknown bundled asset/);
});

test('strict base64, safe paths, MIME consistency and real signatures are required', () => {
  assert.throws(() => decodeDocumentFile({ ...file(), dataBase64: 'not base64' }), /base64/);
  assert.throws(() => decodeDocumentFile({ ...file(), dataBase64: 'Zh==' }), /padding/);
  assert.throws(() => validateDocumentFile(file(), { ...asset, path: 'other/custom.svg' }), /effects/);
  assert.throws(() => validateDocumentFile({ ...file(), mimeType: 'image/png' }, asset), /PNG/);
  assert.throws(() => validateDocumentFile(file('plain text'), asset), /SVG/);
  const unsafe = document(); unsafe.assets.push({ ...asset, path: 'effects/../custom.svg' }); unsafe.files.push(file());
  assert.throws(() => parseAttackDocument(unsafe, content));
  const samePath = document(); samePath.assets.push(asset, { ...asset, id: 'second-effect' });
  samePath.files.push(file(), { ...file(), assetId: 'second-effect' });
  assert.throws(() => parseAttackDocument(samePath, content), /share an asset path|another asset ID/);
});

test('active SVG, encoded external references and stylesheet instructions are rejected', () => {
  for (const payload of [
    '<svg><script>alert(1)</script></svg>', '<svg><x:script xmlns:x="http://www.w3.org/2000/svg">run()</x:script></svg>',
    '<svg onload="run()"></svg>', '<svg><image href="https://example.com/a.png"/></svg>',
    '<svg><a href="&#x68;ttps://example.com">x</a></svg>', '<svg><path fill="url(https://example.com/a.svg)"/></svg>',
    '<svg><path style="fill:red"/></svg>', '<!DOCTYPE svg><svg></svg>',
    '<?xml-stylesheet href="#style"?><svg></svg>', '<svg><foreignObject/></svg>',
  ]) assert.throws(() => validateDocumentFile(file(payload), asset), /SVG/, payload);
  assert.equal(validateDocumentFile(file(), asset), Buffer.byteLength(svg));
});

test('8 MiB per-image and 16 MiB combined byte limits are enforced', () => {
  const over = document(); over.assets.push(asset);
  over.files.push({ ...file(), dataBase64: Buffer.alloc(8 * 1024 * 1024 + 1, 1).toString('base64') });
  assert.throws(() => parseAttackDocument(over, content), /8 MiB|11184812|Too big/);
  const largeSvg = '<svg>' + ' '.repeat(6 * 1024 * 1024) + '</svg>';
  const total = document();
  for (let index = 0; index < 3; index++) {
    const assetId = `large-${index}`; total.assets.push({ ...asset, id: assetId, path: `effects/${assetId}.svg` });
    total.files.push({ ...file(largeSvg), assetId });
  }
  assert.throws(() => parseAttackDocument(total, content), /16 MiB/);
});

test('technical fixtures stay in their own source category and cannot export broken production assignments', () => {
  const technical = document(); technical.move.id = 'lab-personal'; technical.sourceMoveId = 'lab-orbit';
  const validated = parseAttackDocument(technical, content);
  assert.equal(documentRecords(validated)[0]!.path, 'content/lab-fixtures/lab-personal.json');
  technical.assignTo = { speciesId: 'jigglypuff', level: 1 };
  assert.throws(() => documentRecords(parseAttackDocument(technical, content)), /Technical lab fixtures/);
});
