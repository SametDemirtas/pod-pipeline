import {
  IPC_CHANNELS,
  IPC_EVENTS,
  unwrapResult,
  type DesktopApi,
  type DesktopBridge,
  type IpcChannel,
} from '@pod/contracts/client';

/** The desktop API on top of the preload bridge. */
export function createDesktopApi(bridge: DesktopBridge): DesktopApi {
  const call =
    (channel: IpcChannel) =>
    async (request?: unknown): Promise<unknown> =>
      unwrapResult(await bridge.invoke(channel, request));
  // IPC_CHANNELS has a channel for every operation, so each gets its call.
  const operations = Object.fromEntries(
    Object.entries(IPC_CHANNELS).map(([name, channel]) => [name, call(channel)]),
  ) as Omit<DesktopApi, `on${string}`>;

  return {
    ...operations,
    onImportProgress: (listener) =>
      bridge.on(IPC_EVENTS.importProgress, (payload) => {
        listener(payload as Parameters<typeof listener>[0]);
      }),
    onCatalogChanged: (listener) =>
      bridge.on(IPC_EVENTS.catalogChanged, () => {
        listener();
      }),
    onBatchChanged: (listener) =>
      bridge.on(IPC_EVENTS.batchChanged, (payload) => {
        listener(payload as Parameters<typeof listener>[0]);
      }),
    onUpscaleProgress: (listener) =>
      bridge.on(IPC_EVENTS.upscaleProgress, (payload) => {
        listener(payload as Parameters<typeof listener>[0]);
      }),
  };
}
