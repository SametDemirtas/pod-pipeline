import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { productFamilyId } from '@pod/core';
import { ConnectionSecrets } from '../../application/connections/connection-secrets.js';
import { MemorySecrets } from '../../testing/memory-secrets.js';
import { json } from '../../testing/fake-services/http.js';
import { fixedClock as clock, prefixFetch } from '../../testing/route-fetch.js';
import { createPrintProviders } from './printful-adapters.js';

const s3 = {
  endpoint: 'https://acc.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'pod',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
};

describe('print providers', () => {
  let dir: string;
  let file: MemorySecrets;
  let secrets: ConnectionSecrets;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pod-providers-'));
    writeFileSync(join(dir, 'design.png'), 'png');
    file = new MemorySecrets();
    secrets = new ConnectionSecrets(file);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const design = () => ({
    absolutePath: join(dir, 'design.png'),
    mimeType: 'image/png' as const,
    name: '01-mug-r1.png',
  });

  it('shares through Dropbox when it is connected', async () => {
    await secrets.fileHosts.dropbox.save({ appKey: 'key', refreshToken: 'r' });
    const { fetch, calls } = prefixFetch({
      'POST https://api.dropboxapi.com/oauth2/token': () =>
        json({
          access_token: 'a',
          expires_in: 14400,
        }),
      'POST https://content.dropboxapi.com/2/files/upload': () => json({}),
      'POST https://api.dropboxapi.com/2/files/get_temporary_link': () =>
        json({
          link: 'https://dl.test/x',
        }),
      'POST https://api.dropboxapi.com/2/files/delete_v2': () => json({}),
    });
    const providers = createPrintProviders({
      secrets,
      dataDirectory: dir,
      fetch,
      clock,
      ids: { next: () => 'id-1' },
      onReleaseFailed: vi.fn(),
    });

    const shared = await providers.fileHost.share(design());
    await shared.release();

    expect(shared.url).toBe('https://dl.test/x');
    expect(calls.map((call) => call.url.split('/').pop())).toEqual([
      'token',
      'upload',
      'get_temporary_link',
      'delete_v2',
    ]);
  });

  it('shares through S3 otherwise and reports a failed clean-up', async () => {
    await secrets.fileHosts.s3.save(s3);
    const onReleaseFailed = vi.fn();
    const { fetch } = prefixFetch({
      'PUT https://acc.r2.cloudflarestorage.com/pod/': () => new Response('', { status: 200 }),
      'DELETE https://acc.r2.cloudflarestorage.com/pod/': () =>
        new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 }),
    });
    const providers = createPrintProviders({
      secrets,
      dataDirectory: dir,
      fetch,
      clock,
      ids: { next: () => 'id-1' },
      onReleaseFailed,
    });

    const shared = await providers.fileHost.share(design());

    expect(shared.url).toContain('X-Amz-Signature=');
    await expect(shared.release()).rejects.toMatchObject({ code: 'PROVIDER_FAILED' });
    expect(onReleaseFailed).toHaveBeenCalledTimes(1);
  });

  it('asks to connect a file host when none is stored', async () => {
    const { fetch } = prefixFetch({});
    const providers = createPrintProviders({
      secrets,
      dataDirectory: dir,
      fetch,
      clock,
      ids: { next: () => 'id-1' },
      onReleaseFailed: vi.fn(),
    });

    await expect(providers.fileHost.share(design())).rejects.toMatchObject({
      code: 'FILE_HOST_NOT_CONNECTED',
    });
    await expect(providers.printCatalog.findProduct(productFamilyId('mug'))).rejects.toMatchObject({
      code: 'PRINTFUL_NOT_CONNECTED',
    });
  });

  it('downloads into the data folder', async () => {
    const { fetch } = prefixFetch({ 'GET https://files.test/': () => new Response('photo') });
    const providers = createPrintProviders({
      secrets,
      dataDirectory: dir,
      fetch,
      clock,
      ids: { next: () => 'id-1' },
      onReleaseFailed: vi.fn(),
    });

    const downloaded = await providers.downloader.download('https://files.test/m.png');

    expect(downloaded.absolutePath.startsWith(join(dir, 'downloads'))).toBe(true);
    await downloaded.dispose();
  });
});
