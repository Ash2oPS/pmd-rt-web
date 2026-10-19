import { mkdir, readFile, readdir, lstat, realpath, rename, unlink, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { parseAttackDocument, documentRecords } from '../src/content/attack-document.ts';
import { recordSchemas } from '../src/content/schemas.ts';
import { validateContent } from '../src/content/validate.ts';

interface Change { path: string; absolute: string; next: Buffer; previous: Buffer | null }
const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;
const recordPath = /^content\/(moves|lab-fixtures|attack-visuals|effect-assets|species)\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.json$/;
const imagePath = /^public\/effects\/[A-Za-z0-9][A-Za-z0-9_./-]*\.(png|webp|svg)$/;

async function existing(file: string): Promise<Buffer | null> {
  try { return await readFile(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

/** Reject symlink/reparse-point destinations as well as lexical path escapes. */
async function confined(root: string, relative: string): Promise<string> {
  const absolute = path.resolve(root, relative), tail = path.relative(root, absolute);
  if (!tail || tail.startsWith('..') || path.isAbsolute(tail)) throw new Error(`Path escapes project: ${relative}`);
  let cursor = root;
  for (const segment of tail.split(path.sep)) {
    cursor = path.join(cursor, segment);
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`Symlink destination rejected: ${relative}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return absolute;
}

async function sourceContent(root: string) {
  const raw: Record<string, unknown[]> = {};
  for (const category of Object.keys(recordSchemas)) {
    const directory = await confined(root, `content/${category}`);
    const files = (await readdir(directory)).filter(file => file.endsWith('.json')).sort();
    raw[category] = await Promise.all(files.map(async file => {
      const absolute = await confined(root, `content/${category}/${file}`);
      return JSON.parse(await readFile(absolute, 'utf8')) as unknown;
    }));
  }
  return validateContent(raw);
}

async function atomicWrite(absolute: string, data: Buffer): Promise<void> {
  await mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, data, { flag: 'wx' }); await rename(temporary, absolute); }
  finally { await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }); }
}

/** Validate every dependency and image before touching any authored project file. */
export async function applyAttackBundle(input: unknown, projectRoot: string, apply = false) {
  const root = await realpath(projectRoot);
  const validated = parseAttackDocument(input, await sourceContent(root));
  const changes: Change[] = [], seen = new Set<string>();
  async function add(relative: string, next: Buffer, allowed: RegExp) {
    if (!allowed.test(relative) || relative.split('/').some(segment => segment === '.' || segment === '..' || !segment))
      throw new Error(`Unsupported authoring destination: ${relative}`);
    if (seen.has(relative)) throw new Error(`Duplicate authoring destination: ${relative}`);
    seen.add(relative);
    const absolute = await confined(root, relative), previous = await existing(absolute);
    if (previous?.equals(next)) return;
    changes.push({ path: relative, absolute, next, previous });
  }
  for (const record of documentRecords(validated))
    await add(record.path, Buffer.from(JSON.stringify(record.data, null, 2) + '\n'), recordPath);
  for (const file of validated.document.files ?? []) {
    const asset = validated.content['effect-assets'].find(asset => asset.id === file.assetId);
    if (!asset) throw new Error(`Missing effect asset definition: ${file.assetId}`);
    const bytes = Buffer.from(file.dataBase64, 'base64'), metadata = await sharp(bytes).metadata();
    const expected = file.mimeType === 'image/png' ? 'png' : file.mimeType === 'image/webp' ? 'webp' : 'svg';
    if (metadata.format !== expected || metadata.width !== asset.frameWidth * asset.frames || metadata.height !== asset.frameHeight)
      throw new Error(`Image format or sheet dimensions disagree with effect asset: ${asset.id}`);
    for (const shared of validated.content['effect-assets'].filter(definition => definition.path === asset.path)) {
      if (metadata.width !== shared.frameWidth * shared.frames || metadata.height !== shared.frameHeight)
        throw new Error(`Uploaded image would invalidate shared effect asset dimensions: ${shared.id}`);
    }
    await add(`public/${asset.path}`, bytes, imagePath);
  }
  for (const asset of validated.document.assets) {
    if (validated.document.files.some(file => file.assetId === asset.id)) continue;
    const relative = `public/${asset.path}`;
    if (!imagePath.test(relative)) throw new Error(`Unsupported effect asset destination: ${relative}`);
    const absolute = await confined(root, relative), metadata = await sharp(absolute).metadata();
    if (metadata.format !== path.extname(asset.path).slice(1) || metadata.width !== asset.frameWidth * asset.frames || metadata.height !== asset.frameHeight)
      throw new Error(`Sheet dimensions disagree with effect asset: ${asset.id}`);
  }
  if (!apply || !changes.length) return { applied: false, changes: changes.map(change => change.path), backup: null };
  const backupRelative = `output/authoring-backups/${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const backup = await confined(root, backupRelative);
  for (const change of changes) {
    if (change.previous) {
      const destination = await confined(root, `${backupRelative}/${change.path}`);
      await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, change.previous, { flag: 'wx' });
    }
  }
  await mkdir(backup, { recursive: true });
  await writeFile(path.join(backup, 'manifest.json'), JSON.stringify(changes.map(change => ({ path: change.path, existed: change.previous !== null })), null, 2));
  const written: Change[] = [];
  try {
    for (const change of changes) {
      await confined(root, change.path);
      const current = await existing(change.absolute);
      if (current === null ? change.previous !== null : change.previous === null || !current.equals(change.previous))
        throw new Error(`File changed during authoring apply: ${change.path}`);
      await atomicWrite(change.absolute, change.next); written.push(change);
    }
  } catch (error) {
    for (const change of written.reverse()) {
      await confined(root, change.path);
      if (change.previous) await atomicWrite(change.absolute, change.previous);
      else await unlink(change.absolute);
    }
    throw error;
  }
  return { applied: true, changes: changes.map(change => change.path), backup: backupRelative };
}

async function main() {
  const args = process.argv.slice(2), file = args[0];
  if (!file || file.startsWith('--')) throw new Error('Usage: attack:apply bundle.json [--apply] [--root project-path]');
  let root = fileURLToPath(new URL('../', import.meta.url));
  for (let index = 1; index < args.length; index++) {
    if (args[index] === '--apply') continue;
    if (args[index] === '--root' && args[index + 1]) { root = path.resolve(args[++index]!); continue; }
    throw new Error(`Unknown argument: ${args[index]}`);
  }
  if ((await stat(file)).size > MAX_BUNDLE_BYTES) throw new Error('Attack bundle exceeds 32 MiB');
  const raw = await readFile(file);
  if (raw.byteLength > MAX_BUNDLE_BYTES) throw new Error('Attack bundle exceeds 32 MiB');
  const result = await applyAttackBundle(JSON.parse(raw.toString('utf8')) as unknown, root, args.includes('--apply'));
  console.log(`${result.applied ? 'Applied' : 'Dry run'}: ${result.changes.length} changed files`);
  for (const changed of result.changes) console.log(`  ${changed}`);
  if (result.backup) console.log(`Originals backed up to ${result.backup}`);
  if (result.applied) console.log('Next: npm run content:generate, npm run check, then rebuild and review.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
