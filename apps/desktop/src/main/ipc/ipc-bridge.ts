import { IPC_CHANNELS, type ApiResult } from '@pod/contracts';
import { invoke } from '../api/invoke.js';
import type { Operation } from '../api/operations.js';
import { toApiError, type ErrorLogger } from '../api/to-api-error.js';
import { AppClosingError } from '../shared/app-error.js';

/** The part of Electron's `ipcMain` the bridge needs. */
export interface IpcRegistrar {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

export interface IpcBridgeOptions {
  /** Rejects requests that do not come from the app's own window. */
  readonly isTrustedSender: (event: unknown) => boolean;
  /** Once the app begins to close, every request is refused. */
  readonly isClosing: () => boolean;
  readonly log: ErrorLogger;
}

/** Not a request the window could fix by sending other input, so not `INVALID_REQUEST`. */
const UNTRUSTED: ApiResult<never> = {
  ok: false,
  error: { code: 'INTERNAL', message: 'Untrusted sender', details: {} },
};

/** Serves each operation on its IPC channel; replies are always `ApiResult`s. */
export function registerIpc(
  ipc: IpcRegistrar,
  operations: readonly Operation[],
  options: IpcBridgeOptions,
): void {
  for (const operation of operations) {
    ipc.handle(IPC_CHANNELS[operation.name], (event, ...args) => {
      if (!options.isTrustedSender(event)) return Promise.resolve(UNTRUSTED);
      if (options.isClosing()) return Promise.resolve(closingResult(options.log));
      return invoke(operation, args[0], options.log);
    });
  }
}

function closingResult(log: ErrorLogger): ApiResult<never> {
  return { ok: false, error: toApiError(new AppClosingError(), log) };
}
