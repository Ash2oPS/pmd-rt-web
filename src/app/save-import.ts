import { restore } from '../domain/state.ts';
import type { World } from '../domain/state.ts';
import type { Runtime } from './runtime.ts';
import { element } from '../ui/dom.ts';

export function bindSaveImport(world: World, runtime: Runtime, callbacks: {
  save(): boolean; imported(): void; hud(): void; toast(message: string): void;
}) {
  element<HTMLInputElement>('import-file').addEventListener('change', async event => {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 65536) throw new Error('size');
      const state = restore(await file.text(), world);
      if (!state) throw new Error('format');
      runtime.replace(state);
      callbacks.imported();
      const saved = callbacks.save();
      callbacks.hud();
      callbacks.toast(saved ? 'Sauvegarde importée.' : 'Importée pour cette session. Stockage indisponible.');
    } catch { callbacks.toast('Fichier invalide. Ta progression est conservée.'); }
    input.value = '';
  });
}
