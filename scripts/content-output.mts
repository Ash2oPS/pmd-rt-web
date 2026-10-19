import { readFile, writeFile } from 'node:fs/promises';

/** Check generated text across Git checkouts without hiding actual content changes. */
export async function outputContent(url: URL, value: string, check: boolean): Promise<void> {
  if (!check) {
    await writeFile(url, value, 'utf8');
    return;
  }
  const existing = await readFile(url, 'utf8').catch(() => '');
  if (existing.replaceAll('\r\n', '\n') !== value.replaceAll('\r\n', '\n'))
    throw new Error(`Generated file is stale: ${url.pathname}. Run npm run content:generate.`);
}
