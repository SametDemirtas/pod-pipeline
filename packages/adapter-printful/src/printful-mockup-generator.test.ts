import type { MockupRequest } from '@pod/core';
import { describe, expect, it, vi } from 'vitest';
import { FakeFetch, type FakeReply } from '@pod/adapter-http/testing';
import { PrintfulMockupError, PrintfulRequestError } from './errors.js';
import { PrintfulClient } from './printful-client.js';
import { PrintfulMockupGenerator } from './printful-mockup-generator.js';
import { ok } from './testing/fake-fetch.js';

const REQUEST: MockupRequest = {
  productId: '19',
  variantIds: ['1320', '4830'],
  area: { placement: 'default', width: 2700, height: 1050, dpi: 300 },
  placement: { left: 127, top: 0, width: 2447, height: 1050 },
  imageUrl: 'https://files.example/01-mug.png?sig=abc',
};

/** The printfiles answer of a product without styles of photo to choose. */
const noStyles = ok({ product_id: 19, option_groups: [] });

function generatorWith(...replies: FakeReply[]) {
  const fake = new FakeFetch().reply(noStyles, ...replies);
  const client = new PrintfulClient({ fetch: fake.fetch, token: () => Promise.resolve('t') });
  let time = 0;
  const sleep = vi.fn((milliseconds: number) => {
    time += milliseconds;
    return Promise.resolve();
  });
  const generator = new PrintfulMockupGenerator(client, {
    sleep,
    now: () => time,
    timeoutMs: 20_000,
  });
  return { fake, sleep, generator };
}

const pending = ok({ task_key: 'gt-1', status: 'pending' });
const done = ok({
  task_key: 'gt-1',
  status: 'completed',
  mockups: [{ placement: 'default', mockup_url: 'https://cdn/a.png', extra: null }],
});

describe('PrintfulMockupGenerator', () => {
  it('creates a task with the placed design and waits for the mockups', async () => {
    const { fake, sleep, generator } = generatorWith(
      ok({ task_key: 'gt-1', status: 'pending' }),
      pending,
      ok({
        task_key: 'gt-1',
        status: 'completed',
        mockups: [
          {
            placement: 'default',
            variant_ids: [1320, 4830],
            mockup_url: 'https://cdn.printful/front.png',
            extra: [
              { title: 'Left', option: 'Left', url: 'https://cdn.printful/left.png' },
              { title: 'Right', option: 'Right', url: 'https://cdn.printful/right.png' },
            ],
          },
        ],
      }),
    );

    const mockups = await generator.generate(REQUEST);

    expect(mockups).toEqual([
      { url: 'https://cdn.printful/front.png', view: 'default' },
      { url: 'https://cdn.printful/left.png', view: 'Left' },
      { url: 'https://cdn.printful/right.png', view: 'Right' },
    ]);
    expect(fake.requests[0]?.url).toBe('https://api.printful.com/mockup-generator/printfiles/19');
    expect(fake.requests[1]).toMatchObject({
      method: 'POST',
      url: 'https://api.printful.com/mockup-generator/create-task/19',
      body: {
        variant_ids: [1320, 4830],
        format: 'jpg',
        files: [
          {
            placement: 'default',
            image_url: REQUEST.imageUrl,
            position: {
              area_width: 2700,
              area_height: 1050,
              width: 2447,
              height: 1050,
              top: 0,
              left: 127,
            },
          },
        ],
      },
    });
    expect(fake.requests[1]?.body).not.toHaveProperty('option_groups');
    expect(fake.requests[2]?.url).toBe(
      'https://api.printful.com/mockup-generator/task?task_key=gt-1',
    );
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([2000, 3000]);
  });

  it('accepts mockups without extra views', async () => {
    const { generator } = generatorWith(
      pending,
      ok({
        status: 'completed',
        mockups: [{ placement: 'default', variant_ids: [1320], mockup_url: 'https://cdn/a.png' }],
      }),
    );

    expect(await generator.generate(REQUEST)).toEqual([
      { url: 'https://cdn/a.png', view: 'default' },
    ]);
  });

  it('fails when the finished task holds no mockups', async () => {
    const { generator } = generatorWith(pending, ok({ status: 'completed', mockups: [] }));

    await expect(generator.generate(REQUEST)).rejects.toThrow(
      new PrintfulMockupError('Printful made no mockups'),
    );
  });

  it('names the main view after the area printed on', async () => {
    const { generator } = generatorWith(
      pending,
      ok({
        status: 'completed',
        mockups: [
          { placement: 'label_outside', variant_ids: [1320], mockup_url: 'https://cdn/c.png' },
        ],
      }),
    );

    expect((await generator.generate(REQUEST))[0]?.view).toBe('label_outside');
  });

  it('skips a rate-limited poll and asks again on the next turn', async () => {
    const { fake, generator } = generatorWith(
      pending,
      { status: 429, body: { code: 429, result: 'Try again after 60 seconds' } },
      ok({
        status: 'completed',
        mockups: [{ placement: 'default', variant_ids: [1320], mockup_url: 'https://cdn/a.png' }],
      }),
    );

    expect(await generator.generate(REQUEST)).toHaveLength(1);
    expect(fake.requests).toHaveLength(4);
  });

  it('waits out a server error while polling, and passes other failures on', async () => {
    const busy = generatorWith(pending, { status: 502, body: { code: 502, result: 'down' } }, done);
    expect(await busy.generator.generate(REQUEST)).toEqual([
      { url: 'https://cdn/a.png', view: 'default' },
    ]);

    const { generator } = generatorWith(pending, {
      status: 400,
      body: { code: 400, result: 'Bad task' },
    });
    await expect(generator.generate(REQUEST)).rejects.toMatchObject({ status: 400 });
  });

  it('skips a poll that never reached Printful', async () => {
    const fake = new FakeFetch().reply(noStyles, pending, done);
    let calls = 0;
    const client = new PrintfulClient({
      fetch: (input, init) => {
        calls += 1;
        return calls === 3
          ? Promise.reject(new TypeError('fetch failed'))
          : fake.fetch(input, init);
      },
      token: () => Promise.resolve('t'),
    });
    const generator = new PrintfulMockupGenerator(client, { sleep: () => Promise.resolve() });

    expect(await generator.generate(REQUEST)).toHaveLength(1);
    expect(calls).toBe(4);
  });

  it('stops polling as soon as it is cancelled, also while waiting', async () => {
    const controller = new AbortController();
    const fake = new FakeFetch().reply(noStyles, pending, pending, done);
    const client = new PrintfulClient({
      fetch: fake.fetch,
      token: () => Promise.resolve('t'),
      signal: controller.signal,
    });
    const generator = new PrintfulMockupGenerator(client, {
      sleep: (_milliseconds, signal) => {
        controller.abort(new Error('cancelled by the seller'));
        return signal?.aborted ? Promise.reject(signal.reason as Error) : Promise.resolve();
      },
    });

    await expect(generator.generate(REQUEST)).rejects.toThrow('cancelled by the seller');
    expect(fake.requests).toHaveLength(2);
  });

  it('ends polling on a cancelled read rather than skipping a turn', async () => {
    const fake = new FakeFetch().reply(noStyles, pending, done);
    let calls = 0;
    const client = new PrintfulClient({
      fetch: (input, init) => {
        calls += 1;
        return calls === 3
          ? Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
          : fake.fetch(input, init);
      },
      token: () => Promise.resolve('t'),
    });
    const generator = new PrintfulMockupGenerator(client, { sleep: () => Promise.resolve() });

    await expect(generator.generate(REQUEST)).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBe(3);
  });

  it('asks for every style of photo the product offers, read once per product', async () => {
    const fake = new FakeFetch().reply(
      ok({
        product_id: 19,
        option_groups: ['Flat', 'Lifestyle', 'Couch', 'Premium Lifestyle', '', 7],
        options: ['Front', 'Lifestyle', 'Couch'],
      }),
      pending,
      done,
      pending,
      done,
    );
    const client = new PrintfulClient({ fetch: fake.fetch, token: () => Promise.resolve('t') });
    const generator = new PrintfulMockupGenerator(client, { sleep: () => Promise.resolve() });

    await generator.generate(REQUEST);
    await generator.generate(REQUEST);

    expect(fake.requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'GET https://api.printful.com/mockup-generator/printfiles/19',
      'POST https://api.printful.com/mockup-generator/create-task/19',
      'GET https://api.printful.com/mockup-generator/task?task_key=gt-1',
      'POST https://api.printful.com/mockup-generator/create-task/19',
      'GET https://api.printful.com/mockup-generator/task?task_key=gt-1',
    ]);
    for (const at of [1, 3]) {
      expect(fake.requests[at]?.body).toMatchObject({
        option_groups: ['Flat', 'Lifestyle', 'Couch'],
      });
    }
  });

  it('names extra views after their style when Printful titles them so', async () => {
    const { generator } = generatorWith(
      pending,
      ok({
        status: 'completed',
        mockups: [
          {
            placement: 'default',
            mockup_url: 'https://cdn/flat.jpg',
            extra: [
              {
                title: 'Lifestyle',
                option: 'Lifestyle',
                option_group: 'Lifestyle',
                url: 'https://cdn/lifestyle.jpg',
              },
            ],
          },
        ],
      }),
    );

    expect(await generator.generate(REQUEST)).toEqual([
      { url: 'https://cdn/flat.jpg', view: 'default' },
      { url: 'https://cdn/lifestyle.jpg', view: 'Lifestyle' },
    ]);
  });

  it('makes the mockups without styles when they cannot be read, and asks again next time', async () => {
    const fake = new FakeFetch().reply(
      { status: 400, body: { code: 400, result: 'Bad product' } },
      pending,
      done,
      noStyles,
      pending,
      done,
    );
    const client = new PrintfulClient({ fetch: fake.fetch, token: () => Promise.resolve('t') });
    const generator = new PrintfulMockupGenerator(client, { sleep: () => Promise.resolve() });

    expect(await generator.generate(REQUEST)).toHaveLength(1);
    expect(fake.requests[1]?.body).not.toHaveProperty('option_groups');
    expect(await generator.generate(REQUEST)).toHaveLength(1);
    expect(fake.requests[3]?.url).toBe('https://api.printful.com/mockup-generator/printfiles/19');
  });

  it('asks for PNGs only when the photos must stay lossless', async () => {
    const { fake, generator } = generatorWith(pending, done);

    await generator.generate({ ...REQUEST, lossless: true });

    expect(fake.requests[1]?.body).toMatchObject({ format: 'png' });
  });

  describe('turned print areas', () => {
    /** A throw blanket's printfiles answer in the vertical orientation. */
    const vertical = (canRotate: unknown) =>
      ok({
        product_id: 395,
        printfiles: [
          { printfile_id: 7, width: 7950, height: 9450, dpi: 150, can_rotate: canRotate },
          { printfile_id: 8, width: 100, height: 100, dpi: 150, can_rotate: true },
        ],
        variant_printfiles: [
          { variant_id: 11111, placements: { default: 7 } },
          { variant_id: 22222, placements: { default: 8 } },
        ],
        option_groups: ['Flat', 'Lifestyle', 'Lifestyle 2'],
      });
    const QUERY = {
      productId: '395',
      variantId: '11111',
      placement: 'default',
      orientation: 'vertical',
    } as const;

    function generatorReplying(...replies: FakeReply[]) {
      const fake = new FakeFetch().reply(...replies);
      const client = new PrintfulClient({ fetch: fake.fetch, token: () => Promise.resolve('t') });
      return {
        fake,
        generator: new PrintfulMockupGenerator(client, { sleep: () => Promise.resolve() }),
      };
    }

    it('allows an orientation when the variant print file may be turned', async () => {
      const { fake, generator } = generatorReplying(vertical(true));

      expect(await generator.supportsOrientation(QUERY)).toBe(true);
      expect(fake.requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
        'GET https://api.printful.com/mockup-generator/printfiles/395?orientation=vertical',
      ]);
    });

    it('refuses an orientation the print file may not be turned to', async () => {
      for (const canRotate of [false, undefined, 'yes']) {
        const { generator } = generatorReplying(vertical(canRotate));
        expect(await generator.supportsOrientation(QUERY)).toBe(false);
      }
    });

    it('refuses a variant or area the printfiles do not list', async () => {
      const { generator } = generatorReplying(vertical(false));

      expect(await generator.supportsOrientation({ ...QUERY, variantId: '33333' })).toBe(false);
      expect(await generator.supportsOrientation({ ...QUERY, placement: 'back' })).toBe(false);
    });

    it('refuses when Printful does not know the orientation, and asks again next time', async () => {
      const { fake, generator } = generatorReplying(
        { status: 400, body: { code: 400, result: 'Invalid orientation given' } },
        vertical(true),
      );

      expect(await generator.supportsOrientation(QUERY)).toBe(false);
      expect(await generator.supportsOrientation(QUERY)).toBe(true);
      expect(fake.requests).toHaveLength(2);
    });

    it('photographs the turned area with the styles of that orientation', async () => {
      const { fake, generator } = generatorReplying(vertical(true), pending, done);

      await generator.supportsOrientation(QUERY);
      await generator.generate({
        productId: '395',
        variantIds: ['11111'],
        area: { placement: 'default', width: 7950, height: 9450, dpi: 150 },
        placement: { left: 0, top: 0, width: 7950, height: 9450 },
        imageUrl: 'https://files.example/01-blanket-r1.png',
        orientation: 'vertical',
      });

      expect(fake.requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
        'GET https://api.printful.com/mockup-generator/printfiles/395?orientation=vertical',
        'POST https://api.printful.com/mockup-generator/create-task/395',
        'GET https://api.printful.com/mockup-generator/task?task_key=gt-1',
      ]);
      expect(fake.requests[1]?.body).toEqual({
        variant_ids: [11111],
        format: 'jpg',
        files: [
          {
            placement: 'default',
            image_url: 'https://files.example/01-blanket-r1.png',
            position: {
              area_width: 7950,
              area_height: 9450,
              width: 7950,
              height: 9450,
              top: 0,
              left: 0,
            },
          },
        ],
        option_groups: ['Flat', 'Lifestyle', 'Lifestyle 2'],
      });
    });

    it('stops at once when cancelled while reading the printfiles', async () => {
      const client = new PrintfulClient({
        fetch: () => Promise.reject(new DOMException('The operation was aborted.', 'AbortError')),
        token: () => Promise.resolve('t'),
      });
      const generator = new PrintfulMockupGenerator(client);

      await expect(generator.supportsOrientation(QUERY)).rejects.toMatchObject({
        name: 'AbortError',
      });
    });
  });

  it('refuses variant ids that are not numbers', async () => {
    const { fake, generator } = generatorWith();

    await expect(generator.generate({ ...REQUEST, variantIds: ['1320', '15oz'] })).rejects.toThrow(
      new PrintfulRequestError('"15oz" is not a Printful variant id'),
    );
    expect(fake.requests).toEqual([]);
  });

  it('reports why Printful could not create the mockups', async () => {
    const { generator } = generatorWith(
      pending,
      ok({ status: 'failed', error: 'Image could not be downloaded' }),
    );

    await expect(generator.generate(REQUEST)).rejects.toThrow(
      new PrintfulMockupError(
        'Printful could not create the mockups: Image could not be downloaded',
      ),
    );
  });

  it('reports a failed task without a reason', async () => {
    const { generator } = generatorWith(pending, ok({ status: 'failed' }));

    await expect(generator.generate(REQUEST)).rejects.toThrow(/no reason given/);
  });

  it('stops waiting after the time limit', async () => {
    const { generator, sleep } = generatorWith(pending, ...Array<FakeReply>(10).fill(pending));

    await expect(generator.generate(REQUEST)).rejects.toThrow(/did not finish the mockups in time/);
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
      2000, 3000, 4500, 6750, 3750,
    ]);
  });
});
