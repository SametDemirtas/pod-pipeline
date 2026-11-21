import { describe, expect, it } from 'vitest';
import type { ListingText } from '../listing-text.js';
import { aiTellsNotIn, findAiTells } from './find-ai-tells.js';
import { findTellHits, matchable, parseTellList } from './tell-patterns.js';
import { referenceHits } from './testing/reference-matcher.js';
import esCases from './es.cases.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import itCases from './it.cases.json' with { type: 'json' };
import it_ from './it.json' with { type: 'json' };
import nlCases from './nl.cases.json' with { type: 'json' };
import nl from './nl.json' with { type: 'json' };

interface ListEntry {
  readonly id: string;
  readonly kind: string;
  readonly match: string;
  readonly precision: string;
  readonly example: string;
  readonly rewrite: string;
  readonly falsePositives: readonly string[];
}

interface ListCase {
  readonly text: string;
  readonly hits?: readonly string[];
  /** Entries that must not fire, or `all`. */
  readonly misses?: readonly string[] | string;
}

interface MeasuredList {
  readonly language: string;
  readonly foldDiacritics?: boolean;
  readonly patterns: readonly ListEntry[];
}

/** The lists taken from the humanizer-lists project, which measured them as written, with its cases. */
const MEASURED: readonly (readonly [MeasuredList, { readonly cases: readonly ListCase[] }])[] = [
  [es, esCases],
  [it_, itCases],
  [nl, nlCases],
];

/** A language with no list, so only marks are checked. */
const MARKS_ONLY = 'und';

/** The print's quoted words are left alone with their quote marks, so this entry cannot fire. */
const QUOTED_ONLY = new Set(['it-caporali']);

const described = (description: string): ListingText => ({ title: '', description, tags: [] });

describe.each(MEASURED.map(([list, { cases }]) => [list.language, list, cases] as const))(
  'the %s list in the detector',
  (language, list, cases) => {
    const compiled = parseTellList(list);
    const entries = list.patterns.map((entry, index) => [entry.id, entry, index] as const);
    const weak = list.patterns.filter(
      (entry) => entry.precision === 'medium' && !QUOTED_ONLY.has(entry.id),
    );

    it.each(entries.filter(([id]) => !QUOTED_ONLY.has(id)))(
      '%s is reported in its example, a medium one next to another weak sign',
      (_, entry, index) => {
        const found = findTellHits(matchable(entry.example), compiled.slice(index, index + 1));
        const company = weak.find((other) => other.id !== entry.id)?.example ?? '';
        const text = entry.precision === 'high' ? entry.example : `${entry.example}\n${company}`;
        const tells = findAiTells(described(text), language);

        expect(found.some(({ match }) => tells.some((tell) => tell.match.includes(match)))).toBe(
          true,
        );
      },
    );

    it.each(entries)('%s adds no tell of the list to its false positives', (_, entry) => {
      for (const ordinary of entry.falsePositives) {
        const tells = findAiTells(described(ordinary), language);
        expect(aiTellsNotIn(tells, findAiTells(described(ordinary), MARKS_ONLY))).toEqual([]);
      }
    });

    it.each(cases.map((testCase, index) => [index + 1, testCase] as const))(
      'case %i of the list project holds',
      (_, { text, hits = [], misses = [] }) => {
        const fired = new Set(findTellHits(matchable(text), compiled).map(({ id }) => id));
        for (const id of hits) expect(fired).toContain(id);
        if (misses === 'all') expect([...fired]).toEqual([]);
        else for (const id of misses) expect(fired).not.toContain(id);
      },
    );

    it('matches every text of the list just as the list project matcher does', () => {
      const texts = [
        ...list.patterns.flatMap((entry) => [
          entry.example,
          entry.rewrite,
          ...entry.falsePositives,
        ]),
        ...cases.map(({ text }) => text),
      ];
      for (const text of texts) {
        const found = findTellHits(matchable(text), compiled).map(({ id, index, match }) => ({
          id,
          index,
          length: match.length,
        }));
        expect(found).toEqual(referenceHits(list, text));
      }
    });
  },
);
