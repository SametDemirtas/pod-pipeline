import { mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ImportPlanChangedError } from '@pod/core';
import { ContentAddressedStore } from './content-addressed-store.js';
import { isWindows, sha256, useTempFolder } from './testing/temp-folder.js';
import { jpeg, png } from './testing/test-images.js';

const folder = useTempFolder('pod-fs-');

describe('ContentAddressedStore', () => {
  let store: ContentAddressedStore;
  let storeRoot: string;
  const incoming = () => readdirSync(join(storeRoot, '.incoming'));

  beforeEach(() => {
    storeRoot = join(folder.path, 'store');
    store = new ContentAddressedStore(storeRoot);
  });

  it('stores a file under the hash of what it copied', async () => {
    const contents = png(8, 8);
    const hash = sha256(contents);

    const stored = await store.put(folder.write('in/a.png', contents), 'image/png');

    expect(stored).toEqual({
      storageKey: `${hash.slice(0, 2)}/${hash}.png`,
      sha256: hash,
      byteSize: contents.length,
    });
    expect(readFileSync(store.pathOf(stored.storageKey))).toEqual(contents);
    expect(incoming()).toEqual([]);
  });

  it('stores identical content once', async () => {
    const contents = jpeg(10, 10);
    const hash = sha256(contents);

    const first = await store.put(folder.write('a.jpg', contents), 'image/jpeg');
    const second = await store.put(folder.write('b.jpg', contents), 'image/jpeg');

    expect(second).toEqual(first);
    expect(first.storageKey.endsWith('.jpg')).toBe(true);
    expect(readdirSync(join(storeRoot, hash.slice(0, 2)))).toEqual([`${hash}.jpg`]);
    expect(incoming()).toEqual([]);
  });

  it('handles the same content stored concurrently', async () => {
    const contents = png(32, 32);
    const sources = ['a', 'b', 'c', 'd'].map((name) => folder.write(`${name}.png`, contents));

    const results = await Promise.all(sources.map((source) => store.put(source, 'image/png')));

    expect(new Set(results.map((result) => result.storageKey)).size).toBe(1);
    expect(readFileSync(store.pathOf(results[0]?.storageKey ?? ''))).toEqual(contents);
    expect(incoming()).toEqual([]);
  });

  it('fails cleanly when the source file is missing', async () => {
    await expect(store.put(join(folder.path, 'missing.png'), 'image/png')).rejects.toThrow(
      /ENOENT/,
    );
    expect(incoming()).toEqual([]);
  });

  it('fails without leaving a copy when the target path is taken by a folder', async () => {
    const contents = png(4, 4);
    const hash = sha256(contents);
    mkdirSync(join(storeRoot, hash.slice(0, 2), `${hash}.png`), { recursive: true });

    await expect(store.put(folder.write('a.png', contents), 'image/png')).rejects.toMatchObject({
      code: expect.stringMatching(/^(EISDIR|ENOTEMPTY|EEXIST|EPERM)$/) as string,
    });
    expect(incoming()).toEqual([]);
  });

  it('lists and removes stored files, ignoring anything else in the folder', async () => {
    expect(await store.listKeys()).toEqual([]);
    const a = await store.put(folder.write('a.png', png(4, 4)), 'image/png');
    const b = await store.put(folder.write('b.jpg', jpeg(6, 6)), 'image/jpeg');
    writeFileSync(join(storeRoot, 'notes.txt'), 'x');
    mkdirSync(join(storeRoot, 'zz'), { recursive: true });
    writeFileSync(join(storeRoot, 'zz', 'other.png'), 'x');
    mkdirSync(join(storeRoot, '.incoming'), { recursive: true });

    expect([...(await store.listKeys())].sort()).toEqual([a.storageKey, b.storageKey].sort());

    await store.remove(a.storageKey);
    await store.remove(a.storageKey);

    expect(await store.listKeys()).toEqual([b.storageKey]);
    await expect(store.remove('../outside.png')).rejects.toThrow('Invalid storage key');
  });

  it('reports a temporary folder that is not a folder', async () => {
    mkdirSync(storeRoot, { recursive: true });
    writeFileSync(join(storeRoot, '.incoming'), 'x');

    await expect(store.removeTemporaryFiles()).rejects.toThrow(/ENOTDIR/);
  });

  it.skipIf(isWindows)('refuses a source that became a symbolic link', async () => {
    const outside = folder.write('outside/secret.png', png(4, 4));
    const linked = join(folder.path, 'linked.png');
    symlinkSync(outside, linked);

    await expect(store.put(linked, 'image/png')).rejects.toBeInstanceOf(ImportPlanChangedError);
    expect(incoming()).toEqual([]);
  });

  it('leaves a leftover copy it cannot delete yet for the next start', async () => {
    mkdirSync(join(storeRoot, '.incoming', 'held'), { recursive: true });
    writeFileSync(join(storeRoot, '.incoming', 'held', 'file'), 'x');
    writeFileSync(join(storeRoot, '.incoming', 'stale.tmp'), 'x');

    await store.removeTemporaryFiles();

    expect(incoming()).toEqual(['held']);
  });

  it('removes copies left by an interrupted import', async () => {
    await store.removeTemporaryFiles();
    mkdirSync(join(storeRoot, '.incoming'), { recursive: true });
    writeFileSync(join(storeRoot, '.incoming', 'stale.tmp'), 'x');

    await store.removeTemporaryFiles();

    expect(incoming()).toEqual([]);
  });

  it.each([
    '../outside.png',
    '/etc/passwd',
    '..\\outside.png',
    'C:\\x.png',
    'D:x.png',
    '\\\\server\\share\\x.png',
    `ab/${'a'.repeat(64)}.png:stream`,
    `ab/${'A'.repeat(64)}.png`,
    `ab/${'a'.repeat(64)}.gif`,
    'ab/abc.png',
  ])('refuses the storage key %j', (key) => {
    expect(() => store.pathOf(key)).toThrow(/Invalid storage key/);
  });

  it('resolves valid storage keys inside the store', () => {
    const key = `ab/${'a'.repeat(64)}.jpg`;

    expect(store.pathOf(key)).toBe(join(storeRoot, 'ab', `${'a'.repeat(64)}.jpg`));
  });
});
