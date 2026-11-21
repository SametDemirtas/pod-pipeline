import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assetUrl } from '@pod/contracts';
import { parseAssetRequest } from './asset-request.js';
import { ThumbnailCache, type ThumbnailRenderer } from './thumbnail-cache.js';

const key = `ab/${'a'.repeat(64)}.png`;

describe('parseAssetRequest', () => {
  it('reads URLs built by assetUrl', () => {
    expect(parseAssetRequest(assetUrl(key))).toEqual({ storageKey: key, width: null });
    expect(parseAssetRequest(assetUrl(key, 320))).toEqual({ storageKey: key, width: 320 });
  });

  it.each([
    'not a url',
    'https://asset/ab/x.png',
    'pod-asset://other/ab/x.png',
    'pod-asset://asset/',
    `pod-asset://asset/${key}?w=321`,
    `pod-asset://asset/${key}?w=`,
    `pod-asset://asset/${key}?w=99999`,
    'pod-asset://asset/%E0%A4%A',
  ])('refuses %j', (url) => {
    expect(parseAssetRequest(url)).toBeNull();
  });
});

describe('ThumbnailCache', () => {
  let dir: string;
  let render: ReturnType<typeof vi.fn<ThumbnailRenderer['render']>>;
  let cache: ThumbnailCache;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pod-thumbs-'));
    render = vi.fn<ThumbnailRenderer['render']>((_source, width) =>
      Promise.resolve(new TextEncoder().encode(`thumb-${width}`)),
    );
    cache = new ThumbnailCache(dir, { render });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('renders once per key and width and reuses the file', async () => {
    const first = await cache.get(key, '/store/x.png', 320);
    const second = await cache.get(key, '/store/x.png', 320);
    const larger = await cache.get(key, '/store/x.png', 640);

    expect(second).toBe(first);
    expect(larger).not.toBe(first);
    expect(readFileSync(first, 'utf8')).toBe('thumb-320');
    expect(render).toHaveBeenCalledTimes(2);
    expect(readdirSync(join(dir, '320'))).toEqual([`ab-${'a'.repeat(64)}.png`]);
  });

  it('shares one render between simultaneous requests', async () => {
    const results = await Promise.all([1, 2, 3].map(() => cache.get(key, '/x.png', 160)));

    expect(new Set(results).size).toBe(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('leaves nothing behind when rendering fails and retries next time', async () => {
    render.mockRejectedValueOnce(new Error('cannot decode'));

    await expect(cache.get(key, '/x.png', 160)).rejects.toThrow('cannot decode');
    expect(existsSync(join(dir, '160'))).toBe(false);
    expect(readFileSync(await cache.get(key, '/x.png', 160), 'utf8')).toBe('thumb-160');
  });

  it('removes the thumbnails of assets that are no longer stored', async () => {
    const gone = `cd/${'c'.repeat(64)}.png`;
    const kept = await cache.get(key, '/x.png', 160);
    await cache.get(gone, '/y.png', 160);
    await cache.get(gone, '/y.png', 640);

    await cache.removeAllBut([key]);

    expect(readdirSync(join(dir, '160'))).toEqual([basename(kept)]);
    expect(readdirSync(join(dir, '640'))).toEqual([]);
  });

  it('has nothing to remove before any thumbnail was made', async () => {
    await expect(cache.removeAllBut([key])).resolves.toBeUndefined();
  });
});
