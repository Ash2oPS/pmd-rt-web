import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const label = z.string().trim().min(1).max(120);
export const effectAssetSchema = z.strictObject({
  id, label,
  path: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]*\.(svg|png|webp)$/)
    .refine(path => !path.split('/').some(segment => segment === '..' || segment === '.' || segment === ''), 'Use a safe local asset path'),
  frameWidth: z.number().int().min(1).max(512), frameHeight: z.number().int().min(1).max(512),
  frames: z.number().int().min(1).max(64), frameSeconds: z.number().positive().max(10),
  credit: z.string().trim().min(1).max(500), license: z.string().trim().min(1).max(500),
});
const fields = {
  assetId: id,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sizePixels: z.number().min(1).max(128),
  offset: z.strictObject({ x: z.number().min(-12).max(12), y: z.number().min(-12).max(12) }),
  delaySeconds: z.number().min(0).max(10), durationSeconds: z.number().positive().max(10),
  count: z.number().int().min(1).max(32), speedTilesPerSecond: z.number().min(0).max(20),
  spreadDegrees: z.number().min(0).max(360), trailLengthTiles: z.number().min(0).max(12),
  layer: z.enum(['ground', 'overlay']),
};
export const visualTrackSchema = z.strictObject({
  id, trigger: z.enum(['prepare', 'lock', 'activate', 'hit', 'projectile', 'zone', 'cancel']),
  kind: z.enum(['sprite', 'particles', 'trail']),
  assetId: fields.assetId, color: fields.color.default('#ffffff'), sizePixels: fields.sizePixels.default(16),
  offset: fields.offset.default({ x: 0, y: 0 }), delaySeconds: fields.delaySeconds.default(0),
  durationSeconds: fields.durationSeconds.default(.3), count: fields.count.default(1),
  speedTilesPerSecond: fields.speedTilesPerSecond.default(1), spreadDegrees: fields.spreadDegrees.default(360),
  trailLengthTiles: fields.trailLengthTiles.default(.6), layer: fields.layer.default('overlay'),
});
// Build partials from validators without defaults: omission must preserve inherited values.
export const visualTrackOverrideSchema = z.strictObject(fields).partial();
export const visualOverridesSchema = z.record(id, visualTrackOverrideSchema);
export const attackVisualSchema = z.strictObject({
  id, label, baseId: id.optional(), tracks: z.array(visualTrackSchema).max(12),
  sound: z.strictObject({ waveform: z.enum(['sine', 'triangle']), frequencyHz: z.number().min(20).max(20000),
    endFrequencyHz: z.number().min(20).max(20000), durationSeconds: z.number().positive().max(2),
    gain: z.number().min(0).max(.5), trigger: z.enum(['activation', 'hit']) }).optional(),
}).refine(visual => new Set(visual.tracks.map(track => track.id)).size === visual.tracks.length, {
  message: 'Track IDs must be unique inside a visual preset', path: ['tracks'],
});
export type EffectAsset = z.infer<typeof effectAssetSchema>;
export type VisualTrack = z.infer<typeof visualTrackSchema>;
export type VisualTrackOverride = z.infer<typeof visualTrackOverrideSchema>;
export type AttackVisual = z.infer<typeof attackVisualSchema>;
