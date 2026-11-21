import { describe, expect, it } from 'vitest';
import { MAX_BATCH_DESIGNS } from './dto/batch-dto.js';
import { batchRequest, updateSettingsRequest } from './requests/index.js';

const designs = { kind: 'designs', designIds: ['d1', 'd2'] } as const;

describe('batchRequest', () => {
  it('takes designs picked one by one or every design a filter matches', () => {
    expect(batchRequest.parse({ selection: designs, steps: ['print'], market: 'US' })).toEqual({
      selection: designs,
      steps: ['print'],
      market: 'US',
    });
    expect(
      batchRequest.safeParse({
        selection: { kind: 'filter', familyId: 'mug', search: 'tulip' },
        steps: ['research'],
        market: 'DE',
      }).success,
    ).toBe(true);
  });

  it('refuses drafts without the text and mockups they are made of', () => {
    const steps = (list: string[]) =>
      batchRequest.safeParse({ selection: designs, steps: list, market: 'US' }).success;

    expect(steps(['draft'])).toBe(false);
    expect(steps(['text', 'draft'])).toBe(false);
    expect(steps(['mockups', 'text', 'draft'])).toBe(true);
  });

  it('refuses an empty or oversized choice, repeated steps and unknown ones', () => {
    const request = (change: object) =>
      batchRequest.safeParse({ selection: designs, steps: ['print'], market: 'US', ...change })
        .success;
    const many = Array.from({ length: MAX_BATCH_DESIGNS + 1 }, (_, index) => `d${index}`);

    expect(request({ selection: { kind: 'designs', designIds: [] } })).toBe(false);
    expect(request({ selection: { kind: 'designs', designIds: many } })).toBe(false);
    expect(request({ steps: [] })).toBe(false);
    expect(request({ steps: ['print', 'print'] })).toBe(false);
    expect(request({ steps: ['scenes'] })).toBe(false);
    expect(request({ market: 'FR' })).toBe(false);
  });
});

describe('listing setup settings', () => {
  it('take prices above zero in a currency, or none to remove one', () => {
    const prices = (listingPrices: object) =>
      updateSettingsRequest.safeParse({ aiDesigns: true, listingPrices }).success;

    expect(prices({ mug: { amount: 1899, currency: 'USD' }, blanket: null })).toBe(true);
    expect(prices({ mug: { amount: 0, currency: 'USD' } })).toBe(false);
    expect(prices({ mug: { amount: 18.5, currency: 'USD' } })).toBe(false);
    expect(prices({ mug: { amount: 1899, currency: 'usd' } })).toBe(false);
  });
});
