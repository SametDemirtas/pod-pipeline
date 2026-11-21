import { describe, expect, it } from 'vitest';
import { isFromFrame } from './trusted-sender.js';

describe('isFromFrame', () => {
  const mainFrame = { name: 'main' };

  it('trusts the main frame itself', () => {
    expect(isFromFrame({ senderFrame: mainFrame }, mainFrame)).toBe(true);
  });

  it.each([
    ['a subframe', { senderFrame: { name: 'child', parent: mainFrame } }],
    ['another window', { senderFrame: { name: 'main' } }],
    ['a sender without a frame', { senderFrame: null }],
    ['an event without senderFrame', {}],
    ['no event', null],
  ])('refuses %s', (_case, event) => {
    expect(isFromFrame(event, mainFrame)).toBe(false);
  });

  it('refuses everything while no window is open', () => {
    expect(isFromFrame({ senderFrame: undefined }, undefined)).toBe(false);
  });
});
