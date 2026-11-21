import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { inProcessWorker, png } from '@pod/adapter-fs/testing';
import { ETSY_SHOP_ID, FAKE_CODE, fakeFetch, fakeServices } from '../testing/fake-services.js';
import { serviceOptions } from '../testing/service-options.js';
import { createServices, type ServiceOptions, type Services } from './create-services.js';
import { openThrough } from './fake-service-route.js';

let dir: string;
let designs: string;
let services: Services | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-listing-'));
  designs = join(dir, 'designs');
  mkdirSync(designs);
  writeFileSync(join(designs, '01-mug.png'), png(120, 50, 10));
});

afterEach(async () => {
  await services?.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

it('drafts, links and publishes a listing through the services, once, and keeps it', async () => {
  const fake = fakeServices();
  const withServices = (): ServiceOptions =>
    serviceOptions(dir, inProcessWorker, {
      fetch: fakeFetch(fake),
      openExternal: openThrough(fakeFetch(fake)),
      pickFolder: () => Promise.resolve(designs),
    });
  services = await createServices(withServices());
  await services.folders.choose();
  const preview = await services.catalog.previewImport({ rootPath: designs });
  await services.catalog.runImport({ rootPath: designs, fingerprint: preview.fingerprint });
  const [mug] = (await services.catalog.listDesigns({ familyId: 'mug' })).items;
  const id = mug?.id ?? '';

  await services.connections.connectPrintful({ token: 'printful-token' });
  await services.connections.startDropbox({ appKey: 'dropbox-app' });
  await services.connections.finishDropbox({ code: FAKE_CODE });
  const connected = await services.connections.connectSignIn({
    service: 'etsy',
    keystring: 'etsy-key',
    sharedSecret: 'etsy-secret',
  });
  expect(connected).toMatchObject({
    printful: { storeName: 'Fake Printful Store' },
    etsy: { shopName: 'FakeShop' },
  });
  const shop = await services.catalog.getShopOptions();
  const photos = await services.catalog.createMockups({
    designId: id,
    variantId: '1320',
    fit: 'contain',
  });
  const created = await services.catalog.createListing({
    designId: id,
    fit: 'contain',
    language: shop.languages[0] ?? 'en-US',
    title: 'Lantern Harbor Mug',
    description: 'A white mug for gardeners who like a quiet spring morning.',
    tags: ['tulip mug', 'tea party gift'],
    price: 1999,
    currency: shop.currency,
    variantIds: ['1320'],
    mockupIds: photos.map((photo) => photo.id),
    shippingProfileId: shop.shippingProfiles[0]?.id ?? '',
    readinessStateId: shop.readinessStates[0]?.id ?? '',
    returnPolicyId: shop.returnPolicies[0]?.id,
    productionPartnerIds: [],
  });
  expect(created.state).toBe('draft');
  expect((await services.catalog.linkListing({ id })).linkCurrent).toBe(true);
  await services.publishing.publishListing({ id });
  expect(await services.catalog.refreshListing({ id })).toMatchObject({ state: 'active' });
  await services.publishing.publishListing({ id });

  const etsy = `https://openapi.etsy.com/v3/application`;
  const listing = `${etsy}/shops/${String(ETSY_SHOP_ID)}/listings/${created.listingId}`;
  const steps = [
    `POST ${etsy}/shops/${String(ETSY_SHOP_ID)}/listings`,
    `PUT ${etsy}/listings/${created.listingId}/inventory`,
    `GET https://api.printful.com/sync/products/@${created.listingId}`,
    'PUT https://api.printful.com/sync/variant/500000001',
    `PATCH ${listing}`,
  ];
  expect(fake.calls.filter((call) => steps.includes(call))).toEqual(steps);

  await services.close();
  services = await createServices(withServices());
  expect(await services.catalog.getListing({ id })).toMatchObject({
    listingId: created.listingId,
    state: 'active',
    linkCurrent: true,
    publishedAt: expect.any(String) as string,
  });
}, 20_000);
