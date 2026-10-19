import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TEST_URL || 'http://localhost:5173/';
const output = 'output/editor';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await context.addInitScript(() => { window.requestAnimationFrame = () => 0; });
const page = await context.newPage();
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const snapshot = () => page.evaluate(() => JSON.parse(window.render_attack_lab_to_text()));
const button = name => page.getByRole('button', { name, exact: true });
const field = path => page.locator(`[data-editor-path=${JSON.stringify(JSON.stringify(path))}]`);
async function ready() {
  await page.waitForFunction(() => typeof window.render_attack_lab_to_text === 'function' &&
    document.querySelector('#lab-status')?.textContent.startsWith('Prêt') && !document.querySelector('#lab-play')?.disabled,
  undefined, { polling: 50 });
}
async function fill(path, value) { await field(path).fill(String(value)); await ready(); }
async function check(name, run) { await run(); results.push(name); console.log(`PASS ${name}`); }
const saveKey = 'pmd-field-save-v1';
const protectedSave = JSON.stringify({ version: 999, guard: 'Editor must never modify exploration saves' });
let exported, importedAsset;
try {
  await page.goto(new URL('lab.html', baseURL).href); await ready();
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: saveKey, value: protectedSave });
  await check('real inspector edits combat values and invalid drafts preserve the playable preview', async () => {
    await fill(['move', 'combat', 'preparationSeconds'], .9);
    await fill(['move', 'combat', 'pattern', 'range'], 2.25);
    let view = await snapshot();
    assert.equal(view.editor.lastValid.move.combat.preparationSeconds, .9);
    assert.equal(view.editor.lastValid.move.combat.pattern.range, 2.25);
    const valid = view.editor.lastValid;
    await field(['move', 'combat', 'preparationSeconds']).fill('0');
    await page.waitForFunction(() => JSON.parse(window.render_attack_lab_to_text()).editor.errors.length > 0, undefined, { polling: 50 });
    view = await snapshot();
    assert.equal(view.editor.raw.move.combat.preparationSeconds, 0);
    assert.deepEqual(view.editor.lastValid, valid);
    assert.equal(await button('Exporter le bundle').isDisabled(), true);
    assert.ok(await page.locator('.editor-field-error').count());
    assert.equal(await field(['move', 'combat', 'preparationSeconds']).inputValue(), '0');
    await button('Annuler').click(); await ready();
    assert.equal((await snapshot()).editor.lastValid.move.combat.preparationSeconds, .9);
    await button('Rétablir').click();
    assert.equal((await snapshot()).editor.errors.length > 0, true);
    await button('Annuler').click(); await ready();
    await button('Revenir à la source').click(); await ready();
    assert.equal((await snapshot()).editor.dirty, false);
    await fill(['move', 'combat', 'preparationSeconds'], .9);
    await fill(['move', 'combat', 'pattern', 'range'], 2.25);
  });
  await check('a duplicated move can edit private presentation and replace only its own sprite', async () => {
    await button('Dupliquer').click(); await ready();
    assert.equal((await snapshot()).move, 'pound-variant');
    await button('Rendu').click();
    await page.getByLabel('Élément visuel', { exact: true }).selectOption('impact');
    await fill(['move', 'visualOverrides', 'impact', 'color'], '#66ddff');
    assert.equal((await snapshot()).editor.lastValid.move.visualOverrides.impact.color, '#66ddff');
    await button('Créer un rendu propre à cette capacité').click(); await ready();
    let view = await snapshot();
    assert.equal(view.editor.lastValid.move.visualId, 'pound-variant-visual');
    const ownVisual = view.editor.lastValid.visuals.find(visual => visual.id === 'pound-variant-visual');
    assert.equal(ownVisual.tracks.find(track => track.id === 'impact').color, '#66ddff');
    await button('Assets').click();
    await page.getByLabel('Ressource visuelle', { exact: true }).selectOption('normal-impact');
    await button('Dupliquer cette ressource pour cette capacité').click(); await ready();
    importedAsset = (await snapshot()).editor.lastValid.move.visualOverrides.impact.assetId;
    assert.equal(importedAsset, 'pound-variant-normal-impact');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="#123c5a" d="M6 1h4v3h3v3h2v3h-3v3H9v2H6v-3H3V9H1V6h3V3h2z"/><path fill="#a9efff" d="M6 4h4v6H6z"/></svg>';
    await page.locator('.editor-body input[type=file]').setInputFiles({ name: 'custom-impact.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
    await page.waitForFunction(assetId => JSON.parse(window.render_attack_lab_to_text()).editor.lastValid.files.some(file => file.assetId === assetId), importedAsset, { polling: 50 });
    await ready(); view = await snapshot();
    const ownAsset = view.editor.lastValid.assets.find(asset => asset.id === importedAsset);
    assert.equal(ownAsset.frameWidth, 16); assert.equal(ownAsset.frameHeight, 16);
    assert.equal(ownAsset.path, `effects/${importedAsset}.svg`);
    assert.equal(view.editor.lastValid.assets.find(asset => asset.id === 'normal-impact').path, 'effects/normal-impact.svg');
    await button('Rendu').click();
    await page.locator('#lab-play').click();
    await page.evaluate(() => window.advance_attack_lab(950));
    assert.ok((await snapshot()).presentation);
    await page.screenshot({ path: `${output}/desktop-editor.png` });
  });
  await check('export and import round trip the exact authoring bundle including its new image', async () => {
    const downloadEvent = page.waitForEvent('download'); await button('Exporter le bundle').click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'attack-bundle.json');
    await download.saveAs(`${output}/attack-bundle.json`);
    exported = JSON.parse(await readFile(`${output}/attack-bundle.json`, 'utf8'));
    assert.equal(exported.move.combat.preparationSeconds, .9);
    assert.equal(exported.move.combat.pattern.range, 2.25);
    assert.equal(exported.files.length, 1);
    assert.equal(exported.files[0].assetId, importedAsset);
    assert.equal(exported.visuals.some(visual => visual.id === 'water'), false, 'Unchanged unrelated presets must not be exported');
    await page.locator('[data-move="vine-whip"]').click(); await ready();
    await page.locator('.editor-toolbar input[type=file]').setInputFiles(`${output}/attack-bundle.json`);
    await page.waitForFunction(() => JSON.parse(window.render_attack_lab_to_text()).move === 'pound-variant' &&
      JSON.parse(window.render_attack_lab_to_text()).editor.lastValid.files.length === 1, undefined, { polling: 50 });
    await ready();
    const view = await snapshot();
    assert.deepEqual(view.editor.lastValid.move, exported.move);
    assert.deepEqual(view.editor.lastValid.files, exported.files);
    for (const visual of exported.visuals) assert.deepEqual(view.editor.lastValid.visuals.find(value => value.id === visual.id), visual);
    for (const asset of exported.assets) assert.deepEqual(view.editor.lastValid.assets.find(value => value.id === asset.id), asset);
    assert.equal(view.editor.errors.length, 0);
    await page.locator('#lab-play').click(); await page.evaluate(() => window.advance_attack_lab(950));
    assert.ok((await snapshot()).presentation.sprites > 0 || (await snapshot()).presentation.particles > 0);
    const roundTripEvent = page.waitForEvent('download'); await button('Exporter le bundle').click();
    await (await roundTripEvent).saveAs(`${output}/attack-bundle-roundtrip.json`);
    assert.deepEqual(JSON.parse(await readFile(`${output}/attack-bundle-roundtrip.json`, 'utf8')), exported);
  });
  await check('browser drafts restore authoring independently from exploration saves', async () => {
    await button('Combat').click();
    await fill(['move', 'combat', 'preparationSeconds'], 1.1);
    const expected = (await snapshot()).editor.raw;
    await button('Garder un brouillon').click();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), protectedSave);
    await page.reload(); await ready();
    await button('Reprendre le brouillon').click();
    await page.waitForFunction(() => JSON.parse(window.render_attack_lab_to_text()).move === 'pound-variant' &&
      JSON.parse(window.render_attack_lab_to_text()).editor.raw.move.combat.preparationSeconds === 1.1, undefined, { polling: 50 });
    await page.waitForFunction(() => !document.querySelector('#lab-play').disabled, undefined, { polling: 50 });
    assert.deepEqual((await snapshot()).editor.raw, expected);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), protectedSave);
  });
  await check('inspector stays usable without horizontal page overflow on desktop and portrait', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await button('Combat').click();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#lab-canvas');
      return canvas.width === Math.round(canvas.clientWidth * Math.min(devicePixelRatio, 2)) &&
        canvas.height === Math.round(canvas.clientHeight * Math.min(devicePixelRatio, 2));
    }, undefined, { polling: 50 });
    await page.evaluate(() => window.advance_attack_lab(0));
    const sizes = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(sizes.document <= sizes.width + 1, JSON.stringify(sizes));
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${output}/portrait-editor.png` });
    await page.locator('.editor-tabs').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/portrait-inspector.png` });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.advance_attack_lab(0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  });
  await check('an image import finishing after selection changes cannot modify another draft', async () => {
    await button('Assets').click();
    await page.getByLabel('Ressource visuelle', { exact: true }).selectOption(importedAsset);
    await page.evaluate(() => {
      window.__editorOriginalDecode = HTMLImageElement.prototype.decode;
      window.__editorDelayedDecodeCalls = 0; window.__editorPendingDecodes = 0;
      HTMLImageElement.prototype.decode = async function () {
        window.__editorDelayedDecodeCalls++; window.__editorPendingDecodes++;
        try {
          await new Promise(resolve => setTimeout(resolve, 200));
          await window.__editorOriginalDecode.call(this);
        } finally { window.__editorPendingDecodes--; }
      };
    });
    try {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="#ff4477" d="M0 0h16v16H0z"/></svg>';
      await page.locator('.editor-body input[type=file]').setInputFiles({ name: 'late-image.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
      await page.waitForFunction(() => window.__editorDelayedDecodeCalls > 0, undefined, { polling: 10 });
      await page.locator('[data-move="vine-whip"]').click();
      await page.waitForFunction(() => JSON.parse(window.render_attack_lab_to_text()).move === 'vine-whip', undefined, { polling: 10 });
      const target = (await snapshot()).editor.raw;
      await page.waitForFunction(() => window.__editorPendingDecodes === 0, undefined, { polling: 25 });
      await ready();
      const after = await snapshot();
      assert.equal(after.move, 'vine-whip');
      assert.deepEqual(after.editor.raw, target, 'A late upload must not overwrite the selected draft');
      assert.deepEqual(after.editor.raw.files, []);
      assert.equal(after.editor.raw.assets.some(asset => asset.id === importedAsset), false);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), protectedSave);
    } finally {
      await page.evaluate(() => {
        HTMLImageElement.prototype.decode = window.__editorOriginalDecode;
        delete window.__editorOriginalDecode; delete window.__editorDelayedDecodeCalls; delete window.__editorPendingDecodes;
      });
    }
  });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ baseURL, results, errors, exportedMove: exported.move.id }, null, 2));
  console.log(`${results.length} editor browser checks passed.`);
} finally { await context.close(); await browser.close(); }
