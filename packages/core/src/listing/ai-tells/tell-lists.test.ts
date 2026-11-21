import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findAiTells } from './find-ai-tells.js';
import { findTellHits, matchable, parseTellList } from './tell-patterns.js';

interface ListEntry {
  readonly id: string;
  readonly why: string;
  readonly example: string;
  readonly rewrite: string;
  readonly falsePositives?: readonly string[];
}

const folder = new URL('.', import.meta.url);
const lists = readdirSync(folder)
  .filter((name) => name.endsWith('.json') && !name.endsWith('.cases.json'))
  .map((name) => {
    const list = JSON.parse(readFileSync(new URL(name, folder), 'utf8')) as {
      readonly language: string;
      readonly patterns: readonly ListEntry[];
    };
    return { name, list, compiled: parseTellList(list) };
  });

describe('the tell lists', () => {
  it('cover the shop languages with their own lists, one file each', () => {
    expect(lists.map(({ name }) => name)).toEqual([
      'de.json',
      'en.json',
      'es.json',
      'fr.json',
      'it.json',
      'nl.json',
      'pt.json',
    ]);
    for (const { name, list } of lists) expect(`${list.language}.json`).toBe(name);
  });

  describe.each(lists)('$name', ({ list, compiled }) => {
    it('has unique ids in the language and explains every pattern', () => {
      const ids = list.patterns.map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const entry of list.patterns) {
        expect(entry.id.startsWith(`${list.language}-`)).toBe(true);
        expect(entry.why && entry.example && entry.rewrite).toBeTruthy();
      }
    });

    it.each(list.patterns.map((entry, index) => [entry.id, entry, index] as const))(
      '%s finds its example but not the rewrite or ordinary words',
      (_, entry, index) => {
        const pattern = compiled.slice(index, index + 1);
        expect(findTellHits(matchable(entry.example), pattern)).not.toEqual([]);
        expect(findTellHits(matchable(entry.rewrite), pattern)).toEqual([]);
        for (const ordinary of entry.falsePositives ?? []) {
          expect(findTellHits(matchable(ordinary), pattern)).toEqual([]);
        }
      },
    );

    it('finds nothing in the rewrites', () => {
      const rewrites = list.patterns.map((entry) => entry.rewrite).join('\n');
      expect(findAiTells({ title: '', description: rewrites, tags: [] }, list.language)).toEqual(
        [],
      );
    });
  });
});
