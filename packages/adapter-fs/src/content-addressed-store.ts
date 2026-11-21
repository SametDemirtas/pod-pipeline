import { createHash, randomUUID } from 'node:crypto';
import { constants, type Dirent } from 'node:fs';
import { lstat, mkdir, open, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  ImportPlanChangedError,
  type AssetInventory,
  type AssetStore,
  type ImageMimeType,
  type StoredAsset,
} from '@pod/core';
import { extensionFor, STORAGE_KEY } from './image-formats.js';
import { hasSize, renameWithRetry } from './rename-with-retry.js';
import { syncFolder } from './sync-folder.js';

/** Refuses to open a symbolic link where the platform supports it (not on Windows). */
const READ_WITHOUT_FOLLOWING =
  constants.O_RDONLY | ('O_NOFOLLOW' in constants ? constants.O_NOFOLLOW : 0);
const TEMPORARY_FOLDER = '.incoming';

/**
 * Stores each file once under a path derived from its SHA-256, e.g.
 * `ab/abcdef….png`. The copy is hashed while it is written, flushed to disk
 * and then renamed into place, so a stored file always matches its key.
 */
export class ContentAddressedStore implements AssetStore, AssetInventory {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(absolutePath: string, mimeType: ImageMimeType): Promise<StoredAsset> {
    const incoming = join(this.root, TEMPORARY_FOLDER);
    await mkdir(incoming, { recursive: true });
    const temporary = join(incoming, `${randomUUID()}.tmp`);

    try {
      const { sha256, byteSize } = await copyAndHash(absolutePath, temporary);
      const storageKey = `${sha256.slice(0, 2)}/${sha256}.${extensionFor(mimeType)}`;
      const target = this.pathOf(storageKey);

      if (!(await hasSize(target, byteSize))) {
        const newShard = await mkdir(dirname(target), { recursive: true });
        await renameWithRetry(temporary, target, { sameSize: byteSize });
        await syncFolder(dirname(target));
        // A new shard folder is itself an entry of the root, which then needs flushing too.
        if (newShard !== undefined) await syncFolder(this.root);
      }
      return { storageKey, sha256, byteSize };
    } finally {
      try {
        await rm(temporary, { force: true });
      } catch {
        // A leftover copy is harmless and removed at the next start-up.
      }
    }
  }

  /** Absolute path of a stored asset. Accepts only keys this store produces. */
  pathOf(storageKey: string): string {
    if (!STORAGE_KEY.test(storageKey)) throw new Error(`Invalid storage key "${storageKey}"`);
    return join(this.root, ...storageKey.split('/'));
  }

  /** Keys of every stored file; anything else in the folder is ignored. */
  async listKeys(): Promise<readonly string[]> {
    const keys: string[] = [];
    const folders = (await entriesIn(this.root)).filter((entry) => entry.isDirectory());
    for (const { name: folder } of folders) {
      for (const { name } of await entriesIn(join(this.root, folder))) {
        const key = `${folder}/${name}`;
        if (STORAGE_KEY.test(key)) keys.push(key);
      }
    }
    return keys;
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.pathOf(storageKey), { force: true });
  }

  /**
   * Deletes copies left behind by an interrupted import. Call once at start-up.
   * A copy that cannot be deleted yet, e.g. while a virus scanner holds it, is
   * left for the next start.
   */
  async removeTemporaryFiles(): Promise<void> {
    const incoming = join(this.root, TEMPORARY_FOLDER);
    const entries = await entriesIn(incoming);
    await Promise.all(
      entries.map(({ name }) => rm(join(incoming, name), { force: true }).catch(() => undefined)),
    );
  }
}

/** The folder's entries; none when it does not exist yet. */
async function entriesIn(folder: string): Promise<Dirent[]> {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function copyAndHash(
  source: string,
  target: string,
): Promise<{ sha256: string; byteSize: number }> {
  const hash = createHash('sha256');
  let byteSize = 0;
  const input = await openWithoutFollowing(source);
  let output;
  try {
    output = await open(target, 'wx');
  } catch (error) {
    await input.close();
    throw error;
  }
  try {
    for await (const chunk of input.createReadStream()) {
      const bytes = chunk as Buffer;
      hash.update(bytes);
      byteSize += bytes.length;
      await output.write(bytes);
    }
    await output.sync();
  } finally {
    await output.close();
  }
  return { sha256: hash.digest('hex'), byteSize };
}

/**
 * The scan never follows links, so a link found here was swapped in after the
 * preview; reading through it could copy a file from outside the chosen folder.
 */
async function openWithoutFollowing(path: string) {
  if ((await lstat(path)).isSymbolicLink()) throw new ImportPlanChangedError();
  try {
    return await open(path, READ_WITHOUT_FOLLOWING);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') throw new ImportPlanChangedError();
    throw error;
  }
}
