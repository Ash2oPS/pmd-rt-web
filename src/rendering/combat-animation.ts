import type { SpriteAnimation } from '../content/sprite-schema.ts';

/** Preserve authored frame durations; hold before contact, then finish once without looping. */
export function attackAnimationTimeMs(animation: SpriteAnimation, elapsedSeconds: number, preparationSeconds: number): number {
  const total = animation.durations.reduce((sum, duration) => sum + duration, 0);
  const hitFrame = Math.max(0, Math.min(animation.durations.length - 1, animation.hitFrame ?? 1));
  const hitTime = animation.durations.slice(0, hitFrame).reduce((sum, duration) => sum + duration, 0);
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const preparation = Number.isFinite(preparationSeconds) ? Math.max(0, preparationSeconds) : 0;
  const time = elapsed < preparation ? Math.min(elapsed * 1000, Math.max(0, hitTime - .001))
    : hitTime + (elapsed - preparation) * 1000;
  return Math.max(0, Math.min(total - .001, time));
}
