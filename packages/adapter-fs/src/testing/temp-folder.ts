import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';

export const isWindows = process.platform === 'win32';
/** Taking away read access means nothing to root, and Windows has no chmod. */
export const canRevokeAccess = !isWindows && process.getuid?.() !== 0;

/** A fresh folder for each test, removed afterwards. */
export function useTempFolder(prefix: string) {
  let path = '';
  beforeEach(() => {
    path = mkdtempSync(join(tmpdir(), prefix));
  });
  afterEach(() => {
    rmSync(path, { recursive: true, force: true });
  });
  return {
    get path() {
      return path;
    },
    /** Writes a file at a path relative to the folder, making its parent folders. */
    write(relativePath: string, contents: string | Buffer): string {
      const file = join(path, ...relativePath.split('/'));
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, contents);
      return file;
    },
  };
}

export function sha256(contents: string | Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}
