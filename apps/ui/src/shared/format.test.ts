import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDate,
  formatList,
  formatMoney,
  formatPixels,
  formatShare,
  formatWait,
} from './format.js';

describe('shares', () => {
  it.each([
    [0, '0%'],
    [0.004, '<1%'],
    [0.094, '9%'],
    [0.996, '>99%'],
    [1, '100%'],
  ])('shows %f as %s', (share, text) => {
    expect(formatShare(share, 'en')).toBe(text);
  });

  it('follows the language', () => {
    expect(formatShare(0.004, 'tr')).toBe('<%1');
  });
});

describe('formatting', () => {
  it('formats file sizes for each language', () => {
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(9_805_738, 'en')).toBe('9.4 MB');
    expect(formatBytes(9_805_738, 'de')).toBe('9,4 MB');
    expect(formatBytes(150 * 1024 * 1024, 'tr')).toBe('150 MB');
  });

  it('formats pixel sizes and dates', () => {
    expect(formatPixels(3840, 1648, 'en')).toBe('3,840 × 1,648 px');
    expect(formatPixels(3840, 1648, 'de')).toBe('3.840 × 1.648 px');
    expect(formatDate('2026-10-21T10:00:00.000Z', 'en')).toBe('Oct 21, 2026');
  });

  it('rounds waits to whole units', () => {
    expect(formatWait(12.3, 'en')).toBe('13 seconds');
    expect(formatWait(59.2, 'en')).toBe('1 minute');
    expect(formatWait(60, 'en')).toBe('1 minute');
    expect(formatWait(61, 'en')).toBe('2 minutes');
    expect(formatWait(5400, 'en')).toBe('1.5 hours');
  });

  it('lists items the way the language does', () => {
    expect(formatList(['A', 'B', 'C'], 'en')).toBe('A, B, and C');
    expect(formatList(['A', 'B'], 'tr')).toBe('A ve B');
    expect(formatList(['A', 'B'], 'de', 'disjunction')).toBe('A oder B');
  });
});

describe('money', () => {
  it('writes a known currency the way the language does', () => {
    expect(formatMoney(12.5, 'USD', 'en')).toBe('$12.50');
  });

  it('keeps an unknown currency label instead of failing', () => {
    expect(formatMoney(1234.5, 'zł', 'en')).toBe('1,234.5 zł');
  });
});
