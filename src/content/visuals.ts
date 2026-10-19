import type { Move } from './schemas.ts';
import { attackVisualSchema } from './visual-schema.ts';
import type { AttackVisual, VisualTrack } from './visual-schema.ts';
export type { EffectAsset, AttackVisual, VisualTrack, VisualTrackOverride } from './visual-schema.ts';

/** Resolve immutable inherited tracks first, then the explicitly authored per-move changes. */
export function resolveVisual(move: Pick<Move, 'visualId' | 'visualOverrides'>, visuals: readonly AttackVisual[]): AttackVisual | null {
  const selectedId = move.visualId ?? 'normal';
  const selected = visuals.find(visual => visual.id === selectedId);
  if (!selected) {
    if (move.visualId) throw new Error(`Unknown visual preset: ${move.visualId}`);
    if (Object.keys(move.visualOverrides ?? {}).length) throw new Error('Cannot override tracks without a visual preset');
    return null;
  }
  const chain: AttackVisual[] = [], seen = new Set<string>();
  let cursor: AttackVisual | undefined = selected;
  while (cursor) {
    if (seen.has(cursor.id)) throw new Error(`Visual inheritance cycle: ${[...seen, cursor.id].join(' -> ')}`);
    seen.add(cursor.id); chain.push(cursor);
    if (!cursor.baseId) break;
    const baseId: string = cursor.baseId;
    cursor = visuals.find(visual => visual.id === baseId);
    if (!cursor) throw new Error(`Unknown visual base preset: ${baseId}`);
  }
  const tracks = new Map<string, VisualTrack>();
  let sound: AttackVisual['sound'];
  for (const visual of chain.reverse()) {
    for (const track of visual.tracks) tracks.set(track.id, structuredClone(track));
    if (visual.sound) sound = { ...visual.sound };
  }
  for (const [id, override] of Object.entries(move.visualOverrides ?? {})) {
    const track = tracks.get(id);
    if (!track) throw new Error(`Unknown visual override track: ${id}`);
    tracks.set(id, { ...track, ...structuredClone(override) });
  }
  return attackVisualSchema.parse({ ...selected, tracks: [...tracks.values()], ...(sound ? { sound } : {}) });
}
