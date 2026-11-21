import { describe, expect, it } from 'vitest';
import { AppClosingError } from './app-error.js';
import { ExclusiveRunner, KeyedExclusiveRunner } from './exclusive-runner.js';

class BusyError extends Error {}

describe('ExclusiveRunner', () => {
  it('refuses a second operation while one runs, then accepts again', async () => {
    const guard = new ExclusiveRunner(() => new BusyError());
    let release: () => void = () => undefined;
    const first = guard.run(
      () =>
        new Promise<string>((resolve) => {
          release = () => {
            resolve('a');
          };
        }),
    );

    await expect(guard.run(() => Promise.resolve('b'))).rejects.toBeInstanceOf(BusyError);
    release();
    expect(await first).toBe('a');
    expect(await guard.run(() => Promise.resolve('c'))).toBe('c');
  });

  it('accepts again after a failure', async () => {
    const guard = new ExclusiveRunner(() => new BusyError());

    await expect(guard.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await guard.run(() => Promise.resolve(1))).toBe(1);
  });
});

describe('KeyedExclusiveRunner', () => {
  it('refuses a second operation under the same key only', async () => {
    const guard = new KeyedExclusiveRunner(() => new BusyError());
    let release: () => void = () => undefined;
    const first = guard.run(
      'a',
      () =>
        new Promise<string>((resolve) => {
          release = () => {
            resolve('a');
          };
        }),
    );

    await expect(guard.run('a', () => Promise.resolve('again'))).rejects.toBeInstanceOf(BusyError);
    expect(await guard.run('b', () => Promise.resolve('b'))).toBe('b');
    release();
    expect(await first).toBe('a');
    expect(await guard.run('a', () => Promise.resolve('later'))).toBe('later');
  });

  it('waits for the operations running now, however they end', async () => {
    const guard = new KeyedExclusiveRunner(() => new BusyError());
    let finish: () => void = () => undefined;
    const done: string[] = [];
    const slow = guard.run(
      'a',
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            done.push('a');
            resolve();
          };
        }),
    );
    const failed = guard.run('b', () => Promise.reject(new Error('boom')));

    const idle = guard.idle().then(() => done.push('idle'));
    finish();
    await idle;

    expect(done).toEqual(['a', 'idle']);
    await slow;
    await expect(failed).rejects.toThrow('boom');
    await new ExclusiveRunner(() => new BusyError()).idle();
  });

  it('refuses new operations once closed and waits for those running', async () => {
    const guard = new ExclusiveRunner(() => new BusyError());
    let finish: () => void = () => undefined;
    const running = guard.run(
      () =>
        new Promise<string>((resolve) => {
          finish = () => {
            resolve('saved');
          };
        }),
    );

    const closed = guard.close();
    await expect(guard.run(() => Promise.resolve('late'))).rejects.toBeInstanceOf(AppClosingError);
    finish();
    await closed;
    expect(await running).toBe('saved');
  });
});
