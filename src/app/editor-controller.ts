import { content } from '../content/catalog.ts';
import { parseAttackDocument } from '../content/attack-document.ts';
import type { AttackDocument, ValidatedAttackDocument } from '../content/attack-document.ts';
import type { Move } from '../content/schemas.ts';
import { resolveVisual } from '../content/visuals.ts';
import { AttackDraft } from '../domain/attack-drafts.ts';
import { createAttackDraftStore, createImageOverrides, downloadAttackDocument, readAttackDocumentFile, readEffectImage, validateImageOverrides } from '../platform/attack-bundle.ts';
import { createAttackEditor } from '../ui/attack-editor.ts';

type Path = (string | number)[];
function mutate(raw: unknown, path: Path, value: unknown, remove = false): unknown {
  if (!path.length || path.some(key => ['__proto__', 'constructor', 'prototype'].includes(String(key)))) throw new Error('Chemin de modification invalide');
  const copy = structuredClone(raw) as Record<string | number, unknown>;
  let cursor = copy;
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index]!;
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = typeof path[index + 1] === 'number' ? [] : {};
    cursor = cursor[key] as Record<string | number, unknown>;
  }
  const key = path.at(-1)!;
  if (remove) { if (Array.isArray(cursor) && typeof key === 'number') cursor.splice(key, 1); else delete cursor[key]; }
  else cursor[key] = value;
  return copy;
}

export function setupAttackEditor(container: HTMLElement, callbacks: {
  apply(validated: ValidatedAttackDocument, images: ReadonlyMap<string, CanvasImageSource>): Promise<void>;
  entry(move: Move, key: string): void; casterId(): string; status(message: string): void;
}) {
  const histories = new Map<string, AttackDraft>(), store = createAttackDraftStore();
  let selected = '', draft: AttackDraft | null = null, previewError: string | null = null, revision = 0;
  let imageFingerprint = '', images = new Map<string, HTMLImageElement>(), previewPending = false;
  let imageOperation = 0;
  const validate = (raw: unknown) => parseAttackDocument(raw, content);
  function sourceDocument(move: Move): AttackDocument {
    return { formatVersion: 1, move: structuredClone(move), visuals: structuredClone(content['attack-visuals']),
      assets: structuredClone(content['effect-assets']), files: [], sourceMoveId: move.id };
  }
  function complete(document: AttackDocument): AttackDocument {
    const merged = parseAttackDocument(document, content);
    return { ...document, visuals: merged.content['attack-visuals'], assets: merged.content['effect-assets'] };
  }
  function render() {
    if (!draft) return;
    const valid = draft.lastValid, visual = resolveVisual(valid.document.move, valid.content['attack-visuals']);
    const sharedUses = valid.content.moves.filter(move => {
      let id = move.visualId; const seen = new Set<string>();
      while (id && !seen.has(id)) { if (id === visual?.id) return true; seen.add(id); id = valid.content['attack-visuals'].find(preset => preset.id === id)?.baseId; }
      return false;
    }).length;
    ui.update({ raw: draft.raw, lastValid: valid.document, resolvedVisual: visual, availableAssets: valid.content['effect-assets'],
      availableVisuals: valid.content['attack-visuals'], errors: [...draft.errors, ...(previewError ? [{ path: [], message: previewError }] : [])],
      dirty: draft.dirty, canUndo: draft.canUndo, canRedo: draft.canRedo, sourceLabel: valid.document.sourceMoveId ?? selected, sharedUses });
  }
  async function apply() {
    if (!draft) return;
    const token = ++revision, valid = draft.lastValid;
    previewError = null; previewPending = true; render();
    callbacks.status('Chargement de l’aperçu…');
    try {
      const signature = JSON.stringify(valid.document.files);
      if (signature !== imageFingerprint) { images = await createImageOverrides(valid.document.files); imageFingerprint = signature; }
      if (token !== revision) return;
      validateImageOverrides(images, valid.document.assets);
      callbacks.entry(valid.document.move, selected);
      await callbacks.apply(valid, images);
    } catch (error) {
      if (token === revision) { previewError = error instanceof Error ? error.message : String(error); callbacks.status(previewError); }
    }
    if (token === revision) { previewPending = false; render(); }
  }
  function changed(next: unknown) {
    if (!draft) return;
    const valid = draft.change(next); previewError = null; render();
    if (valid) void apply();
    else callbacks.status('Définition invalide : l’aperçu conserve la dernière version valide.');
  }
  async function importDocument(raw: unknown, invalidDraft?: unknown) {
    const document = complete(validate(raw).document);
    selected = document.move.id; draft = new AttackDraft(document, validate); histories.set(selected, draft);
    if (invalidDraft !== undefined) draft.change(invalidDraft);
    callbacks.entry(document.move, selected); await apply();
  }
  async function command(action: () => void | Promise<void>) {
    try { await action(); } catch (error) { callbacks.status(error instanceof Error ? error.message : String(error)); }
  }
  const ui = createAttackEditor(container, {
    isolateVisual() {
      if (!draft) return;
      const valid = draft.lastValid, resolved = resolveVisual(valid.document.move, valid.content['attack-visuals']);
      if (!resolved) return;
      const raw = draft.raw as AttackDocument;
      const { baseId: _baseId, ...copy } = structuredClone(resolved);
      let id = `${valid.document.move.id}-visual`, suffix = 2;
      while (raw.visuals.some(visual => visual.id === id)) id = `${valid.document.move.id}-visual-${suffix++}`;
      copy.id = id; copy.label = `${valid.document.move.label} · rendu`;
      raw.visuals.push(copy); raw.move.visualId = id; delete raw.move.visualOverrides;
      changed(raw);
    },
    isolateAsset(assetId) {
      if (!draft) return;
      const valid = draft.lastValid, asset = valid.content['effect-assets'].find(asset => asset.id === assetId);
      const visual = resolveVisual(valid.document.move, valid.content['attack-visuals']);
      if (!asset || !visual) return;
      const raw = draft.raw as AttackDocument;
      let id = `${valid.document.move.id}-${assetId}`, suffix = 2;
      while (raw.assets.some(asset => asset.id === id)) id = `${valid.document.move.id}-${assetId}-${suffix++}`;
      const embedded = raw.files.find(file => file.assetId === assetId);
      const extension = embedded?.mimeType === 'image/svg+xml' ? 'svg' : embedded?.mimeType === 'image/webp' ? 'webp' : 'png';
      raw.assets.push({ ...asset, id, label: `${asset.label} · ${valid.document.move.label}`,
        path: embedded ? `effects/${id}.${extension}` : asset.path });
      if (embedded) raw.files.push({ ...embedded, assetId: id });
      raw.move.visualOverrides ??= {};
      for (const track of visual.tracks.filter(track => track.assetId === assetId))
        raw.move.visualOverrides[track.id] = { ...raw.move.visualOverrides[track.id], assetId: id };
      changed(raw); return id;
    },
    change(path, value) {
      if (!draft) return;
      let next = mutate(draft.raw, path, value);
      const field = path.join('.');
      const pattern = draft.lastValid.document.move.combat;
      if (pattern && 'pattern' in pattern && pattern.pattern.kind === 'projectile') {
        if (field === 'move.combat.pattern.radius' && typeof value === 'number') next = mutate(next, ['move', 'combat', 'pattern', 'width'], value * 2);
        if (field === 'move.combat.pattern.width' && typeof value === 'number') next = mutate(next, ['move', 'combat', 'pattern', 'radius'], value / 2);
      }
      changed(next);
    },
    remove(path) { if (draft) changed(mutate(draft.raw, path, undefined, true)); },
    undo() { draft?.undo(); void apply(); }, redo() { draft?.redo(); void apply(); }, revert() { draft?.revert(); void apply(); },
    duplicate() {
      if (!draft) return;
      const document = structuredClone(draft.lastValid.document), base = document.move.id;
      let id = `${base}-variant`, index = 2;
      while (histories.has(id) || content.moves.some(move => move.id === id)) id = `${base}-variant-${index++}`;
      document.move.id = id; document.move.label += ' · variante';
      document.move.sourceMoveId = document.sourceMoveId ?? base;
      if (id.startsWith('lab-')) delete document.assignTo;
      else document.assignTo = { speciesId: callbacks.casterId(), level: 1 };
      void command(() => importDocument(document));
    },
    export() {
      if (!draft || draft.errors.length || previewError || previewPending) return;
      const document = draft.lastValid.document;
      if (document.move.id.startsWith('lab-')) delete document.assignTo;
      else if (!content.moves.some(move => move.id === document.move.id) && !document.assignTo)
        document.assignTo = { speciesId: callbacks.casterId(), level: 1 };
      const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
      document.visuals = document.visuals.filter(visual => !equal(visual, content['attack-visuals'].find(source => source.id === visual.id)));
      document.assets = document.assets.filter(asset => document.files.some(file => file.assetId === asset.id)
        || !equal(asset, content['effect-assets'].find(source => source.id === asset.id)));
      validate(document);
      downloadAttackDocument(document); render();
      callbacks.status('Bundle exporté. Dans le projet : npm run attack:apply -- attack-bundle.json --apply, puis npm run content:generate et npm run build.');
    },
    importFile(file) { void command(async () => { await importDocument(await readAttackDocumentFile(file)); }); },
    replaceAsset(assetId, file) {
      void command(async () => {
        if (!draft) return;
        const targetDraft = draft, operation = ++imageOperation;
        callbacks.status('Lecture du nouveau sprite…');
        const imported = await readEffectImage(file, assetId);
        if (draft !== targetDraft || operation !== imageOperation) return;
        const raw = targetDraft.raw as AttackDocument;
        const assetIndex = raw.assets.findIndex(asset => asset.id === assetId);
        if (assetIndex < 0) throw new Error('Sprite introuvable dans le brouillon');
        const extension = imported.file.mimeType === 'image/svg+xml' ? 'svg' : imported.file.mimeType === 'image/webp' ? 'webp' : 'png';
        const asset = raw.assets[assetIndex]!;
        raw.assets[assetIndex] = { ...asset, path: `effects/${assetId}.${extension}`, frameWidth: imported.width, frameHeight: imported.height, frames: 1,
          credit: 'User-provided image', license: 'User-provided; specify license' };
        raw.files = [...raw.files.filter(image => image.assetId !== assetId), imported.file];
        changed(raw);
      });
    },
    saveDraft() {
      if (!draft) return;
      const saved = store.save({ storeVersion: 1, raw: draft.raw, lastValid: draft.lastValid.document });
      callbacks.status(saved ? 'Brouillon conservé dans ce navigateur. Les fichiers du projet ne sont pas encore modifiés.' : store.error ?? 'Stockage indisponible');
    },
    restoreDraft() {
      void command(async () => {
        const saved = store.load();
        if (!saved || typeof saved !== 'object' || !('storeVersion' in saved) || saved.storeVersion !== 1 || !('lastValid' in saved) || !('raw' in saved)) throw new Error(store.error ?? 'Aucun brouillon enregistré');
        await importDocument(saved.lastValid, saved.raw);
        callbacks.status('Brouillon restauré.');
      });
    },
  });
  return {
    async select(move: Move, key = move.id) {
      selected = key;
      draft = histories.get(key) ?? new AttackDraft(sourceDocument(move), validate);
      histories.set(key, draft); await apply();
    },
    snapshot() { return draft ? { dirty: draft.dirty, errors: draft.errors, raw: draft.raw, lastValid: draft.lastValid.document } : null; },
  };
}
