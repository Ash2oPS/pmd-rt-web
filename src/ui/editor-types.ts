import type { AttackDocument } from '../content/attack-document.ts';
import type { AttackVisual, EffectAsset } from '../content/visuals.ts';
import type { DraftIssue } from '../domain/attack-drafts.ts';
import type { EditorPath } from './editor-fields.ts';

export interface EditorView {
  raw: unknown;
  lastValid: AttackDocument;
  resolvedVisual: AttackVisual | null;
  availableVisuals?: readonly AttackVisual[];
  availableAssets?: readonly EffectAsset[];
  errors: readonly DraftIssue[];
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  sourceLabel: string;
  sharedUses: number;
}
export interface EditorCallbacks {
  change(path: EditorPath, value: unknown): void;
  remove(path: EditorPath): void;
  undo(): void;
  redo(): void;
  revert(): void;
  duplicate(): void;
  export(): void;
  importFile(file: File): void;
  replaceAsset(assetId: string, file: File): void;
  saveDraft(): void;
  restoreDraft(): void;
  isolateVisual(): void;
  isolateAsset(assetId: string): string | undefined;
}
