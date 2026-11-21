import { describe, expect, it } from 'vitest';
import { ETSY_LINKS } from './etsy-links.js';

describe('ETSY_LINKS', () => {
  it('points to the listing page, its editor and the shop drafts', () => {
    expect(ETSY_LINKS.listingUrl('1234567890')).toBe('https://www.etsy.com/listing/1234567890');
    expect(ETSY_LINKS.editUrl('1234567890')).toBe(
      'https://www.etsy.com/your/shops/me/listing-editor/edit/1234567890',
    );
    expect(ETSY_LINKS.draftsUrl()).toBe(
      'https://www.etsy.com/your/shops/me/tools/listings/state:draft',
    );
  });
});
