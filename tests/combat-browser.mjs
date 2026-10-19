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
async function start(page) {
  await key(page, 'Escape');
  await page.locator('[data-menu="combat"]').click();
  await advance(page, 0);
  assert.equal((await state(page)).mode, 'play');
  assert.ok((await state(page)).combat);
}
async function check(name, run) { await run(); results.push(name); console.log(`PASS ${name}`); }
try {
  await check('training uses prepared real attacks, freezes in menus and can be won', async () => {
    const { page, context } = await scene();
    try {
      await start(page);
      let view = await state(page);
      assert.equal(view.combat.actors.filter(actor => actor.team === 'hostile').length, 1);
      const enemy = view.combat.actors.find(actor => actor.team === 'hostile');
      await key(page, 'j');
      view = await state(page);
      assert.equal(view.combat.casts[0].moveId, 'pound');
      assert.equal(view.combat.actors.find(actor => actor.id === enemy.id).hp, enemy.hp);
      const before = view.player;
      await key(page, 'ArrowLeft', 100);
      assert.deepEqual((await state(page)).player, before, 'Preparation immobilizes the player');
      await key(page, 'Escape');
      const frozen = (await state(page)).combat;
      await advance(page, 2000);
      assert.deepEqual((await state(page)).combat, frozen, 'Combat clock, actors and casts freeze');
      await page.locator('[data-menu="resume"]').click();
      await advance(page, 300);
      view = await state(page);
      assert.ok(view.combat.actors.find(actor => actor.id === enemy.id).hp < enemy.hp);
      await page.screenshot({ path: `${output}/first-hit.png` });
      await advance(page, 400);
      for (let i = 0; i < 3 && (await state(page)).combat.result === 'playing'; i++) {
        await key(page, 'j'); await advance(page, 800);
      }
      assert.equal((await state(page)).combat.result, 'won');
      await advance(page, 1000);
      assert.equal((await state(page)).combatPresentation.recentEvents, 0, 'Final impact cosmetics expire after victory');
      await page.screenshot({ path: `${output}/victory.png` });
      await page.keyboard.press('Enter');
      await advance(page, 0);
      assert.equal((await state(page)).combat.result, 'playing');
      await advance(page, 20000);
      assert.equal((await state(page)).combat.result, 'lost');
      await page.evaluate(() => {
        window.__combatPad = { id: 'Combat pad', index: 0, connected: true, axes: [0, 0],
          buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__combatPad] });
      });
      await advance(page, 0);
      await page.evaluate(() => { window.__combatPad.buttons[13] = { pressed: true, value: 1 }; });
      await advance(page, 17);
      await page.evaluate(() => { window.__combatPad.buttons[13] = { pressed: false, value: 0 }; });
      await advance(page, 0);
      await page.evaluate(() => { window.__combatPad.buttons[1] = { pressed: true, value: 1 }; });
      await advance(page, 17);
      assert.equal((await state(page)).combat, null);
    } finally { await context.close(); }
  });
  await check('enemy telegraphs lock before impact and first-visit combat stays available offline', async () => {
    const { page, context } = await scene({ width: 640, height: 360 });
    try {
      await start(page);
      await advance(page, 1200);
      let view = await state(page);
      assert.ok(view.combat.casts.some(cast => cast.casterId !== 'player'));
      await advance(page, 200);
      view = await state(page);
      const locked = view.combat.casts.find(cast => cast.phase === 'locked');
      assert.ok(locked, 'Enemy provides a locked warning interval');
      await page.screenshot({ path: `${output}/locked-telegraph-compact.png` });
      await context.setOffline(true);
      await page.reload();
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && JSON.parse(window.render_game_to_text()).pokemon.status === 'ready', undefined, { polling: 50 });
      assert.equal((await state(page)).combat, null, 'Reload never resumes a dangerous transient cast');
      await start(page);
      await page.locator('[data-slot="0"]').click();
      await advance(page, 17);
      assert.equal((await state(page)).pokemon.player.frame.animation, 'Attack');
      await page.screenshot({ path: `${output}/offline-attack.png` });
    } finally { await context.close(); }
  });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ baseURL, results, errors }, null, 2));
  console.log(`${results.length} combat browser checks passed.`);
} finally { await browser.close(); }
