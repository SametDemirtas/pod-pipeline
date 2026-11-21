import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERDUE_MS, useOverdue } from './use-overdue.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('useOverdue', () => {
  it('turns overdue once the time has long passed, while the page stays open', () => {
    vi.useFakeTimers();
    const publishAt = new Date(Date.now() + 60_000).toISOString();
    const { result } = renderHook(() => useOverdue(publishAt, true));

    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(60_000 + OVERDUE_MS + 10);
    });
    expect(result.current).toBe(true);
  });

  it('never calls a pin that is no longer waiting overdue', () => {
    const { result } = renderHook(() => useOverdue('2020-01-01T00:00:00.000Z', false));

    expect(result.current).toBe(false);
  });

  it('waits for nothing when the time cannot be read', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useOverdue('not a time', true));

    expect(result.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
