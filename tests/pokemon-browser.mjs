import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TEST_URL || 'http://localhost:5173/';
const output = 'output/pokemon';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [], errors = [], requests = [];
const state = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function check(name, run) { await run(); results.push(name); console.log(`PASS ${name}`); }
async function waitReady(page) {
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' &&
    JSON.parse(window.render_game_to_text()).pokemon?.status === 'ready', undefined, { timeout: 20000 });
}
try {
  // Fresh context deliberately performs no online reload before the offline test.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(baseURL);
  await waitReady(page);
  await check('ten local species render in the current field with Rondoudou as player', async () => {
    const view = await state(page);
    assert.equal(view.pokemon.player.speciesId, 'jigglypuff');
    assert.equal(view.pokemon.player.animation, 'Idle');
    const actors = [view.pokemon.player, ...view.pokemon.actors];
    assert.equal(actors.length, 10);
    assert.equal(new Set(actors.map((actor) => actor.speciesId)).size, 10);
    for (const actor of actors) {
      assert.ok(actor.frame, `${actor.speciesId} has a sampled animation`);
      assert.ok(actor.frame.width > 0 && actor.frame.height > 0);
    }
    const assetRequests = requests.filter((url) => url.includes('/pokemon/'));
    assert.ok(assetRequests.some((url) => url.endsWith('manifest.json')));
    assert.ok(assetRequests.some((url) => url.endsWith('-ShadowMask.png')));
    assert.ok(assetRequests.every((url) => new URL(url).origin === new URL(baseURL).origin));
  });
  await check('Rondoudou changes to Walk during movement and returns to Idle', async () => {
    const before = await state(page);
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).pokemon.player.animation === 'Walk');
    const walking = await state(page);
    assert.equal(walking.pokemon.player.frame.animation, 'Walk');
    assert.equal(walking.pokemon.player.frame.direction, 2);
    await page.keyboard.up('ArrowRight');
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).pokemon.player.animation === 'Idle');
    const after = await state(page);
    assert.ok(after.player.x > before.player.x);
    assert.equal(after.pokemon.player.frame.animation, 'Idle');
  });
  await page.screenshot({ path: `${output}/field-desktop.png` });
  await check('first-visit scene sheets are cached before any online reload', async () => {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.waitForFunction(async () => {
      const keys = await caches.keys();
      const urls = (await Promise.all(keys.map(async (key) => (await (await caches.open(key)).keys()).map((request) => request.url)))).flat();
      return urls.some((url) => url.endsWith('jigglypuff/Normal.png'));
    });
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      return (await Promise.all(keys.map(async (key) => (await (await caches.open(key)).keys()).map((request) => request.url)))).flat();
    });
    for (const url of requests.filter((url) => /\/pokemon\/.*(?:Anim|ShadowMask)\.png$/.test(url))) {
      assert.ok(cached.includes(url), `Cached on first visit: ${url}`);
    }
  });
  await check('offline reload retains all ten animated Pokemon on first visit', async () => {
    await context.setOffline(true);
    await page.reload();
    await waitReady(page);
    const view = await state(page);
    assert.equal(view.pokemon.actors.length, 9);
    assert.equal(view.pokemon.player.speciesId, 'jigglypuff');
    assert.equal(view.pokemon.loaded, 'ready');
    assert.equal(view.pokemon.error, null);
    await page.screenshot({ path: `${output}/field-offline.png` });
    await context.setOffline(false);
  });
  assert.deepEqual(errors, [], 'No runtime or browser console errors');
  await context.close();
  await check('unavailable service workers cannot block playable Pokemon indefinitely', async () => {
    const blocked = await browser.newContext({ serviceWorkers: 'block' });
    const fallback = await blocked.newPage();
    const failures = [];
    fallback.on('pageerror', (error) => failures.push(error.message));
    const started = Date.now();
    await fallback.goto(baseURL);
    await waitReady(fallback);
    assert.ok(Date.now() - started < 16000, 'Worker wait is bounded and images still load');
    assert.equal((await state(fallback)).pokemon.loaded, 'ready');
    assert.deepEqual(failures, []);
    await blocked.close();
  });
  await writeFile(`${output}/results.json`, JSON.stringify({ baseURL, results, errors }, null, 2));
  console.log(`${results.length} Pokemon browser checks passed.`);
} finally { await browser.close(); }
