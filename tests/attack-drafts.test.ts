import test from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/catalog.ts';
import { attackDocumentSchema, parseAttackDocument } from '../src/content/attack-document.ts';
import { AttackDraft } from '../src/domain/attack-drafts.ts';
import type { AttackDocument } from '../src/content/attack-document.ts';

function fixture(maxHistory = 32, maxHistoryBytes = 16 * 1024 * 1024) {
  const initial = attackDocumentSchema.parse({ formatVersion: 1, move: structuredClone(content.moves.find(move => move.id === 'pound')!) });
  const draft = new AttackDraft(initial, input => parseAttackDocument(input, content), { maxHistory, maxHistoryBytes });
  return { initial, draft };
}
const edited = (draft: AttackDraft, label: string): AttackDocument => {
  const raw = draft.raw as AttackDocument; raw.move.label = label; return raw;
};

test('valid edits replace the preview without mutating source or objects returned by getters', () => {
  const { initial, draft } = fixture(), before = structuredClone(initial);
  assert.equal(draft.dirty, false); assert.equal(draft.canUndo, false);
  const next = edited(draft, 'Edited attack'); assert.equal(draft.change(next), true);
  assert.equal(draft.lastValid.document.move.label, 'Edited attack');
  next.move.label = 'Mutated outside';
  assert.equal(draft.lastValid.document.move.label, 'Edited attack');
  const returned = draft.lastValid; returned.document.move.label = 'Mutated preview copy';
  assert.equal(draft.lastValid.document.move.label, 'Edited attack');
  assert.deepEqual(initial, before); assert.equal(draft.dirty, true);
});

test('invalid raw edits retain their errors and the previous valid preview through undo and redo', () => {
  const { draft } = fixture();
  draft.change(edited(draft, 'Valid edit'));
  const invalid = draft.raw as AttackDocument; invalid.move.combat!.preparationSeconds = 0;
  assert.equal(draft.change(invalid), false);
  assert.equal((draft.raw as AttackDocument).move.combat!.preparationSeconds, 0);
  assert.ok(draft.errors.some(issue => issue.path.includes('preparationSeconds') || issue.message.includes('Invalid input')));
  assert.ok(draft.lastValid.document.move.combat!.preparationSeconds > 0);
  assert.equal(draft.lastValid.document.move.label, 'Valid edit');
  assert.throws(() => draft.markSaved(), /invalid draft/);
  draft.undo(); assert.equal(draft.errors.length, 0); assert.equal(draft.canRedo, true);
  draft.redo(); assert.ok(draft.errors.length > 0); assert.equal(draft.lastValid.document.move.label, 'Valid edit');
});

test('invalid non-object input stays editable and cannot destroy the last valid attack', () => {
  const { draft } = fixture(); const previous = draft.lastValid;
  for (const raw of [null, 'unfinished JSON', [], undefined]) {
    assert.equal(draft.change(raw), false);
    assert.deepEqual(draft.raw, raw);
    assert.deepEqual(draft.lastValid, previous);
    assert.ok(draft.errors.every(issue => typeof issue.message === 'string' && Array.isArray(issue.path)));
  }
});

test('undo branches discard redo; revert restores source; saving only marks a valid draft clean', () => {
  const { initial, draft } = fixture();
  draft.change(edited(draft, 'First')); draft.change(edited(draft, 'Second')); draft.undo();
  draft.change(edited(draft, 'Branched')); assert.equal(draft.canRedo, false);
  draft.markSaved(); assert.equal(draft.dirty, false);
  draft.change(edited(draft, 'After save')); assert.equal(draft.dirty, true);
  draft.undo(); assert.equal(draft.dirty, false);
  draft.revert(); assert.deepEqual(draft.raw, initial);
  assert.equal(draft.lastValid.document.move.label, initial.move.label);
});

test('history count and byte limits keep the latest draft and preserve independent revert-to-source', () => {
  const { initial, draft } = fixture(3);
  for (let index = 0; index < 8; index++) draft.change(edited(draft, `Edit ${index}`));
  let undos = 0;
  while (draft.canUndo) { draft.undo(); undos++; }
  assert.equal(undos, 2);
  draft.revert(); assert.deepEqual(draft.raw, initial);
  const tiny = fixture(32, 1).draft;
  tiny.change(edited(tiny, 'Keep newest even over history budget'));
  assert.equal(tiny.canUndo, false);
  assert.equal(tiny.lastValid.document.move.label, 'Keep newest even over history budget');
});

test('identical edits do not create history entries and malformed history limits are rejected', () => {
  const { initial, draft } = fixture(); draft.change(structuredClone(initial));
  assert.equal(draft.canUndo, false);
  assert.throws(() => new AttackDraft(initial, input => parseAttackDocument(input, content), { maxHistory: 0 }), /history limits/);
  assert.throws(() => new AttackDraft(initial, input => parseAttackDocument(input, content), { maxHistoryBytes: NaN }), /history limits/);
});
