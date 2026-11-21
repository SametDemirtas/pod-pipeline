import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, LOCAL_API_VERSION } from '@pod/contracts/client';
import { AppNotRunningError } from './connection.js';
import { httpCatalogApi } from './http-catalog-api.js';

interface Recorded {
  readonly path: string;
  readonly auth: string | undefined;
  readonly body: string;
}

/** A port nothing listens on: taken from a server that is then closed. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

describe('httpCatalogApi', () => {
  let server: Server;
  let url: string;
  const requests: Recorded[] = [];
  let reply: { status: number; body: string };

  beforeEach(async () => {
    requests.length = 0;
    reply = { status: 200, body: JSON.stringify({ ok: true, value: [] }) };
    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
      request.on('end', () => {
        requests.push({ path: request.url ?? '', auth: request.headers.authorization, body });
        response.writeHead(reply.status, { 'content-type': 'application/json' });
        response.end(reply.body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const api = () =>
    httpCatalogApi(() => Promise.resolve({ apiVersion: LOCAL_API_VERSION, url, token: 'tok' }));

  it('posts each operation with the token and returns its value', async () => {
    reply.body = JSON.stringify({ ok: true, value: { items: [], nextCursor: null, total: 0 } });

    expect(await api().listDesigns({ search: 'tulip' })).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
    });
    expect(requests).toEqual([
      { path: '/api/listDesigns', auth: 'Bearer tok', body: '{"search":"tulip"}' },
    ]);
  });

  it('sends no body for operations without input', async () => {
    await api().listFamilies();
    await api().listImportFolders();

    expect(requests.map((request) => [request.path, request.body])).toEqual([
      ['/api/listFamilies', ''],
      ['/api/listImportFolders', ''],
    ]);
  });

  it('posts every operation to its own path', async () => {
    const operations = Object.entries(api()) as [string, (request?: unknown) => Promise<unknown>][];

    for (const [, operation] of operations) await operation();

    expect(operations.map(([name]) => name).sort()).toEqual([
      'checkPrint',
      'createListing',
      'createMockups',
      'getBatchStatus',
      'getDesign',
      'getListing',
      'getResearch',
      'getShopOptions',
      'linkListing',
      'listBoards',
      'listDesigns',
      'listFamilies',
      'listImportFolders',
      'listMockups',
      'listPins',
      'listResearch',
      'listingPhotos',
      'previewImport',
      'proposePin',
      'refreshListing',
      'replaceListingPhotos',
      'researchKeywords',
      'runImport',
    ]);
    expect(requests.map((request) => request.path)).toEqual(
      operations.map(([name]) => `/api/${name}`),
    );
  });

  it('returns failed results as the ApiError the app reported', async () => {
    reply.body = JSON.stringify({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'gone', details: { id: 'x' } },
    });

    await expect(api().getDesign({ id: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      details: { id: 'x' },
    });
  });

  it.each([
    [401, /Restart POD Pipeline/],
    [404, /Update the app/],
    [413, /too large/],
    [500, /HTTP 500/],
  ])('explains HTTP %d', async (status, message) => {
    reply = { status, body: '{"error":"x"}' };

    const error = await api()
      .previewImport({ rootPath: '/d' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INTERNAL', details: { status } });
    expect((error as Error).message).toMatch(message);
  });

  it('reports an answer that is not JSON', async () => {
    reply.body = '<html>';

    await expect(api().listFamilies()).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'The app sent an answer that could not be read.',
    });
  });

  it('reports a closed app when nothing listens', async () => {
    const port = await freePort();
    const closed = httpCatalogApi(() =>
      Promise.resolve({
        apiVersion: LOCAL_API_VERSION,
        url: `http://127.0.0.1:${port}`,
        token: 'tok',
      }),
    );

    await expect(closed.runImport({ rootPath: '/d', fingerprint: 'f' })).rejects.toBeInstanceOf(
      AppNotRunningError,
    );
  });

  it('gives up on an app that does not answer in time', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const slow = httpCatalogApi(
      () => Promise.resolve({ apiVersion: LOCAL_API_VERSION, url, token: 'tok' }),
      () => Promise.reject(timeout),
    );

    await expect(slow.listFamilies()).rejects.toMatchObject({
      code: 'APP_OUTCOME_UNKNOWN',
      message: expect.stringMatching(/did not answer in time\. It may be busy/) as string,
    });
    await expect(slow.runImport({ rootPath: '/d', fingerprint: 'f' })).rejects.toMatchObject({
      message: expect.stringMatching(/may still be working on the import/) as string,
    });
    await expect(slow.createMockups({ designId: 'd', fit: 'contain' })).rejects.toMatchObject({
      message: expect.stringMatching(/may still be making the mockups/) as string,
    });
  });

  it('says the app may still be working when the connection breaks mid-request', async () => {
    const reset = new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    const broken = httpCatalogApi(
      () => Promise.resolve({ apiVersion: LOCAL_API_VERSION, url, token: 'tok' }),
      () => Promise.reject(reset),
    );

    const error = await broken
      .proposePin({
        designId: 'd',
        mockupId: 'm1',
        title: 'T',
        description: '',
        altText: '',
        headline: '',
        boardId: '11',
        publishAt: '2026-11-02T18:00:00+01:00',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'APP_OUTCOME_UNKNOWN' });
    expect((error as Error).message).toBe(
      'The connection to the app was lost. It may still be making the pin; check list_pins ' +
        'before trying again.',
    );
  });

  it('posts the print operations', async () => {
    await api().checkPrint({ designId: 'd', fit: 'cover' });
    await api().createMockups({ designId: 'd', variantId: '1320', fit: 'contain' });
    await api().listMockups({ id: 'd' });

    expect(requests.map((request) => [request.path, request.body])).toEqual([
      ['/api/checkPrint', '{"designId":"d","fit":"cover"}'],
      ['/api/createMockups', '{"designId":"d","variantId":"1320","fit":"contain"}'],
      ['/api/listMockups', '{"id":"d"}'],
    ]);
  });

  it('posts the listing operations', async () => {
    const listing = {
      designId: 'd',
      fit: 'contain' as const,
      language: 'en-US',
      title: 'T',
      description: 'D',
      tags: [],
      price: 1999,
      currency: 'USD',
      variantIds: ['1320'],
      mockupIds: ['m1'],
      shippingProfileId: '316',
      readinessStateId: '151',
      productionPartnerIds: [],
    };
    await api().getShopOptions();
    await api().getListing({ id: 'd' });
    await api().createListing(listing);
    await api().linkListing({ id: 'd' });
    await api().refreshListing({ id: 'd' });
    await api().researchKeywords({ query: 'tulip mug' });
    await api().listResearch();
    await api().getResearch({ id: 'r1' });
    await api().listBoards();
    await api().listPins({ id: 'd' });
    const pin = {
      designId: 'd',
      mockupId: 'm1',
      title: 'T',
      description: '',
      altText: '',
      headline: '',
      boardId: '11',
      publishAt: '2026-11-02T18:00:00+01:00',
    };
    await api().proposePin(pin);
    await api().getBatchStatus();

    expect(requests.map((request) => [request.path, request.body])).toEqual([
      ['/api/getShopOptions', ''],
      ['/api/getListing', '{"id":"d"}'],
      ['/api/createListing', JSON.stringify(listing)],
      ['/api/linkListing', '{"id":"d"}'],
      ['/api/refreshListing', '{"id":"d"}'],
      ['/api/researchKeywords', '{"query":"tulip mug"}'],
      ['/api/listResearch', ''],
      ['/api/getResearch', '{"id":"r1"}'],
      ['/api/listBoards', ''],
      ['/api/listPins', '{"id":"d"}'],
      ['/api/proposePin', JSON.stringify(pin)],
      ['/api/getBatchStatus', ''],
    ]);
  });
});
