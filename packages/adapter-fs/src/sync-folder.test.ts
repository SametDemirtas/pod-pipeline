import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncFolder } from './sync-folder.js';
import { useTempFolder } from './testing/temp-folder.js';

const folder = useTempFolder('pod-sync-');

describe('syncFolder', () => {
  it('flushes an existing folder', async () => {
    await expect(syncFolder(folder.path)).resolves.toBeUndefined();
  });

  it('resolves for a folder that cannot be opened', async () => {
    await expect(syncFolder(join(folder.path, 'missing'))).resolves.toBeUndefined();
  });
});
