import { describe, expect, it } from 'vitest';
import { FakeFetch, type FakeReply } from '@pod/adapter-http/testing';
import { PrintfulApiError } from './errors.js';
import { PrintfulClient } from './printful-client.js';
import { PrintfulPrintSync } from './printful-print-sync.js';
import { ok } from './testing/fake-fetch.js';

function syncWith(...replies: FakeReply[]) {
  const fake = new FakeFetch().reply(...replies);
  const client = new PrintfulClient({
    fetch: fake.fetch,
    token: () => Promise.resolve('t'),
    sleep: () => Promise.resolve(),
  });
  let time = 0;
  const sync = new PrintfulPrintSync(client, {
    sleep: (ms) => {
      time += ms;
      return Promise.resolve();
    },
    now: () => time,
    timeoutMs: 10_000,
  });
  return { fake, sync };
}

const notFound: FakeReply = { status: 404, body: { code: 404, result: 'Not found' } };

describe('PrintfulPrintSync', () => {
  it('finds the variants Printful imported for an Etsy listing', async () => {
    const { fake, sync } = syncWith(
      ok({
        sync_product: { id: 400000001, external_id: '1234567890' },
        sync_variants: [{ id: 500000001, external_id: '800000001', variant_id: 1320 }],
      }),
    );

    expect(await sync.syncedVariants('1234567890')).toEqual([
      { id: '500000001', productId: '800000001' },
    ]);
    expect(fake.requests[0]?.url).toBe('https://api.printful.com/sync/products/@1234567890');
  });

  it('says when the listing was not imported yet', async () => {
    const { sync } = syncWith(notFound, { status: 500, body: { code: 500, result: 'down' } });

    expect(await sync.syncedVariants('1')).toBeUndefined();
    await expect(sync.syncedVariants('1')).rejects.toMatchObject({ status: 500 });
  });

  it('reads the distinct pictures of the files linked to the variants', async () => {
    const file = (type: string, name: string, thumbnail = true) => ({
      type,
      preview_url: `https://files.cdn.printful.com/${name}.png`,
      thumbnail_url: thumbnail ? `https://files.cdn.printful.com/${name}-t.png` : null,
    });
    const { fake, sync } = syncWith(
      ok({
        sync_product: { id: 400000001, external_id: '1234567890' },
        sync_variants: [
          {
            id: 500000001,
            external_id: '800000001',
            files: [file('default', 'art'), file('preview', 'mock', false)],
          },
          {
            id: 500000002,
            external_id: '800000002',
            files: [file('default', 'art'), { type: 'default', preview_url: null }],
          },
          { id: 500000003, external_id: '800000003' },
        ],
      }),
      notFound,
    );

    expect(await sync.previews('1234567890')).toEqual([
      {
        kind: 'default',
        url: 'https://files.cdn.printful.com/art.png',
        thumbnailUrl: 'https://files.cdn.printful.com/art-t.png',
      },
      {
        kind: 'preview',
        url: 'https://files.cdn.printful.com/mock.png',
        thumbnailUrl: 'https://files.cdn.printful.com/mock.png',
      },
    ]);
    expect(fake.requests[0]?.url).toBe('https://api.printful.com/sync/products/@1234567890');
    expect(await sync.previews('1')).toBeUndefined();
  });

  it('waits until Printful stored the print file', async () => {
    const { fake, sync } = syncWith(
      ok({ id: 600000001, status: 'waiting' }),
      ok({ id: 600000001, status: 'waiting' }),
      ok({ id: 600000001, status: 'ok' }),
    );

    expect(await sync.uploadPrintFile('https://host.test/01-mug-r1.png', '01-mug-r1.png')).toBe(
      '600000001',
    );
    expect(fake.requests.map((request) => [request.method, request.url, request.body])).toEqual([
      [
        'POST',
        'https://api.printful.com/files',
        { url: 'https://host.test/01-mug-r1.png', filename: '01-mug-r1.png' },
      ],
      ['GET', 'https://api.printful.com/files/600000001', undefined],
      ['GET', 'https://api.printful.com/files/600000001', undefined],
    ]);
  });

  it('reports a file Printful could not fetch, or not in time', async () => {
    const failed = syncWith(ok({ id: 1, status: 'failed', message: 'Invalid URL' }));
    const slow = syncWith(...Array.from({ length: 10 }, () => ok({ id: 2, status: 'waiting' })));

    await expect(failed.sync.uploadPrintFile('u', 'n')).rejects.toThrow(
      'Printful could not fetch the print file: Invalid URL',
    );
    await expect(slow.sync.uploadPrintFile('u', 'n')).rejects.toThrow(/in time/);
  });

  it('waits out a server error while Printful fetches the file, and passes others on', async () => {
    const busy = syncWith(
      ok({ id: 3, status: 'waiting' }),
      { status: 502, body: { code: 502, result: 'down' } },
      ok({ id: 3, status: 'ok' }),
    );
    const refused = syncWith(ok({ id: 4, status: 'waiting' }), {
      status: 404,
      body: { code: 404, result: 'Not found' },
    });

    expect(await busy.sync.uploadPrintFile('u', 'n')).toBe('3');
    await expect(refused.sync.uploadPrintFile('u', 'n')).rejects.toMatchObject({ status: 404 });
  });

  it('links a synced variant to the catalog variant and the placed print file', async () => {
    const { fake, sync } = syncWith(ok({}));

    await sync.linkVariant('500000001', {
      variantId: '1320',
      fileId: '600000001',
      area: { placement: 'default', width: 2700, height: 1050, dpi: 300 },
      placement: { left: 127, top: 0, width: 2447, height: 1050 },
    });

    expect(fake.requests[0]).toMatchObject({
      method: 'PUT',
      url: 'https://api.printful.com/sync/variant/500000001',
      body: {
        variant_id: 1320,
        files: [
          {
            type: 'default',
            id: 600000001,
            position: {
              area_width: 2700,
              area_height: 1050,
              width: 2447,
              height: 1050,
              top: 0,
              left: 127,
              limit_to_print_area: true,
            },
          },
        ],
      },
    });
  });

  it('names a print file Printful no longer has, and passes other refusals on', async () => {
    const link = {
      variantId: '1320',
      fileId: '600000001',
      area: { placement: 'default', width: 2700, height: 1050, dpi: 300 },
      placement: { left: 127, top: 0, width: 2447, height: 1050 },
    };
    const { sync } = syncWith(
      { status: 400, body: { code: 400, result: 'File with ID 600000001 not found' } },
      { status: 400, body: { code: 400, result: 'File is too small for this print area' } },
      { status: 400, body: { code: 400, result: 'Variant is discontinued' } },
    );

    const missing = await sync.linkVariant('500000001', link).catch((error: unknown) => error);
    expect(missing).toMatchObject({
      code: 'NOT_FOUND',
      details: { entity: 'Print file', id: '600000001' },
      cause: expect.any(PrintfulApiError) as unknown,
    });
    await expect(sync.linkVariant('500000001', link)).rejects.toThrow(
      new PrintfulApiError(400, 'File is too small for this print area'),
    );
    await expect(sync.linkVariant('500000001', link)).rejects.toBeInstanceOf(PrintfulApiError);
  });
});
