import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS, type ApiResult } from '@pod/contracts';
import { catalogOperations } from '../api/operations.js';
import { fakeCatalog } from '../testing/fake-catalog.js';
import { registerIpc, type IpcRegistrar } from './ipc-bridge.js';

type Listener = (event: unknown, ...args: unknown[]) => unknown;

class FakeIpc implements IpcRegistrar {
  readonly listeners = new Map<string, Listener>();

  handle(channel: string, listener: Listener): void {
    this.listeners.set(channel, listener);
  }

  invoke(channel: string, event: unknown, ...args: unknown[]): Promise<ApiResult<unknown>> {
    const listener = this.listeners.get(channel);
    if (!listener) throw new Error(`No handler for ${channel}`);
    return listener(event, ...args) as Promise<ApiResult<unknown>>;
  }
}

describe('registerIpc', () => {
  const trusted = { trusted: true };

  function setUp() {
    const ipc = new FakeIpc();
    const catalog = fakeCatalog();
    const app = { closing: false };
    registerIpc(ipc, catalogOperations(catalog), {
      isTrustedSender: (event) => event === trusted,
      isClosing: () => app.closing,
      log: vi.fn(),
    });
    return { ipc, catalog, app };
  }

  it('serves each operation on its channel and passes the first argument', async () => {
    const { ipc, catalog } = setUp();

    expect([...ipc.listeners.keys()]).toEqual([
      IPC_CHANNELS.listFamilies,
      IPC_CHANNELS.listDesigns,
      IPC_CHANNELS.getDesign,
      IPC_CHANNELS.previewImport,
      IPC_CHANNELS.runImport,
      IPC_CHANNELS.listImportFolders,
      IPC_CHANNELS.checkPrint,
      IPC_CHANNELS.createMockups,
      IPC_CHANNELS.listMockups,
      IPC_CHANNELS.getShopOptions,
      IPC_CHANNELS.getListing,
      IPC_CHANNELS.createListing,
      IPC_CHANNELS.linkListing,
      IPC_CHANNELS.refreshListing,
      IPC_CHANNELS.listingPhotos,
      IPC_CHANNELS.replaceListingPhotos,
      IPC_CHANNELS.researchKeywords,
      IPC_CHANNELS.listResearch,
      IPC_CHANNELS.getResearch,
      IPC_CHANNELS.listBoards,
      IPC_CHANNELS.listPins,
      IPC_CHANNELS.proposePin,
      IPC_CHANNELS.getBatchStatus,
    ]);
    expect(await ipc.invoke(IPC_CHANNELS.listDesigns, trusted, { limit: 3 }, 'ignored')).toEqual({
      ok: true,
      value: { items: [], nextCursor: null, total: 0 },
    });
    expect(catalog.listDesigns).toHaveBeenCalledWith({ limit: 3 });
  });

  it('refuses requests from untrusted senders without running anything', async () => {
    const { ipc, catalog } = setUp();

    expect(await ipc.invoke(IPC_CHANNELS.listDesigns, { trusted: false }, {})).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: 'Untrusted sender', details: {} },
    });
    expect(catalog.listDesigns).not.toHaveBeenCalled();
  });

  it('refuses every request once the app is closing', async () => {
    const { ipc, catalog, app } = setUp();
    app.closing = true;

    expect(await ipc.invoke(IPC_CHANNELS.listDesigns, trusted, {})).toEqual({
      ok: false,
      error: { code: 'APP_CLOSING', message: 'The app is closing', details: {} },
    });
    expect(catalog.listDesigns).not.toHaveBeenCalled();
  });
});
