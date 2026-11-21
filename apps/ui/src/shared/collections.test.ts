import { describe, expect, it } from 'vitest';
import { toggled, toggledIn } from './collections.js';

describe('toggled', () => {
  it('adds or takes out a value without changing the set given', () => {
    const values = new Set(['a']);

    expect([...toggled(values, 'b', true)]).toEqual(['a', 'b']);
    expect([...toggled(values, 'a', false)]).toEqual([]);
    expect([...values]).toEqual(['a']);
  });
});

describe('toggledIn', () => {
  it('adds a value last once and keeps the order of the others', () => {
    expect(toggledIn(['a', 'b'], 'a', true)).toEqual(['b', 'a']);
    expect(toggledIn(['a', 'b', 'c'], 'b', false)).toEqual(['a', 'c']);
  });
});
