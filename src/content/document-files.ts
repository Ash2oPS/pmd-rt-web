import type { EffectAsset } from './visual-schema.ts';

export const MAX_DOCUMENT_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_TOTAL_BYTES = 16 * 1024 * 1024;
export interface DocumentFile {
  assetId: string;
  mimeType: 'image/png' | 'image/webp' | 'image/svg+xml';
  dataBase64: string;
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function decodeDocumentFile(file: DocumentFile): Uint8Array {
  const text = file.dataBase64;
  if (!text || text.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new Error('Invalid base64 image data');
  if ((text.endsWith('==') && (alphabet.indexOf(text.at(-3)!) & 15))
    || (text.endsWith('=') && !text.endsWith('==') && (alphabet.indexOf(text.at(-2)!) & 3))) throw new Error('Non-canonical base64 image padding');
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const length = text.length / 4 * 3 - padding;
  if (length > MAX_DOCUMENT_FILE_BYTES) throw new Error('Image exceeds the 8 MiB file limit');
  const bytes = new Uint8Array(length);
  let index = 0;
  for (let cursor = 0; cursor < text.length; cursor += 4) {
    const value = (alphabet.indexOf(text[cursor]!) << 18) | (alphabet.indexOf(text[cursor + 1]!) << 12)
      | (Math.max(0, alphabet.indexOf(text[cursor + 2]!)) << 6) | Math.max(0, alphabet.indexOf(text[cursor + 3]!));
    if (index < length) bytes[index++] = value >>> 16 & 255;
    if (index < length) bytes[index++] = value >>> 8 & 255;
    if (index < length) bytes[index++] = value & 255;
  }
  return bytes;
}
function validateSvg(bytes: Uint8Array): void {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!/^\s*(?:<\?xml[^?]*\?>\s*)?<svg(?:\s|>)/i.test(text) || !/<\/svg>\s*$/i.test(text)) throw new Error('Invalid SVG image signature');
  if (/<!DOCTYPE|<!ENTITY|<\s*(?:[A-Za-z_][A-Za-z0-9_.-]*:)?(?:script|foreignObject|iframe|object|embed|image|use|style|animate|set)\b|\s(?:on[a-z]+|style)\s*=|javascript\s*:|data\s*:/i.test(text))
    throw new Error('SVG contains active or external content');
  for (const match of text.matchAll(/\b(?:href|src|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))
    if (!/^#[A-Za-z][A-Za-z0-9_.-]*$/.test(match[1] ?? match[2] ?? match[3] ?? '')) throw new Error('SVG external references are not allowed');
  for (const match of text.matchAll(/url\s*\(([^)]*)\)/gi))
    if (!/^\s*['"]?#[A-Za-z][A-Za-z0-9_.-]*['"]?\s*$/.test(match[1]!)) throw new Error('SVG external URLs are not allowed');
  if (/<\?(?!xml\s)/i.test(text)) throw new Error('SVG processing instructions are not allowed');
}
export function validateDocumentFile(file: DocumentFile, asset: EffectAsset): number {
  if (!asset.path.startsWith('effects/')) throw new Error('Bundled image paths must stay under effects/');
  const bytes = decodeDocumentFile(file);
  if (file.mimeType === 'image/png') {
    if (!asset.path.endsWith('.png') || bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
      || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('PNG MIME, extension and signature must agree');
  } else if (file.mimeType === 'image/webp') {
    if (!asset.path.endsWith('.webp') || bytes.length < 20 || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF'
      || String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP') throw new Error('WebP MIME, extension and signature must agree');
  } else {
    if (!asset.path.endsWith('.svg')) throw new Error('SVG MIME and extension must agree');
    validateSvg(bytes);
  }
  return bytes.length;
}
