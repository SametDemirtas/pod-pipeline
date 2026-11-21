import { reasonOf } from '../../shared/app-error.js';
import {
  ConnectionFailedError,
  PrintfulTokenNotSingleStoreError,
} from '../errors/connection-errors.js';
import type { SecretName } from './secret-store.js';

/** Runs a check with a service, failing as a connection to that service that did not work. */
export async function checked<T>(service: SecretName, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PrintfulTokenNotSingleStoreError) throw error;
    throw new ConnectionFailedError(service, reasonOf(error));
  }
}
