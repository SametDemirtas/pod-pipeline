import type { AssetInventory, AssetReferences } from '../ports/files.js';

/**
 * Deletes stored files no design, revision or mockup refers to, such as photos
 * of replaced mockups or copies left by a run that failed halfway. Run it when
 * nothing else writes, at start-up: a file stored a moment ago has no record yet.
 */
export class RemoveUnusedAssets {
  constructor(
    private readonly inventory: AssetInventory,
    private readonly references: AssetReferences,
  ) {}

  /** Resolves with the number of files removed; files that cannot be removed now are kept. */
  async execute(): Promise<number> {
    const referenced = await this.references.referencedKeys();
    const unused = (await this.inventory.listKeys()).filter((key) => !referenced.has(key));
    const results = await Promise.allSettled(unused.map((key) => this.inventory.remove(key)));
    return results.filter((result) => result.status === 'fulfilled').length;
  }
}
