import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { format } from 'node:util';
import { redact } from '../shared/redact.js';
import { SerialQueue } from '../shared/serial-queue.js';

/**
 * At start, a log larger than this becomes the old log and a new one begins;
 * a log of exactly this size or less is kept. Only one old log is kept.
 */
export const MAX_LOG_BYTES = 1024 * 1024;

/**
 * The main process's error log, `main.log` in `folder`. Packaged builds have
 * no console, so this is what users can attach to a bug report. Writes never
 * fail the caller; a log that cannot be written is simply missing.
 */
export class MainLog {
  private readonly writes = new SerialQueue();
  /** Where the log is, to point users to it. */
  readonly path: string;

  constructor(folder: string) {
    this.path = join(folder, 'main.log');
    void this.writes
      .run(async () => {
        await mkdir(folder, { recursive: true });
        const size = await stat(this.path).then(
          (stats) => stats.size,
          () => 0,
        );
        if (size > MAX_LOG_BYTES) await rename(this.path, join(folder, 'main.old.log'));
      })
      .catch(() => undefined);
  }

  /** Resolves once the error is written, or could not be. */
  write(error: unknown): Promise<void> {
    const line = `${new Date().toISOString()} ${redact(format(error))}\n`;
    return this.writes.run(() => appendFile(this.path, line)).catch(() => undefined);
  }
}
