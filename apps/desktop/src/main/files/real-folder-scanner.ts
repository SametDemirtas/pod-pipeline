import { realpath } from 'node:fs/promises';
import type { ScanResult, SourceScanner } from '@pod/core';

/**
 * Scans only a folder that is still the real folder that was approved: if
 * it was swapped for a link after the approval check, the scan is refused.
 */
export class RealFolderScanner implements SourceScanner {
  constructor(private readonly inner: SourceScanner) {}

  async scan(rootPath: string, maxDepth: number): Promise<ScanResult> {
    // A link, or a folder inside one, resolves to another path.
    if ((await realpath(rootPath)) !== rootPath) {
      throw new Error(`${rootPath} is no longer the folder that was approved`);
    }
    return this.inner.scan(rootPath, maxDepth);
  }
}
