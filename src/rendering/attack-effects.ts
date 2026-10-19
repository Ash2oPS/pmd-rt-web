import { resolveVisual } from '../content/visuals.ts';
import type { AttackVisual, EffectAsset, VisualTrack } from '../content/visuals.ts';
import type { Move } from '../content/schemas.ts';
import type { CombatEvent, EncounterSnapshot } from '../domain/combat/types.ts';
import type { Point } from '../domain/movement.ts';
import { createEffectSprites } from './attack-sprites.ts';
import { combatRoot as root } from './combat-shapes.ts';

export interface EffectStats { sprites: number; particles: number; trails: number }
interface Source { id: number; moveId: string; trigger: VisualTrack['trigger']; position: Point; age: number;
  direction: number; previous?: Point; continuous?: boolean }
export interface PresentationOptions {
  moves: readonly Move[];
  visuals: readonly AttackVisual[];
  assets: readonly EffectAsset[];
  getImage(id: string): CanvasImageSource | undefined;
  reducedMotion: boolean;
}
const eventTriggers: Partial<Record<CombatEvent['type'], VisualTrack['trigger']>> = {
  'cast-start': 'prepare', 'aim-lock': 'lock', activation: 'activate', hit: 'hit', 'cast-cancel': 'cancel',
};
export function visualTriggerForEvent(type: CombatEvent['type']): VisualTrack['trigger'] | undefined {
  return eventTriggers[type];
}

/** Stable cosmetic variation is independent from encounter RNG and call order. */
function noise(id: number, track: string, index: number): number {
  let seed = id ^ Math.imul(index + 1, 1597334677);
  for (const letter of track) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619);
  seed ^= seed >>> 16; seed = Math.imul(seed, 2246822507); seed ^= seed >>> 13;
  return (seed >>> 0) / 4294967296;
}

function sources(snapshot: EncounterSnapshot, events: readonly CombatEvent[], time: number): Source[] {
  const result: Source[] = [];
  for (const event of events.slice(-128)) {
    const trigger = visualTriggerForEvent(event.type);
    if (!trigger || !event.moveId) continue;
    const cast = snapshot.casts.find(cast => cast.casterId === event.casterId && cast.moveId === event.moveId);
    const direction = cast && 'angleRadians' in cast.geometry ? cast.geometry.angleRadians : -Math.PI / 2;
    result.push({ id: event.id, moveId: event.moveId, trigger, position: event.position,
      age: time - event.time, direction });
  }
  for (const projectile of snapshot.projectiles.slice(0, 64)) {
    result.push({ id: projectile.id, moveId: projectile.moveId, trigger: 'projectile', position: projectile.position,
      previous: projectile.previousPosition, direction: Math.atan2(projectile.position.y - projectile.previousPosition.y,
        projectile.position.x - projectile.previousPosition.x), age: time - (projectile.spawnTime ?? time), continuous: true });
  }
  for (const zone of snapshot.zones.slice(0, 128)) {
    if (zone.phase !== 'active' || zone.occluded) continue;
    result.push({ id: zone.id, moveId: zone.moveId, trigger: 'zone', position: zone.geometry.origin,
      direction: 'angleRadians' in zone.geometry ? zone.geometry.angleRadians : 0,
      age: snapshot.time - zone.activationTime, continuous: true });
  }
  return result;
}

/** Recreate after applying validated editor changes; snapshots and authoring records stay immutable. */
export function createAttackPresentation(options: PresentationOptions) {
  const visuals = new Map(options.moves.map(move => [move.id, resolveVisual(move, options.visuals)]));
  const sprites = createEffectSprites(options.assets, options.getImage);
  return {
    draw(context: CanvasRenderingContext2D, snapshot: EncounterSnapshot, events: readonly CombatEvent[],
      time: number, layer: 'ground' | 'overlay'): EffectStats {
      const total: EffectStats = { sprites: 0, particles: 0, trails: 0 };
      const drawn: EffectStats = { sprites: 0, particles: 0, trails: 0 };
      context.save();
      context.setLineDash([]);
      for (const source of sources(snapshot, events, time)) {
        for (const track of visuals.get(source.moveId)?.tracks ?? []) {
          if (track.trigger !== source.trigger) continue;
          const elapsed = source.age - track.delaySeconds;
          if (elapsed < 0 || !source.continuous && elapsed >= track.durationSeconds) continue;
          const age = source.continuous ? elapsed % track.durationSeconds : elapsed;
          const progress = age / track.durationSeconds;
          const x = root(source.position.x + track.offset.x), y = root(source.position.y + track.offset.y);
          const visible = track.layer === layer;
          if (track.kind === 'sprite') {
            if (total.sprites + total.trails >= 64) continue;
            total.sprites++;
            if (visible) {
              context.globalAlpha = source.continuous ? 1 : Math.min(1, (1 - progress) * 3);
              if (sprites.draw(context, track.assetId, track.color, x, y, track.sizePixels, age, !!source.continuous)) drawn.sprites++;
            }
          } else if (track.kind === 'particles') {
            const count = options.reducedMotion ? Math.min(4, track.count) : track.count;
            for (let index = 0; index < count && total.particles < 256; index++) {
              total.particles++;
              if (!visible) continue;
              const random = noise(source.id, track.id, index);
              const angle = source.direction + (random - .5) * track.spreadDegrees * Math.PI / 180;
              const distance = age * track.speedTilesPerSecond * 32 * (.5 + random) * (options.reducedMotion ? .25 : 1);
              context.globalAlpha = 1 - progress;
              if (sprites.draw(context, track.assetId, track.color, x + Math.cos(angle) * distance,
                y + Math.sin(angle) * distance, track.sizePixels * (.65 + random * .35), age, !!source.continuous)) drawn.particles++;
            }
          } else {
            if (total.sprites + total.trails >= 64 || track.trailLengthTiles <= 0) continue;
            total.trails++;
            if (!visible) continue;
            const dx = source.previous ? source.position.x - source.previous.x : Math.cos(source.direction);
            const dy = source.previous ? source.position.y - source.previous.y : Math.sin(source.direction);
            const distance = Math.hypot(dx, dy);
            if (!distance) continue;
            const growth = source.previous ? 1 : Math.min(1, progress * 3);
            const length = track.trailLengthTiles * 32 * (options.reducedMotion ? .3 : 1) * growth;
            context.globalAlpha = source.continuous ? .65 : (1 - progress) * .7;
            context.strokeStyle = track.color; context.lineWidth = Math.max(1, track.sizePixels / 3);
            context.lineCap = 'round'; context.beginPath();
            if (source.previous) {
              context.moveTo(Math.round(x - dx / distance * length), Math.round(y - dy / distance * length));
              context.lineTo(Math.round(x), Math.round(y));
            } else {
              context.moveTo(Math.round(x), Math.round(y));
              context.lineTo(Math.round(x + dx / distance * length), Math.round(y + dy / distance * length));
            }
            context.stroke();
            drawn.trails++;
          }
        }
      }
      context.restore();
      return drawn;
    },
  };
}
