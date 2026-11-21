import { expect, test } from '@playwright/test';
import type { MockupDto, PinDto, BoardDto } from '@pod/contracts';
import { draftListing, invoke, openFakeShop, type FakeShop } from './fake-shop.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let shop: FakeShop;

test.beforeEach(async () => {
  shop = await openFakeShop();
});

test.afterEach(async () => {
  await shop.close();
});

test('plans a pin from a Printful photo, approves it and publishes it now', async () => {
  const { launched, designId, services } = shop;
  const { window } = launched;
  const print = { designId, variantId: '1320', fit: 'contain' };
  const photos = await invoke<MockupDto[]>(window, 'print:create-mockups', print);
  await draftListing(window, designId, photos);
  await invoke(window, 'listing:link', { id: designId });
  await invoke(window, 'listing:publish', { id: designId });
  await invoke(window, 'connections:sign-in', {
    service: 'pinterest',
    appId: '1500',
    appSecret: 'secret',
  });
  const [board] = await invoke<BoardDto[]>(window, 'pins:boards');

  const planned = await invoke<PinDto>(window, 'pins:plan', {
    designId,
    mockupId: photos[0]?.id ?? '',
    title: 'Lantern Harbor Mug',
    description: 'A mug for quiet spring mornings.',
    altText: 'A white mug with tulips in a meadow',
    headline: 'For the garden party',
    boardId: board?.id ?? '',
    publishAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  await invoke(window, 'pins:approve', { id: planned.id });
  const published = await invoke<PinDto>(window, 'pins:publish-now', { id: planned.id });

  expect(published.state).toBe('published');
  expect(services.calls).toContain('POST https://api.pinterest.com/v5/pins');
  expect(services.pinImages).toHaveLength(1);
  const [image] = services.pinImages;
  expect(Buffer.from(image ?? []).subarray(0, 8)).toEqual(PNG_SIGNATURE);
});
