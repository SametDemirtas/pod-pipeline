import { expect, it } from 'vitest';
import { PINTEREST_LINKS } from './pinterest-links.js';

it('links to a published pin on Pinterest', () => {
  expect(PINTEREST_LINKS.pinUrl('987')).toBe('https://www.pinterest.com/pin/987/');
});
