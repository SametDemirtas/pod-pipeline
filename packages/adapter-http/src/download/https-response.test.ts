import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { describe, expect, it, vi } from 'vitest';
import { DownloadFailedError, fetchHttps, limitSize } from './https-response.js';

const OPTIONS = { maxBytes: 4, timeoutMs: 1000 };

function answering(response: () => Promise<Response>) {
  return vi.fn<typeof fetch>(response);
}

describe('fetchHttps', () => {
  it('hands over the body of an HTTPS answer, following no redirect', async () => {
    const fetchFn = answering(() =>
      Promise.resolve(new Response('abc', { headers: { 'content-type': 'text/plain' } })),
    );

    const { headers, body } = await fetchHttps(fetchFn, 'https://cdn.test/a.png', OPTIONS);

    expect(headers.get('content-type')).toBe('text/plain');
    expect(await new Response(body).text()).toBe('abc');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://cdn.test/a.png',
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
  });

  it.each([
    'http://cdn.test/a.png',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'pod-asset://design/a.png',
    'not a url',
  ])('refuses %s without fetching', async (url) => {
    const fetchFn = answering(() => Promise.reject(new Error('not called')));

    await expect(fetchHttps(fetchFn, url, OPTIONS)).rejects.toBeInstanceOf(DownloadFailedError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails on an error status and releases the body', async () => {
    const body = new ReadableStream<Uint8Array>();
    const cancel = vi.spyOn(body, 'cancel');
    const fetchFn = answering(() => Promise.resolve(new Response(body, { status: 503 })));

    await expect(fetchHttps(fetchFn, 'https://cdn.test/a.png', OPTIONS)).rejects.toThrow(
      /^Download from cdn\.test failed with 503$/,
    );
    expect(cancel).toHaveBeenCalled();
  });

  it('fails on an answer without a body', async () => {
    const fetchFn = answering(() => Promise.resolve(new Response(null)));

    await expect(fetchHttps(fetchFn, 'https://cdn.test/a.png', OPTIONS)).rejects.toThrow(
      'failed with 200',
    );
  });

  it('refuses a body announced as too large before reading it', async () => {
    const body = new ReadableStream<Uint8Array>();
    const cancel = vi.spyOn(body, 'cancel');
    const fetchFn = answering(() =>
      Promise.resolve(new Response(body, { headers: { 'content-length': '5' } })),
    );

    await expect(fetchHttps(fetchFn, 'https://cdn.test/a.png', OPTIONS)).rejects.toThrow(
      'is larger than 4 bytes',
    );
    expect(cancel).toHaveBeenCalled();
  });

  it('passes network failures on as they are, so callers can tell offline from refused', async () => {
    const redirect = new TypeError('fetch failed', { cause: new Error('unexpected redirect') });
    const timeout = Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });

    await expect(
      fetchHttps(
        answering(() => Promise.reject(redirect)),
        'https://cdn.test/a',
        OPTIONS,
      ),
    ).rejects.toBe(redirect);
    await expect(
      fetchHttps(
        answering(() => Promise.reject(timeout)),
        'https://cdn.test/a',
        OPTIONS,
      ),
    ).rejects.toBe(timeout);
  });
});

describe('limitSize', () => {
  it('passes up to the limit on and fails beyond it', async () => {
    const chunks: Buffer[] = [];
    const collect = async (source: AsyncIterable<Buffer>) => {
      for await (const chunk of source) chunks.push(chunk);
    };

    await pipeline(
      Readable.from([Buffer.from('ab'), Buffer.from('cd')]),
      limitSize('https://x.test', 4),
      collect,
    );
    expect(Buffer.concat(chunks).toString()).toBe('abcd');
    await expect(
      pipeline(
        Readable.from([Buffer.from('abc'), Buffer.from('de')]),
        limitSize('https://x.test', 4),
        collect,
      ),
    ).rejects.toThrow('Download from x.test is larger than 4 bytes');
  });
});
