import { describe, expect, it } from 'vitest';
import { LISTING_RULES } from '@pod/rules';
import {
  FileHostNotConnectedError as HostNotConnected,
  FileHostRequestError,
} from '@pod/adapter-file-hosts';
import { EtsyApiError } from '@pod/adapter-etsy';
import { PrintfulNotConnectedError as PrintfulMissing } from '@pod/adapter-printful';
import { AiCopywriter, AiServiceBusyError } from '@pod/adapter-ai';
import { DownloadFailedError } from '@pod/adapter-http';
import { ClaudeModels } from '@pod/adapter-anthropic';
import {
  ProviderFailedError,
  ProviderInterruptedError,
  ProviderUnavailableError,
} from '../application/errors/provider-errors.js';
import {
  toAppError,
  translateDownloader,
  translateFileHost,
  translatePort,
} from './provider-errors.js';

describe('toAppError', () => {
  it.each([
    [
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('x'), { code: 'ENOTFOUND' }),
      }),
      { code: 'PROVIDER_FAILED', details: { service: 'Dropbox', reason: 'network unavailable' } },
    ],
    [
      // The request may have arrived before the connection broke.
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }),
      }),
      { code: 'PROVIDER_INTERRUPTED', details: { service: 'Dropbox', reason: 'connection lost' } },
    ],
    [
      Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' }),
      { code: 'PROVIDER_INTERRUPTED', details: { service: 'Dropbox', reason: 'timed out' } },
    ],
    [
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
      { code: 'PROVIDER_INTERRUPTED', details: { reason: 'cancelled' } },
    ],
  ])('maps %s', (error, expected) => {
    expect(toAppError(error, 'Dropbox')).toMatchObject(expected);
  });

  it('marks a service that could not be reached at all as unavailable', () => {
    const offline = new TypeError('fetch failed', {
      cause: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }),
    });

    expect(toAppError(offline, 'Pinterest')).toBeInstanceOf(ProviderUnavailableError);
  });

  it('marks a Claude that could not be reached as unavailable, not as failed', async () => {
    const offline = new TypeError('fetch failed', {
      cause: Object.assign(new Error('x'), { code: 'ENOTFOUND' }),
    });
    const copywriter = new AiCopywriter(
      new ClaudeModels({
        apiKey: () => Promise.resolve('sk-test'),
        model: () => Promise.resolve('claude-opus-5-5'),
        fetch: () => Promise.reject(offline),
      }),
      LISTING_RULES,
    );
    const error: unknown = await copywriter
      .translate({ title: 'Tulip Mug', description: 'A mug.', tags: [] }, 'de')
      .catch((thrown: unknown) => thrown);

    expect(toAppError(error, 'Claude')).toBeInstanceOf(ProviderUnavailableError);
    expect(toAppError(error, 'Claude')).toMatchObject({ details: { service: 'Claude' } });
  });

  it('marks a request that broke off after sending as interrupted, not as a plain failure', () => {
    const dropped = new TypeError('fetch failed', {
      cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }),
    });

    expect(toAppError(dropped, 'Pinterest')).toBeInstanceOf(ProviderInterruptedError);
    expect(toAppError(dropped, 'Pinterest')).not.toBeInstanceOf(ProviderFailedError);
    expect(toAppError(dropped, 'Pinterest')).toMatchObject({
      code: 'PROVIDER_INTERRUPTED',
      details: { service: 'Pinterest', reason: 'connection lost' },
    });
  });

  it('marks a request that only reads and broke off as failed, as it changed nothing', () => {
    const dropped = new TypeError('fetch failed', {
      cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }),
    });

    expect(toAppError(dropped, 'Etsy', { readOnly: true })).toMatchObject({
      code: 'PROVIDER_FAILED',
      details: { service: 'Etsy', reason: 'connection lost' },
    });
  });

  it.each([new Error('disk full'), new TypeError('x is not a function'), 'text'])(
    'leaves %s alone',
    (error) => {
      expect(toAppError(error, 'Printful')).toBe(error);
    },
  );
});

const refused = () => Object.assign(new Error('x'), { code: 'ECONNREFUSED' });

describe('busy services', () => {
  it('tells the seller a busy service turned the request away for now', () => {
    expect(toAppError(new AiServiceBusyError('Claude'), 'Claude')).toMatchObject({
      code: 'PROVIDER_BUSY',
      details: { service: 'Claude' },
    });
  });
});

describe('translating wrappers', () => {
  it('translate every method of a port and leave other values alone', async () => {
    class Catalog {
      readonly name = 'catalog';
      constructor(private readonly error: Error) {}
      find(): Promise<string> {
        return Promise.reject(this.error);
      }
      count(): Promise<number> {
        return Promise.resolve(3);
      }
    }
    const port = translatePort(new Catalog(new PrintfulMissing()), 'Printful');

    expect(port.name).toBe('catalog');
    expect(await port.count()).toBe(3);
    await expect(port.find()).rejects.toMatchObject({ code: 'PRINTFUL_NOT_CONNECTED' });
    await expect(
      translatePort(new Catalog(new EtsyApiError(500, 'down')), 'Etsy').find(),
    ).rejects.toMatchObject({ code: 'PROVIDER_FAILED', details: { service: 'Etsy' } });
  });

  it('name the service chosen when the error happens', async () => {
    let chosen: 'Claude' | 'ChatGPT' = 'Claude';
    const offline = translatePort(
      { ask: () => Promise.reject(new TypeError('fetch failed', { cause: refused() })) },
      () => Promise.resolve(chosen),
    );

    await expect(offline.ask()).rejects.toMatchObject({ details: { service: 'Claude' } });
    chosen = 'ChatGPT';
    await expect(offline.ask()).rejects.toMatchObject({ details: { service: 'ChatGPT' } });
  });

  it('read a broken-off call of a reading method as failed and of others as interrupted', async () => {
    const dropped = () =>
      Promise.reject(
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }),
        }),
      );
    const port = translatePort({ boards: dropped, publish: dropped }, 'Pinterest', ['boards']);

    await expect(port.boards()).rejects.toMatchObject({ code: 'PROVIDER_FAILED' });
    await expect(port.publish()).rejects.toMatchObject({ code: 'PROVIDER_INTERRUPTED' });
  });

  it('keep the service error when the chosen service cannot be read', async () => {
    const original = new EtsyApiError(500, 'down');
    const port = translatePort({ ask: () => Promise.reject(original) }, () =>
      Promise.reject(new Error('settings unreadable')),
    );

    await expect(port.ask()).rejects.toBe(original);
  });

  it('translate sharing and releasing a file', async () => {
    const host = translateFileHost(
      {
        share: () =>
          Promise.resolve({
            url: 'https://host.test/a.png',
            release: () => Promise.reject(new FileHostRequestError('s3', 500, undefined)),
          }),
      },
      'Cloudflare R2 or S3',
    );
    const refusing = translateFileHost(
      { share: () => Promise.reject(new HostNotConnected('dropbox')) },
      'Dropbox',
    );
    const offline = translateFileHost(
      { share: () => Promise.reject(new TypeError('fetch failed')) },
      'Cloudflare R2 or S3',
    );
    const file = { absolutePath: '/a.png', mimeType: 'image/png' as const, name: 'a.png' };

    const shared = await host.share(file);

    expect(shared.url).toBe('https://host.test/a.png');
    await expect(shared.release()).rejects.toMatchObject({ code: 'PROVIDER_FAILED' });
    await expect(refusing.share(file)).rejects.toMatchObject({ code: 'FILE_HOST_NOT_CONNECTED' });
    await expect(offline.share(file)).rejects.toMatchObject({
      details: { service: 'Cloudflare R2 or S3', reason: 'connection lost' },
    });
  });

  it('blame Printful only for failed downloads, not for local file errors', async () => {
    const file = { absolutePath: '/tmp/x', dispose: () => Promise.resolve() };
    const working = translateDownloader({ download: () => Promise.resolve(file) });
    const failing = translateDownloader({
      download: () =>
        Promise.reject(new DownloadFailedError('https://cdn.test/a.png', 'failed with 404')),
    });
    const offline = translateDownloader({
      download: () => Promise.reject(new TypeError('fetch failed')),
    });
    const diskFull = Object.assign(new Error('no space left'), { code: 'ENOSPC' });
    const local = translateDownloader({ download: () => Promise.reject(diskFull) });

    expect(await working.download('https://x.test')).toBe(file);
    await expect(failing.download('https://x.test')).rejects.toMatchObject({
      code: 'PROVIDER_FAILED',
      details: { service: 'Printful', reason: 'Download from cdn.test failed with 404' },
    });
    await expect(offline.download('https://x.test')).rejects.toMatchObject({
      details: { service: 'Printful', reason: 'connection lost' },
    });
    await expect(local.download('https://x.test')).rejects.toBe(diskFull);
  });
});
