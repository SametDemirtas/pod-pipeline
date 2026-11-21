import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** Deletes downloads a crash or force quit left behind; a missing folder is fine. */
export async function removeLeftoverDownloads(directory: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await Promise.all(
    names
      .filter((name) => /\.download(\.[a-z]+)?$/.test(name))
      .map((name) => rm(join(directory, name), { force: true })),
  );
}
