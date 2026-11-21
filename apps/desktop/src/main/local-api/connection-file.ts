import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { LOCAL_API_CONNECTION_FILE, type LocalApiConnection } from '@pod/contracts';
import { writeFileAtomically } from '../files/write-file-atomically.js';

/**
 * Publishes how to reach the local API and returns a function that withdraws
 * it again. On macOS and Linux only the current user can read the file; on
 * Windows it relies on the data folder being private to the user.
 */
export async function publishConnection(
  dataDirectory: string,
  connection: LocalApiConnection,
): Promise<() => Promise<void>> {
  const file = join(dataDirectory, LOCAL_API_CONNECTION_FILE);
  await writeFileAtomically(file, JSON.stringify(connection), 0o600);
  return () => rm(file, { force: true });
}
