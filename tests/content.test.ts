import assert from 'node:assert/strict';
import test from 'node:test';
import { content, field } from '../src/content/catalog.ts';
import { dungeonSchema } from '../src/content/schemas.ts';
import { validateContent } from '../src/content/validate.ts';

test('loads the playable field with collectible item definitions', () => {
  assert.equal(field.spawn.x, 3);
  assert.equal(field.spawn.y, 5);
  assert.equal(field.collectibles.length, 3);
  for (const collectible of field.collectibles) {
    assert.ok(content.items.some((item) => item.id === collectible.itemId));
  }
});

test('places all ten imported species in the current field', () => {
  assert.equal(content.species.length, 10);
  assert.equal(field.playerSpeciesId, 'jigglypuff');
  assert.equal(field.actors.length, 9);
  assert.deepEqual(new Set([field.playerSpeciesId, ...field.actors.map((actor) => actor.speciesId)]), new Set(content.species.map((species) => species.id)));
  for (const species of content.species) {
    assert.equal(species.spriteId, species.id);
    assert.equal(species.source?.provider, 'pokeapi');
    assert.equal(species.source?.pokemonId, species.dexNumber);
  }
});

test('actor teams default to neutral unless a field instance declares hostility', () => {
  const parsed = dungeonSchema.parse({ id: 'team-default', label: 'Team default', tileSize: 32,
    map: ['#####', '#...#', '#####'], spawn: { x: 1, y: 1 }, collectibles: [],
    actors: [{ id: 'visitor', speciesId: 'bulbasaur', x: 3, y: 1, facing: 'left', animation: 'Idle' }] });
  assert.equal(parsed.actors[0]!.team, 'neutral');
  assert.equal(field.actors.find(actor => actor.speciesId === 'bulbasaur')!.team, 'hostile');
  assert.equal(field.actors.find(actor => actor.speciesId === 'bulbasaur')!.noticeRange, 5);
});

test('hostile field actors require an authored notice range', () => {
  const candidate = structuredClone(content);
  delete candidate.dungeons[0]!.actors.find(actor => actor.team === 'hostile')!.noticeRange;
  assert.throws(() => validateContent(candidate), /requires a notice range/);
});

test('rejects unknown actors, duplicate IDs and invalid actor placements', () => {
  const candidate = structuredClone(content);
  const actor = candidate.dungeons[0]!.actors[0]!;
  actor.speciesId = 'missing';
  assert.throws(() => validateContent(candidate), /Unknown actor species/);
  actor.speciesId = content.species[0]!.id;
  actor.x = 0;
  actor.y = 0;
  assert.throws(() => validateContent(candidate), /Actor at .*blocked or unreachable/);
  Object.assign(actor, candidate.dungeons[0]!.spawn);
  assert.throws(() => validateContent(candidate), /overlaps/);
  Object.assign(actor, field.actors[0]);
  candidate.dungeons[0]!.actors[1]!.id = actor.id;
  assert.throws(() => validateContent(candidate), /Duplicate actor ID/);
});

test('rejects an unknown playable species', () => {
  const candidate = structuredClone(content);
  candidate.dungeons[0]!.playerSpeciesId = 'missing';
  assert.throws(() => validateContent(candidate), /Unknown player species/);
});

test('rejects duplicate IDs within a category', () => {
  const candidate = structuredClone(content);
  candidate.items.push(candidate.items[0]!);
  assert.throws(() => validateContent(candidate), /Duplicate ID/);
});

test('rejects unresolved species ability and learnset references', () => {
  const candidate = structuredClone(content);
  candidate.species[0]!.abilityIds = ['missing'];
  candidate.species[0]!.learnset = [{ level: 1, moveId: 'missing' }];
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
