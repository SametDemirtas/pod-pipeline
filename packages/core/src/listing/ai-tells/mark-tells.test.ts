import { describe, expect, it } from 'vitest';
import { markTells } from './mark-tells.js';

const described = (description: string) =>
  markTells({ title: 'Tulip Mug', description, tags: '' }, 'en').map(({ match, index }) => ({
    match,
    index,
  }));

describe('markTells', () => {
  it('places fragments on separate lines where they stand, with what lies between them', () => {
    const description = 'A mug with a tulip.\nSoft.\nWarm.  Yours.';

    expect(described(description)).toEqual([
      { match: 'Soft.\nWarm.  Yours.', index: description.indexOf('Soft.') },
    ]);
  });

  it('places each of the same sentence where it stands', () => {
    const description = 'Is it a mug?  It is.\nIs it a mug? Yes. SO VERY GOOD and SO VERY GOOD.';

    expect(described(description)).toEqual([
      { match: 'Is it a mug?', index: 0 },
      { match: 'Is it a mug?', index: 0 },
      { match: 'Is it a mug?', index: description.lastIndexOf('Is it') },
      { match: 'SO VERY GOOD', index: description.indexOf('SO') },
      { match: 'SO VERY GOOD', index: description.lastIndexOf('SO') },
    ]);
  });

  it('places a hyphen between words and a run in capitals after a label', () => {
    const description = '- a list - line\nPLEASE NOTE: a tulip - honestly. A REALLY BIG mug.';

    expect(described(description)).toEqual([
      { match: 'REALLY BIG', index: description.indexOf('REALLY') },
      { match: 'tulip - honestly', index: description.indexOf('tulip') },
    ]);
  });
});
