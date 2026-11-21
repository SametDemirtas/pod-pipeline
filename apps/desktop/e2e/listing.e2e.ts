import { expect, test } from '@playwright/test';
import type { MockupDto } from '@pod/contracts';
import { ETSY_SHOP_ID } from '../src/main/testing/fake-services.js';
import { draftListing, invoke, openFakeShop, type FakeShop } from './fake-shop.js';

let shop: FakeShop;

test.beforeEach(async () => {
  shop = await openFakeShop();
});

test.afterEach(async () => {
  await shop.close();
});

test('checks the print, has Printful photograph it and drafts the listing on Etsy', async () => {
  const { launched, designId } = shop;
  const { window } = launched;
  const print = { designId, variantId: '1320', fit: 'contain' };

  const check = await invoke<{ quality: string }>(window, 'print:check', print);
  const photos = await invoke<MockupDto[]>(window, 'print:create-mockups', print);
  const draft = await draftListing(window, designId, photos);

  expect(check.quality).toBe('poor');
  expect(photos).toHaveLength(2);
  expect(draft.state).toBe('draft');
  expect(shop.services.calls).toContain(
    `POST https://openapi.etsy.com/v3/application/shops/${String(ETSY_SHOP_ID)}/listings`,
  );
  await window.getByRole('link', { name: /^01-mug,/ }).click();
  const status = window.getByText(`Listing ${draft.listingId}`).locator('..');
  await expect(status.getByText('Draft', { exact: true })).toBeVisible();
});
