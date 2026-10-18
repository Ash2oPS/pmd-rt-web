import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';
import { spriteManifestSchema } from '../src/content/sprite-schema.js';
import { sampleAnimation, SPRITE_DIRECTIONS } from '../src/domain/animation.js';

// Reproducible, native-pixel source review. Red crosses mark the fixed sprite
// root; white source shadow markers are inspected independently and never used
// to recenter art. Output is deliberately excluded from distributable assets.
const manifest = spriteManifestSchema.parse(JSON.parse(await readFile('public/pokemon/manifest.json', 'utf8')));
const directory = 'output/pokemon-qa';
await mkdir(directory, { recursive: true });
const report = [];
const overview: OverlayOptions[] = [];
const overviewLabels: string[] = [];
let speciesRow = 0;
for (const species of manifest.species) {
  const maxFrames = Math.max(...Object.values(species.animations).map(animation => animation.durations.length));
  const cell = Math.max(96, ...Object.values(species.animations).map(animation => Math.max(animation.frameWidth, animation.frameHeight) + 20));
  const labelWidth = 132;
  const width = labelWidth + maxFrames * cell;
  const height = 40 + Object.keys(species.animations).length * 8 * cell;
  const composites: OverlayOptions[] = [];
  const text = [`<text x="8" y="24">${species.id}: fixed source center, no recentering</text>`];
  let row = 0;
  let animationColumn = 0;
  for (const [name, animation] of Object.entries(species.animations)) {
    overviewLabels.push(`<text x="${132 + animationColumn * 288}" y="${speciesRow * 104 + 18}">${name}: first / middle / last, down</text>`);
    const indices = [0, Math.floor(animation.durations.length / 2), animation.durations.length - 1];
    for (const [index, frame] of indices.entries()) {
      const left = Math.round(132 + animationColumn * 288 + index * 96 + 48 - animation.origin.x);
      const top = Math.round(speciesRow * 104 + 62 - animation.origin.y);
      const input = await sharp(`public/${animation.sheet}`).extract({ left: frame * animation.frameWidth, top: 0, width: animation.frameWidth, height: animation.frameHeight }).png().toBuffer();
      overview.push({ input, left, top });
    }
    animationColumn++;
    const source = await sharp(`public/${animation.sheet}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const shadow = await sharp(`public/${animation.shadowSheet}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const errors: string[] = [];
    let markerFrames = 0, emptyFrames = 0;
    for (let direction = 0; direction < animation.directions; direction++) {
      text.push(`<text x="4" y="${40 + row * cell + 18}">${name} ${SPRITE_DIRECTIONS[direction]}</text>`);
      let elapsed = 0;
      for (let frame = 0; frame < animation.durations.length; frame++) {
        const sampled = sampleAnimation(species, name, SPRITE_DIRECTIONS[direction]!, elapsed + animation.durations[frame]! / 2)!;
        if (sampled.frame !== frame) errors.push(`Wrong sampled frame ${direction}/${frame}`);
        const marker = animation.origins?.[direction]?.[frame];
        const markers: { x: number; y: number }[] = [];
        let alpha = 0;
        for (let y = 0; y < animation.frameHeight; y++) for (let x = 0; x < animation.frameWidth; x++) {
          const offset = ((direction * animation.frameHeight + y) * source.info.width + frame * animation.frameWidth + x) * 4;
          alpha += source.data[offset + 3]!;
          if (shadow.data[offset] === 255 && shadow.data[offset + 1] === 255 && shadow.data[offset + 2] === 255 && shadow.data[offset + 3]! > 0) markers.push({ x, y });
        }
        if (markers.length !== 1) errors.push(`White marker count ${markers.length} at ${direction}/${frame}`);
        else markerFrames++;
        if (!marker || marker.x !== markers[0]?.x || marker.y !== markers[0]?.y) errors.push(`Wrong marker metadata ${direction}/${frame}`);
        if (!alpha) emptyFrames++;
        const rootX = labelWidth + frame * cell + cell / 2;
        const rootY = 40 + row * cell + cell / 2;
        const left = Math.round(rootX - sampled.origin.x), top = Math.round(rootY - sampled.origin.y);
        if (animation.shadowMask) {
          const input = await sharp(`public/${animation.shadowMask}`).extract({ left: sampled.sourceX, top: sampled.sourceY, width: sampled.width, height: sampled.height }).png().toBuffer();
          composites.push({ input, left, top });
        }
        const input = await sharp(`public/${animation.sheet}`).extract({ left: sampled.sourceX, top: sampled.sourceY, width: sampled.width, height: sampled.height }).png().toBuffer();
        composites.push({ input, left, top });
        text.push(`<path d="M${rootX - 3},${rootY}h6 M${rootX},${rootY - 3}v6" stroke="#ff5771"/><text x="${labelWidth + frame * cell + 3}" y="${40 + row * cell + cell - 5}">${frame}: ${animation.sourceDurations[frame]}t</text>`);
        elapsed += animation.durations[frame]!;
      }
      row++;
    }
    report.push({ species: species.id, animation: name, frameCount: animation.durations.length * animation.directions,
      markerFrames, emptyFrames, errors });
  }
  const overlay = Buffer.from(`<svg width="${width}" height="${height}"><g fill="#e8eaf2" font-family="monospace" font-size="11">${text.join('')}</g></svg>`);
  composites.push({ input: overlay, top: 0, left: 0 });
  await sharp({ create: { width, height, channels: 4, background: '#273138' } }).composite(composites).png().toFile(`${directory}/${species.id}.png`);
  overviewLabels.push(`<text x="4" y="${speciesRow * 104 + 62}">${species.id}</text>`);
  speciesRow++;
}
overview.push({ input: Buffer.from(`<svg width="1284" height="1040"><g fill="#e8eaf2" font-family="monospace" font-size="11">${overviewLabels.join('')}</g></svg>`), left: 0, top: 0 });
await sharp({ create: { width: 1284, height: 1040, channels: 4, background: '#273138' } }).composite(overview).png().toFile(`${directory}/overview.png`);
await writeFile(`${directory}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
const errors = report.flatMap(entry => entry.errors.map(error => `${entry.species}/${entry.animation}: ${error}`));
console.log(JSON.stringify({ species: manifest.species.length, animations: report.length, frames: report.reduce((total, entry) => total + entry.frameCount, 0), errors, emptyFrames: report.filter(entry => entry.emptyFrames) }, null, 2));
if (errors.length) process.exitCode = 1;
