import { describe, expect, it } from 'vitest';
import { RESOURCES } from '../i18n.js';

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function leafValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(leafValues);
}

/** The `{{placeholders}}` and `<tags>` each text uses, by its key. */
function marks(value: unknown, prefix = ''): Map<string, string[]> {
  if (typeof value === 'string') {
    const found = value.match(/\{\{\s*\w+|<\/?\w+\s*\/?>/g) ?? [];
    return new Map([[prefix, [...new Set(found.map((mark) => mark.replace(/\s/g, '')))].sort()]]);
  }
  if (typeof value !== 'object' || value === null) return new Map();
  return new Map(
    Object.entries(value).flatMap(([key, child]) => [
      ...marks(child, prefix ? `${prefix}.${key}` : key),
    ]),
  );
}

describe('translations', () => {
  const english = leafPaths(RESOURCES.en.translation).sort();

  it.each(['tr', 'de'] as const)('%s has exactly the English keys', (language) => {
    expect(leafPaths(RESOURCES[language].translation).sort()).toEqual(english);
  });

  it.each(['tr', 'de'] as const)(
    '%s uses the same placeholders and tags as English',
    (language) => {
      const english = marks(RESOURCES.en.translation);
      const translated = marks(RESOURCES[language].translation);
      for (const [path, expected] of english) {
        expect([path, translated.get(path)]).toEqual([path, expected]);
      }
    },
  );

  it.each(['en', 'tr', 'de'] as const)('%s has no empty texts or long dashes', (language) => {
    for (const text of leafValues(RESOURCES[language].translation)) {
      expect(text.trim()).not.toBe('');
      expect(text).not.toMatch(/[–—]/);
    }
  });
});
