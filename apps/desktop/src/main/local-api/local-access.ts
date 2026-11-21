import { randomBytes } from 'node:crypto';
import { LOCAL_API_VERSION, type CatalogApi } from '@pod/contracts';
import { catalogOperations } from '../api/operations.js';
import type { ErrorLogger } from '../api/to-api-error.js';
import { publishConnection } from './connection-file.js';
import { startLocalApi } from './local-api-server.js';

/**
 * Opens the catalog to local tools for as long as the app runs: starts the
 * local API with a fresh token and publishes where to find it. Returns a
 * function that closes the API and withdraws the connection details.
 */
export async function openLocalAccess(
  dataDirectory: string,
  catalog: CatalogApi,
  log: ErrorLogger,
): Promise<() => Promise<void>> {
  const token = randomBytes(32).toString('base64url');
  const api = await startLocalApi({ operations: catalogOperations(catalog), token, log });
  let withdraw: () => Promise<void>;
  try {
    withdraw = await publishConnection(dataDirectory, {
      apiVersion: LOCAL_API_VERSION,
      url: api.url,
      token,
    });
  } catch (error) {
    await api.close();
    throw error;
  }

  return async () => {
    await withdraw();
    await api.close();
  };
}
