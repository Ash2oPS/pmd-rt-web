import { z } from 'zod';

// Paths are relative to the public root, never remote URLs.
const assetPath = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/)
  .refine(value => !value.split('/').includes('..') && !value.includes('//'), 'Unsafe asset path');
const originSchema = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export const spriteAnimationSchema = z.strictObject({
  sheet: assetPath,
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  durations: z.array(z.number().positive()).min(1),
  sourceDurations: z.array(z.number().int().positive()).min(1),
  directions: z.union([z.literal(1), z.literal(8)]),
  origin: originSchema,
  origins: z.array(z.array(originSchema).min(1)).optional(),
  sourceName: z.string().min(1),
  offsetsSheet: assetPath,
  shadowSheet: assetPath,
  shadowMask: assetPath.optional(),
  copyOf: z.string().optional(),
  rushFrame: z.number().int().nonnegative().optional(),
  hitFrame: z.number().int().nonnegative().optional(),
  returnFrame: z.number().int().nonnegative().optional(),
});
export const spriteSpeciesSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  dexNumber: z.number().int().positive(),
  label: z.string().min(1),
  animations: z.record(z.string(), spriteAnimationSchema),
  portrait: assetPath.optional(),
  credits: z.array(z.string()),
  shadowSize: z.number().int().nonnegative(),
  sourceAnimData: assetPath,
});
export const spriteManifestSchema = z.strictObject({
  version: z.literal(1),
  source: z.strictObject({ provider: z.literal('SpriteCollab'), commit: z.string().regex(/^[a-f0-9]{40}$/) }),
  species: z.array(spriteSpeciesSchema),
}).superRefine((manifest, context) => {
  const ids = new Set<string>();
  for (const species of manifest.species) {
    if (ids.has(species.id)) context.addIssue({ code: 'custom', message: `Duplicate species ${species.id}` });
    ids.add(species.id);
    for (const animation of Object.values(species.animations)) {
      if (animation.sourceDurations.length !== animation.durations.length) {
        context.addIssue({ code: 'custom', message: `Invalid duration count for ${species.id}` });
      }
      if (animation.origins && (animation.origins.length !== animation.directions ||
        animation.origins.some(row => row.length !== animation.durations.length))) {
        context.addIssue({ code: 'custom', message: `Invalid origins for ${species.id}` });
      }
    }
  }
});
export type SpriteAnimation = z.infer<typeof spriteAnimationSchema>;
export type SpriteSpecies = z.infer<typeof spriteSpeciesSchema>;
export type SpriteManifest = z.infer<typeof spriteManifestSchema>;
