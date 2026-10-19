import { z } from 'zod';
import { resolveVisual } from './visuals.ts';
import { catalogSchema, type Content, type Dungeon } from './schemas.ts';

type Issue = { code: 'custom'; path: (string | number)[]; message: string };

function validateDungeon(dungeon: Dungeon, index: number, issues: Issue[]): void {
  const base = ['dungeons', index];
  const report = (field: string, message: string): void => {
    issues.push({ code: 'custom', path: [...base, field], message });
  };
  const width = dungeon.map[0]?.length ?? 0;
  if (dungeon.map.some((row) => row.length !== width)) report('map', 'Map rows must have equal width');
  const floor = (x: number, y: number): boolean => dungeon.map[y]?.[x] === '.';
  if (!floor(dungeon.spawn.x, dungeon.spawn.y)) {
    report('spawn', 'Spawn must be on a walkable floor tile');
    return;
  }
  const visited = new Set<string>();
  const queue = [dungeon.spawn];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const position = queue[cursor];
    if (!position) continue;
    const key = `${position.x},${position.y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const x = position.x + dx, y = position.y + dy;
      if (floor(x, y) && !visited.has(`${x},${y}`)) queue.push({ x, y });
    }
  }
  const occupied = new Set<string>();
  for (const collectible of dungeon.collectibles) {
    const key = `${collectible.x},${collectible.y}`;
    if (!visited.has(key)) report('collectibles', `Collectible at ${key} is blocked or unreachable`);
    if (occupied.has(key)) report('collectibles', `Duplicate collectible position ${key}`);
    occupied.add(key);
  }
  occupied.add(`${dungeon.spawn.x},${dungeon.spawn.y}`);
  const actorIds = new Set<string>();
  for (const actor of dungeon.actors) {
    const key = `${actor.x},${actor.y}`;
    if (!visited.has(key)) report('actors', `Actor at ${key} is blocked or unreachable`);
    if (occupied.has(key)) report('actors', `Actor position ${key} overlaps another placement`);
    if (actorIds.has(actor.id)) report('actors', `Duplicate actor ID: ${actor.id}`);
    occupied.add(key);
    actorIds.add(actor.id);
  }
}

export function validateContent(input: unknown): Content {
  const data = catalogSchema.parse(input);
  const issues: Issue[] = [];
  for (const category of Object.keys(data) as (keyof Content)[]) {
    const seen = new Set<string>();
    data[category].forEach((record, index) => {
      if (seen.has(record.id)) issues.push({ code: 'custom', path: [category, index, 'id'], message: `Duplicate ID: ${record.id}` });
      seen.add(record.id);
    });
  }
  const abilities = new Set(data.abilities.map((record) => record.id));
  const moves = new Set(data.moves.map((record) => record.id));
  const items = new Set(data.items.map((record) => record.id));
  const speciesIds = new Set(data.species.map((record) => record.id));
  data.species.forEach((species, index) => {
    species.abilityIds.forEach((abilityId, offset) => {
      if (!abilities.has(abilityId)) issues.push({ code: 'custom', path: ['species', index, 'abilityIds', offset], message: `Unknown ability: ${abilityId}` });
    });
    species.learnset.forEach((entry, offset) => {
      if (!moves.has(entry.moveId)) issues.push({ code: 'custom', path: ['species', index, 'learnset', offset, 'moveId'], message: `Unknown move: ${entry.moveId}` });
    });
  });
  data.dungeons.forEach((dungeon, index) => {
    validateDungeon(dungeon, index, issues);
    if (!speciesIds.has(dungeon.playerSpeciesId)) issues.push({ code: 'custom', path: ['dungeons', index, 'playerSpeciesId'], message: `Unknown player species: ${dungeon.playerSpeciesId}` });
    dungeon.collectibles.forEach((entry, offset) => {
      if (!items.has(entry.itemId)) issues.push({ code: 'custom', path: ['dungeons', index, 'collectibles', offset, 'itemId'], message: `Unknown item: ${entry.itemId}` });
    });
    dungeon.actors.forEach((entry, offset) => {
      if (!speciesIds.has(entry.speciesId)) issues.push({ code: 'custom', path: ['dungeons', index, 'actors', offset, 'speciesId'], message: `Unknown actor species: ${entry.speciesId}` });
    });
  });
  const assets = new Set(data['effect-assets'].map(asset => asset.id));
  data['attack-visuals'].forEach((visual, index) => {
    visual.tracks.forEach((track, offset) => {
      if (!assets.has(track.assetId)) issues.push({ code: 'custom', path: ['attack-visuals', index, 'tracks', offset, 'assetId'], message: `Unknown effect asset: ${track.assetId}` });
    });
    try { resolveVisual({ visualId: visual.id }, data['attack-visuals']); }
    catch (error) { issues.push({ code: 'custom', path: ['attack-visuals', index], message: error instanceof Error ? error.message : String(error) }); }
  });
  data.moves.forEach((move, index) => {
    try {
      const resolved = resolveVisual(move, data['attack-visuals']);
      for (const track of resolved?.tracks ?? []) if (!assets.has(track.assetId))
        issues.push({ code: 'custom', path: ['moves', index, 'visualOverrides', track.id, 'assetId'], message: `Unknown effect asset: ${track.assetId}` });
    } catch (error) { issues.push({ code: 'custom', path: ['moves', index, 'visualId'], message: error instanceof Error ? error.message : String(error) }); }
  });
  if (issues.length) throw new z.ZodError(issues);
  return data;
}
