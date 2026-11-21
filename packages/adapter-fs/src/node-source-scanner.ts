import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  compareCodeUnits,
  type ScanResult,
  type ScanSkip,
  type SourceFile,
  type SourceScanner,
} from '@pod/core';

/** Entries operating systems create on their own; never part of a design folder. */
const SYSTEM_ENTRIES = new Set([
  'thumbs.db',
  'ehthumbs.db',
  'desktop.ini',
  '$recycle.bin',
  'system volume information',
  '__macosx',
]);

/** Errors that make one entry unreadable without making the whole folder unreadable. */
const UNREADABLE = new Set(['EACCES', 'EPERM', 'EBUSY']);

interface Walk {
  readonly files: SourceFile[];
  readonly skipped: ScanSkip[];
}

/**
 * Walks a folder without following symbolic links, so a link can never pull
 * in files from outside the folder the user picked. Relative paths use `/`
 * and Unicode NFC on every platform. Folders that are too deep or cannot be
 * read are reported, never silently dropped.
 */
export class NodeSourceScanner implements SourceScanner {
  async scan(rootPath: string, maxDepth: number): Promise<ScanResult> {
    const rootStats = await stat(rootPath);
    if (!rootStats.isDirectory()) throw new Error(`${rootPath} is not a folder`);

    const walk: Walk = { files: [], skipped: [] };
    await this.walk(walk, rootPath, [], maxDepth, await readdir(rootPath, { withFileTypes: true }));
    walk.files.sort((a, b) => compareCodeUnits(a.relativePath, b.relativePath));
    walk.skipped.sort((a, b) => compareCodeUnits(a.relativePath, b.relativePath));
    return walk;
  }

  private async walk(
    walk: Walk,
    folder: string,
    segments: readonly string[],
    depthLeft: number,
    entries: readonly Dirent[],
  ): Promise<void> {
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SYSTEM_ENTRIES.has(entry.name.toLowerCase())) continue;
      const absolutePath = join(folder, entry.name);
      const path = [...segments, entry.name.normalize('NFC')];
      const relativePath = path.join('/');

      try {
        if (entry.isDirectory()) {
          if (depthLeft === 0) {
            walk.skipped.push({ relativePath, reason: 'too-deep' });
            continue;
          }
          const children = await readdir(absolutePath, { withFileTypes: true });
          await this.walk(walk, absolutePath, path, depthLeft - 1, children);
        } else if (entry.isFile()) {
          const { size } = await stat(absolutePath);
          walk.files.push({ relativePath, absolutePath, byteSize: size });
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException | undefined)?.code ?? '';
        if (UNREADABLE.has(code)) walk.skipped.push({ relativePath, reason: 'unreadable' });
        else if (code !== 'ENOENT') throw error;
      }
    }
  }
}
