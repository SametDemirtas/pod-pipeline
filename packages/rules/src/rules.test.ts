import { describe, expect, it } from 'vitest';
import { isMarketBadge } from './market-badges.js';
import { isPublishablePhoto } from './publishable-photo.js';

describe('isPublishablePhoto', () => {
  it('publishes a scene only once its print is confirmed', () => {
    expect(isPublishablePhoto({ scenePrompt: null, printConfirmed: false })).toBe(true);
    expect(isPublishablePhoto({ scenePrompt: 'On a desk', printConfirmed: false })).toBe(false);
    expect(isPublishablePhoto({ scenePrompt: 'On a desk', printConfirmed: true })).toBe(true);
  });
});

describe('isMarketBadge', () => {
  it('knows the codes, not the names Etsy shows', () => {
    expect(isMarketBadge('marketPick')).toBe(true);
    expect(isMarketBadge("Etsy's Pick")).toBe(false);
  });
});
