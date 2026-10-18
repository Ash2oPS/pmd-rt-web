import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const label = z.string().trim().min(1).max(120);
export const elementalTypeSchema = z.enum([
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting',
  'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost',
  'dragon', 'dark', 'steel', 'fairy',
]);
const stat = z.number().int().min(1).max(999);
const pointSchema = z.strictObject({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() });
export const speciesSchema = z.strictObject({
  id, label, dexNumber: z.number().int().min(1),
  spriteId: id.optional(),
  source: z.strictObject({ provider: z.literal('pokeapi'), pokemonId: z.number().int().positive() }).optional(),
  types: z.array(elementalTypeSchema).min(1).max(2),
  stats: z.strictObject({ hp: stat, attack: stat, defense: stat, specialAttack: stat, specialDefense: stat, speed: stat }),
  abilityIds: z.array(id).min(1),
  learnset: z.array(z.strictObject({ level: z.number().int().min(1).max(100), moveId: id })),
});
export const moveSchema = z.strictObject({
  id, label, type: elementalTypeSchema,
  category: z.enum(['physical', 'special', 'status']),
  power: z.number().int().min(0).max(999),
  accuracy: z.number().int().min(1).max(100),
  pp: z.number().int().min(1).max(99),
  effectId: z.enum(['damage', 'lower-attack']),
});
export const abilitySchema = z.strictObject({
  id, label, description: z.string().min(1),
  effectId: z.enum(['static', 'overgrow', 'blaze', 'torrent', 'run-away', 'unimplemented']),
});
export const itemSchema = z.strictObject({
  id, label, description: z.string().min(1),
  effectId: z.enum(['collectible', 'restore-hp']),
  value: z.number().int().nonnegative(),
});
export const dungeonSchema = z.strictObject({
  id, label, tileSize: z.number().int().min(8).max(128),
  playerSpeciesId: id.default('jigglypuff'),
  map: z.array(z.string().min(3).regex(/^[#.~]+$/)).min(3),
  spawn: pointSchema,
  collectibles: z.array(pointSchema.extend({ itemId: id })),
  actors: z.array(pointSchema.extend({
    id, speciesId: id,
    facing: z.enum(['down', 'down-left', 'left', 'up-left', 'up', 'up-right', 'right', 'down-right']),
    animation: z.enum(['Idle', 'Walk']),
  })).default([]),
});
export const catalogSchema = z.strictObject({
  species: z.array(speciesSchema).min(1), moves: z.array(moveSchema).min(1),
  abilities: z.array(abilitySchema).min(1), items: z.array(itemSchema).min(1),
  dungeons: z.array(dungeonSchema).min(1),
});
export const recordSchemas = {
  species: speciesSchema, moves: moveSchema, abilities: abilitySchema,
  items: itemSchema, dungeons: dungeonSchema,
};
export type Content = z.infer<typeof catalogSchema>;
export type Species = z.infer<typeof speciesSchema>;
export type Move = z.infer<typeof moveSchema>;
export type Ability = z.infer<typeof abilitySchema>;
export type Item = z.infer<typeof itemSchema>;
export type Dungeon = z.infer<typeof dungeonSchema>;
