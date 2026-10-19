import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TEST_URL || 'http://localhost:5173/';
const output = 'output/lab';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [], results = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => { window.requestAnimationFrame = () => 0; });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const view = () => page.evaluate(() => JSON.parse(window.render_attack_lab_to_text()));
const advance = ms => page.evaluate(ms => window.advance_attack_lab(ms), ms);
async function ready(id) {
  await page.waitForFunction(id => typeof window.render_attack_lab_to_text === 'function' &&
    JSON.parse(window.render_attack_lab_to_text()).move === id && document.querySelector('#lab-status').textContent.startsWith('Prêt'), id, { polling: 50 });
}
try {
  await page.goto(new URL('lab.html', baseURL).href);
  await ready('pound');
  for (const id of ['pound', 'sing', 'vine-whip', 'water-gun', 'thunder'])
    assert.equal(await page.locator(`[data-move="${id}"]`).count(), 1, `${id} remains available as the catalog grows`);
  for (const id of ['lab-rain', 'lab-orbit', 'lab-ring', 'lab-arc', 'lab-waves', 'lab-cone', 'lab-line']) {
    await page.locator(`[data-move="${id}"]`).click(); await ready(id);
    await page.locator('#lab-play').click();
    const pending = (await view()).encounter.zones;
    assert.ok(pending.length, `${id} creates real domain zones`);
    assert.equal((await view()).encounter.lastFailure, null);
    await advance(1000);
    assert.ok((await view()).encounter.time > .9);
    if (id === 'lab-orbit') {
      const first = (await view()).encounter.zones[0].geometry.origin;
      await advance(200);
      const second = (await view()).encounter.zones[0].geometry.origin;
      assert.ok(Math.hypot(second.x - first.x, second.y - first.y) > .1);
    }
    await page.screenshot({ path: `${output}/${id}.png` });
    results.push(id);
  }
  await page.locator('[data-move="lab-rain"]').click(); await ready('lab-rain');
  await page.locator('#lab-play').click();
  const original = (await view()).encounter.zones;
  await page.locator('#lab-play').click();
  assert.deepEqual((await view()).encounter.zones, original, 'Seeded preview reset is reproducible');
  await page.locator('#lab-seek').evaluate(element => { element.value = '1.5'; element.dispatchEvent(new Event('input')); });
  assert.ok((await view()).encounter.time > 1.4);
  await page.locator('#lab-seek').evaluate(element => { element.value = '0'; element.dispatchEvent(new Event('input')); });
  assert.ok((await view()).encounter.time < .01);
  assert.deepEqual((await view()).encounter.zones, original, 'Backward scrub replays without stale zones');
  await context.setOffline(true); await page.reload(); await ready('pound');
  await page.locator('[data-move="lab-orbit"]').click(); await ready('lab-orbit');
  await page.locator('#lab-play').click(); await advance(1000);
  assert.ok((await view()).encounter.zones.length);
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log('PASS 7 advanced patterns, deterministic reset/scrub and first-visit offline lab');
} finally { await context.close(); await browser.close(); }
