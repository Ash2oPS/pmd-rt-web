import type { EffectAsset } from '../content/visuals.ts';
import { action, at, field, labelFor, node, section } from './editor-fields.ts';
import type { EditorCallbacks, EditorView } from './editor-types.ts';

export interface VisualSelection { trackId: string; assetId: string; shared: boolean }
export function visualFields(parent: HTMLElement, view: EditorView, callbacks: EditorCallbacks, selected: VisualSelection,
  redraw: () => void): void {
  const context = { raw: view.raw, ...callbacks };
  const preset = section('Présentation réutilisable', parent);
  const choices = [...new Set([...(view.availableVisuals ?? []).map(visual => visual.id),
    ...view.lastValid.visuals.map(visual => visual.id), view.resolvedVisual?.id ?? 'normal'])];
  field(preset, context, ['move', 'visualId'], 'Preset', view.lastValid.move.visualId ?? 'normal', choices);
  preset.append(action('Créer un rendu propre à cette capacité', callbacks.isolateVisual));
  preset.append(node('p', 'Par défaut, les changements concernent uniquement cette capacité. Le comportement et les zones restent indépendants.', 'editor-hint'));
  const visual = view.resolvedVisual;
  if (!visual) { preset.append(node('p', 'Aucune présentation disponible.')); return; }
  const toggle = node('label', 'Modifier le preset partagé', 'editor-check');
  const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.shared;
  checkbox.addEventListener('change', () => {
    selected.shared = checkbox.checked;
    if (selected.shared) {
      const { baseId: _base, ...flattened } = visual;
      const index = view.lastValid.visuals.findIndex(preset => preset.id === visual.id);
      const values = [...view.lastValid.visuals];
      if (index >= 0) values[index] = structuredClone(flattened); else values.push(structuredClone(flattened));
      callbacks.change(['visuals'], values);
    } else redraw();
  });
  toggle.prepend(checkbox); preset.append(toggle);
  if (selected.shared) preset.append(node('p', `Preset partagé : ${view.sharedUses} capacité(s) concernée(s). Son remplacement sera inclus dans l’export.`, 'editor-warning'));
  const tracks = visual.tracks;
  const current = tracks.find(track => track.id === selected.trackId) ?? tracks[0];
  if (!current) { preset.append(node('p', 'Ce preset ne contient aucun élément.')); return; }
  selected.trackId = current.id;
  const select = node('select'); select.setAttribute('aria-label', 'Élément visuel');
  for (const track of tracks) { const item = node('option', `${track.id} · ${track.kind}`); item.value = track.id; select.append(item); }
  select.value = current.id; select.addEventListener('change', () => { selected.trackId = select.value; redraw(); }); parent.append(select);
  const localPreset = view.lastValid.visuals.findIndex(preset => preset.id === visual.id);
  const localTrack = view.lastValid.visuals[localPreset]?.tracks.findIndex(track => track.id === current.id) ?? -1;
  const path = selected.shared ? ['visuals', localPreset, 'tracks', localTrack] : ['move', 'visualOverrides', current.id];
  const group = section('Paramètres de l’élément', parent);
  const overridden = at(view.raw, ['move', 'visualOverrides', current.id]);
  group.append(node('p', selected.shared ? 'Édition du preset partagé' : overridden ? 'Valeurs personnalisées pour cette capacité' : 'Valeurs héritées du preset', 'editor-hint'));
  if (!selected.shared) group.append(action('Réinitialiser les réglages de cet élément', () => callbacks.remove(['move', 'visualOverrides', current.id]), !overridden));
  if (selected.shared) {
    field(group, context, [...path, 'trigger'], 'Déclenchement', current.trigger, ['prepare', 'lock', 'activate', 'hit', 'projectile', 'zone', 'cancel']);
    field(group, context, [...path, 'kind'], 'Type d’élément', current.kind, ['sprite', 'particles', 'trail']);
  } else group.append(node('p', `Déclenchement : ${current.trigger} · ${current.kind}`, 'editor-hint'));
  const assets = [...new Set([...(view.availableAssets ?? []).map(asset => asset.id), ...view.lastValid.assets.map(asset => asset.id), current.assetId])];
  if (current.kind !== 'trail') field(group, context, [...path, 'assetId'], 'Sprite', current.assetId, assets);
  for (const key of ['color', 'sizePixels', 'delaySeconds', 'durationSeconds', 'count', 'speedTilesPerSecond', 'spreadDegrees', 'trailLengthTiles'] as const)
    field(group, context, [...path, key], labelFor(key), current[key]);
  field(group, context, [...path, 'layer'], 'Couche', current.layer, ['ground', 'overlay']);
  for (const axis of ['x', 'y'] as const) field(group, context, [...path, 'offset', axis], `Décalage ${axis.toUpperCase()} (cases)`, current.offset[axis], undefined,
    value => {
      const raw = at(view.raw, [...path, 'offset']);
      callbacks.change([...path, 'offset'], { ...current.offset, ...(raw && typeof raw === 'object' ? raw : {}), [axis]: value });
    });
  if (selected.shared && localPreset >= 0) {
    group.append(action('Ajouter un élément', () => {
      const copy = structuredClone(current); let id = `element-${tracks.length + 1}`;
      while (tracks.some(track => track.id === id)) id += '-copy';
      copy.id = id; selected.trackId = id;
      callbacks.change(['visuals', localPreset, 'tracks'], [...tracks, copy]);
    }, tracks.length >= 12));
    group.append(action('Retirer cet élément', () => callbacks.change(['visuals', localPreset, 'tracks'], tracks.filter(track => track.id !== current.id)), tracks.length <= 1));
  }
}

export function assetFields(parent: HTMLElement, view: EditorView, callbacks: EditorCallbacks, selected: VisualSelection,
  redraw: () => void): void {
  const merged = new Map<string, EffectAsset>();
  for (const asset of [...(view.availableAssets ?? []), ...view.lastValid.assets]) merged.set(asset.id, asset);
  const asset = merged.get(selected.assetId) ?? merged.values().next().value;
  if (!asset) { parent.append(node('p', 'Aucune ressource disponible.')); return; }
  selected.assetId = asset.id;
  const selector = node('select'); selector.setAttribute('aria-label', 'Ressource visuelle');
  for (const asset of merged.values()) { const option = node('option', asset.label); option.value = asset.id; selector.append(option); }
  selector.value = asset.id; selector.addEventListener('change', () => { selected.assetId = selector.value; redraw(); }); parent.append(selector);
  const index = view.lastValid.assets.findIndex(record => record.id === asset.id);
  const group = section('Sprite et animation', parent);
  if (index < 0) {
    group.append(node('p', `${asset.path} · ${asset.frameWidth} × ${asset.frameHeight} px · ${asset.frames} frame(s)`, 'editor-hint'));
    group.append(action('Modifier la fiche de cette ressource', () => callbacks.change(['assets'], [...view.lastValid.assets, structuredClone(asset)])));
  } else {
    const context = { raw: view.raw, ...callbacks };
    for (const key of ['id', 'label', 'path', 'frameWidth', 'frameHeight', 'frames', 'frameSeconds', 'credit', 'license'] as const)
      field(group, context, ['assets', index, key], labelFor(key), asset[key]);
  }
  const replace = node('label', 'Remplacer l’image (PNG, WebP ou SVG)', 'editor-field');
  const file = node('input'); file.type = 'file'; file.accept = 'image/png,image/webp,image/svg+xml';
  file.addEventListener('change', () => { if (file.files?.[0]) callbacks.replaceAsset(asset.id, file.files[0]); });
  replace.append(file); group.append(replace);
  group.append(action('Dupliquer cette ressource pour cette capacité', () => {
    const id = callbacks.isolateAsset(asset.id); if (id) { selected.assetId = id; redraw(); }
  }));
  group.append(node('p', 'Une ressource peut être partagée. Duplique-la pour remplacer son image uniquement dans cette capacité.', 'editor-hint'));
  group.append(node('p', 'Le sprite peut changer sans modifier la zone de contact. Les nouvelles images sont incluses dans le bundle exporté.', 'editor-hint'));
}
