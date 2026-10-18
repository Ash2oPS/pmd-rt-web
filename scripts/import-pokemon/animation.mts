import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';

const positive = z.coerce.number().int().positive();
const animation = z.object({
  Name: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/),
  CopyOf: z.string().optional(),
  FrameWidth: positive.optional(), FrameHeight: positive.optional(),
  Durations: z.object({ Duration: z.array(positive) }).optional(),
  RushFrame: z.coerce.number().int().nonnegative().optional(),
  HitFrame: z.coerce.number().int().nonnegative().optional(),
  ReturnFrame: z.coerce.number().int().nonnegative().optional(),
});
export type SourceAnimation = z.infer<typeof animation>;

export function parseAnimationData(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error('Invalid or unsafe animation XML');
  }
  const parser = new XMLParser({ isArray: (name) => name === 'Anim' || name === 'Duration' });
  const data = z.object({ AnimData: z.object({ ShadowSize: z.coerce.number().int().nonnegative(),
    Anims: z.object({ Anim: z.array(animation).nonempty() }) }) }).parse(parser.parse(xml)).AnimData;
  const animations = new Map(data.Anims.Anim.map((entry) => [entry.Name, entry]));
  if (animations.size !== data.Anims.Anim.length) throw new Error('Duplicate animation name');
  return { shadowSize: data.ShadowSize, animations };
}

export function resolveAnimation(name: string, animations: Map<string, SourceAnimation>, seen = new Set<string>()): SourceAnimation {
  if (seen.has(name)) throw new Error(`Circular CopyOf: ${name}`);
  const value = animations.get(name);
  if (!value) throw new Error(`Missing animation: ${name}`);
  if (value.CopyOf) return resolveAnimation(value.CopyOf, animations, new Set([...seen, name]));
  if (!value.FrameWidth || !value.FrameHeight || !value.Durations?.Duration.length) {
    throw new Error(`Incomplete animation: ${name}`);
  }
  return value;
}

export function normalizeAnimation(source: SourceAnimation, width: number, height: number) {
  const frameWidth = positive.parse(source.FrameWidth), frameHeight = positive.parse(source.FrameHeight);
  const ticks = z.array(positive).nonempty().parse(source.Durations?.Duration);
  if (width !== ticks.length * frameWidth || height % frameHeight !== 0 || ![1, 8].includes(height / frameHeight)) {
    throw new Error(`Sheet dimensions disagree with ${source.Name} metadata`);
  }
  return { frameWidth, frameHeight, directions: height / frameHeight,
    durations: ticks.map((tick) => tick * 1000 / 60), sourceDurations: ticks,
    origin: { x: frameWidth / 2, y: frameHeight / 2 },
    ...(source.RushFrame === undefined ? {} : { rushFrame: source.RushFrame }),
    ...(source.HitFrame === undefined ? {} : { hitFrame: source.HitFrame }),
    ...(source.ReturnFrame === undefined ? {} : { returnFrame: source.ReturnFrame }),
  };
}
