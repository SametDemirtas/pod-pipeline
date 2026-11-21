import { describe, expect, it } from 'vitest';
import type { AssetInventory } from '../ports/files.js';
import { RemoveUnusedAssets } from './remove-unused-assets.js';

class MemoryInventory implements AssetInventory {
  constructor(
    readonly keys: Set<string>,
    private readonly locked = new Set<string>(),
  ) {}

  listKeys(): Promise<readonly string[]> {
    return Promise.resolve([...this.keys]);
  }

  remove(storageKey: string): Promise<void> {
    if (this.locked.has(storageKey)) return Promise.reject(new Error('EBUSY'));
    this.keys.delete(storageKey);
    return Promise.resolve();
  }
}

describe('RemoveUnusedAssets', () => {
  it('removes only files nothing refers to', async () => {
    const inventory = new MemoryInventory(new Set(['aa/a.png', 'bb/b.png', 'cc/c.png']));
    const references = { referencedKeys: () => Promise.resolve(new Set(['bb/b.png'])) };

    expect(await new RemoveUnusedAssets(inventory, references).execute()).toBe(2);
    expect([...inventory.keys]).toEqual(['bb/b.png']);
  });

  it('keeps files it cannot remove now and counts only the removed ones', async () => {
    const inventory = new MemoryInventory(new Set(['aa/a.png', 'bb/b.png']), new Set(['aa/a.png']));
    const references = { referencedKeys: () => Promise.resolve(new Set<string>()) };

    expect(await new RemoveUnusedAssets(inventory, references).execute()).toBe(1);
    expect([...inventory.keys]).toEqual(['aa/a.png']);
  });
});
