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
async function scene(viewport = { width: 1280, height: 720 }, initialSave = null) {
  const context = await browser.newContext({ viewport });
  const defaultSave = JSON.stringify({ version: 1, player: { x: 2, y: 4 }, steps: 0, collected: [], facing: 'up' });
  await context.addInitScript(`(() => {
    window.requestAnimationFrame = () => 0;
    const initialSave = ${JSON.stringify(initialSave)};
    if (initialSave) localStorage.setItem('pmd-field-save-v1', JSON.stringify(initialSave));
    else if (!localStorage.getItem('pmd-field-save-v1')) localStorage.setItem('pmd-field-save-v1', ${JSON.stringify(defaultSave)});
  })()`);
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
  await check('Bulbasaur waits behind a wall and pursues only after it sees the explorer move', async () => {
    const saved = { version: 2, player: { x: 7, y: 3 }, distance: 0, steps: 0, collected: [], facing: 'left' };
    const { page, context } = await scene({ width: 1280, height: 720 }, saved);
    try {
      const initial = await state(page);
      const enemy = initial.combat.actors.find(actor => actor.team === 'hostile');
      await advance(page, 1500);
      assert.equal((await state(page)).combat.actors.find(actor => actor.id === enemy.id).behavior, 'idle', 'Idle behind a wall does not trigger aggro');
      await waitWorld(page, 250);
      let view = await state(page);
      assert.equal(view.combat.actors.find(actor => actor.id === enemy.id).behavior, 'idle', 'Wait alone cannot bypass blocked line of sight');
      await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowDown');
      await advance(page, 900);
      await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowDown'); await advance(page, 0);
      view = await state(page);
      const pursuing = view.combat.actors.find(actor => actor.id === enemy.id);
      assert.notDeepEqual([pursuing.x, pursuing.y], [enemy.x, enemy.y], 'Bulbasaur approaches after seeing the explorer during a movement action');
    } finally { await context.close(); }
  });
  await check('Bulbasaur announces real Vine Whip geometry, the player dodges and ripostes', async () => {
    const { page, context } = await scene();
    try {
      let view = await state(page);
      const enemy = view.combat.actors.find(actor => actor.team === 'hostile');
      for (let i = 0; i < 30 && !view.combat.casts.some(cast => cast.casterId === enemy.id); i++) {
        await waitWorld(page, 100); view = await state(page);
      }
      let warning = view.combat.casts.find(cast => cast.casterId === enemy.id);
      assert.ok(warning);
      for (let i = 0; i < 20 && warning.phase === 'tracking'; i++) {
        await waitWorld(page, 50); view = await state(page);
        warning = view.combat.casts.find(cast => cast.casterId === enemy.id) ?? warning;
      }
      assert.equal(warning.phase, 'locked');
      const geometry = warning.geometry, hp = view.combat.player.hp;
      assert.equal(warning.moveId, 'vine-whip');
      assert.match(await page.locator('.combat-warning').textContent(), /Bulbizarre prépare Fouet Lianes/);
      assert.ok(geometry, 'The renderer and contact rule share the resolved warning geometry');
      await page.screenshot({ path: `${output}/enemy-vine-whip-telegraph.png` });
      await page.setViewportSize({ width: 320, height: 568 });
      await page.waitForTimeout(100);
      await advance(page, 0);
      assert.deepEqual(await page.locator('#game').evaluate(canvas => [canvas.width, canvas.height]), [320, 568]);
      const warningRect = await page.locator('.combat-warning').boundingBox();
      assert.ok(warningRect && warningRect.x >= 0 && warningRect.y >= 0 && warningRect.x + warningRect.width <= 320
        && warningRect.y + warningRect.height <= 568, 'The warning remains visible inside a compact viewport');
      await page.screenshot({ path: `${output}/enemy-vine-whip-compact.png` });
      await key(page, 'ArrowDown', 450);
      view = await state(page);
      assert.deepEqual(view.combat.casts.find(cast => cast.id === warning.id)?.geometry, geometry, 'The locked telegraph does not retarget while dodging');
      await waitWorld(page, 300);
      view = await state(page);
      assert.equal(view.combat.player.hp, hp, 'Moving out of the locked zone dodges its contact');
      await key(page, 'ArrowUp', 400);
      const enemyHp = view.combat.actors.find(actor => actor.id === enemy.id).hp;
      await page.locator('[data-slot="0"]').click(); await advance(page, 0); await waitWorld(page, 800);
      view = await state(page);
      assert.ok(view.combat.actors.find(actor => actor.id === enemy.id).hp < enemyHp, 'The equipped Pound can riposte on the same map');
    } finally { await context.close(); }
  });
  await check('K.O. saves the exploration state before same-map revival and reload starts with grace', async () => {
    const saved = { version: 2, player: { x: 2, y: 4 }, distance: 0, steps: 0, collected: [0], facing: 'up' };
    const { page, context } = await scene({ width: 1280, height: 720 }, saved);
    try {
      for (let i = 0; i < 80 && (await state(page)).combat.result === 'playing'; i++) await waitWorld(page, 250);
      let view = await state(page);
      assert.equal(view.combat.result, 'lost', 'Bulbasaur can K.O. Rondoudou in exploration');
      assert.equal(await page.locator('[data-recover]').isVisible(), true);
      const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('pmd-field-save-v1')));
      assert.deepEqual(persisted.player, view.player);
      assert.deepEqual(persisted.collected, [0], 'Collected objects are saved before recovery is offered');
      assert.deepEqual(view.combat.casts, []); assert.deepEqual(view.combat.projectiles, []); assert.deepEqual(view.combat.zones, []);
      const frozenTime = view.worldClock.time, fallen = view.combat;
      await advance(page, 1000);
      view = await state(page);
      assert.equal(view.worldClock.time, frozenTime);
      assert.deepEqual(view.combat, fallen, 'K.O. stops the world until the player chooses recovery');
      const neutralPositions = new Map(view.combat.actors.filter(actor => actor.team === 'neutral').map(actor => [actor.id, [actor.x, actor.y]]));
      await page.locator('[data-recover]').click(); await advance(page, 0);
      view = await state(page);
      assert.equal(view.combat.result, 'playing');
      assert.equal(view.combat.player.hp, view.combat.player.maxHp);
      assert.equal(view.combat.graceSeconds, 1);
      assert.deepEqual(view.player, persisted.player);
      assert.deepEqual(view.collected, persisted.collected);
      assert.ok(view.combat.actors.find(actor => actor.team === 'hostile').x === 2, 'Bulbasaur returns to its authored position');
      for (const actor of view.combat.actors.filter(actor => actor.team === 'neutral'))
        assert.deepEqual([actor.x, actor.y], neutralPositions.get(actor.id), 'Neutral visitor positions survive revival');
      assert.deepEqual(view.combat.casts, []); assert.deepEqual(view.combat.projectiles, []);
      await page.reload();
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && JSON.parse(window.render_game_to_text()).pokemon.status === 'ready', undefined, { polling: 50 });
      await advance(page, 2000);
      view = await state(page);
      assert.equal(view.combat.result, 'playing');
      assert.equal(view.combat.graceSeconds, 1, 'Reload creates a safe transient encounter');
      assert.deepEqual(view.combat.casts, [], 'No attack resumes from the old page');
      assert.deepEqual(view.collected, [0]);
      await page.screenshot({ path: `${output}/field-after-revival-reload.png` });
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
  await check('an enemy cast freezes on pause and suspension; blur leaves exploration active', async () => {
    const { page, context } = await scene();
    try {
      let view = await state(page);
      const enemy = view.combat.actors.find(actor => actor.team === 'hostile');
      for (let i = 0; i < 40 && !view.combat.casts.some(cast => cast.casterId === enemy.id && cast.phase === 'locked'); i++) {
        await waitWorld(page, 100); view = await state(page);
      }
      assert.ok(view.combat.casts.some(cast => cast.casterId === enemy.id && cast.phase === 'locked'));
      const active = view.combat;
      const clock = view.worldClock.time;
      await key(page, 'Escape');
      assert.equal((await state(page)).mode, 'menu');
      await advance(page, 1000);
      assert.deepEqual((await state(page)).combat, active, 'Menu pause freezes the announced cast');
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await advance(page, 1000);
      assert.deepEqual((await state(page)).combat, active, 'Suspension keeps the pending cast frozen');
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal((await state(page)).mode, 'menu', 'Visibility return requires explicit resume');
      await page.locator('[data-menu="resume"]').click(); await advance(page, 0);
      assert.deepEqual((await state(page)).combat, active, 'Idle after explicit resume remains frozen');
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.equal((await state(page)).mode, 'play', 'Blur clears input without opening a pause menu');
      assert.deepEqual((await state(page)).combat, active);
      await waitWorld(page, 100);
      assert.ok((await state(page)).worldClock.time > clock, 'A player action advances the resumed encounter');
    } finally { await context.close(); }
  });
  await check('offline reload discards pending combat and keeps the field ready', async () => {
    const { page, context } = await scene();
    try {
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) {
        await page.reload();
        await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && JSON.parse(window.render_game_to_text()).pokemon.status === 'ready', undefined, { polling: 50 });
      }
      let view = await state(page);
      const enemy = view.combat.actors.find(actor => actor.team === 'hostile');
      for (let i = 0; i < 40 && !view.combat.casts.some(cast => cast.casterId === enemy.id); i++) {
        await waitWorld(page, 100); view = await state(page);
      }
      assert.ok(view.combat.casts.some(cast => cast.casterId === enemy.id), 'The online session has a pending hostile move');
      await context.setOffline(true);
      await page.reload();
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && JSON.parse(window.render_game_to_text()).pokemon.status === 'ready', undefined, { polling: 50 });
      view = await state(page);
      assert.match(await page.locator('.build').textContent(), /^BUILD 0\.4\.\d+$/);
      assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'The offline page remains under the installed worker');
      assert.equal(view.offline, 'Prêt');
      assert.equal(view.combat.graceSeconds, 1);
      assert.deepEqual(view.combat.casts, []);
      assert.deepEqual(view.combat.projectiles, []);
      assert.deepEqual(view.combat.statuses, []);
      assert.equal(view.combatPresentation.assetsReady, true);
      assert.equal(view.combat.player.hp, view.combat.player.maxHp);
      await page.screenshot({ path: `${output}/field-offline-reload.png` });
    } finally { await context.close(); }
  });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ baseURL, results, errors }, null, 2));
  console.log(`${results.length} field combat browser checks passed.`);
} finally { await browser.close(); }
