import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { FlattenedImage, ImageFlattener, LocalImage } from '@pod/core';
import { EtsyListings } from './etsy-listings.js';
import { clientWith } from './testing/fake-fetch.js';
import { path } from './testing/listings.js';

const folder = mkdtempSync(join(tmpdir(), 'etsy-listings-'));
afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** Lays PNGs onto white by writing `flat <name>`; it remembers what it was asked and removed. */
function fakeFlattener() {
  const flattened: string[] = [];
  const disposed: string[] = [];
  const flattener: ImageFlattener = {
    flatten: (image: LocalImage) => {
      if (image.mimeType !== 'image/png') return Promise.resolve(undefined);
      flattened.push(image.absolutePath);
      const absolutePath = `${image.absolutePath}-flat`;
      writeFileSync(absolutePath, `flat ${image.absolutePath}`);
      const flat: FlattenedImage = {
        absolutePath,
        mimeType: 'image/png',
        dispose: () => {
          disposed.push(absolutePath);
          return Promise.resolve();
        },
      };
      return Promise.resolve(flat);
    },
  };
  return { flattener, flattened, disposed };
}

/** Etsy's answer to listing the photos of a listing. */
const IMAGES = {
  body: {
    count: 2,
    results: [
      { listing_id: 9, listing_image_id: 501, rank: 1 },
      { listing_id: 9, listing_image_id: 502, rank: 2 },
    ],
  },
};

describe('EtsyListings changes', () => {
  it('uploads photos one by one in the chosen order', async () => {
    writeFileSync(join(folder, 'abc'), 'png bytes');
    writeFileSync(join(folder, 'front.jpg'), 'jpeg bytes');
    const { client, calls } = clientWith({ body: {} }, { body: {} });

    await new EtsyListings(client).addImages('9', [
      { absolutePath: join(folder, 'abc'), mimeType: 'image/png' },
      { absolutePath: join(folder, 'front.jpg'), mimeType: 'image/jpeg' },
    ]);

    const forms = calls().map((request) => request.body as FormData);
    expect(calls().map(path)).toEqual(Array(2).fill('/shops/10001001/listings/9/images'));
    expect(forms.map((form) => form.get('rank'))).toEqual(['1', '2']);
    expect(forms.map((form) => (form.get('image') as File).name)).toEqual(['abc.png', 'front.jpg']);
    expect(await (forms[1]?.get('image') as File).text()).toBe('jpeg bytes');
  });

  it('lays see-through photos onto white before sending them', async () => {
    writeFileSync(join(folder, 'mockup.png'), 'png bytes');
    writeFileSync(join(folder, 'scene.jpg'), 'jpeg bytes');
    const { client, calls } = clientWith({ body: {} }, { body: {} });
    const { flattener, flattened, disposed } = fakeFlattener();
    const png = join(folder, 'mockup.png');

    await new EtsyListings(client, { flattener }).addImages('9', [
      { absolutePath: png, mimeType: 'image/png' },
      { absolutePath: join(folder, 'scene.jpg'), mimeType: 'image/jpeg' },
    ]);

    const images = calls().map((request) => (request.body as FormData).get('image') as File);
    expect(flattened).toEqual([png]);
    expect(disposed).toEqual([`${png}-flat`]);
    expect(images.map((image) => [image.name, image.type])).toEqual([
      ['mockup.png', 'image/png'],
      ['scene.jpg', 'image/jpeg'],
    ]);
    expect(await images[0]?.text()).toBe(`flat ${png}`);
    expect(await images[1]?.text()).toBe('jpeg bytes');
  });

  it("replaces a listing's photos: the old ones removed, the new ones in order", async () => {
    writeFileSync(join(folder, 'flat.jpg'), 'flat bytes');
    writeFileSync(join(folder, 'couch.png'), 'couch bytes');
    const { client, calls } = clientWith(
      IMAGES,
      { status: 204 },
      { body: {} },
      { status: 404, body: { error: 'Image not found' } },
      { body: {} },
    );
    const { flattener, disposed } = fakeFlattener();
    const couch = join(folder, 'couch.png');

    await new EtsyListings(client, { flattener }).replaceImages('9', [
      { absolutePath: join(folder, 'flat.jpg'), mimeType: 'image/jpeg' },
      { absolutePath: couch, mimeType: 'image/png' },
    ]);

    expect(calls().map((request) => [request.method, path(request)])).toEqual([
      ['GET', '/listings/9/images'],
      ['DELETE', '/shops/10001001/listings/9/images/501'],
      // Etsy refuses to delete a listing's last photo, so it goes once a new one is up.
      ['POST', '/shops/10001001/listings/9/images'],
      ['DELETE', '/shops/10001001/listings/9/images/502'],
      ['POST', '/shops/10001001/listings/9/images'],
    ]);
    const forms = calls()
      .filter((request) => request.method === 'POST')
      .map((request) => request.body as FormData);
    expect(forms.map((form) => form.get('rank'))).toEqual(['1', '2']);
    expect(await (forms[1]?.get('image') as File).text()).toBe(`flat ${couch}`);
    expect(disposed).toEqual([`${couch}-flat`]);
  });

  it('passes on an upload that fails, leaving an old photo on the listing', async () => {
    writeFileSync(join(folder, 'flat.jpg'), 'flat bytes');
    const { client, calls } = clientWith(
      IMAGES,
      { status: 204 },
      { status: 400, body: { error: 'Image could not be read' } },
    );

    await expect(
      new EtsyListings(client).replaceImages('9', [
        { absolutePath: join(folder, 'flat.jpg'), mimeType: 'image/jpeg' },
      ]),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls().map((request) => request.method)).toEqual(['GET', 'DELETE', 'POST']);
  });

  it('keeps the old photos when a new one cannot be read', async () => {
    const { client, calls } = clientWith();

    await expect(
      new EtsyListings(client).replaceImages('9', [
        { absolutePath: join(folder, 'missing.png'), mimeType: 'image/png' },
      ]),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(calls()).toEqual([]);
  });

  it('stops when Etsy refuses to remove a photo', async () => {
    writeFileSync(join(folder, 'flat.jpg'), 'flat bytes');
    const { client, calls } = clientWith(IMAGES, { status: 403, body: { error: 'Forbidden' } });

    await expect(
      new EtsyListings(client).replaceImages('9', [
        { absolutePath: join(folder, 'flat.jpg'), mimeType: 'image/jpeg' },
      ]),
    ).rejects.toMatchObject({ status: 403 });
    expect(calls()).toHaveLength(2);
  });

  it('removes and publishes listings', async () => {
    const { client, calls } = clientWith({ status: 204 }, { body: { state: 'active' } });
    const listings = new EtsyListings(client);

    await listings.remove('9');
    await listings.publish('9');

    expect(calls().map((request) => [request.method, path(request), request.body])).toEqual([
      ['DELETE', '/listings/9', undefined],
      ['PATCH', '/shops/10001001/listings/9', { state: 'active' }],
    ]);
  });

  it('reads the state of a listing, counting paused and sold out ones as inactive', async () => {
    const { client } = clientWith(
      { body: { state: 'draft' } },
      { body: { state: 'active' } },
      { body: { state: 'sold_out' } },
      { body: { state: 'removed' } },
      { status: 404, body: { error: 'Listing not found' } },
      { status: 500, body: { error: 'down' } },
    );
    const listings = new EtsyListings(client);

    const states = [];
    for (let i = 0; i < 5; i++) states.push(await listings.state('9'));

    expect(states).toEqual(['draft', 'active', 'inactive', undefined, undefined]);
    await expect(listings.state('9')).rejects.toMatchObject({ status: 500 });
  });

  it('writes a translation of the listing', async () => {
    const { client, calls } = clientWith({ body: {} });

    await new EtsyListings(client).setTranslation('9', 'de', {
      title: 'Geister-Tasse',
      description: 'Gruselig.',
      tags: ['geister tasse', 'buch'],
    });

    expect(calls()[0]).toMatchObject({
      method: 'POST',
      body: {
        title: 'Geister-Tasse',
        description: 'Gruselig.',
        tags: 'geister tasse,buch',
      },
    });
    expect(path(calls()[0])).toBe('/shops/10001001/listings/9/translations/de');
  });

  it('updates a translation the listing already has, and reports other failures', async () => {
    const text = { title: 'T', description: 'D', tags: [] };
    const { client, calls } = clientWith(
      { status: 409, body: { error: 'Translation already exists' } },
      { body: {} },
      { status: 400, body: { error: 'Language not supported' } },
    );
    const listings = new EtsyListings(client);

    await listings.setTranslation('9', 'de', text);
    await expect(listings.setTranslation('9', 'xx', text)).rejects.toThrow(
      'Language not supported',
    );

    expect(calls().map((request) => request.method)).toEqual(['POST', 'PUT', 'POST']);
  });
});
