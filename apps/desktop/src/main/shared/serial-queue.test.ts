import { describe, expect, it } from 'vitest';
import { SerialQueue } from './serial-queue.js';

describe('SerialQueue', () => {
  it('runs one operation at a time, in order, past failures', async () => {
    const queue = new SerialQueue();
    const log: string[] = [];
    let finish: () => void = () => undefined;
    const first = queue.run(
      () =>
        new Promise<string>((resolve) => {
          log.push('first starts');
          finish = () => {
            log.push('first ends');
            resolve('a');
          };
        }),
    );
    const second = queue.run(() => Promise.reject(new Error('b failed')));
    const third = queue.run(() => {
      log.push('third');
      return Promise.resolve('c');
    });

    await Promise.resolve();
    finish();

    await expect(first).resolves.toBe('a');
    await expect(second).rejects.toThrow('b failed');
    await expect(third).resolves.toBe('c');
    expect(log).toEqual(['first starts', 'first ends', 'third']);
  });
});
