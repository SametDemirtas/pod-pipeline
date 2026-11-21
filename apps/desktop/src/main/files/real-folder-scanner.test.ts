import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceScanner } from '@pod/core';
import { RealFolderScanner } from './real-folder-scanner.js';

describe('RealFolderScanner', () => {
  let dir: string;
  const inner = {
    scan: vi.fn<SourceScanner['scan']>(() => Promise.resolve({ files: [], skipped: [] })),
  };

  beforeEach(async () => {
    dir = await realpath(mkdtempSync(join(tmpdir(), 'pod-real-')));
    mkdirSync(join(dir, 'designs'));
    mkdirSync(join(dir, 'private'));
    inner.scan.mockClear();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('scans a folder given by its real path', async () => {
    await new RealFolderScanner(inner).scan(join(dir, 'designs'), 1);

    expect(inner.scan).toHaveBeenCalledWith(join(dir, 'designs'), 1);
  });

  it.skipIf(process.platform === 'win32')(
    'refuses a folder swapped for a link after it was approved',
    async () => {
      rmSync(join(dir, 'designs'), { recursive: true });
      symlinkSync(join(dir, 'private'), join(dir, 'designs'));

      await expect(new RealFolderScanner(inner).scan(join(dir, 'designs'), 1)).rejects.toThrow(
        /no longer the folder that was approved/,
      );
      expect(inner.scan).not.toHaveBeenCalled();
    },
  );

  it.skipIf(process.platform === 'win32')('refuses a path that goes through a link', async () => {
    symlinkSync(join(dir, 'designs'), join(dir, 'alias'));

    await expect(new RealFolderScanner(inner).scan(join(dir, 'alias'), 1)).rejects.toThrow();
    expect(inner.scan).not.toHaveBeenCalled();
  });
});
