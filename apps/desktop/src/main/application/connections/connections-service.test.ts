import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS } from '@pod/contracts';
import {
  ConnectionFailedError,
  ConnectionInProgressError,
  PrintfulTokenNotSingleStoreError,
} from '../errors/connection-errors.js';
import { SecretStorageUnavailableError } from './secret-store.js';
import type { FulfilmentStore } from './fulfilment-store.js';
import {
  checks,
  clock,
  connections,
  file,
  openExternal,
  setUpConnections,
} from '../../testing/connections-setup.js';

const s3 = {
  endpoint: 'https://account.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'pod',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
};

const NO_AI = { anthropic: false, openai: false, deepseek: false, kimi: false, gemini: false };

beforeEach(setUpConnections);

describe('ConnectionsService', () => {
  it('starts with nothing connected', async () => {
    expect(await connections.get()).toEqual({
      printful: null,
      fileHost: null,
      etsy: null,
      ai: NO_AI,
      pinterest: null,
    });
  });

  it('connects Printful after the token is accepted and never returns the token', async () => {
    const result = await connections.connectPrintful({ token: 'pf-token' });

    expect(checks.printful).toHaveBeenCalledWith('pf-token');
    expect(result).toEqual({
      printful: { storeName: 'Example Store' },
      fileHost: null,
      etsy: null,
      ai: NO_AI,
      pinterest: null,
    });
    expect(JSON.stringify(result)).not.toContain('pf-token');
  });

  it('warns when the Printful store syncs with no Etsy shop, or looks like another one', async () => {
    checks.printful.mockResolvedValueOnce({
      name: 'Maple Lane',
      syncsWithMarketplace: false,
      shopHandle: null,
    });
    expect((await connections.connectPrintful({ token: 'manual' })).printful).toEqual({
      storeName: 'Maple Lane',
      storeProblem: 'not-marketplace',
    });

    checks.printful.mockResolvedValueOnce({
      name: 'Other',
      syncsWithMarketplace: true,
      shopHandle: null,
    });
    await connections.connectPrintful({ token: 'other' });
    expect((await connections.get()).printful).toEqual({ storeName: 'Other' });
    await connections.connectSignIn({ service: 'etsy', keystring: 'k', sharedSecret: 's' });
    expect((await connections.get()).printful).toEqual({
      storeName: 'Other',
      storeProblem: 'other-shop',
    });
    expect(await connections.fulfilmentStoreMismatch()).toEqual({
      problem: 'other-shop',
      storeName: 'Other',
      shopName: 'Example',
    });
  });

  it('finds the store of a token saved before the app kept its kind, once per run', async () => {
    file.entries.set('printful', JSON.stringify({ token: 'old', storeName: 'Maple Lane' }));
    checks.printful.mockResolvedValue({
      name: 'Maple Lane',
      syncsWithMarketplace: false,
      shopHandle: null,
    });

    expect((await connections.get()).printful).toEqual({
      storeName: 'Maple Lane',
      storeProblem: 'not-marketplace',
    });
    await connections.get();
    expect(checks.printful).toHaveBeenCalledOnce();
    expect(checks.printful).toHaveBeenCalledWith('old');
    await vi.waitFor(() => {
      expect(JSON.parse(file.entries.get('printful') ?? '{}')).toMatchObject({
        token: 'old',
        storeSyncsWithMarketplace: false,
      });
    });
  });

  it('keeps the store kind found during another change at the next read', async () => {
    file.entries.set('printful', JSON.stringify({ token: 'old', storeName: 'Maple Lane' }));
    checks.printful.mockResolvedValue({
      name: 'Maple Lane',
      syncsWithMarketplace: false,
      shopHandle: null,
    });

    await connections.connectS3(s3);
    await new Promise((resolve) => setImmediate(resolve));
    expect(JSON.parse(file.entries.get('printful') ?? '{}')).not.toHaveProperty(
      'storeSyncsWithMarketplace',
    );
    await connections.get();

    await vi.waitFor(() => {
      expect(JSON.parse(file.entries.get('printful') ?? '{}')).toMatchObject({
        storeSyncsWithMarketplace: false,
      });
    });
    expect(checks.printful).toHaveBeenCalledOnce();
  });

  it('shows a store saved without its kind as it is while Printful cannot be asked', async () => {
    file.entries.set('printful', JSON.stringify({ token: 'old', storeName: 'Shop' }));
    checks.printful.mockRejectedValueOnce(new Error('offline'));

    expect((await connections.get()).printful).toEqual({ storeName: 'Shop' });
    await connections.get();
    expect(checks.printful).toHaveBeenCalledOnce();

    clock.now.mockReturnValue(new Date(1_000_000 + 60_000));
    checks.printful.mockResolvedValueOnce({
      name: 'Shop',
      syncsWithMarketplace: false,
      shopHandle: null,
    });
    expect((await connections.get()).printful).toMatchObject({ storeProblem: 'not-marketplace' });
  });

  it('stores nothing when Printful refuses the token', async () => {
    checks.printful.mockRejectedValueOnce(new Error('401 Unauthorized'));

    await expect(connections.connectPrintful({ token: 'bad' })).rejects.toMatchObject({
      code: 'CONNECTION_FAILED',
      details: { service: 'printful', reason: '401 Unauthorized' },
    });
    expect(file.entries.size).toBe(0);
  });

  it('connects Dropbox in two steps, opening the browser in between', async () => {
    const started = await connections.startDropbox({ appKey: 'app-key' });

    expect(started.authorizeUrl).toBe(
      'https://dropbox.test/authorize?client_id=app-key&challenge=challenge',
    );
    expect(openExternal).toHaveBeenCalledWith(started.authorizeUrl);

    const result = await connections.finishDropbox({ code: 'code-1' });

    expect(checks.dropbox.refreshToken).toHaveBeenCalledWith('app-key', 'code-1', 'verifier');
    expect(result.fileHost).toBe('dropbox');
    await expect(connections.finishDropbox({ code: 'again' })).rejects.toBeInstanceOf(
      ConnectionFailedError,
    );
  });

  it('keeps the pending Dropbox authorization when the code is wrong', async () => {
    await connections.startDropbox({ appKey: 'app-key' });
    checks.dropbox.refreshToken.mockRejectedValueOnce('invalid_grant');

    await expect(connections.finishDropbox({ code: 'typo' })).rejects.toMatchObject({
      details: { service: 'dropbox', reason: 'invalid_grant' },
    });
    expect((await connections.finishDropbox({ code: 'right' })).fileHost).toBe('dropbox');
  });

  it('forgets a Dropbox connection begun but not finished once the file host is disconnected', async () => {
    await connections.startDropbox({ appKey: 'app-key' });

    await connections.disconnect({ service: 'fileHost' });

    await expect(connections.finishDropbox({ code: 'code-1' })).rejects.toMatchObject({
      code: 'CONNECTION_FAILED',
    });
  });

  it('switches the file host from Dropbox to S3 after a test upload', async () => {
    await connections.startDropbox({ appKey: 'app-key' });
    await connections.finishDropbox({ code: 'code' });

    const result = await connections.connectS3(s3);

    expect(checks.s3).toHaveBeenCalledWith(s3);
    expect(result.fileHost).toBe('s3');
    expect(file.entries.has('dropbox')).toBe(false);
  });

  it('disconnects Printful and the file host separately', async () => {
    await connections.connectPrintful({ token: 'pf-token' });
    await connections.connectS3(s3);

    expect(await connections.disconnect({ service: 'fileHost' })).toEqual({
      printful: { storeName: 'Example Store' },
      fileHost: null,
      etsy: null,
      ai: NO_AI,
      pinterest: null,
    });
    expect(await connections.disconnect({ service: 'printful' })).toEqual({
      printful: null,
      fileHost: null,
      etsy: null,
      ai: NO_AI,
      pinterest: null,
    });
  });

  it('tells the seller when a Printful token does not reach exactly one store', async () => {
    checks.printful.mockRejectedValueOnce(new PrintfulTokenNotSingleStoreError(3));

    await expect(connections.connectPrintful({ token: 'account-wide' })).rejects.toMatchObject({
      code: 'PRINTFUL_TOKEN_NOT_SINGLE_STORE',
      details: { storeCount: 3 },
    });
    expect((await connections.get()).printful).toBeNull();
  });

  it('refuses a second change while one runs', async () => {
    let answer: (store: FulfilmentStore) => void = () => undefined;
    checks.printful.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const first = connections.connectPrintful({ token: 'a' });

    await expect(connections.connectS3(s3)).rejects.toBeInstanceOf(ConnectionInProgressError);
    await expect(connections.finishDropbox({ code: 'c' })).rejects.toBeInstanceOf(
      ConnectionInProgressError,
    );
    answer({ name: 'Store', syncsWithMarketplace: true, shopHandle: null });
    expect((await first).printful).toEqual({ storeName: 'Store' });
  });

  it('keeps a newer Dropbox authorization started after the previous finished', async () => {
    await connections.startDropbox({ appKey: 'first' });
    await connections.finishDropbox({ code: 'one' });
    checks.dropbox.createPkcePair.mockReturnValueOnce({
      verifier: 'second-verifier',
      challenge: 'c2',
    });
    await connections.startDropbox({ appKey: 'second' });

    await connections.finishDropbox({ code: 'two' });

    expect(checks.dropbox.refreshToken).toHaveBeenLastCalledWith(
      'second',
      'two',
      'second-verifier',
    );
  });

  it('checks the keychain before talking to any service', async () => {
    file.writable = false;

    await expect(connections.connectPrintful({ token: 't' })).rejects.toBeInstanceOf(
      SecretStorageUnavailableError,
    );
    await expect(connections.connectS3(s3)).rejects.toBeInstanceOf(SecretStorageUnavailableError);
    await expect(connections.startDropbox({ appKey: 'k' })).rejects.toBeInstanceOf(
      SecretStorageUnavailableError,
    );
    await expect(
      connections.connectAi({ provider: 'openai', apiKey: 'sk-key' }),
    ).rejects.toBeInstanceOf(SecretStorageUnavailableError);
    expect(checks.printful).not.toHaveBeenCalled();
    expect(checks.s3).not.toHaveBeenCalled();
    expect(checks.aiKey).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('treats malformed stored secrets as not connected', async () => {
    file.entries.set('printful', '{');
    file.entries.set('s3', JSON.stringify({ bucket: 'pod' }));

    expect(await connections.get()).toEqual({
      printful: null,
      fileHost: null,
      etsy: null,
      ai: NO_AI,
      pinterest: null,
    });
  });

  it.each(AI_PROVIDERS)(
    'connects %s once the service accepts the key, and never returns it',
    async (provider) => {
      const result = await connections.connectAi({ provider, apiKey: 'sk-key' });

      expect(checks.aiKey).toHaveBeenCalledWith(provider, 'sk-key');
      expect(result.ai).toEqual({ ...NO_AI, [provider]: true });
      expect(JSON.stringify(result)).not.toContain('sk-key');
      expect((await connections.disconnect({ service: provider })).ai).toEqual(NO_AI);
    },
  );

  it('stores no key the service refuses', async () => {
    checks.aiKey.mockRejectedValueOnce(new Error('invalid x-api-key'));

    await expect(connections.connectAi({ provider: 'kimi', apiKey: 'bad' })).rejects.toMatchObject({
      code: 'CONNECTION_FAILED',
      details: { service: 'kimi' },
    });
    expect((await connections.get()).ai.kimi).toBe(false);
  });
});
