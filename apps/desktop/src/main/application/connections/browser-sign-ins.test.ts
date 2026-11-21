import { expect, it } from 'vitest';
import { BrowserSignIns } from './browser-sign-ins.js';

const waitForCancel = (signal: AbortSignal) =>
  new Promise<string>((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      reject(new Error('This operation was aborted'));
    });
  });

it('fails a cancelled sign-in as cancelled and leaves the others waiting', async () => {
  const signIns = new BrowserSignIns();
  const cancelled = () => new Error('cancelled');
  const etsy = signIns.run('etsy', waitForCancel, cancelled);
  const pinterest = signIns.run('pinterest', () => Promise.resolve('token'), cancelled);

  signIns.cancel('etsy');

  await expect(etsy).rejects.toThrow('cancelled');
  await expect(pinterest).resolves.toBe('token');
});

it('cancels every waiting sign-in at once', async () => {
  const signIns = new BrowserSignIns();
  const waiting = signIns.run('pinterest', waitForCancel, () => new Error('cancelled'));

  signIns.cancelAll();

  await expect(waiting).rejects.toThrow('cancelled');
});
