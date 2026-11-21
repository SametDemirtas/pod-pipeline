import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IPC_CHANNELS,
  LOCAL_API_CONNECTION_FILE,
  LOCAL_API_VERSION,
  type LocalApiConnection,
} from '@pod/contracts';
import { LISTING_LIMITS } from '@pod/rules';
import { catalogOperations } from '../api/operations.js';
import { fakeCatalog } from '../testing/fake-catalog.js';
import { openLocalAccess } from './local-access.js';
import { MAX_BODY_BYTES, startLocalApi, type LocalApi } from './local-api-server.js';

interface Reply {
  readonly status: number;
  readonly body: unknown;
}

/** Raw HTTP so tests control every header, including Host and Origin. */
function send(
  url: string,
  options: { path: string; method?: string; headers?: Record<string, string>; body?: string },
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      `${url}${options.path}`,
      { method: options.method ?? 'POST', headers: options.headers ?? {} },
      (response) => {
        let text = '';
        response.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, body: text ? JSON.parse(text) : null });
        });
      },
    );
    request.on('error', reject);
    request.end(options.body);
  });
}

describe('local API server', () => {
  const token = 'secret-token';
  let api: LocalApi;
  let catalog: ReturnType<typeof fakeCatalog>;
  const log = vi.fn();

  beforeEach(async () => {
    log.mockClear();
    catalog = fakeCatalog();
    api = await startLocalApi({ operations: catalogOperations(catalog), token, log });
  });

  afterEach(async () => {
    await api.close();
  });

  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  it('listens on the loopback interface only', () => {
    expect(api.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('runs an operation and answers with its result', async () => {
    const reply = await send(api.url, {
      path: '/api/listDesigns',
      headers: auth,
      body: JSON.stringify({ limit: 2 }),
    });

    expect(reply).toEqual({
      status: 200,
      body: { ok: true, value: { items: [], nextCursor: null, total: 0 } },
    });
    expect(catalog.listDesigns).toHaveBeenCalledWith({ limit: 2 });
  });

  it('reports operation errors inside the result', async () => {
    const reply = await send(api.url, {
      path: '/api/getDesign',
      headers: auth,
      body: JSON.stringify({ id: 'x' }),
    });

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('accepts operations without a body', async () => {
    expect(await send(api.url, { path: '/api/listFamilies', headers: auth })).toEqual({
      status: 200,
      body: { ok: true, value: [] },
    });
  });

  it.each([
    ['no token', {}, 401],
    ['a wrong token', { authorization: 'Bearer nope' }, 401],
    ['a token of another length', { authorization: `Bearer ${token}x` }, 401],
    [
      'a wrong token of the same length',
      { authorization: `Bearer ${'x'.repeat(token.length)}` },
      401,
    ],
    ['the token without the Bearer scheme', { authorization: token }, 401],
    ['a browser origin', { ...auth, origin: 'https://evil.example' }, 403],
  ])('refuses a request with %s', async (_case, headers, status) => {
    const reply = await send(api.url, { path: '/api/listFamilies', headers });

    expect(reply.status).toBe(status);
    expect(catalog.listFamilies).not.toHaveBeenCalled();
  });

  it('logs a request that breaks off while its body is read', async () => {
    const port = new URL(api.url).port;
    await new Promise<void>((resolve) => {
      const request = httpRequest(`${api.url}/api/listDesigns`, {
        method: 'POST',
        headers: { ...auth, host: `127.0.0.1:${port}`, 'content-length': '1000' },
      });
      request.on('error', () => {
        resolve();
      });
      request.write('{"limit":');
      setTimeout(() => request.destroy(), 20);
    });

    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ code: 'ECONNRESET' }));
    });
  });

  it('checks the token before the method, so routes stay hidden', async () => {
    expect((await send(api.url, { path: '/api/listFamilies', method: 'GET' })).status).toBe(401);
    expect((await send(api.url, { path: '/api/unknown' })).status).toBe(401);
  });

  it('accepts a body of exactly the size limit', async () => {
    const prefix = '{"search":"';
    const padding = 'x'.repeat(MAX_BODY_BYTES - prefix.length - 2);
    const reply = await send(api.url, {
      path: '/api/listDesigns',
      headers: auth,
      body: `${prefix}${padding}"}`,
    });

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  });

  it('serves assistants exactly the operations they are meant to have', () => {
    expect(catalogOperations(catalog).map((operation) => operation.name)).toEqual([
      'listFamilies',
      'listDesigns',
      'getDesign',
      'previewImport',
      'runImport',
      'listImportFolders',
      'checkPrint',
      'createMockups',
      'listMockups',
      'getShopOptions',
      'getListing',
      'createListing',
      'linkListing',
      'refreshListing',
      'listingPhotos',
      'replaceListingPhotos',
      'researchKeywords',
      'listResearch',
      'getResearch',
      'listBoards',
      'listPins',
      'proposePin',
      'getBatchStatus',
    ]);
  });

  it('hides every window-only operation from assistants', async () => {
    const served: ReadonlySet<string> = new Set(
      catalogOperations(catalog).map((operation) => operation.name),
    );
    const windowOnly = Object.keys(IPC_CHANNELS).filter((name) => !served.has(name));

    const statuses = await Promise.all(
      windowOnly.map(async (name) => {
        const reply = await send(api.url, { path: `/api/${name}`, headers: auth, body: '{}' });
        return [name, reply.status];
      }),
    );

    expect(windowOnly).toContain('publishListing');
    expect(statuses).toEqual(windowOnly.map((name) => [name, 404]));
  });

  it('takes a listing with the longest description in every Etsy language', async () => {
    const words = { title: 'ゴースト', description: '語'.repeat(LISTING_LIMITS.description) };
    const listing = {
      designId: 'd1',
      fit: 'contain',
      language: 'ja',
      ...words,
      tags: ['tulip mug'],
      price: 2499,
      currency: 'JPY',
      variantIds: ['1320'],
      mockupIds: ['m1'],
      shippingProfileId: '316',
      readinessStateId: '151',
      productionPartnerIds: [],
      translations: Array.from({ length: 10 }, () => ({ language: 'ja', ...words, tags: [] })),
    };

    const reply = await send(api.url, {
      path: '/api/createListing',
      headers: auth,
      body: JSON.stringify(listing),
    });

    expect(reply.status).toBe(200);
    expect(catalog.createListing).toHaveBeenCalledOnce();
  });

  it('refuses a foreign Host header', async () => {
    const reply = await send(api.url, {
      path: '/api/listFamilies',
      headers: { ...auth, host: 'evil.example' },
    });

    expect(reply.status).toBe(403);
  });

  it('refuses other methods, unknown operations, bad JSON and large bodies', async () => {
    expect(
      (await send(api.url, { path: '/api/listFamilies', method: 'GET', headers: auth })).status,
    ).toBe(405);
    expect((await send(api.url, { path: '/api/pickFolder', headers: auth })).status).toBe(404);
    expect((await send(api.url, { path: '/api/../x', headers: auth })).status).toBe(404);
    expect(
      (await send(api.url, { path: '/api/listDesigns', headers: auth, body: '{' })).status,
    ).toBe(400);
    const large = JSON.stringify({ search: 'x'.repeat(MAX_BODY_BYTES) });
    expect(
      (await send(api.url, { path: '/api/listDesigns', headers: auth, body: large })).status,
    ).toBe(413);
  });
});

describe('openLocalAccess', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pod-access-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  it('publishes a working connection and withdraws it on close', async () => {
    const close = await openLocalAccess(dir, fakeCatalog(), vi.fn());
    const file = join(dir, LOCAL_API_CONNECTION_FILE);
    const connection = JSON.parse(readFileSync(file, 'utf8')) as LocalApiConnection;

    expect(connection.token).toMatch(/^[\w-]{43}$/);
    expect(connection.apiVersion).toBe(LOCAL_API_VERSION);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    const reply = await send(connection.url, {
      path: '/api/listFamilies',
      headers: { authorization: `Bearer ${connection.token}` },
    });
    expect(reply.status).toBe(200);

    await close();

    expect(existsSync(file)).toBe(false);
    await expect(
      send(connection.url, { path: '/api/listFamilies', headers: {} }),
    ).rejects.toThrow();
  });
});
