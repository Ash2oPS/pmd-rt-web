import assert from 'node:assert/strict';
import test from 'node:test';
import { content, field } from '../src/content/catalog.ts';
import { validateContent } from '../src/content/validate.ts';

test('loads the playable field with collectible item definitions', () => {
  assert.equal(field.spawn.x, 3);
  assert.equal(field.spawn.y, 5);
  assert.equal(field.collectibles.length, 3);
  for (const collectible of field.collectibles) {
    assert.ok(content.items.some((item) => item.id === collectible.itemId));
  }
});

test('rejects duplicate IDs within a category', () => {
  const candidate = structuredClone(content);
  candidate.items.push(candidate.items[0]!);
  assert.throws(() => validateContent(candidate), /Duplicate ID/);
});

test('rejects unresolved species ability and learnset references', () => {
  const candidate = structuredClone(content);
  candidate.species[0]!.abilityIds = ['missing'];
  candidate.species[0]!.learnset[0]!.moveId = 'missing';
  assert.throws(() => validateContent(candidate), /Unknown ability/);
  assert.throws(() => validateContent(candidate), /Unknown move/);
});

test('rejects unknown collectible items', () => {
  const candidate = structuredClone(content);
  candidate.dungeons[0]!.collectibles[0]!.itemId = 'missing';
  assert.throws(() => validateContent(candidate), /Unknown item/);
});

test('rejects malformed maps, blocked spawns and unreachable collectibles', () => {
  const candidate = structuredClone(content);
  candidate.dungeons[0]!.map = ['#####', '#.#.#', '#####'];
  candidate.dungeons[0]!.spawn = { x: 1, y: 1 };
  candidate.dungeons[0]!.collectibles = [{ x: 3, y: 1, itemId: 'light-shard' }];
  assert.throws(() => validateContent(candidate), /unreachable/);
  candidate.dungeons[0]!.spawn = { x: 0, y: 0 };
  assert.throws(() => validateContent(candidate), /Spawn/);
  candidate.dungeons[0]!.map[0] = '###';
  assert.throws(() => validateContent(candidate), /equal width/);
});

test('rejects unknown fields and impossible data values', () => {
  assert.throws(() => validateContent({ ...content, typo: true }), /Unrecognized key/);
  const candidate = structuredClone(content);
  candidate.moves[0]!.accuracy = 101;
  assert.throws(() => validateContent(candidate));
  candidate.moves[0]!.accuracy = 100;
  candidate.species[0]!.stats.hp = 0;
  assert.throws(() => validateContent(candidate));
});
