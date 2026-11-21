import { describe, expect, it } from 'vitest';
import { findTellHits, matchable, parseTellList, withoutDiacritics } from './tell-patterns.js';

const entry = { id: 'xx-a', kind: 'word', match: 'grand', category: 'hype', precision: 'high' };

describe('parseTellList', () => {
  it('reads words, phrases with gaps and regular expressions', () => {
    const patterns = parseTellList({
      language: 'xx',
      version: 1,
      patterns: [
        entry,
        { ...entry, id: 'xx-b', kind: 'phrase', match: 'so … that' },
        { ...entry, id: 'xx-c', kind: 'regex', match: '\\d+ stars', precision: 'medium' },
      ],
    });

    expect(
      findTellHits(matchable('Grand, so very grand that 5 stars. Grandeur.'), patterns),
    ).toEqual([
      { id: 'xx-a', category: 'hype', precision: 'high', match: 'Grand', index: 0 },
      { id: 'xx-a', category: 'hype', precision: 'high', match: 'grand', index: 15 },
      { id: 'xx-b', category: 'hype', precision: 'high', match: 'so very grand that', index: 7 },
      { id: 'xx-c', category: 'hype', precision: 'medium', match: '5 stars', index: 26 },
    ]);
  });

  it('ignores diacritics but the tilde of ñ, and reports the match as the text has it', () => {
    const patterns = parseTellList({
      language: 'xx',
      patterns: [
        { ...entry, match: 'mas que una' },
        { ...entry, id: 'xx-b', kind: 'regex', match: 'decoración' },
        { ...entry, id: 'xx-c', match: 'año' },
      ],
    });

    expect(
      findTellHits(matchable('MÁS QUE UNA taza, decoracion para el ano y el año.'), patterns),
    ).toEqual([
      { id: 'xx-a', category: 'hype', precision: 'high', match: 'MÁS QUE UNA', index: 0 },
      { id: 'xx-b', category: 'hype', precision: 'high', match: 'decoracion', index: 18 },
      { id: 'xx-c', category: 'hype', precision: 'high', match: 'año', index: 46 },
    ]);
  });

  it('bridges a gap in a phrase only between whole words', () => {
    const patterns = parseTellList({
      language: 'xx',
      patterns: [
        { ...entry, kind: 'phrase', match: 'no solo … sino' },
        { ...entry, id: 'xx-b', kind: 'phrase', match: 'not just … but' },
      ],
    });
    const found = (text: string) =>
      findTellHits(matchable(text), patterns).map(({ match }) => match);

    expect(found('No solo para el casino, sino para casa.')).toEqual([
      'No solo para el casino, sino',
    ]);
    expect(found('No solomillo ni sino.')).toEqual([]);
    expect(found('It is not just pretty: my debut print.')).toEqual([]);
  });

  it('keeps diacritics for a list that tells words apart by them', () => {
    const patterns = parseTellList({
      language: 'xx',
      foldDiacritics: false,
      patterns: [{ ...entry, match: 'è uno stile' }],
    });

    expect(
      findTellHits(matchable('È uno stile. E uno stile.'), patterns).map(({ match }) => match),
    ).toEqual(['È uno stile']);
  });

  it('refuses a list it cannot read, naming the pattern', () => {
    expect(() => parseTellList(null)).toThrow('A tell list names no language');
    expect(() => parseTellList({ language: 'xx' })).toThrow('xx: the list has no patterns');
    expect(() => parseTellList({ language: 'xx', patterns: ['word'] })).toThrow(
      'xx: a pattern is not an object',
    );
    expect(() => parseTellList({ language: 'xx', foldDiacritics: 'no', patterns: [] })).toThrow(
      'xx: foldDiacritics is not true or false',
    );
    for (const open of ['… sino', 'no solo …']) {
      expect(() =>
        parseTellList({ language: 'xx', patterns: [{ ...entry, kind: 'phrase', match: open }] }),
      ).toThrow('xx: pattern "xx-a" is incomplete');
    }
    for (const broken of [
      { ...entry, kind: 'glob' },
      { ...entry, category: 'rude' },
      { ...entry, precision: 'low' },
      { ...entry, match: ' ' },
    ]) {
      expect(() => parseTellList({ language: 'xx', patterns: [broken] })).toThrow(
        'xx: pattern "xx-a" is incomplete',
      );
    }
  });
});

describe('matchable', () => {
  it('composes accents and straightens apostrophes and spaces without moving characters', () => {
    expect(matchable('cafe\u0301 it’s l‘amore\u00A0d´oro')).toBe("café it's l'amore d'oro");
  });
});

describe('withoutDiacritics', () => {
  it('drops diacritics but the tilde of ñ, one character for one', () => {
    expect(withoutDiacritics('Créée für Año ÑANDÚ')).toBe('Creee fur Año ÑANDU');
    const other = '한국어 ✨ ΐ ǅ';
    expect(withoutDiacritics(other)).toHaveLength(other.length);
  });
});
