import { spriteManifestSchema } from '../content/sprite-schema.js';
import type { SpriteManifest } from '../content/sprite-schema.js';
import { resolveAnimation } from '../domain/animation.js';
import { waitForOfflineController } from './offline.js';

export async function createPokemonAssets(baseURL: string) {
  const base = new URL(baseURL, location.href);
  const errors: string[] = [];
  const sheets = new Map<string, HTMLImageElement>();
  const pending = new Map<string, Promise<void>>();
  const offlineController = waitForOfflineController();
  let manifest: SpriteManifest = { version: 1, species: [], source: { provider: 'SpriteCollab', commit: '0'.repeat(40) } };
  let status: 'loading' | 'ready' | 'error' = 'loading';
  try {
    const response = await fetch(new URL('pokemon/manifest.json', base));
    if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
    manifest = spriteManifestSchema.parse(await response.json());
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    status = 'error';
  }
  const catalog = new Map(manifest.species.map(species => [species.id, species]));
  function loadSheet(path: string): Promise<void> {
    if (sheets.has(path)) return Promise.resolve();
    const existing = pending.get(path);
    if (existing) return existing;
    const task = offlineController.then(() => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const animation = manifest.species.flatMap(species => Object.values(species.animations)).find(entry => entry.sheet === path);
        if (animation && (image.naturalWidth !== animation.frameWidth * animation.durations.length ||
          image.naturalHeight !== animation.frameHeight * animation.directions)) {
          errors.push(`Invalid Pokémon sheet dimensions: ${path}`);
          status = 'error';
        } else sheets.set(path, image);
        resolve();
      };
      image.onerror = () => { errors.push(`Cannot load Pokémon asset: ${path}`); status = 'error'; resolve(); };
      image.src = new URL(path, base).href;
    }));
    pending.set(path, task);
    return task.finally(() => pending.delete(path));
  }
  async function loadSpecies(ids: readonly string[], animations: readonly string[] = ['Idle', 'Walk']): Promise<void> {
    if (status !== 'error') status = 'loading';
    const paths = new Set<string>();
    for (const id of ids) {
      const species = catalog.get(id);
      if (!species) { errors.push(`Unknown sprite species: ${id}`); status = 'error'; continue; }
      for (const name of animations) {
        const resolved = resolveAnimation(species, name);
        if (resolved) {
          paths.add(resolved[1].sheet);
          if (resolved[1].shadowMask) paths.add(resolved[1].shadowMask);
        }
      }
    }
    await Promise.all([...paths].map(loadSheet));
    if (status !== 'error') status = 'ready';
  }
  async function loadPortrait(id: string): Promise<HTMLImageElement | undefined> {
    const path = catalog.get(id)?.portrait;
    if (!path) return undefined;
    await loadSheet(path);
    return sheets.get(path);
  }
  return {
    manifest, errors, loadSpecies, loadPortrait,
    get status() { return status; },
    getSheet: (path: string): HTMLImageElement | undefined => sheets.get(path),
  };
}
