import test from 'node:test';
import assert from 'node:assert/strict';
import { content, movementSettings } from '../src/content/catalog.ts';
import { dungeonSchema } from '../src/content/schemas.ts';
import { Encounter } from '../src/domain/combat/encounter.ts';
import { createState } from '../src/domain/state.ts';

test('overlapping enemy warnings remain independent and cannot advance or hit at rest', () => {
  const field = dungeonSchema.parse({ id: 'concurrent-fixture', label: 'Concurrent warnings', tileSize: 32,
    playerSpeciesId: 'jigglypuff', map: ['##########', ...Array.from({ length: 8 }, () => '#........#'), '##########'],
    spawn: { x: 5, y: 5 }, collectibles: [], actors: [
      { id: 'left', speciesId: 'bulbasaur', x: 4, y: 5, facing: 'right', animation: 'Idle' },
      { id: 'right', speciesId: 'bulbasaur', x: 6, y: 5, facing: 'left', animation: 'Idle' },
    ] });
  const state = createState(field);
  const moves = content.moves.filter(move => move.id === 'vine-whip').map(move => ({ ...move, power: 1 }));
  const fight = new Encounter({ field, state, species: content.species, moves, movementSettings, hostileIds: ['left', 'right'] });
  fight.update(1.02);
  const warnings = fight.snapshot();
  assert.equal(warnings.casts.length, 2);
  assert.equal(new Set(warnings.casts.map(cast => cast.casterId)).size, 2);
  assert.equal(new Set(warnings.casts.map(cast => cast.id)).size, 2);
  assert.equal(warnings.player.hp, warnings.player.maxHp, 'Both attacks announce before dealing damage');
  fight.takeEvents();
  fight.update(0);
  assert.deepEqual(fight.snapshot(), warnings, 'Overlapping enemy casts cannot advance a stopped world');
  fight.update(1);
  const hits = fight.takeEvents().filter(event => event.type === 'hit' && event.targetId === 'player');
  assert.deepEqual(new Set(hits.map(event => event.casterId)), new Set(['left', 'right']));
  assert.equal(hits.length, 2, 'Each overlapping contact hits only once');
  assert.ok(fight.player.hp < warnings.player.hp);
  fight.cancelAll();
  assert.equal(fight.snapshot().casts.length, 0);
  assert.equal(fight.snapshot().zones.length, 0);
});
