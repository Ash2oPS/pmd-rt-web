import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { commandFor, options, planChecks, repoRoot, requireProduction, runChecks } from './checks.mjs';

test('iteration selects relevant existing flows; unknown code broadens coverage', () => {
  assert.deepEqual(planChecks(['src/domain/combat/damage.ts']), ['check', 'browser:realtime', 'browser:combat', 'browser:lab', 'browser:effects']);
  assert.deepEqual(planChecks(['src/ui/styles/combat.css']), ['check', 'browser:browser', 'browser:combat', 'browser:hud']);
  assert.deepEqual(planChecks(['docs/ASSETS.md', '.agents/skills/example/SKILL.md']), []);
  assert.deepEqual(planChecks([]), []);
  for (const file of ['src/platform/offline.ts', '.github/workflows/pages.yml', 'new-runtime.js'])
    assert.deepEqual(planChecks([file]), ['check', 'browser:all']);
  assert.deepEqual(planChecks(['content/moves/pound.json', 'content/moves/sing.json']), planChecks(['content/moves/pound.json']));
});

test('release never becomes selective, even for docs or an empty checkout', () => {
  assert.deepEqual(planChecks([], 'docs', true), ['build', 'browser:all']);
  assert.deepEqual(commandFor('browser:all').args, ['run', 'test:browser'], 'Full coverage follows package.json as suites grow');
  assert.equal(JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).name, 'pmd-rt-web');
});

test('invalid CLI/commands are rejected; subpath preview URLs retain their directory', () => {
  assert.equal(options(['--url', 'https://example.test/pmd-rt-web']).url, 'https://example.test/pmd-rt-web/');
  assert.deepEqual(options(['--suites', 'combat,hud'], true).suites, ['combat', 'hud']);
  for (const args of [['--area', 'anything'], ['--url', 'file:///tmp/game'], ['--url', 'https://user:secret@example.test/'], ['--run', '--typo'], ['--files']])
    assert.throws(() => options(args));
  assert.throws(() => options(['--suites', 'arbitrary-code'], true));
  assert.throws(() => commandFor('npm:publish'));
});

test('browser preflight rejects development HTML and unsuccessful responses', async () => {
  const response = html => async () => ({ ok: true, text: async () => html });
  for (const html of ['<script src="/@vite/client"></script>', '<script type="module" src="./src/app/main.ts"></script>'])
    await assert.rejects(requireProduction('http://localhost/', response(html)), /Development server/);
  await requireProduction('http://localhost/', response('<script src="./assets/game-hash.js"></script>'));
  await assert.rejects(requireProduction('http://localhost/', async () => ({ ok: false, status: 404 })), /404/);
});

test('real child failure is logged compactly and prevents subsequent checks', async () => {
  mkdirSync(path.join(repoRoot, 'output'), { recursive: true });
  const root = mkdtempSync(path.join(repoRoot, 'output', 'skill-test-'));
  mkdirSync(path.join(root, 'tests'));
  writeFileSync(path.join(root, 'tests/hud-browser.mjs'), "console.log('detail\\n'.repeat(30)); process.exit(3);");
  writeFileSync(path.join(root, 'tests/combat-browser.mjs'), "import {writeFileSync} from 'node:fs';writeFileSync('should-not-run','bad');");
  const fetcher = async () => ({ ok: true, text: async () => '<script src="assets/game.js"></script>' });
  const failed = await runChecks(['browser:hud', 'browser:combat'], { root, url: 'http://localhost/', fetcher });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.results.length, 1);
  assert.equal(failed.results[0].tail.length, 10);
  assert.equal(existsSync(path.join(root, 'should-not-run')), false);
  assert.ok(readFileSync(failed.results[0].log, 'utf8').length > failed.results[0].tail.join('\n').length);
  assert.equal(JSON.parse(readFileSync(failed.report, 'utf8')).status, 'failed');
  writeFileSync(path.join(root, 'tests/hud-browser.mjs'), "console.log('PASS actual child');");
  const passed = await runChecks(['browser:hud'], { root, url: 'http://localhost/', fetcher });
  assert.equal(passed.status, 'passed'); assert.equal(passed.results[0].tail, undefined);
  const blocked = await runChecks(['browser:hud'], { root, url: 'http://localhost/', fetcher: async () => ({ ok: false, status: 503 }) });
  assert.equal(blocked.status, 'failed'); assert.equal(blocked.results[0].preflight, true);
  assert.equal((await runChecks([], { root })).status, 'not-run');
});
