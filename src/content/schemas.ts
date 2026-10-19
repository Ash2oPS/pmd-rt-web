import { z } from 'zod';
import { attackVisualSchema, effectAssetSchema, visualOverridesSchema } from './visual-schema.ts';
export type { EffectAsset, AttackVisual, VisualTrack, VisualTrackOverride } from './visual-schema.ts';
import { combatMoveSchema } from './combat-schema.ts';
export { combatMoveSchema } from './combat-schema.ts';
export type { CombatMoveDefinition } from './combat-schema.ts';

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
  sourceMoveId: id.optional(),
  category: z.enum(['physical', 'special', 'status']),
  power: z.number().int().min(0).max(999),
  accuracy: z.number().int().min(1).max(100),
  pp: z.number().int().min(1).max(99),
  effectId: z.enum(['damage', 'lower-attack', 'sleep']),
  combat: combatMoveSchema.optional(),
  visualId: id.optional(), visualOverrides: visualOverridesSchema.optional(),
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
const roamingSchema = z.strictObject({
  radius: z.number().min(0.5).max(6),
  behaviorMultiplier: z.number().min(0.01).max(2),
  idleMinSeconds: z.number().min(0.2).max(15),
  idleMaxSeconds: z.number().min(0.2).max(15),
}).refine((profile) => profile.idleMaxSeconds >= profile.idleMinSeconds, {
  message: 'Maximum idle duration must not be shorter than minimum idle duration',
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
    roaming: roamingSchema.optional(),
  })).default([]),
});
export const movementSettingsSchema = z.strictObject({
  id: z.literal('movement'),
  playerMaxSpeed: z.number().min(0.1).max(15),
  relativeSpeedExponent: z.number().min(0).max(2),
  minSpeedRatio: z.number().min(0.05).max(5),
  maxSpeedRatio: z.number().min(0.05).max(5),
  pursuitMultiplier: z.number().min(0.01).max(2),
}).refine(settings => settings.maxSpeedRatio >= settings.minSpeedRatio, {
  message: 'Maximum speed ratio must not be smaller than minimum speed ratio',
});
export type MovementSettings = z.infer<typeof movementSettingsSchema>;
export const catalogSchema = z.strictObject({
  species: z.array(speciesSchema).min(1), moves: z.array(moveSchema).min(1),
  abilities: z.array(abilitySchema).min(1), items: z.array(itemSchema).min(1),
  dungeons: z.array(dungeonSchema).min(1),
  settings: z.array(movementSettingsSchema).length(1),
  'attack-visuals': z.array(attackVisualSchema).max(256).default([]),
  'effect-assets': z.array(effectAssetSchema).max(256).default([]),
});
export const recordSchemas = {
  species: speciesSchema, moves: moveSchema, abilities: abilitySchema,
  items: itemSchema, dungeons: dungeonSchema, settings: movementSettingsSchema,
  'attack-visuals': attackVisualSchema, 'effect-assets': effectAssetSchema,
};
export type Content = z.infer<typeof catalogSchema>;
export type Species = z.infer<typeof speciesSchema>;
export type Move = z.infer<typeof moveSchema>;
export type Ability = z.infer<typeof abilitySchema>;
export type Item = z.infer<typeof itemSchema>;
export type Dungeon = z.infer<typeof dungeonSchema>;
