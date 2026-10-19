import { content } from '../content/catalog.ts';
import type { Move } from '../content/schemas.ts';
import type { AttackVisual, EffectAsset } from '../content/visual-schema.ts';
import { resolveVisual } from '../content/visuals.ts';
import type { CombatEvent, EncounterSnapshot } from '../domain/combat/types.ts';
import { createEffectAssets } from '../platform/effect-assets.ts';
import { createAttackAudio } from '../platform/attack-audio.ts';
import { createAttackPresentation, visualTriggerForEvent } from '../rendering/attack-effects.ts';

export interface PresentationOptions {
  moves?: readonly Move[]; visuals?: readonly AttackVisual[]; assets?: readonly EffectAsset[];
  audio?: boolean; imageOverrides?: ReadonlyMap<string, CanvasImageSource>;
}

/** Owns browser resources and dispatches simulation events; drawing never applies gameplay. */
export function setupAttackPresentation(options: PresentationOptions = {}) {
  const moves = options.moves ?? content.moves;
  const visuals = options.visuals ?? content['attack-visuals'];
  const definitions = options.assets ?? content['effect-assets'];
  const images = createEffectAssets(definitions);
  const audio = options.audio ? createAttackAudio() : null;
  const renderer = createAttackPresentation({ moves, visuals, assets: definitions,
    getImage: id => options.imageOverrides?.get(id) ?? images.getImage(id),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
  const required = new Set(moves.filter(move => move.combat).flatMap(move =>
    resolveVisual(move, visuals)?.tracks.map(track => track.assetId) ?? []));
  let error: string | null = null, ready = false;
  const loaded = images.load([...required].filter(id => !options.imageOverrides?.has(id)))
    .then(() => {
      if (images.status === 'error') throw new Error(images.errors.join('; '));
      ready = true;
    }).catch(cause => { error = cause instanceof Error ? cause.message : String(cause); });
  let budget = { sprites: 0, particles: 0, trails: 0 };
  return {
    loaded,
    get isReady() { return ready; },
    get error() { return error; },
    snapshot() { return { assetsReady: ready, error, ...budget, muted: audio?.muted ?? true }; },
    reset() { audio?.reset(); },
    suspend() { audio?.suspend(); },
    toggleSound() { return audio?.toggleMute() ?? true; },
    retention(event: CombatEvent) {
      const move = moves.find(move => move.id === event.moveId);
      const trigger = visualTriggerForEvent(event.type);
      const tracks = move ? resolveVisual(move, visuals)?.tracks.filter(track => track.trigger === trigger) ?? [] : [];
      return Math.max(.8, ...tracks.map(track => track.delaySeconds + track.durationSeconds));
    },
    consume(events: readonly CombatEvent[]) {
      if (!audio) return;
      for (const event of events) {
        const move = moves.find(move => move.id === event.moveId);
        if (!move) continue;
        const sound = resolveVisual(move, visuals)?.sound;
        if (sound?.trigger === event.type) audio.play(sound);
      }
    },
    draw(context: CanvasRenderingContext2D, snapshot: EncounterSnapshot, events: readonly CombatEvent[], time: number, layer: 'ground' | 'overlay') {
      if (!ready) return;
      const drawn = renderer.draw(context, snapshot, events, time, layer);
      if (layer === 'ground') budget = { ...drawn };
      else budget = { sprites: budget.sprites + drawn.sprites, particles: budget.particles + drawn.particles, trails: budget.trails + drawn.trails };
    },
  };
}
