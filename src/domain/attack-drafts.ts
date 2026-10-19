import type { AttackDocument, ValidatedAttackDocument } from '../content/attack-document.ts';

export interface DraftIssue { path: (string | number)[]; message: string }
interface DraftEntry { raw: unknown; lastValid: ValidatedAttackDocument; errors: DraftIssue[]; fingerprint: string; bytes: number }
interface DraftOptions { maxHistory?: number; maxHistoryBytes?: number }
function issuesFor(error: unknown): DraftIssue[] {
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
    return error.issues.map((issue: unknown) => {
      if (issue && typeof issue === 'object' && 'path' in issue && Array.isArray(issue.path) && 'message' in issue && typeof issue.message === 'string')
        return { path: issue.path.filter((part: unknown): part is string | number => typeof part === 'string' || typeof part === 'number'), message: issue.message };
      return { path: [], message: String(issue) };
    });
  }
  return [{ path: [], message: error instanceof Error ? error.message : String(error) }];
}
function fingerprint(value: unknown): string { return JSON.stringify(value) ?? 'undefined'; }
/** Invalid edits are undoable drafts; only validated states can replace the actual preview. */
export class AttackDraft {
  private entries: DraftEntry[];
  private index = 0;
  private readonly source: AttackDocument;
  private savedFingerprint: string;
  private readonly maxHistory: number;
  private readonly maxHistoryBytes: number;
  constructor(initial: AttackDocument, private readonly validate: (input: unknown) => ValidatedAttackDocument, options: DraftOptions = {}) {
    this.maxHistory = options.maxHistory ?? 32; this.maxHistoryBytes = options.maxHistoryBytes ?? 16 * 1024 * 1024;
    if (!Number.isInteger(this.maxHistory) || this.maxHistory < 1 || this.maxHistory > 128
      || !Number.isFinite(this.maxHistoryBytes) || this.maxHistoryBytes <= 0) throw new Error('Invalid draft history limits');
    this.source = structuredClone(initial);
    const lastValid = validate(structuredClone(initial));
    const raw = structuredClone(initial), signature = fingerprint(raw);
    this.entries = [this.entry(raw, lastValid, [], signature)]; this.savedFingerprint = signature;
  }
  private get current(): DraftEntry { return this.entries[this.index]!; }
  get raw(): unknown { return structuredClone(this.current.raw); }
  get lastValid(): ValidatedAttackDocument { return structuredClone(this.current.lastValid); }
  get errors(): readonly DraftIssue[] { return structuredClone(this.current.errors); }
  get dirty(): boolean { return this.current.fingerprint !== this.savedFingerprint; }
  get canUndo(): boolean { return this.index > 0; }
  get canRedo(): boolean { return this.index < this.entries.length - 1; }
  change(next: unknown): boolean {
    const raw = structuredClone(next), signature = fingerprint(raw);
    if (signature === this.current.fingerprint) return !this.current.errors.length;
    let lastValid = this.current.lastValid, errors: DraftIssue[] = [];
    try { lastValid = this.validate(structuredClone(raw)); }
    catch (error) { errors = issuesFor(error); }
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(this.entry(raw, lastValid, errors, signature)); this.index++;
    let totalBytes = this.entries.reduce((total, entry) => total + entry.bytes, 0);
    while (this.entries.length > 1 && (this.entries.length > this.maxHistory || totalBytes > this.maxHistoryBytes)) {
      totalBytes -= this.entries.shift()!.bytes; this.index--;
    }
    return !errors.length;
  }
  undo(): void { if (this.canUndo) this.index--; }
  redo(): void { if (this.canRedo) this.index++; }
  revert(): void { this.change(this.source); }
  markSaved(): void {
    if (this.current.errors.length) throw new Error('Cannot mark an invalid draft as saved');
    this.savedFingerprint = this.current.fingerprint;
  }
  private entry(raw: unknown, lastValid: ValidatedAttackDocument, errors: DraftIssue[], signature: string): DraftEntry {
    const bytes = new TextEncoder().encode(fingerprint({ raw, lastValid, errors })).length;
    return { raw, lastValid, errors, fingerprint: signature, bytes };
  }
}
