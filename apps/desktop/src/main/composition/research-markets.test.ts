import { describe, expect, it } from 'vitest';
import { UNCHECKED_PAGE_WORDS } from '@pod/adapter-etsy';
import { UNCHECKED_RESEARCH_MARKETS } from '@pod/contracts';

describe('research markets', () => {
  it('mark as beta in the window exactly the markets whose page words are unchecked', () => {
    expect(Object.keys(UNCHECKED_PAGE_WORDS).sort()).toEqual(
      [...UNCHECKED_RESEARCH_MARKETS].sort(),
    );
  });
});
