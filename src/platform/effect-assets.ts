import type { EffectAsset } from '../content/visual-schema.ts';
import { waitForOfflineController } from './offline.ts';

/** Load only effects referenced by the scene, after its first offline controller settles. */
export function createEffectAssets(definitions: readonly EffectAsset[]) {
  const base = new URL(import.meta.env.BASE_URL, location.href);
  const catalog = new Map(definitions.map(definition => [definition.id, definition]));
  const images = new Map<string, HTMLImageElement>();
  const paths = new Map<string, HTMLImageElement>();
  const pending = new Map<string, Promise<HTMLImageElement>>();
  const errors: string[] = [];
  const controller = waitForOfflineController();
  let loading = 0;
  function loadPath(path: string): Promise<HTMLImageElement> {
    const loaded = paths.get(path);
    if (loaded) return Promise.resolve(loaded);
    const existing = pending.get(path);
    if (existing) return existing;
    const task = controller.then(() => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const timeout = setTimeout(() => finish(new Error(`Effect asset load timed out: ${path}`)), 15000);
      function finish(error?: Error) {
        clearTimeout(timeout); image.onload = null; image.onerror = null;
        if (error) reject(error);
        else { paths.set(path, image); resolve(image); }
      }
      image.onload = () => finish();
      image.onerror = () => finish(new Error(`Cannot load effect asset: ${path}`));
      image.src = new URL(path, base).href;
    }));
    pending.set(path, task);
    void task.then(() => pending.delete(path), () => pending.delete(path));
    return task;
  }
  async function load(ids: readonly string[]): Promise<void> {
    loading++;
    try {
      await Promise.all([...new Set(ids)].map(async id => {
        if (images.has(id)) return;
        try {
          const definition = catalog.get(id);
          if (!definition) throw new Error(`Unknown effect asset: ${id}`);
          const image = await loadPath(definition.path);
          if (image.naturalWidth !== definition.frameWidth * definition.frames || image.naturalHeight !== definition.frameHeight)
            throw new Error(`Invalid effect sheet dimensions: ${id} (${definition.path})`);
          images.set(id, image);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!errors.includes(message)) errors.push(message);
        }
      }));
    } finally { loading--; }
  }
  return {
    load, errors,
    getImage: (id: string): HTMLImageElement | undefined => images.get(id),
    get status(): 'loading' | 'ready' | 'error' { return errors.length ? 'error' : loading ? 'loading' : 'ready'; },
  };
}
