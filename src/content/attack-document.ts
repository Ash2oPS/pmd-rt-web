import { z } from 'zod';
import { moveSchema } from './schemas.ts';
import type { Content } from './schemas.ts';
import { attackVisualSchema, effectAssetSchema } from './visual-schema.ts';
import { validateContent } from './validate.ts';
import { MAX_DOCUMENT_FILE_BYTES, MAX_DOCUMENT_TOTAL_BYTES, validateDocumentFile } from './document-files.ts';
export type { DocumentFile } from './document-files.ts';

const id = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
export const attackDocumentSchema = z.strictObject({
  formatVersion: z.literal(1), move: moveSchema,
  visuals: z.array(attackVisualSchema).max(64).default([]), assets: z.array(effectAssetSchema).max(64).default([]),
  files: z.array(z.strictObject({ assetId: id, mimeType: z.enum(['image/png', 'image/webp', 'image/svg+xml']),
    dataBase64: z.string().min(4).max(Math.ceil(MAX_DOCUMENT_FILE_BYTES / 3) * 4) })).max(64).default([]),
  sourceMoveId: id.optional(), assignTo: z.strictObject({ speciesId: id, level: z.number().int().min(1).max(100) }).optional(),
}).superRefine((bundle, context) => {
  for (const category of ['visuals', 'assets', 'files'] as const) {
    const seen = new Set<string>();
    bundle[category].forEach((record, index) => {
      const key = 'assetId' in record ? record.assetId : record.id;
      if (seen.has(key)) context.addIssue({ code: 'custom', path: [category, index], message: `Duplicate ${category} ID: ${key}` });
      seen.add(key);
    });
  }
});
export type AttackDocument = z.infer<typeof attackDocumentSchema>;
export interface ValidatedAttackDocument { document: AttackDocument; content: Content }
export interface DocumentRecord { path: string; data: unknown }
function mergeRecords<T extends { id: string }>(base: readonly T[], changes: readonly T[]): T[] {
  const records = new Map(base.map(record => [record.id, structuredClone(record)]));
  for (const record of changes) records.set(record.id, structuredClone(record));
  return [...records.values()];
}

/** Validate a portable authoring bundle against a cloned complete catalog, never a game save. */
export function parseAttackDocument(input: unknown, baseContent: Content): ValidatedAttackDocument {
  const bundle = attackDocumentSchema.parse(input);
  const candidate = structuredClone(baseContent);
  candidate.moves = mergeRecords(candidate.moves, [bundle.move]);
  candidate['attack-visuals'] = mergeRecords(candidate['attack-visuals'], bundle.visuals);
  candidate['effect-assets'] = mergeRecords(candidate['effect-assets'], bundle.assets);
  if (bundle.assignTo) {
    const assignment = bundle.assignTo;
    const species = candidate.species.find(species => species.id === assignment.speciesId);
    if (!species) throw new z.ZodError([{ code: 'custom', path: ['assignTo', 'speciesId'], message: `Unknown assignment species: ${assignment.speciesId}` }]);
    species.learnset = [...species.learnset.filter(entry => entry.moveId !== bundle.move.id), { moveId: bundle.move.id, level: assignment.level }];
  }
  let totalBytes = 0;
  const assetPaths = new Set<string>();
  bundle.files.forEach((file, index) => {
    const asset = candidate['effect-assets'].find(asset => asset.id === file.assetId);
    try {
      if (!asset) throw new Error(`Unknown bundled asset: ${file.assetId}`);
      if (assetPaths.has(asset.path)) throw new Error(`Bundled files share an asset path: ${asset.path}`);
      if (candidate['effect-assets'].some(other => other.id !== asset.id && other.path === asset.path))
        throw new Error(`Bundled image would replace another asset ID at the same path: ${asset.path}`);
      assetPaths.add(asset.path);
      totalBytes += validateDocumentFile(file, asset);
      if (totalBytes > MAX_DOCUMENT_TOTAL_BYTES) throw new Error('Bundled images exceed the 16 MiB total limit');
    } catch (error) { throw new z.ZodError([{ code: 'custom', path: ['files', index], message: error instanceof Error ? error.message : String(error) }]); }
  });
  return { document: structuredClone(bundle), content: validateContent(candidate) };
}

/** Reviewable source records only; callers choose when and where to write them. */
export function documentRecords(validated: ValidatedAttackDocument): DocumentRecord[] {
  const bundle = validated.document, content = validated.content;
  if (bundle.move.id.startsWith('lab-') && bundle.assignTo)
    throw new Error('Technical lab fixtures cannot be assigned in production species records');
  const category = bundle.move.id.startsWith('lab-') ? 'lab-fixtures' : 'moves';
  const records: DocumentRecord[] = [{ path: `content/${category}/${bundle.move.id}.json`, data: structuredClone(bundle.move) }];
  for (const visual of bundle.visuals) records.push({ path: `content/attack-visuals/${visual.id}.json`, data: structuredClone(visual) });
  for (const asset of bundle.assets) records.push({ path: `content/effect-assets/${asset.id}.json`, data: structuredClone(asset) });
  if (bundle.assignTo) {
    const species = content.species.find(species => species.id === bundle.assignTo!.speciesId)!;
    records.push({ path: `content/species/${species.id}.json`, data: structuredClone(species) });
  }
  return records;
}
