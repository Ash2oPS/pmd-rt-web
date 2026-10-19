import type { SpriteManifest } from '../content/sprite-schema.js';
import { animationPhase, sampleAnimation } from '../domain/animation.js';

export interface PokemonActor {
  id: string;
  speciesId: string;
  x: number;
  y: number;
  facing: string;
  animation: string;
  animationTimeMs?: number;
}

/** Positions are world pixel ground anchors; time is milliseconds. */
export function createPokemonRenderer(manifest: SpriteManifest, getSheet: (path: string) => CanvasImageSource | undefined) {
  const catalog = new Map(manifest.species.map(species => [species.id, species]));
  function snapshot(actor: PokemonActor, timeMs: number) {
    const species = catalog.get(actor.speciesId);
    return species ? sampleAnimation(species, actor.animation, actor.facing,
      actor.animationTimeMs ?? timeMs + animationPhase(actor.id)) : null;
  }
  function draw(context: CanvasRenderingContext2D, actor: PokemonActor, timeMs: number): boolean {
    const frame = snapshot(actor, timeMs);
    const sheet = frame ? getSheet(frame.sheet) : undefined;
    if (!frame || !sheet) return false;
    context.save();
    context.imageSmoothingEnabled = false;
    const species = catalog.get(actor.speciesId);
    const shadowPath = species?.animations[frame.animation]?.shadowMask;
    const shadow = shadowPath ? getSheet(shadowPath) : undefined;
    if (shadow) {
      context.globalAlpha = 0.23;
      context.drawImage(shadow, frame.sourceX, frame.sourceY, frame.width, frame.height,
        Math.round(actor.x - frame.origin.x), Math.round(actor.y - frame.origin.y), frame.width, frame.height);
      context.globalAlpha = 1;
    } else if (!shadowPath) {
      context.fillStyle = 'rgba(10, 25, 20, 0.23)';
      context.beginPath();
      context.ellipse(Math.round(actor.x + frame.shadowOrigin.x - frame.origin.x),
        Math.round(actor.y + frame.shadowOrigin.y - frame.origin.y), 7, 3, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.drawImage(sheet, frame.sourceX, frame.sourceY, frame.width, frame.height,
      Math.round(actor.x - frame.origin.x), Math.round(actor.y - frame.origin.y), frame.width, frame.height);
    context.restore();
    return true;
  }
  return { draw, snapshot };
}
