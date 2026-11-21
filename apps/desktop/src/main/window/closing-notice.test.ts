import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closingPage, showClosingNotice } from './closing-notice.js';

describe('showClosingNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows nothing when closing is quick', () => {
    const open = vi.fn(() => ({ close: vi.fn() }));

    const done = showClosingNotice(open, vi.fn(), 1000);
    vi.advanceTimersByTime(999);
    done();
    vi.advanceTimersByTime(1000);

    expect(open).not.toHaveBeenCalled();
  });

  it('shows the notice while closing takes long, and takes it away after', () => {
    const window = { close: vi.fn() };
    const open = vi.fn(() => window);

    const done = showClosingNotice(open, vi.fn(), 1000);
    vi.advanceTimersByTime(1000);
    expect(open).toHaveBeenCalledOnce();
    done();

    expect(window.close).toHaveBeenCalledOnce();
  });
});

it('logs a notice that cannot be shown and goes on closing', () => {
  vi.useFakeTimers();
  try {
    const logError = vi.fn();
    const done = showClosingNotice(
      () => {
        throw new Error('no display');
      },
      logError,
      10,
    );

    vi.advanceTimersByTime(10);
    done();

    expect(logError).toHaveBeenCalledWith(new Error('no display'));
  } finally {
    vi.useRealTimers();
  }
});

describe('closingPage', () => {
  it('says so in the seller’s language', () => {
    expect(closingPage('tr')).toContain('İşler bitiriliyor…');
    expect(closingPage('de')).toContain('lang="de"');
    expect(closingPage('en')).not.toContain('<script');
  });
});
