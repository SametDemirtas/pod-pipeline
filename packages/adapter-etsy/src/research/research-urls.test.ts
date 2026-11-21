import { describe, expect, it } from 'vitest';
import { isAllowedResearchUrl, isEtsyPage } from './research-urls.js';

describe('research URLs', () => {
  it.each([
    ['https://www.etsy.com/search?q=mug', true],
    ['https://www.etsy.com/listing/1/x', true],
    ['https://geo.captcha-delivery.com/captcha/?initialCid=1', true],
    ['https://www.etsy.com/signin?from=search', false],
    ['https://www.etsy.com/join', false],
    ['https://www.etsy.com/de/signin?from=search', false],
    ['https://www.etsy.com/uk/account/purchases', false],
    ['https://www.etsy.com/de-de/join', false],
    ['https://www.etsy.com/de/search?q=tasse', true],
    ['https://www.etsy.com/joinery-tools', true],
    ['https://www.etsy.com/signin.php?from=search', false],
    ['https://www.etsy.com/your/purchases', false],
    ['https://www.etsy.com/de/your/account', false],
    ['https://www.etsy.com/oauth/connect', false],
    ['https://www.etsy.com/yourself-gift', true],
    ['http://www.etsy.com/search?q=mug', false],
    ['https://ads.example.com/click', false],
    ['https://etsy.com.evil.example/search', false],
    ['not a url', false],
  ])('allows %s: %s', (url, allowed) => {
    expect(isAllowedResearchUrl(url)).toBe(allowed);
  });

  it('reads only pages on Etsy itself', () => {
    expect(isEtsyPage('https://www.etsy.com/search?q=mug')).toBe(true);
    expect(isEtsyPage('https://geo.captcha-delivery.com/captcha/')).toBe(false);
    expect(isEtsyPage('about:blank')).toBe(false);
  });
});
