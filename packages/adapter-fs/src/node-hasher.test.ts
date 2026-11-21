import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeHasher } from './node-hasher.js';
import { sha256, useTempFolder } from './testing/temp-folder.js';
import { png } from './testing/test-images.js';

const folder = useTempFolder('pod-fs-');

describe('NodeHasher', () => {
  const hasher = new NodeHasher();

  it('hashes file contents and text with SHA-256', async () => {
    const contents = png(64, 32);
    const file = folder.write('a.png', contents);

    expect(await hasher.hashFile(file)).toBe(sha256(contents));
    expect(await hasher.hashText('Kış ☃')).toBe(sha256(Buffer.from('Kış ☃', 'utf8')));
  });

  it('fails for a missing file', async () => {
    await expect(hasher.hashFile(join(folder.path, 'missing.png'))).rejects.toThrow(/ENOENT/);
  });
});
