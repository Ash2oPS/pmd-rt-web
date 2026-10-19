import type { AttackDocument } from '../content/attack-document.ts';
import type { EffectAsset } from '../content/visual-schema.ts';
import { decodeDocumentFile, validateDocumentFile } from '../content/document-files.ts';

export interface EmbeddedEffectImage { assetId: string; mimeType: 'image/png' | 'image/webp' | 'image/svg+xml'; dataBase64: string }
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
const DRAFT_KEY = 'pmd-attack-drafts-v1';
const MIME_TYPES = new Set(['image/png', 'image/webp', 'image/svg+xml']);

export function downloadAttackDocument(document: AttackDocument): void {
  const blob = new Blob([JSON.stringify(document, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = window.document.createElement('a');
  link.href = url; link.download = 'attack-bundle.json';
  window.document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readAttackDocumentFile(file: File): Promise<unknown> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Attack bundle exceeds 32 MiB');
  return JSON.parse(await file.text());
}

async function decodeImage(file: EmbeddedEffectImage): Promise<HTMLImageElement> {
  if (!MIME_TYPES.has(file.mimeType)) throw new Error('Invalid embedded effect image');
  if (file.dataBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Error('Effect image exceeds 8 MiB');
  const extension = file.mimeType === 'image/png' ? 'png' : file.mimeType === 'image/webp' ? 'webp' : 'svg';
  // Full records are validated when imported; this checks the same byte policy before preview.
  validateDocumentFile(file, { id: file.assetId, label: 'Uploaded image', path: `effects/upload.${extension}`,
    frameWidth: 1, frameHeight: 1, frames: 1, frameSeconds: 1, credit: 'Upload pending attribution', license: 'Upload pending license' });
  const bytes = decodeDocumentFile(file);
  if (file.mimeType === 'image/svg+xml' && new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml').querySelector('parsererror'))
    throw new Error('Invalid SVG image');
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: file.mimeType }));
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Effect image has no dimensions');
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export async function readEffectImage(file: File, assetId: string): Promise<{ file: EmbeddedEffectImage; width: number; height: number }> {
  if (!MIME_TYPES.has(file.type)) throw new Error('Choose a PNG, WebP or passive SVG image');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Effect image exceeds 8 MiB');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  const embedded: EmbeddedEffectImage = { assetId, mimeType: file.type as EmbeddedEffectImage['mimeType'], dataBase64: btoa(binary) };
  const image = await decodeImage(embedded);
  return { file: embedded, width: image.naturalWidth, height: image.naturalHeight };
}

export async function createImageOverrides(files: readonly EmbeddedEffectImage[]): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>();
  if (new Set(files.map(file => file.assetId)).size !== files.length) throw new Error('Duplicate effect image IDs');
  await Promise.all(files.map(async file => {
    images.set(file.assetId, await decodeImage(file));
  }));
  return images;
}

export function validateImageOverrides(images: ReadonlyMap<string, HTMLImageElement>, assets: readonly EffectAsset[]): void {
  for (const [id, image] of images) {
    const asset = assets.find(asset => asset.id === id);
    if (!asset || image.naturalWidth !== asset.frameWidth * asset.frames || image.naturalHeight !== asset.frameHeight)
      throw new Error(`Dimensions du sprite ${id} incompatibles avec la taille et le nombre de frames.`);
  }
}

export function createAttackDraftStore() {
  let error: string | null = null;
  return {
    get error() { return error; },
    load(): unknown | null {
      try {
        const raw = localStorage.getItem(DRAFT_KEY); error = null;
        if (raw && raw.length > MAX_DOCUMENT_BYTES) throw new Error('Stored attack draft exceeds 32 MiB');
        return raw ? JSON.parse(raw) : null;
      } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); return null; }
    },
    save(document: unknown): boolean {
      try {
        const raw = JSON.stringify(document);
        if (raw.length > MAX_DOCUMENT_BYTES) throw new Error('Attack draft exceeds 32 MiB');
        localStorage.setItem(DRAFT_KEY, raw); error = null; return true;
      } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); return false; }
    },
    clear(): boolean {
      try { localStorage.removeItem(DRAFT_KEY); error = null; return true; }
      catch (cause) { error = cause instanceof Error ? cause.message : String(cause); return false; }
    },
  };
}
