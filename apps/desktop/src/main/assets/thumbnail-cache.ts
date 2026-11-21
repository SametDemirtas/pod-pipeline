import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeFileAtomically } from '../files/write-file-atomically.js';

export interface ThumbnailRenderer {
  /** Returns PNG bytes of the image scaled down to `width` pixels. */
  render(sourcePath: string, width: number): Promise<Uint8Array>;
}

/**
 * Keeps scaled-down copies of stored assets on disk. Stored assets never
 * change (their name is their hash), so a cached thumbnail never goes stale.
 */
export class ThumbnailCache {
  private readonly pending = new Map<string, Promise<string>>();

  constructor(
    private readonly directory: string,
    private readonly renderer: ThumbnailRenderer,
  ) {}

  /** Path of the thumbnail for `storageKey`, rendering it on first use. */
  get(storageKey: string, sourcePath: string, width: number): Promise<string> {
    const target = join(this.directory, String(width), thumbnailName(storageKey));
    const inFlight = this.pending.get(target);
    if (inFlight) return inFlight;

    const work = this.ensure(target, sourcePath, width).finally(() => {
      this.pending.delete(target);
    });
    this.pending.set(target, work);
    return work;
  }

  /** Deletes the thumbnails of assets that are no longer stored. */
  async removeAllBut(storageKeys: readonly string[]): Promise<void> {
    const kept = new Set(storageKeys.map(thumbnailName));
    // Missing folders, and stray files where a width folder belongs, hold nothing to remove.
    const widths = await readdir(this.directory).catch(() => []);
    for (const width of widths) {
      const folder = join(this.directory, width);
      const names = await readdir(folder).catch(() => []);
      await Promise.all(
        names
          .filter((name) => !kept.has(name))
          .map((name) => rm(join(folder, name), { force: true })),
      );
    }
  }

  private async ensure(target: string, sourcePath: string, width: number): Promise<string> {
    if (await exists(target)) return target;

    const bytes = await this.renderer.render(sourcePath, width);
    await mkdir(dirname(target), { recursive: true });
    await writeFileAtomically(target, bytes);
    return target;
  }
}

function thumbnailName(storageKey: string): string {
  return `${storageKey.replace(/\//g, '-').replace(/\.\w+$/, '')}.png`;
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
