import { describe, expect, it } from 'vitest';
import { shopOptionsDto } from '../../../testing/batch-fixtures.js';
import { ShippingProfileGoneError } from '../../errors/batch-errors.js';
import { shippingProfileFor } from './shipping-profile.js';

const shop = shopOptionsDto({
  shippingProfiles: [
    { id: '316', label: 'Free everywhere' },
    { id: '412', label: 'Free US, paid UK and EU' },
  ],
});

describe('shippingProfileFor', () => {
  it("takes the family's chosen profile, else the shop's first", () => {
    expect(shippingProfileFor(shop, { 'phone-case': '412' }, 'phone-case')?.label).toBe(
      'Free US, paid UK and EU',
    );
    expect(shippingProfileFor(shop, { 'phone-case': '412' }, 'mug')?.id).toBe('316');
    expect(shippingProfileFor({ shippingProfiles: [] }, {}, 'mug')).toBeUndefined();
  });

  it('names the family whose chosen profile is no longer in the shop', () => {
    expect(() => shippingProfileFor(shop, { mug: '999' }, 'mug')).toThrow(ShippingProfileGoneError);
    expect(() => shippingProfileFor(shop, { mug: '999' }, 'mug')).toThrow(
      expect.objectContaining({ code: 'SHIPPING_PROFILE_GONE', details: { familyId: 'mug' } }),
    );
  });
});
