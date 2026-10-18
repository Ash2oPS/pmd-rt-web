import type { SpriteAnimation, SpriteSpecies } from '../content/sprite-schema.js';

// SpriteCollab rows follow clockwise compass directions beginning south.
export const SPRITE_DIRECTIONS = ['down', 'down-right', 'right', 'up-right', 'up', 'up-left', 'left', 'down-left'] as const;
export type SpriteFacing = typeof SPRITE_DIRECTIONS[number];
export interface AnimationFrame {
  animation: string;
  frame: number;
  direction: number;
  sourceX: number;
  sourceY: number;
  width: number;
  height: number;
  origin: { x: number; y: number };
  shadowOrigin: { x: number; y: number };
  sheet: string;
}

/** Missing optional animations fall back to Idle, then the first available sheet. */
export function resolveAnimation(species: SpriteSpecies, requested: string): [string, SpriteAnimation] | null {
  const key = species.animations[requested] ? requested : species.animations.Idle ? 'Idle' : Object.keys(species.animations)[0];
  const animation = key ? species.animations[key] : undefined;
  return animation && key ? [key, animation] : null;
}

/** Converted durations and time are milliseconds; source ticks remain in metadata. */
export function sampleAnimation(species: SpriteSpecies, requested: string, facing: string, timeMs: number): AnimationFrame | null {
  const resolved = resolveAnimation(species, requested);
  if (!resolved) return null;
  const [name, animation] = resolved;
  const total = animation.durations.reduce((sum, duration) => sum + duration, 0);
  const elapsed = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  let tick = elapsed % total;
  let frame = 0;
  while (frame < animation.durations.length - 1 && tick >= animation.durations[frame]!) {
    tick -= animation.durations[frame]!;
    frame++;
  }
  const index = SPRITE_DIRECTIONS.findIndex(direction => direction === facing);
  const direction = animation.directions === 1 ? 0 : Math.max(0, index);
  return {
    animation: name, frame, direction, sheet: animation.sheet,
    sourceX: frame * animation.frameWidth, sourceY: direction * animation.frameHeight,
    width: animation.frameWidth, height: animation.frameHeight,
    // Sprite root is the source tile center. The moving white marker controls
    // the shadow only; anchoring art to it cancels authored walking/lunge motion.
    origin: animation.origin,
    shadowOrigin: animation.origins?.[direction]?.[frame] ?? animation.origin,
  };
}

/** Stable per-instance phase keeps nearby creatures from moving in lockstep. */
export function animationPhase(id: string): number {
  let hash = 0;
  for (const letter of id) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
  return hash % 1000;
}
