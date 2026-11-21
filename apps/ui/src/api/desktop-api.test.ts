import { describe, expect, it, vi } from 'vitest';
import { ApiError, IPC_CHANNELS, IPC_EVENTS, type DesktopBridge } from '@pod/contracts/client';
import { createDesktopApi } from './desktop-api.js';

function fakeBridge() {
  const listeners = new Map<string, (payload: unknown) => void>();
  const bridge = {
    invoke: vi.fn<DesktopBridge['invoke']>((channel) =>
      Promise.resolve({ ok: true, value: `answer from ${channel}` }),
    ),
    on: vi.fn<DesktopBridge['on']>((event, listener) => {
      listeners.set(event, listener);
      return () => listeners.delete(event);
    }),
  };
  return { bridge, listeners };
}

describe('createDesktopApi', () => {
  it('sends every operation on its own channel with the request', async () => {
    const { bridge } = fakeBridge();
    const api = createDesktopApi(bridge);

    const operations = api as unknown as Record<string, (request: unknown) => Promise<unknown>>;
    for (const [name, channel] of Object.entries(IPC_CHANNELS)) {
      expect(await operations[name]?.({ name })).toBe(`answer from ${channel}`);
      expect(bridge.invoke).toHaveBeenLastCalledWith(channel, { name });
    }
  });

  it('turns a failed result into an ApiError with its code and details', async () => {
    const { bridge } = fakeBridge();
    bridge.invoke.mockResolvedValueOnce({
      ok: false,
      error: { code: 'PRINTFUL_NOT_CONNECTED', message: 'connect first', details: { a: 1 } },
    });

    const failure = createDesktopApi(bridge).checkPrint({ designId: 'd', fit: 'contain' });

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      code: 'PRINTFUL_NOT_CONNECTED',
      details: { a: 1 },
    });
  });

  it('forwards events and stops when asked', () => {
    const { bridge, listeners } = fakeBridge();
    const api = createDesktopApi(bridge);
    const progress = vi.fn();
    const changed = vi.fn();
    const batch = vi.fn();

    const stopProgress = api.onImportProgress(progress);
    api.onCatalogChanged(changed);
    api.onBatchChanged(batch);
    listeners.get(IPC_EVENTS.importProgress)?.({ done: 1 });
    listeners.get(IPC_EVENTS.catalogChanged)?.('ignored');
    listeners.get(IPC_EVENTS.batchChanged)?.({ job: null });
    stopProgress();

    expect(progress).toHaveBeenCalledWith({ done: 1 });
    expect(changed).toHaveBeenCalledWith();
    expect(batch).toHaveBeenCalledWith({ job: null });
    expect(listeners.has(IPC_EVENTS.importProgress)).toBe(false);
  });
});
