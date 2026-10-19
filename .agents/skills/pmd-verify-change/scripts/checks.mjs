import { spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export const suites = ['browser', 'pokemon', 'realtime', 'combat', 'lab', 'effects', 'editor', 'pwa-update', 'hud'];
export const suiteFile = name => `tests/${name === 'browser' ? 'browser' : `${name}-browser`}.mjs`;
const areas = {
  combat: ['realtime', 'combat', 'lab', 'effects'],
  input: ['browser', 'realtime', 'combat', 'hud'],
  ui: ['browser', 'combat', 'hud'],
  assets: ['pokemon', 'combat', 'effects', 'hud'],
  content: ['pokemon', 'realtime', 'combat', 'lab', 'effects', 'editor', 'hud'],
  platform: suites,
  tooling: [],
  docs: [],
};

export function changedFiles(root = repoRoot) {
  const git = args => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Git inspection failed');
    return result.stdout.split('\0').filter(Boolean);
  };
  return [...new Set([...git(['diff', '--name-only', '-z', 'HEAD']), ...git(['ls-files', '--others', '--exclude-standard', '-z'])])];
}

/** Selection is advisory during iteration; release always builds and exercises every suite. */
export function planChecks(files, area = 'auto', release = false) {
  if (release) return ['build', 'browser:all'];
  if (area !== 'auto') {
    if (!Object.hasOwn(areas, area)) throw new Error(`Unknown area: ${area}`);
    return area === 'docs' ? [] : ['check', ...(areas[area].length === suites.length ? ['browser:all'] : areas[area].map(name => `browser:${name}`))];
  }
  const selected = new Set(); let code = false;
  for (const raw of files) {
    const file = raw.replaceAll('\\', '/').replace(/^\.\//, '');
    if (/^(docs\/|\.agents\/)|\.(md|txt)$/.test(file)) continue;
    code = true;
    const add = names => names.forEach(name => selected.add(`browser:${name}`));
    const test = suites.find(name => file === suiteFile(name));
    if (test) add([test]);
    else if (/^tests\/.*\.test\.ts$/.test(file)) continue;
    else if (/^(src\/platform\/(offline|lifecycle)|scripts\/(build-offline|offline-assets|templates)|\.github\/|vite\.config|package)/.test(file)) add(suites);
    else if (/^(src\/app\/|src\/content\/|src\/platform\/)/.test(file)) add(suites);
    else if (/^(src\/domain\/combat\/|src\/domain\/(action-clock|speed))/.test(file)) add(areas.combat);
    else if (/^src\/domain\/(movement|roaming|state)/.test(file)) add(['browser', 'realtime', 'combat']);
    else if (/^src\/domain\//.test(file)) add(suites);
    else if (/^src\/ui\/.*editor|^src\/ui\/styles\/(editor|lab)/.test(file)) add(['lab', 'editor']);
    else if (/^(src\/ui\/|index\.html)/.test(file)) add(areas.ui);
    else if (/^src\/rendering\//.test(file)) add(['pokemon', 'combat', 'lab', 'effects', 'hud']);
    else if (/^(content\/attack-visuals|content\/effect-assets|public\/effects)/.test(file)) add(['lab', 'effects', 'editor']);
    else if (/^(content\/|lab\.html)/.test(file)) add(areas.content);
    else if (/^(imports\/|public\/pokemon|public\/credits|scripts\/import-pokemon)/.test(file)) add(areas.assets);
    else if (/^public\/ui\//.test(file)) add(['hud']);
    else if (/^scripts\//.test(file)) add(suites);
    else add(suites); // Unknown runtime/config paths must not silently lose coverage.
  }
  const browserChecks = selected.size === suites.length ? ['browser:all'] : suites.map(name => `browser:${name}`).filter(name => selected.has(name));
  return code ? ['check', ...browserChecks] : [];
}

export function options(args, browserOnly = false) {
  const result = { run: false, release: false, area: 'auto', files: null, url: 'http://localhost:5173/', suites: ['all'] };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--run') result.run = true;
    else if (flag === '--release' && !browserOnly) result.release = true;
    else if (['--url', '--area', '--files', '--suites'].includes(flag)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      if (flag === '--url') result.url = value;
      else if (flag === '--area' && !browserOnly) result.area = value;
      else if (flag === '--files' && !browserOnly) result.files = value.split(',').filter(Boolean);
      else if (flag === '--suites' && browserOnly) result.suites = value.split(',');
      else throw new Error(`Unsupported option: ${flag}`);
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (result.area !== 'auto' && !Object.hasOwn(areas, result.area)) throw new Error(`Unknown area: ${result.area}`);
  if (result.suites.some(name => name !== 'all' && !suites.includes(name))) throw new Error('Unknown browser suite');
  const url = new URL(result.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('Use an HTTP(S) preview URL without credentials, query or fragment');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  result.url = url.href;
  return result;
}

export async function requireProduction(url, fetcher = fetch) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Preview returned HTTP ${response.status}`);
  const html = await response.text();
  if (/@vite\/client|<script[^>]+src=["'][^"']*\.(?:ts|tsx)(?:[?"'])/i.test(html))
    throw new Error('Development server detected; build and use npm run preview');
  if (!/<script\b/i.test(html)) throw new Error('Preview does not contain the game entry script');
}

export function commandFor(step) {
  if (step === 'check' || step === 'build' || step === 'browser:all')
    return { file: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', step === 'browser:all' ? 'test:browser' : step], shell: process.platform === 'win32' };
  const name = step.startsWith('browser:') ? step.slice(8) : '';
  if (!suites.includes(name)) throw new Error(`Unknown check: ${step}`);
  return { file: process.execPath, args: [suiteFile(name)], shell: false };
}

export async function runChecks(plan, { root = repoRoot, url, invoke = spawnSync, fetcher = fetch } = {}) {
  plan.forEach(commandFor); // Validate the complete plan before any command can run.
  const directory = path.join(root, 'output', 'ai', `${Date.now()}-${randomUUID().slice(0, 8)}`);
  mkdirSync(directory, { recursive: true });
  const report = { status: plan.length ? 'passed' : 'not-run', url, plan, results: [], report: path.join(directory, 'report.json') };
  let previewChecked = false;
  for (const [index, step] of plan.entries()) {
    if (step.startsWith('browser:') && !previewChecked) {
      try { await requireProduction(url, fetcher); previewChecked = true; }
      catch (error) { report.status = 'failed'; report.results.push({ step, status: 'failed', preflight: true, error: error.message }); break; }
    }
    const log = path.join(directory, `${index + 1}-${step.replace(':', '-')}.log`), fd = openSync(log, 'w');
    const command = commandFor(step), started = Date.now(); let result;
    try {
      // Only fixed commands from commandFor reach the Windows npm shell; user input is never a command.
      result = invoke(command.file, command.args, { cwd: root, env: { ...process.env, TEST_URL: url },
        shell: command.shell, windowsHide: true, timeout: step === 'browser:all' ? 600000 : 180000, stdio: ['ignore', fd, fd] });
    } finally { closeSync(fd); }
    const passed = result.status === 0 && !result.error;
    report.results.push({ step, status: passed ? 'passed' : 'failed', ms: Date.now() - started, log,
      ...(passed ? {} : { error: result.error?.message ?? result.signal ?? `Exit ${result.status}`,
        tail: readFileSync(log, 'utf8').trim().split(/\r?\n/).slice(-10) }) });
    if (!passed) { report.status = 'failed'; break; }
  }
  writeFileSync(report.report, JSON.stringify(report, null, 2) + '\n');
  return report;
}
