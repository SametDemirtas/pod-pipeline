import { open } from 'node:fs/promises';

/**
 * Flushes a folder's entries so a rename into it survives a power cut. Best
 * effort: Windows cannot open folders, and some network or FUSE file systems
 * refuse to flush them; the rename itself has already succeeded.
 */
export async function syncFolder(folder: string): Promise<void> {
  try {
    const handle = await open(folder, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // The data is in place; only the extra durability guarantee is lost.
  }
}
