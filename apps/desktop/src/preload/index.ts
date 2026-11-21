import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type ApiResult,
  type DesktopBridge,
} from '@pod/contracts/client';

const CHANNELS: ReadonlySet<string> = new Set(Object.values(IPC_CHANNELS));
const EVENTS: ReadonlySet<string> = new Set(Object.values(IPC_EVENTS));

// Only the app's own channels pass, so the page can never reach other IPC.
const bridge: DesktopBridge = {
  invoke: (channel, request) => {
    if (!CHANNELS.has(channel)) return Promise.reject(new Error(`Unknown channel ${channel}`));
    return ipcRenderer.invoke(channel, request) as Promise<ApiResult<unknown>>;
  },
  on: (event, listener) => {
    if (!EVENTS.has(event)) throw new Error(`Unknown event ${event}`);
    const handler = (_event: unknown, payload: unknown) => {
      listener(payload);
    };
    ipcRenderer.on(event, handler);
    return () => {
      ipcRenderer.removeListener(event, handler);
    };
  },
};

contextBridge.exposeInMainWorld('pod', bridge);
