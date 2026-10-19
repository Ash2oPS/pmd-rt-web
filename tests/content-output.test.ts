import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { outputContent } from '../scripts/content-output.mts';

test('generated checks accept LF and CRLF without rewriting and reject real differences', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pmd-content-'));
  const url = pathToFileURL(join(directory, 'schema.json'));
  try {
    const expected = '{\n  "version": 1\n}\n';
    for (const original of [expected, expected.replaceAll('\n', '\r\n')]) {
      await writeFile(url, original);
      await outputContent(url, expected, true);
      assert.equal(await readFile(url, 'utf8'), original);
      await assert.rejects(outputContent(url, expected.replace('1', '2'), true), /Generated file is stale/);
      assert.equal(await readFile(url, 'utf8'), original);
    }
    await rm(url);
    await assert.rejects(outputContent(url, expected, true), /Generated file is stale/);
    await outputContent(url, expected, false);
    assert.equal(await readFile(url, 'utf8'), expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
