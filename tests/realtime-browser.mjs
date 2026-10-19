import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TEST_URL || 'http://localhost:5173/';
const output = 'output/realtime';
const field = JSON.parse(await readFile(new URL('../content/dungeons/awakening-woods.json', import.meta.url), 'utf8'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], results = [];
const state = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate((ms) => window.advanceTime(ms), ms);
const axes = (page, x, y) => page.evaluate(([x, y]) => { window.__testPad.axes = [x, y, 0, 0]; }, [x, y]);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
async function check(name, run) { await run(); results.push(name); console.log(`PASS ${name}`); }
async function scene() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => {
    // Stop only the automatic frame driver; advanceTime exercises the real input/update/render pipeline.
    window.requestAnimationFrame = () => 0;
    localStorage.setItem('pmd-field-save-v1', JSON.stringify({ version: 1, player: { x: 3, y: 5 }, steps: 0, collected: [], facing: 'down' }));
    window.__testPad = { id: 'Test standard gamepad', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    const nativePad = Object.create({
      get id() { return window.__testPad.id; }, get index() { return window.__testPad.index; },
      get connected() { return window.__testPad.connected; }, get mapping() { return window.__testPad.mapping; },
      get timestamp() { return window.__testPad.timestamp; },
      get axes() { return window.__testPad.axes; }, get buttons() { return window.__testPad.buttons; },
    });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [nativePad] });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(baseURL);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && JSON.parse(window.render_game_to_text()).pokemon?.status === 'ready', undefined, { polling: 50, timeout: 20000 });
  await advance(page, 0);
  return { page, context };
}
async function travel(x, y, ms = 400) {
  const { page, context } = await scene();
  const before = (await state(page)).player;
  await axes(page, x, y); await advance(page, ms);
  const after = await state(page);
  await context.close();
  return { before, after, length: distance(before, after.player) };
}
try {
  await check('analog movement is continuous, proportional and supports arbitrary directions', async () => {
    const full = await travel(1, 0), half = await travel(0.6, 0), angled = await travel(0.8, 0.4);
    assert.ok(full.length > 0.5, 'Full stick moves a meaningful distance');
    assert.ok(half.length > 0 && half.length < full.length * 0.8, 'Partial stick is slower than full stick');
    assert.ok(!Number.isInteger(half.after.player.x), 'Movement is not snapped to tile coordinates');
    const dx = angled.after.player.x - angled.before.x, dy = angled.after.player.y - angled.before.y;
    assert.ok(Math.abs(dy / dx - 0.5) < 0.02, 'Actual travel follows arbitrary stick angle');
    assert.equal(angled.after.pokemon.player.animation, 'Walk');
    assert.equal(angled.after.pokemon.player.frame.direction, 1, 'Down-right art follows diagonal travel');
  });
  await check('partial axes remain proportional with duplicate keyboard and Dpad signals', async () => {
    const { page, context } = await scene();
    await axes(page, .55, .2);
    await page.evaluate(() => { window.__testPad.buttons[15] = { pressed: true, value: 1 }; });
    await page.keyboard.down('ArrowRight');
    const before = (await state(page)).player;
    await advance(page, 400);
    const view = await state(page);
    assert.equal(view.movement.source, 'analog');
    assert.ok(view.movement.resolvedSpeed > 0 && view.movement.resolvedSpeed < view.movement.maxSpeed * .6);
    assert.ok(Math.abs((view.player.y - before.y) / (view.player.x - before.x) - .2 / .55) < .01);
    const actorsWithStick = view.pokemon.actors.map(actor => ({ id: actor.id, speed: actor.resolvedSpeed }));
    await page.keyboard.up('ArrowRight');
    await axes(page, 0, 0);
    await page.evaluate(() => { window.__testPad.buttons[15] = { pressed: false, value: 0 }; });
    await advance(page, 400);
    assert.deepEqual((await state(page)).pokemon.actors.map(actor => ({ id: actor.id, speed: actor.resolvedSpeed })), actorsWithStick);
    await page.screenshot({ path: `${output}/proportional-input.png` });
    await context.close();
  });
  await check('diagonal speed equals straight speed and deadzone prevents drift', async () => {
    const straight = await travel(1, 0), diagonal = await travel(1, 1), drift = await travel(0.06, 0.06, 1000);
    assert.ok(Math.abs(straight.length - diagonal.length) < 0.01, 'Diagonal travel is normalized');
    assert.equal(drift.length, 0, 'Small stick noise causes no movement');
    assert.equal(drift.after.pokemon.player.animation, 'Idle');
  });
  await check('stick release stops immediately and wall contact allows sliding', async () => {
    const { page, context } = await scene();
    await axes(page, 1, 0); await advance(page, 130);
    await axes(page, 0, 0); await advance(page, 17);
    const stopped = await state(page);
    await advance(page, 700);
    assert.deepEqual((await state(page)).player, stopped.player, 'No residual movement after release');
    assert.equal((await state(page)).pokemon.player.animation, 'Idle');
    await axes(page, -1, 0); await advance(page, 4000);
    const wall = await state(page);
    assert.ok(wall.player.x > 0.5 && wall.player.x < 1.1, 'Solid border stops the collision body');
    await axes(page, -1, -0.5); await advance(page, 400);
    const sliding = await state(page);
    assert.ok(sliding.player.y < wall.player.y - 0.1, 'Player slides along the wall');
    assert.ok(Math.abs(sliding.player.x - wall.player.x) < 0.02, 'Wall remains solid while sliding');
    await axes(page, 0, 0); await advance(page, 17);
    await page.screenshot({ path: `${output}/wall-slide.png` });
    await context.close();
  });
  await check('blur suppresses a held analog stick until release and deadzone settings persist', async () => {
    const { page, context } = await scene();
    await axes(page, 0.8, 0); await advance(page, 150);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blurred = await state(page);
    assert.equal(blurred.mode, 'play');
    await advance(page, 500);
    assert.deepEqual((await state(page)).player, blurred.player, 'Held analog input cannot drift after focus loss');
    await axes(page, 0, 0); await advance(page, 17);
    await axes(page, 1, 0); await advance(page, 100);
    assert.ok((await state(page)).player.x > blurred.player.x, 'Releasing and pressing restores control');
    await axes(page, 0, 0); await advance(page, 17);
    await page.keyboard.down('Escape'); await advance(page, 17); await page.keyboard.up('Escape');
    await page.locator('[data-menu="controls"]').click();
    const setting = page.locator('#stick-deadzone'), original = await setting.textContent();
    await setting.click();
    const changed = await setting.textContent();
    assert.notEqual(changed, original, 'Deadzone button changes the setting');
    await page.reload();
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { polling: 50 });
    assert.equal(await page.locator('#stick-deadzone').textContent(), changed, 'Deadzone setting survives reload');
    await context.close();
  });
  await check('Pokemon alternate Idle and Roaming coherently and freeze in pause', async () => {
    const { page, context } = await scene();
    await page.keyboard.down('Space');
    const first = await state(page), seen = new Map(first.pokemon.actors.map((actor) => [actor.id, new Set([actor.behavior])]));
    const moved = new Set(), previous = new Map(first.pokemon.actors.map((actor) => [actor.id, actor]));
    for (let i = 0; i < 60; i++) {
      await advance(page, 250);
      const view = await state(page);
      for (const actor of view.pokemon.actors) {
        seen.get(actor.id).add(actor.behavior);
        const initial = first.pokemon.actors.find((entry) => entry.id === actor.id);
        const definition = field.actors.find((entry) => entry.id === actor.id);
        if (distance(initial, actor) > 0.05) moved.add(actor.id);
        assert.ok(distance(definition, actor) <= definition.roaming.radius + 0.02, `${actor.id} stays near its home`);
        assert.ok(distance(previous.get(actor.id), actor) <= actor.resolvedSpeed * 0.25 + 0.01, `${actor.id} respects its authored speed`);
        previous.set(actor.id, actor);
        assert.equal(view.map[Math.round(actor.y)]?.[Math.round(actor.x)], '.', `${actor.id} remains on traversable terrain`);
        assert.ok(Number.isFinite(actor.velocity.x) && Number.isFinite(actor.velocity.y));
        assert.equal(actor.animation, Math.hypot(actor.velocity.x, actor.velocity.y) > 0.00001 ? 'Walk' : 'Idle', 'Animation follows actual movement, including state-transition boundaries');
      }
    }
    assert.equal(moved.size, 9, 'All nine Pokemon roam');
    assert.ok([...seen.values()].every((behaviors) => behaviors.has('Idle') && behaviors.has('Roaming')), 'Every Pokemon enters both states');
    await page.keyboard.down('Escape'); await advance(page, 17); await page.keyboard.up('Escape');
    const paused = await state(page);
    assert.equal(paused.mode, 'menu');
    await advance(page, 2500);
    const frozen = await state(page);
    assert.deepEqual(frozen.pokemon.actors, paused.pokemon.actors, 'NPC state and animation frame freeze in pause');
    assert.deepEqual(frozen.player, paused.player);
    await page.keyboard.up('Space');
    await page.locator('[data-menu="resume"]').click();
    await page.keyboard.down('Space'); await advance(page, 1000); await page.keyboard.up('Space');
    assert.equal((await state(page)).mode, 'play');
    assert.notDeepEqual((await state(page)).pokemon.actors, paused.pokemon.actors, 'World resumes after pause');
    await page.screenshot({ path: `${output}/roaming-field.png` });
    await context.close();
  });
  assert.deepEqual(errors, [], 'No console or runtime errors');
  await writeFile(`${output}/results.json`, JSON.stringify({ baseURL, results, errors }, null, 2));
  console.log(`${results.length} realtime browser checks passed.`);
} finally { await browser.close(); }
