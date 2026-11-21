import { randomUUID } from 'node:crypto';
import { open, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { renameWithRetry, syncFolder } from '@pod/adapter-fs';

/**
 * Writes `data` to a temporary file next to `path` and renames it into place,
 * so readers see either the old or the new contents, never half of either.
 * The file reaches the disk before the rename and the folder is flushed after
 * it where the file system allows, so a power cut cannot leave an empty
 * settings or secrets file behind.
 */
export async function writeFileAtomically(
  path: string,
  data: string | Uint8Array,
  mode = 0o644,
): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'w', mode);
    try {
      await file.writeFile(data);
      await file.datasync();
    } finally {
      await file.close();
    }
    await renameWithRetry(temporary, path);
    await syncFolder(dirname(path));
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
