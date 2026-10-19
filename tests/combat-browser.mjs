import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TEST_URL || 'http://localhost:5173/';
const output = 'output/combat';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [], errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
async function key(page, code, duration = 17) {
  await page.keyboard.down(code); await advance(page, duration); await page.keyboard.up(code); await advance(page, 0);
}
async function waitWorld(page, ms) {
  await page.keyboard.down('Space'); await advance(page, ms); await page.keyboard.up('Space'); await advance(page, 0);
}
async function scene(viewport = { width: 1280, height: 720 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    if (!localStorage.getItem('pmd-field-save-v1')) localStorage.setItem('pmd-field-save-v1', JSON.stringify({
      version: 1, player: { x: 2, y: 4 }, steps: 0, collected: [], facing: 'up',
    }));
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(baseURL);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && JSON.parse(window.render_game_to_text()).pokemon.status === 'ready', undefined, { polling: 50 });
  return { page, context };
}
async function check(name, run) { await run(); results.push(name); console.log(`PASS ${name}`); }
try {
  await check('camera focuses field attacks smoothly, freezes on pause and returns at idle', async () => {
    const { page, context } = await scene();
    try {
      await advance(page, 0);
      const resting = (await state(page)).camera;
      assert.equal(resting.zoom, 1.25);
      await page.screenshot({ path: `${output}/camera-exploration.png` });
      await key(page, 'j', 100);
      const focusing = (await state(page)).camera;
      assert.equal(focusing.targetZoom, 1.42);
      assert.ok(focusing.zoom > resting.zoom && focusing.zoom < focusing.targetZoom);
      assert.ok(focusing.width < resting.width);
      await key(page, 'Escape');
      const paused = (await state(page)).camera;
      await advance(page, 1000);
      assert.deepEqual((await state(page)).camera, paused);
      await page.locator('[data-menu="resume"]').click();
      await advance(page, 150);
      await page.screenshot({ path: `${output}/camera-action.png` });
      await advance(page, 2500);
      const returned = await state(page);
      assert.equal(returned.camera.zoom, 1.25);
      const worldTime = returned.worldClock.time;
      await advance(page, 1000);
      assert.equal((await state(page)).worldClock.time, worldTime, 'Camera does not drive simulation time');
    } finally { await context.close(); }
  });
  await check('reduced motion retains closer field framing without automatic attack zoom', async () => {
    const { page, context } = await scene();
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload();
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && JSON.parse(window.render_game_to_text()).pokemon.status === 'ready', undefined, { polling: 50 });
      await key(page, 'j', 100);
      assert.equal((await state(page)).camera.zoom, 1.25);
      assert.equal((await state(page)).camera.targetZoom, 1.25);
    } finally { await context.close(); }
  });
  await check('one field encounter owns each actor and only Bulbasaur is hostile', async () => {
    const { page, context } = await scene();
    try {
      const before = await state(page);
      assert.equal(before.mode, 'play');
      assert.equal(before.combat.actors.filter(actor => actor.team === 'hostile').length, 1);
      assert.equal(before.combat.actors.filter(actor => actor.team === 'neutral').length, 8);
      assert.equal(await page.locator('[data-menu="combat"]').count(), 0, 'Exploration has no training launch button');
      assert.equal(await page.locator('[data-menu="lab"]').count(), 1, 'The ability workshop remains separate');
      assert.equal(new Set(before.pokemon.actors.map(actor => actor.id)).size, before.pokemon.actors.length);
      assert.deepEqual(before.pokemon.actors.map(({ id, x, y }) => [id, x, y]), before.combat.actors.map(({ id, x, y }) => [id, x, y]));
      await advance(page, 1200);
      const idle = await state(page);
      assert.equal(idle.worldClock.time, before.worldClock.time, 'Idle presentation does not advance the world');
      assert.deepEqual(idle.combat.actors.map(({ id, x, y }) => [id, x, y]), before.combat.actors.map(({ id, x, y }) => [id, x, y]));
      assert.ok(idle.pokemon.elapsed > before.pokemon.elapsed, 'Idle sprites keep animating');
      await waitWorld(page, 500);
      const waited = await state(page);
      assert.ok(waited.worldClock.time > idle.worldClock.time, 'Held wait advances the world');
      assert.deepEqual(waited.pokemon.actors.map(({ id, x, y }) => [id, x, y]), waited.combat.actors.map(({ id, x, y }) => [id, x, y]));
    } finally { await context.close(); }
  });
  await check('equipped attacks work in exploration and defeating Bulbasaur does not end the game', async () => {
    const { page, context } = await scene();
    try {
      const hostile = (await state(page)).combat.actors.find(actor => actor.team === 'hostile');
      assert.ok(hostile);
      await key(page, 'j');
      let view = await state(page);
      assert.ok(view.combat.casts.some(cast => cast.casterId === 'player' && cast.moveId === 'pound'));
      await advance(page, 750);
      view = await state(page);
      assert.ok(view.combat.actors.find(actor => actor.id === hostile.id).hp < hostile.hp, 'The authored Pound contact damages its target');
      await page.screenshot({ path: `${output}/field-first-hit.png` });
      for (let hit = 1; hit < 3 && !view.combat.actors.find(actor => actor.id === hostile.id).defeated; hit++) {
        await page.locator('[data-slot="0"]').click();
        await advance(page, 0);
        await waitWorld(page, 1100);
        view = await state(page);
      }
      assert.equal(view.combat.actors.find(actor => actor.id === hostile.id).defeated, true);
      assert.equal(view.combat.result, 'playing', 'Victory leaves the field active');
      assert.equal(view.mode, 'play');
      const position = view.player;
      await key(page, 'ArrowRight', 150);
      view = await state(page);
      assert.ok(view.player.x > position.x, 'Exploration continues after the enemy is removed');
      await page.screenshot({ path: `${output}/field-after-victory.png` });
    } finally { await context.close(); }
  });
  await check('pause freezes the shared encounter and resume advances it only on player action', async () => {
    const { page, context } = await scene();
    try {
      await waitWorld(page, 250);
      await key(page, 'Escape');
      const paused = (await state(page)).combat;
      await advance(page, 2000);
      assert.deepEqual((await state(page)).combat, paused);
      await page.locator('[data-menu="resume"]').click();
      await advance(page, 500);
      assert.deepEqual((await state(page)).combat, paused, 'Idle after resuming remains frozen');
      await waitWorld(page, 250);
      assert.ok((await state(page)).combat.time > paused.time);
    } finally { await context.close(); }
  });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ baseURL, results, errors }, null, 2));
  console.log(`${results.length} field combat browser checks passed.`);
} finally { await browser.close(); }
