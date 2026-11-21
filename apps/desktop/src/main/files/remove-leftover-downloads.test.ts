import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { removeLeftoverDownloads } from './remove-leftover-downloads.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-leftovers-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('removeLeftoverDownloads', () => {
  it('removes unfinished downloads and nothing else', async () => {
    writeFileSync(join(dir, 'a.download'), 'x');
    writeFileSync(join(dir, 'b.download'), 'y');
    writeFileSync(join(dir, 'c.download.png'), 'w');
    writeFileSync(join(dir, 'keep.png'), 'z');

    await removeLeftoverDownloads(dir);

    expect(readdirSync(dir)).toEqual(['keep.png']);
  });

  it('accepts a folder that does not exist yet', async () => {
    await expect(removeLeftoverDownloads(join(dir, 'missing'))).resolves.toBeUndefined();
  });

  it('reports other read errors', async () => {
    const file = join(dir, 'file');
    writeFileSync(file, 'x');
    mkdirSync(join(dir, 'sub'));

    await expect(removeLeftoverDownloads(file)).rejects.toThrow();
  });
});
