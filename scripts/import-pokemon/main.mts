import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { z } from 'zod';
import { normalizeAnimation, parseAnimationData, resolveAnimation } from './animation.mts';
import { normalizeSpecies } from './data.mts';
import { creditsHtml } from './credits.mts';
import { readShadowOrigins, shadowMaskPixels } from './anchors.mts';
import { emit, fetchSource, json } from './source.mts';
import type { SourceLock } from './source.mts';

const configSchema = z.object({ version: z.literal(1), spriteCollabCommit: z.string().regex(/^[a-f0-9]{40}$/),
  animations: z.array(z.string()), species: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), dexNumber: z.number().int().positive() })) });
const config = configSchema.parse(JSON.parse(await readFile('imports/pokemon/config.json', 'utf8')));
const check = process.argv.includes('--check');
let lock: SourceLock = {};
try { lock = JSON.parse(await readFile('imports/pokemon/sources.lock.json', 'utf8')) as SourceLock; }
catch (error) { if (check) throw error; }
const base = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/${config.spriteCollabCommit}`;
const spriteSource = (path: string) => fetchSource(`imports/raw/spritecollab/${config.spriteCollabCommit}/${path}`, `${base}/${path}`, lock, check);
const metadata = await spriteSource('credit_names.txt');
const names = new Map(metadata.toString().trim().split(/\r?\n/).slice(1).map((line) => {
  const [name, discord, contact] = line.split('\t'); return [discord, { name: name || discord, contact }];
}));
await emit('public/credits/SpriteCollab-LICENSE.md', await spriteSource('LICENSE.md'), check);
await emit('public/credits/SpriteCollab-README.md', await spriteSource('README.md'), check);
const normalized = [], manifestSpecies = [], report = [];
for (const item of config.species) {
  const rawData = await Promise.all(['pokemon', 'pokemon-species'].map(async (endpoint) => {
    const url = `https://pokeapi.co/api/v2/${endpoint}/${item.dexNumber}/`;
    return JSON.parse((await fetchSource(`imports/raw/pokeapi/${endpoint}-${item.dexNumber}.json`, url, lock, check)).toString()) as unknown;
  }));
  const data = normalizeSpecies(rawData[0], rawData[1]);
  if (data.id !== item.id) throw new Error(`Species ID mismatch: ${item.id}`);
  normalized.push(data);
  const folder = String(item.dexNumber).padStart(4, '0'), prefix = `pokemon/${item.id}`;
  const xml = await spriteSource(`sprite/${folder}/AnimData.xml`);
  const parsed = parseAnimationData(xml.toString());
  await emit(`public/${prefix}/AnimData.xml`, xml, check);
  const animations: Record<string, unknown> = {};
  for (const requested of config.animations) {
    const source = resolveAnimation(requested, parsed.animations);
    const buffers = await Promise.all(['Anim', 'Offsets', 'Shadow'].map((kind) => spriteSource(`sprite/${folder}/${source.Name}-${kind}.png`)));
    const image = await sharp(buffers[0]).metadata();
    const info = normalizeAnimation(source, image.width ?? 0, image.height ?? 0);
    const shadow = await sharp(buffers[2]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (shadow.info.width !== image.width || shadow.info.height !== image.height) throw new Error('Shadow sheet dimensions mismatch');
    const origins = readShadowOrigins(shadow.data, shadow.info.width, shadow.info.height, info.frameWidth, info.frameHeight);
    const mask = await sharp(shadowMaskPixels(shadow.data, parsed.shadowSize), { raw: {
      width: shadow.info.width, height: shadow.info.height, channels: 4,
    } }).png().toBuffer();
    await emit(`public/${prefix}/${source.Name}-ShadowMask.png`, mask, check);
    for (const [index, kind] of ['Anim', 'Offsets', 'Shadow'].entries()) await emit(`public/${prefix}/${source.Name}-${kind}.png`, buffers[index], check);
    animations[requested] = { ...info, origins, sourceName: source.Name,
      sheet: `${prefix}/${source.Name}-Anim.png`, offsetsSheet: `${prefix}/${source.Name}-Offsets.png`, shadowSheet: `${prefix}/${source.Name}-Shadow.png`, shadowMask: `${prefix}/${source.Name}-ShadowMask.png`,
      ...(source.Name === requested ? {} : { copyOf: source.Name }) };
  }
  const rawCredits = await Promise.all(['sprite', 'portrait'].map((kind) => spriteSource(`${kind}/${folder}/credits.txt`)));
  const credits = [...new Set(rawCredits.flatMap((value) => value.toString().trim().split(/\r?\n/).map((line) => line.split('\t')[1])))].filter(Boolean).map((id) => {
    const author = names.get(id); return author ? `${author.name}${author.contact ? ` (${author.contact})` : ''}` : id;
  });
  for (const [i, kind] of ['sprite', 'portrait'].entries()) await emit(`public/${prefix}/${kind}-credits.txt`, rawCredits[i], check);
  await emit(`public/${prefix}/Normal.png`, await spriteSource(`portrait/${folder}/Normal.png`), check);
  manifestSpecies.push({ id: item.id, dexNumber: item.dexNumber, label: data.label, animations,
    shadowSize: parsed.shadowSize, sourceAnimData: `${prefix}/AnimData.xml`, portrait: `${prefix}/Normal.png`, credits });
  report.push({ id: item.id, animations: Object.keys(animations), missing: [], portrait: 'Normal', credits,
    anchorAudit: Object.fromEntries(Object.entries(animations).map(([name, entry]) => {
      const value = entry as { directions: number; durations: number[] };
      return [name, { frames: value.directions * value.durations.length, missing: 0, duplicate: 0, fallback: 0 }];
    })) });
  console.log(`Imported ${item.id}`);
}
await emit('imports/pokemon/species.json', json(normalized), check);
await emit('public/pokemon/manifest.json', json({ version: 1, source: { provider: 'SpriteCollab', commit: config.spriteCollabCommit }, species: manifestSpecies }), check);
await emit('imports/reports/pokemon-coverage.json', json({ version: 1, species: report }), check);
await emit('public/credits/pokemon.html', creditsHtml(report, config.spriteCollabCommit), check);
await emit('public/credits/pokemon.json', json({ spriteCollab: { url: 'https://github.com/PMDCollab/SpriteCollab', commit: config.spriteCollabCommit,
  license: 'CC-BY-NC-4.0 (community submissions); official assets retain original rights', modifications: 'Original PNG pixels unchanged; metadata normalized to JSON; derived black RGBA shadow masks extracted from source RGB channels',
  originalRights: 'Pokémon / Nintendo / Creatures / GAME FREAK / Spike Chunsoft', species: report },
  data: { provider: 'PokéAPI', url: 'https://pokeapi.co', snapshotLock: 'imports/pokemon/sources.lock.json' } }), check);
await emit('imports/pokemon/sources.lock.json', json(lock), check);
console.log(check ? 'Verified cached sources and generated outputs without network.' : 'Import complete. Commit source lock, snapshots and generated assets.');
