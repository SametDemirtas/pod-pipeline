import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSize, renameWithRetry } from './rename-with-retry.js';

function failure(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('renameWithRetry', () => {
  let dir: string;
  let from: string;
  let to: string;
  const wait = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pod-rename-'));
    from = join(dir, 'incoming.tmp');
    to = join(dir, 'stored.png');
    writeFileSync(from, 'abc');
    wait.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('moves the file in one attempt when nothing holds it', async () => {
    await renameWithRetry(from, to, { sameSize: 3, wait });

    expect(readFileSync(to, 'utf8')).toBe('abc');
    expect(wait).not.toHaveBeenCalled();
  });

  it('retries transient locks with growing waits', async () => {
    const rename = vi
      .fn<(from: string, to: string) => Promise<void>>()
      .mockRejectedValueOnce(failure('EBUSY'))
      .mockRejectedValueOnce(failure('EPERM'))
      .mockResolvedValueOnce(undefined);

    await renameWithRetry(from, to, { sameSize: 3, rename, wait });

    expect(rename).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[50], [100]]);
  });

  it('waits on a timer between attempts by default', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const rename = vi
      .fn<(from: string, to: string) => Promise<void>>()
      .mockRejectedValueOnce(failure('EBUSY'))
      .mockResolvedValueOnce(undefined);

    const renamed = renameWithRetry(from, to, { sameSize: 3, rename });
    // The wait starts once the file system said the target is not there yet.
    while (vi.getTimerCount() === 0) await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(49);
    expect(rename).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await renamed;

    expect(rename).toHaveBeenCalledTimes(2);
  });

  it('gives up after repeated locks and reports the last error', async () => {
    const rename = vi.fn(() => Promise.reject(failure('EACCES')));

    await expect(renameWithRetry(from, to, { sameSize: 3, rename, wait })).rejects.toMatchObject({
      code: 'EACCES',
    });
    expect(rename).toHaveBeenCalledTimes(6);
  });

  it('does not retry other errors', async () => {
    const rename = vi.fn(() => Promise.reject(failure('EXDEV')));

    await expect(renameWithRetry(from, to, { sameSize: 3, rename, wait })).rejects.toMatchObject({
      code: 'EXDEV',
    });
    expect(rename).toHaveBeenCalledTimes(1);
  });

  it('succeeds when another writer stored the same content meanwhile', async () => {
    writeFileSync(to, 'xyz');
    const rename = vi.fn(() => Promise.reject(failure('EPERM')));

    await renameWithRetry(from, to, { sameSize: 3, rename, wait });

    expect(rename).toHaveBeenCalledTimes(1);
    expect(readFileSync(to, 'utf8')).toBe('xyz');
  });

  it('reports the rename error when the target cannot be read', async () => {
    const rename = vi.fn(() => Promise.reject(failure('EXDEV')));

    await expect(
      renameWithRetry(from, join(from, 'stored.png'), { sameSize: 3, rename, wait }),
    ).rejects.toMatchObject({ code: 'EXDEV' });
  });
});

describe('hasSize', () => {
  it('checks that a regular file of that size exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pod-size-'));
    try {
      writeFileSync(join(dir, 'a'), 'abc');

      expect(await hasSize(join(dir, 'a'), 3)).toBe(true);
      expect(await hasSize(join(dir, 'a'), 4)).toBe(false);
      expect(await hasSize(join(dir, 'missing'), 3)).toBe(false);
      expect(await hasSize(dir, 0)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
