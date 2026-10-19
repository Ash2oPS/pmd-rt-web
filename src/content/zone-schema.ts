import { z } from 'zod';

const length = z.number().min(.05).max(12);
const angle = z.number().min(1).max(360);
export const zoneShapeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('disk'), radius: length }),
  z.strictObject({ kind: z.literal('sector'), range: length, angleDegrees: angle }),
  z.strictObject({ kind: z.literal('ring'), innerRadius: z.number().min(0).max(12), outerRadius: length, angleDegrees: angle.default(360) }),
  z.strictObject({ kind: z.literal('line'), length, width: z.number().min(.05).max(4) }),
]);
export const hitPolicySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('once-per-cast') }),
  z.strictObject({ kind: z.literal('once-per-zone') }),
  z.strictObject({ kind: z.literal('periodic'), intervalSeconds: z.number().min(.05).max(10), maxHitsPerTarget: z.number().int().min(1).max(64) }),
]);
export const zonePatternSchema = z.strictObject({
  kind: z.literal('zones'), shape: zoneShapeSchema,
  placement: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('caster') }),
    z.strictObject({ kind: z.literal('target'), targetingRange: length }),
    z.strictObject({ kind: z.literal('forward'), distance: z.number().min(0).max(12) }),
  ]),
  distribution: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('single') }),
    z.strictObject({ kind: z.literal('offsets'), offsets: z.array(z.strictObject({ x: z.number().min(-12).max(12), y: z.number().min(-12).max(12) })).min(1).max(16) }),
    z.strictObject({ kind: z.literal('random-disk'), count: z.number().int().min(1).max(16), radius: length }),
    z.strictObject({ kind: z.literal('circle'), count: z.number().int().min(1).max(16), radius: length }),
  ]),
  motion: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('fixed') }),
    z.strictObject({ kind: z.literal('orbit'), angularSpeedDegrees: z.number().min(-720).max(720), followCaster: z.boolean() }),
  ]),
  waves: z.strictObject({ count: z.number().int().min(1).max(8), intervalSeconds: z.number().min(0).max(10), activeSeconds: z.number().min(.02).max(20) }),
  hitPolicy: hitPolicySchema,
}).superRefine((pattern, context) => {
  const distribution = pattern.distribution;
  const count = distribution.kind === 'single' ? 1 : distribution.kind === 'offsets' ? distribution.offsets.length : distribution.count;
  if (count * pattern.waves.count > 64) context.addIssue({ code: 'custom', message: 'At most 64 zones are allowed per cast', path: ['waves', 'count'] });
  if (pattern.shape.kind === 'ring' && pattern.shape.innerRadius >= pattern.shape.outerRadius)
    context.addIssue({ code: 'custom', message: 'Inner radius must be smaller than outer radius', path: ['shape', 'innerRadius'] });
  if (pattern.waves.count > 1 && pattern.waves.intervalSeconds < .02)
    context.addIssue({ code: 'custom', message: 'Multiple waves need an interval of at least 0.02 seconds', path: ['waves', 'intervalSeconds'] });
});
export type ZonePattern = z.infer<typeof zonePatternSchema>;
export type ZoneShape = z.infer<typeof zoneShapeSchema>;
export type HitPolicy = z.infer<typeof hitPolicySchema>;
