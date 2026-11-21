import { describe, expect, it } from 'vitest';
import { DESIGN_STEPS, stepStatuses } from './design-steps.js';

describe('stepStatuses', () => {
  it.each([
    [{ printable: false, checked: false, hasMockups: false }, 'upcoming', 'upcoming'],
    [{ printable: true, checked: false, hasMockups: false }, 'open', 'open'],
    [{ printable: true, checked: true, hasMockups: false }, 'done', 'open'],
    [{ printable: true, checked: true, hasMockups: true }, 'done', 'done'],
    [{ printable: true, checked: false, hasMockups: true }, 'open', 'done'],
  ])('rates check and mockups for %o', (progress, check, mockups) => {
    const statuses = stepStatuses({ ...progress, listing: null, pinned: false });

    expect(Object.keys(statuses)).toEqual([...DESIGN_STEPS]);
    expect(statuses).toMatchObject({ design: 'done', check, mockups });
  });

  it.each([
    [false, false, 'upcoming'],
    [true, false, 'open'],
    [true, true, 'done'],
  ])('rates the pins with mockups %s and a published pin %s', (hasMockups, pinned, rated) => {
    const statuses = stepStatuses({
      printable: true,
      checked: true,
      hasMockups,
      listing: null,
      pinned,
    });

    expect(statuses.pins).toBe(rated);
  });

  it.each([
    [false, null, ['upcoming', 'upcoming', 'upcoming']],
    [true, null, ['open', 'upcoming', 'upcoming']],
    [true, { state: 'draft', linkCurrent: false }, ['done', 'open', 'upcoming']],
    [true, { state: 'draft', linkCurrent: true }, ['done', 'done', 'open']],
    [true, { state: 'active', linkCurrent: true }, ['done', 'done', 'done']],
  ] as const)(
    'rates the listing steps with mockups %s and listing %o',
    (hasMockups, listing, rated) => {
      const statuses = stepStatuses({
        printable: true,
        checked: true,
        hasMockups,
        listing,
        pinned: false,
      });

      expect([statuses.text, statuses.listing, statuses.fulfilment, statuses.publish]).toEqual([
        rated[0],
        ...rated,
      ]);
    },
  );
});
