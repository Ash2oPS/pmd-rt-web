import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TEST_URL || 'http://localhost:5173/';
const output = 'output/effects';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => { window.requestAnimationFrame = () => 0; });
const page = await context.newPage(), errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => requests.push(request.url()));
const state = () => page.evaluate(() => JSON.parse(window.render_attack_lab_to_text()));
async function select(id) {
  if (id !== 'pound') await page.locator(`[data-move="${id}"]`).click();
  await page.waitForFunction(id => typeof window.render_attack_lab_to_text === 'function' &&
    JSON.parse(window.render_attack_lab_to_text()).move === id && document.querySelector('#lab-status').textContent.startsWith('Prêt'), id, { polling: 50 });
}
try {
  await page.goto(new URL('lab.html', baseURL).href);
  await select('pound');
  for (const [id, ms] of [['pound', 420], ['sing', 1250], ['vine-whip', 1000], ['water-gun', 720], ['thunder', 1450]]) {
    await select(id); await page.locator('#lab-play').click();
    await page.evaluate(ms => window.advance_attack_lab(ms), ms);
    const view = await state();
    assert.equal(view.presentation.assetsReady, true);
    assert.ok(view.presentation.sprites + view.presentation.particles + view.presentation.trails > 0, `${id} draws real effects`);
    assert.ok(view.presentation.particles <= 256);
    assert.ok(view.presentation.sprites + view.presentation.trails <= 64);
    await page.screenshot({ path: `${output}/${id}.png` });
  }
  assert.ok(requests.some(url => url.endsWith('/effects/water-drop.svg')));
  assert.ok(requests.some(url => url.endsWith('/effects/electric-spark.svg')));
  await context.setOffline(true); await page.reload(); await select('pound');
  await select('water-gun'); await page.locator('#lab-play').click();
  await page.evaluate(() => window.advance_attack_lab(720));
  assert.ok((await state()).presentation.sprites > 0, 'Visited effects remain available offline');
  assert.deepEqual(errors, []);
  const blocked = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await blocked.route('**/effects/**', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Missing test asset' }));
    const game = await blocked.newPage();
    await game.goto(baseURL);
    await game.waitForFunction(() => typeof window.render_game_to_text === 'function' &&
      !!JSON.parse(window.render_game_to_text()).combatPresentation.error, undefined, { timeout: 25000 });
    const failed = await game.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(failed.combatPresentation.assetsReady, false, 'Missing visuals never report combat ready');
    await game.locator('#menu-toggle').click();
    await game.locator('[data-menu="combat"]').click();
    assert.equal(await game.evaluate(() => JSON.parse(window.render_game_to_text()).combat), null);
    assert.equal(await game.evaluate(() => JSON.parse(window.render_game_to_text()).mode), 'menu');
  } finally { await blocked.close(); }
  await writeFile(`${output}/results.json`, JSON.stringify({ passed: 5, errors }, null, 2));
  console.log('PASS five local effect presentations, budgets and offline reload');
} finally { await context.close(); await browser.close(); }
