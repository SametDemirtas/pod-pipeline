import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentAddressedStore } from './content-addressed-store.js';
import { syncFolder } from './sync-folder.js';
import { sha256, useTempFolder } from './testing/temp-folder.js';
import { png } from './testing/test-images.js';

vi.mock('./sync-folder.js', () => ({ syncFolder: vi.fn(() => Promise.resolve()) }));

const folder = useTempFolder('pod-fs-sync-');

describe('ContentAddressedStore flushing', () => {
  let root: string;

  beforeEach(() => {
    vi.mocked(syncFolder).mockClear();
    root = resolve(folder.path, 'store');
  });

  it('flushes the root too when a file starts a new shard folder', async () => {
    const contents = png(8, 8);
    const shard = join(root, sha256(contents).slice(0, 2));

    await new ContentAddressedStore(root).put(folder.write('a.png', contents), 'image/png');

    expect(vi.mocked(syncFolder).mock.calls).toEqual([[shard], [root]]);
  });

  it('flushes only the shard folder when it already exists', async () => {
    const contents = png(9, 9);
    const shard = join(root, sha256(contents).slice(0, 2));
    mkdirSync(shard, { recursive: true });

    await new ContentAddressedStore(root).put(folder.write('b.png', contents), 'image/png');

    expect(vi.mocked(syncFolder).mock.calls).toEqual([[shard]]);
  });
});
