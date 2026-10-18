import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface LockEntry { url: string; sha256: string }
export type SourceLock = Record<string, LockEntry>;
export const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

export async function fetchSource(path: string, url: string, lock: SourceLock, check: boolean): Promise<Buffer> {
  let bytes: Buffer;
  try { bytes = await readFile(path); }
  catch {
    if (check) throw new Error(`Missing cached source ${path}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  const digest = hash(bytes), previous = lock[path];
  if (previous && (previous.url !== url || previous.sha256 !== digest)) throw new Error(`Source integrity mismatch: ${path}`);
  if (check && !previous) throw new Error(`Unlocked source: ${path}`);
  lock[path] = { url, sha256: digest };
  return bytes;
}

export async function emit(path: string, value: Uint8Array | string, check: boolean) {
  if (check) {
    const previous = await readFile(path);
    if (hash(previous) !== hash(typeof value === 'string' ? Buffer.from(value) : value)) throw new Error(`Stale generated output: ${path}`);
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value);
  }
}
export const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
