import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContentAddressedStore } from '@pod/adapter-fs';
import {
  InMemoryCatalog,
  InMemoryListings,
  InMemoryMockups,
  InMemoryPins,
} from '@pod/core/testing';
import { sampleConcept, sampleDesign, samplePin } from '@pod/core/testing/contract';
import type { DesignId, Mockup, MockupId } from '@pod/core';
import { ConnectionSecrets } from '../../application/connections/connection-secrets.js';
import { MemorySecrets } from '../../testing/memory-secrets.js';
import { PinterestNotConnectedError } from '../../application/errors/connection-errors.js';
import { PinSentUnconfirmedError } from '../../application/errors/pin-errors.js';
import {
  ProviderFailedError,
  ProviderInterruptedError,
  ProviderUnavailableError,
} from '../../application/errors/provider-errors.js';
import { createPinService, isOutage, isOutcomeUnknown } from './pin-providers.js';

function serviceWith(
  secrets: ConnectionSecrets,
  fetchFn: typeof fetch,
  pins = new InMemoryPins(),
  assets = new ContentAddressedStore('/nowhere'),
  catalog = new InMemoryCatalog(),
  mockups = new InMemoryMockups(),
) {
  return createPinService({
    secrets,
    fetch: fetchFn,
    clock: { now: () => new Date() },
    ids: { next: () => 'pin-1' },
    inspector: { inspect: () => Promise.resolve(undefined) },
    query: catalog,
    mockups,
    listings: new InMemoryListings(),
    pins,
    assets,
    renderPin: () => Promise.reject(new Error('not rendered here')),
    events: { catalogChanged: () => undefined },
    writeTemporary: () => Promise.reject(new Error('not written here')),
    logError: () => undefined,
    onTokenNotSaved: () => undefined,
  });
}

/** The mug design with the photo its sample pins were made from, still publishable. */
async function withPhoto() {
  const catalog = new InMemoryCatalog();
  await catalog.concepts.save(sampleConcept('01'));
  await catalog.designs.save(sampleDesign('01-mug'));
  const mockups = new InMemoryMockups();
  const photo: Mockup = {
    id: 'm1' as MockupId,
    designId: 'design-01-mug' as DesignId,
    designRevision: 1,
    variantId: '1320',
    printArea: 'default',
    view: 'Front',
    scenePrompt: null,
    sceneCheck: null,
    printConfirmed: false,
    sourceAsset: null,
    asset: sampleDesign('01-mug').asset,
    createdAt: new Date('2026-10-24T10:00:00.000Z'),
  };
  await mockups.add([photo]);
  return { catalog, mockups };
}

describe('createPinService', () => {
  it('reads boards with the stored sign-in and keeps the refresh token Pinterest hands out', async () => {
    const secrets = new ConnectionSecrets(new MemorySecrets());
    await secrets.signIns.pinterest.save({
      appId: '1500',
      appSecret: 'secret',
      refreshToken: 'refresh-1',
      username: 'example-pins',
    });
    const fakeFetch: typeof fetch = (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      const body = url.includes('/oauth/token')
        ? { access_token: 'a', refresh_token: 'refresh-2', expires_in: 3600 }
        : { items: [{ id: '11', name: 'Mugs' }], bookmark: null };
      return Promise.resolve(new Response(JSON.stringify(body)));
    };
    const pins = serviceWith(secrets, fakeFetch);

    expect(await pins.listBoards()).toEqual([{ id: '11', name: 'Mugs' }]);
    expect((await secrets.signIns.pinterest.get())?.refreshToken).toBe('refresh-2');
    expect(await pins.publishDue()).toEqual([]);
  });

  it('says Pinterest is not connected, and publishes nothing then', async () => {
    const pins = serviceWith(new ConnectionSecrets(new MemorySecrets()), () =>
      Promise.reject(new Error('no request expected')),
    );

    await expect(pins.listBoards()).rejects.toMatchObject({
      code: 'PINTEREST_NOT_CONNECTED',
    });
    expect(await pins.publishDue()).toEqual([]);
  });

  it('treats a lost sign-in or connection as an outage, other failures not', () => {
    expect(isOutage(new PinterestNotConnectedError())).toBe(true);
    expect(isOutage(new ProviderUnavailableError('Pinterest'))).toBe(true);
    expect(isOutage(new ProviderFailedError('Pinterest', 'connection lost'))).toBe(false);
    expect(isOutage(new ProviderFailedError('Pinterest', 'Invalid board'))).toBe(false);
    expect(isOutage(new Error('x'))).toBe(false);
  });

  it('treats only a pin the adapter could not confirm as of unknown outcome', () => {
    expect(isOutcomeUnknown(new PinSentUnconfirmedError('timed out'))).toBe(true);
    expect(isOutcomeUnknown(new ProviderInterruptedError('Pinterest', 'timed out'))).toBe(false);
    expect(isOutcomeUnknown(new ProviderUnavailableError('Pinterest'))).toBe(false);
    expect(isOutcomeUnknown(new ProviderFailedError('Pinterest', 'Invalid board'))).toBe(false);
  });

  describe('publishing a pin that fails', () => {
    const imageKey = `ab/${'ab'.repeat(32)}.png`;
    const tokenReply = () =>
      Promise.resolve(
        new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r2', expires_in: 3600 })),
      );
    const socketError = (message: string, code: string) =>
      new TypeError(message, { cause: Object.assign(new Error(code), { code }) });
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'pod-pins-'));
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    /** Publishes a planned pin now, with Pinterest's token and pin endpoints answering as given. */
    async function publishWith(token: () => Promise<Response>, pin: () => Promise<Response>) {
      const assets = new ContentAddressedStore(root);
      await mkdir(dirname(assets.pathOf(imageKey)), { recursive: true });
      await writeFile(assets.pathOf(imageKey), 'png');
      const secrets = new ConnectionSecrets(new MemorySecrets());
      await secrets.signIns.pinterest.save({
        appId: '1500',
        appSecret: 'secret',
        refreshToken: 'refresh-1',
        username: 'example-pins',
      });
      const pins = new InMemoryPins();
      const planned = samplePin('p1', 'design-01-mug' as DesignId, 0);
      await pins.save({ ...planned, image: { ...planned.image, storageKey: imageKey } });
      const fakeFetch: typeof fetch = (input) => {
        const url = input instanceof Request ? input.url : input.toString();
        return url.includes('/oauth/token') ? token() : pin();
      };
      const { catalog, mockups } = await withPhoto();
      return serviceWith(secrets, fakeFetch, pins, assets, catalog, mockups).publishPinNow({
        id: 'p1',
      });
    }

    it.each([
      ['a connection reset', () => Promise.reject(socketError('fetch failed', 'ECONNRESET'))],
      ['a body cut off', () => Promise.reject(socketError('terminated', 'UND_ERR_SOCKET'))],
      ['a gateway error', () => Promise.resolve(new Response('{}', { status: 502 }))],
      ['an answer without an id', () => Promise.resolve(new Response('{}', { status: 201 }))],
    ])('is of unknown outcome after %s', async (_case, answer: () => Promise<Response>) => {
      expect(await publishWith(tokenReply, answer)).toMatchObject({
        state: 'failed',
        failureCode: 'PIN_OUTCOME_UNKNOWN',
      });
    });

    it('is a plain failure when refreshing the sign-in fails, as no pin was sent', async () => {
      let pinRequests = 0;
      const failed = await publishWith(
        () => Promise.resolve(new Response('{}', { status: 502 })),
        () => {
          pinRequests++;
          return Promise.resolve(new Response('{}'));
        },
      );

      expect(failed).toMatchObject({ state: 'failed', failureCode: 'PROVIDER_FAILED' });
      expect(pinRequests).toBe(0);
    });

    it('is no unknown pin when the connection breaks while refreshing the sign-in', async () => {
      const failed = await publishWith(
        () => Promise.reject(socketError('fetch failed', 'ECONNRESET')),
        () => Promise.resolve(new Response('{}')),
      );

      expect(failed).toMatchObject({ state: 'failed', failureCode: 'PROVIDER_FAILED' });
    });

    it('is no unknown pin when a refused token cannot be renewed', async () => {
      let tokenRequests = 0;
      const failed = await publishWith(
        () =>
          tokenRequests++ === 0
            ? tokenReply()
            : Promise.reject(socketError('fetch failed', 'ECONNRESET')),
        () => Promise.resolve(new Response('{}', { status: 401 })),
      );

      expect(failed).toMatchObject({ state: 'failed', failureCode: 'PROVIDER_FAILED' });
      expect(tokenRequests).toBe(2);
    });
  });
});
