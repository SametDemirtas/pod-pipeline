import { describe, expect, it } from 'vitest';
import { isHttpsUrl } from './https-url.js';

describe('isHttpsUrl', () => {
  it.each(['https://www.etsy.com/listing/1', 'HTTPS://example.test/a?b=c#d'])(
    'accepts %s',
    (url) => {
      expect(isHttpsUrl(url)).toBe(true);
    },
  );

  it.each([
    'http://www.etsy.com/listing/1',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'pod-asset://design/a.png',
    'https//missing-colon.test',
    'not a url',
    '',
  ])('refuses %s', (url) => {
    expect(isHttpsUrl(url)).toBe(false);
  });
});
