import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { MockupDto, ShopOptionsDto } from '@pod/contracts';
import { png } from '@pod/adapter-fs/testing';
import { FAKE_CODE, fakeServices, type FakeServices } from '../src/main/testing/fake-services.js';
import { serveFakeServices, type FakeServiceServer } from './fake-service-server.js';
import { callApp, launchApp, removeFolder, type LaunchedApp } from './launch-app.js';

/** Calls the app the way the window does, and fails the test on an error result. */
export async function invoke<T>(window: Page, channel: string, request?: unknown): Promise<T> {
  const result = await callApp(window, channel, request);
  const answer = result as { ok: boolean; value?: unknown; error?: unknown };
  if (!answer.ok) throw new Error(`${channel} failed: ${JSON.stringify(answer.error)}`);
  return answer.value as T;
}

/** Drafts the mug's listing on Etsy with the photos, as the listing form sends it. */
export async function draftListing(
  window: Page,
  designId: string,
  photos: readonly MockupDto[],
): Promise<{ state: string; listingId: string }> {
  const options = await invoke<ShopOptionsDto>(window, 'listing:shop-options');
  return invoke(window, 'listing:create', {
    designId,
    fit: 'contain',
    language: options.languages[0] ?? 'en-US',
    title: 'Lantern Harbor Mug',
    description: 'A white mug for gardeners who like a quiet spring morning.',
    tags: ['tulip mug', 'tea party gift'],
    price: 1999,
    currency: options.currency,
    variantIds: ['1320'],
    mockupIds: photos.map((photo) => photo.id),
    shippingProfileId: options.shippingProfiles[0]?.id ?? '',
    readinessStateId: options.readinessStates[0]?.id ?? '',
    returnPolicyId: options.returnPolicies[0]?.id,
    productionPartnerIds: [],
  });
}

export interface FakeShop {
  /** The app as first started. */
  readonly launched: LaunchedApp;
  readonly services: FakeServices;
  /** The id of the imported mug design. */
  readonly designId: string;
  /** Quits the app and starts it again on the same data and fake services. */
  readonly restart: () => Promise<LaunchedApp>;
  readonly close: () => Promise<void>;
}

/**
 * The app on fake services, with one mug design imported and Printful, a
 * Dropbox file host and an Etsy shop connected as the seller would.
 */
export async function openFakeShop(): Promise<FakeShop> {
  const designs = mkdtempSync(join(tmpdir(), 'pod-e2e-shop-'));
  writeFileSync(join(designs, '01 Mug.png'), png(400, 170, 60));
  const services = fakeServices();
  let server: FakeServiceServer | undefined;
  let launched: LaunchedApp | undefined;
  const close = async () => {
    try {
      try {
        await launched?.close();
      } finally {
        await server?.close();
      }
    } finally {
      removeFolder(designs);
    }
  };
  try {
    server = await serveFakeServices(services);
    launched = await launchApp({ fakeServicesUrl: server.url });
    const { window } = launched;
    await launched.answerOpenDialog(designs);
    await invoke(window, 'dialog:pick-folder');
    const preview = await invoke<{ fingerprint: string }>(window, 'import:preview', {
      rootPath: designs,
    });
    await invoke(window, 'import:run', { rootPath: designs, fingerprint: preview.fingerprint });
    const list = await invoke<{ items: { id: string }[] }>(window, 'catalog:list-designs', {
      familyId: 'mug',
    });
    await invoke(window, 'connections:printful', { token: 'printful-token' });
    await invoke(window, 'connections:dropbox-start', { appKey: 'dropbox-app' });
    await invoke(window, 'connections:dropbox-finish', { code: FAKE_CODE });
    await invoke(window, 'connections:sign-in', {
      service: 'etsy',
      keystring: 'etsy-key',
      sharedSecret: 'secret',
    });
    const first = launched;
    const url = server.url;
    const restart = async () => {
      await first.quit();
      launched = await launchApp({ dataDirectory: first.dataDirectory, fakeServicesUrl: url });
      return launched;
    };
    return { launched, services, designId: list.items[0]?.id ?? '', restart, close };
  } catch (error) {
    await close();
    throw error;
  }
}
