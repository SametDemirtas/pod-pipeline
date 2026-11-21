import { describe, expect, it, vi } from 'vitest';
import { closingWork, type ClosingParts } from './closing-work.js';

const NAMES = [
  'batch',
  'scheduler',
  'pins',
  'catalog',
  'print',
  'listings',
  'research',
  'scenes',
  'upscale',
  'rotation',
  'connections',
] as const;

describe('closingWork', () => {
  it('waits longer for the batch and listings, which may leave a draft on Etsy', async () => {
    const parts = Object.fromEntries(
      NAMES.map((name) => [name, { close: vi.fn(() => Promise.resolve()) }]),
    ) as unknown as ClosingParts;

    const work = closingWork(parts);
    for (const item of work) await item.close();

    const limits = new Map(NAMES.map((name, index) => [name, work[index]?.withinMs]));
    const longer = NAMES.filter((name) => (limits.get(name) ?? 0) > (limits.get('pins') ?? 0));
    expect(longer).toEqual(['batch', 'listings']);
    expect(
      new Set(NAMES.filter((name) => !longer.includes(name)).map((n) => limits.get(n))).size,
    ).toBe(1);
    for (const name of NAMES) expect(parts[name].close).toHaveBeenCalledOnce();
  });
});
