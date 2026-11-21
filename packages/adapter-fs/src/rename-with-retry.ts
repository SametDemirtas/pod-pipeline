import { rename as renameFile, stat } from 'node:fs/promises';

/** Windows briefly locks fresh files while antivirus or the indexer scans them. */
const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY']);
const ATTEMPTS = 6;
/** Half the first wait between attempts, 50 ms; the wait doubles after every failure. */
const BASE_DELAY_MS = 25;

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export interface RenameOptions {
  /** The size a copy at the target has when a concurrent writer already stored the same file. */
  readonly sameSize?: number;
  readonly rename?: (from: string, to: string) => Promise<void>;
  readonly wait?: (milliseconds: number) => Promise<void>;
}

/**
 * Moves a finished copy into place, retrying the transient locks Windows
 * places on new files. With `sameSize`, succeeds when a concurrent writer
 * already stored a file of that size there, which by content addressing is
 * the same file.
 */
export async function renameWithRetry(
  from: string,
  to: string,
  { sameSize, rename = renameFile, wait = sleep }: RenameOptions = {},
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      // A target that cannot be read is not the same file; the rename's own error is reported.
      const stored = sameSize !== undefined && (await hasSize(to, sameSize).catch(() => false));
      if (stored) return;
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!RETRYABLE.has(code) || attempt >= ATTEMPTS) throw error;
      await wait(BASE_DELAY_MS * 2 ** attempt);
    }
  }
}

export async function hasSize(path: string, byteSize: number): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile() && stats.size === byteSize;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
