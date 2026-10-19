import { action, node } from './editor-fields.ts';
import { combatFields } from './editor-combat.ts';
import { assetFields, visualFields } from './editor-visuals.ts';
import type { VisualSelection } from './editor-visuals.ts';
import type { EditorCallbacks, EditorView } from './editor-types.ts';
export type { EditorCallbacks, EditorView } from './editor-types.ts';

/** DOM inspector emits authoring intents; application composition owns files and preview. */
export function createAttackEditor(container: HTMLElement, callbacks: EditorCallbacks) {
  let view: EditorView | null = null;
  let tab: 'combat' | 'visuals' | 'assets' = 'combat';
  let identity = '';
  const selected: VisualSelection = { trackId: '', assetId: '', shared: false };
  function render() {
    if (!view) return;
    const current = view;
    const focus = container.ownerDocument.activeElement;
    const focused = focus instanceof HTMLInputElement || focus instanceof HTMLSelectElement ? focus : null;
    const focusPath = focused?.dataset.editorPath;
    const selection = focused instanceof HTMLInputElement ? [focused.selectionStart, focused.selectionEnd] : null;
    const scroll = container.scrollTop;
    const panel = node('section', undefined, 'attack-editor');
    panel.setAttribute('aria-label', 'Éditeur de capacité');
    const heading = node('header', undefined, 'editor-heading');
    heading.append(node('h2', 'Éditer la capacité'), node('p', current.sourceLabel, 'editor-source'),
      node('span', current.dirty ? 'Brouillon modifié' : 'Valeurs de départ', 'editor-dirty'));
    panel.append(heading);
    const toolbar = node('div', undefined, 'editor-toolbar');
    toolbar.append(action('Annuler', callbacks.undo, !current.canUndo), action('Rétablir', callbacks.redo, !current.canRedo),
      action('Revenir à la source', callbacks.revert, !current.dirty), action('Dupliquer', callbacks.duplicate),
      action('Exporter le bundle', callbacks.export, !!current.errors.length));
    const importFile = node('input'); importFile.type = 'file'; importFile.accept = '.json,application/json'; importFile.hidden = true;
    importFile.addEventListener('change', () => { if (importFile.files?.[0]) callbacks.importFile(importFile.files[0]); });
    toolbar.append(action('Importer un bundle', () => importFile.click()), importFile,
      action('Garder un brouillon', callbacks.saveDraft), action('Reprendre le brouillon', callbacks.restoreDraft));
    panel.append(toolbar);
    if (current.errors.length) {
      const errors = node('section', undefined, 'editor-errors'); errors.setAttribute('role', 'alert');
      errors.append(node('strong', 'Corrige ces valeurs pour exporter. L’aperçu conserve la dernière version valide.'));
      const list = node('ul');
      for (const issue of current.errors) list.append(node('li', `${issue.path.join(' › ') || 'Document'} : ${issue.message}`));
      errors.append(list); panel.append(errors);
    }
    const tabs = node('nav', undefined, 'editor-tabs'); tabs.setAttribute('aria-label', 'Sections de l’éditeur');
    for (const [id, label] of [['combat', 'Combat'], ['visuals', 'Rendu'], ['assets', 'Assets']] as const) {
      const button = action(label, () => { tab = id; render(); }); button.setAttribute('aria-pressed', String(tab === id)); tabs.append(button);
    }
    panel.append(tabs);
    const body = node('div', undefined, 'editor-body');
    if (tab === 'combat') combatFields(body, { raw: current.raw, ...callbacks }, current.lastValid.move);
    if (tab === 'visuals') visualFields(body, current, callbacks, selected, render);
    if (tab === 'assets') assetFields(body, current, callbacks, selected, render);
    panel.append(body);
    for (const control of body.querySelectorAll<HTMLElement>('[data-editor-path]')) {
      const path: unknown = JSON.parse(control.dataset.editorPath ?? '[]');
      if (!Array.isArray(path)) continue;
      const issues = current.errors.filter(issue => issue.path.every((part, index) => path[index] === part)
        || path.every((part, index) => issue.path[index] === part));
      if (!issues.length) continue;
      control.setAttribute('aria-invalid', 'true');
      control.parentElement?.append(node('small', issues.map(issue => issue.message).join(' · '), 'editor-field-error'));
    }
    const advanced = node('details', undefined, 'editor-source-view');
    advanced.append(node('summary', 'Source JSON (lecture seule)'), node('pre', JSON.stringify(current.raw, null, 2)));
    panel.append(advanced);
    panel.append(node('p', 'Les exports téléchargent les fichiers à intégrer au projet. Un brouillon reste dans ce navigateur.', 'editor-hint'));
    container.replaceChildren(panel);
    container.scrollTop = scroll;
    if (focusPath && container.contains(focus)) return;
    if (focusPath) {
      const target = [...container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-editor-path]')]
        .find(control => control.dataset.editorPath === focusPath);
      target?.focus({ preventScroll: true });
      if (target instanceof HTMLInputElement && selection?.[0] !== null && selection?.[1] !== null && target.type === 'text')
        target.setSelectionRange(selection![0], selection![1]);
    }
  }
  return {
    update(next: EditorView) {
      const source = `${next.lastValid.sourceMoveId ?? next.sourceLabel}:${next.lastValid.move.id}`;
      if (source !== identity) { selected.shared = false; selected.trackId = ''; selected.assetId = ''; identity = source; }
      view = next; render();
    },
  };
}
