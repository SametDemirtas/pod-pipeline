import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSmallFile } from './read-small-file.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-small-file-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readSmallFile', () => {
  it('reads a file up to the limit', async () => {
    const file = join(dir, 'list.csv');
    writeFileSync(file, 'abc');

    expect(Buffer.from((await readSmallFile(file, 3)) ?? [])).toEqual(Buffer.from('abc'));
  });

  it('is null for a larger file', async () => {
    const file = join(dir, 'huge.csv');
    writeFileSync(file, 'abcd');

    expect(await readSmallFile(file, 3)).toBeNull();
  });

  it('fails for a missing file', async () => {
    await expect(readSmallFile(join(dir, 'missing.csv'), 3)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
