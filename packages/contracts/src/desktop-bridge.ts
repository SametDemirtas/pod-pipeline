import type { IPC_CHANNELS, IPC_EVENTS } from './api.js';
import type { ApiResult } from './errors.js';

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];

/**
 * What the preload script exposes. Results cross the bridge as plain data,
 * because Electron's context bridge drops everything but the message of an
 * error, so the window turns failed results into errors itself.
 */
export interface DesktopBridge {
  invoke(channel: IpcChannel, request?: unknown): Promise<ApiResult<unknown>>;
  /** Returns a function that stops listening. */
  on(event: IpcEvent, listener: (payload: unknown) => void): () => void;
}
