import assert from 'node:assert/strict';
import test from 'node:test';
import { labFixtures } from '../src/content/lab-fixtures.ts';
import { content } from '../src/content/catalog.ts';
import { moveSchema } from '../src/content/schemas.ts';

test('technical pattern demonstrations validate without entering the official move catalog', () => {
  assert.equal(labFixtures.length, 7);
  for (const fixture of labFixtures) {
    assert.ok(fixture.id.startsWith('lab-'));
    assert.equal(moveSchema.safeParse(fixture).success, true);
    assert.ok(!content.moves.some(move => move.id === fixture.id));
  }
});
