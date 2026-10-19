import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
const pkg = JSON.parse(await read('package.json')) as { version: string };
const lock = JSON.parse(await read('package-lock.json')) as {
  version: string; packages: Record<string, { version?: string }>;
};
const configured = (await read('src/app/config.ts')).match(/export const VERSION = ["']([^"']+)["']/)?.[1];
if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || lock.version !== pkg.version
  || lock.packages['']?.version !== pkg.version || configured !== pkg.version)
  throw new Error('Release version differs between package.json, package-lock.json and src/app/config.ts');
console.log(`Release version checked: ${pkg.version}`);
