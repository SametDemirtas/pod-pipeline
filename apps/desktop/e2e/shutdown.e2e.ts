import { expect, test } from '@playwright/test';
import type { BatchStatusDto } from '@pod/contracts';
import { invoke, openFakeShop, type FakeShop } from './fake-shop.js';

let shop: FakeShop;

test.beforeEach(async () => {
  shop = await openFakeShop();
});

test.afterEach(async () => {
  await shop.close();
});

test('says it is finishing work while quitting, and shows the job paused after a restart', async () => {
  const { launched, designId, services } = shop;
  const { app } = launched;
  services.mockups.held = true;
  await invoke(launched.window, 'batch:start', {
    selection: { kind: 'designs', designIds: [designId] },
    steps: ['mockups', 'text'],
    market: 'US',
  });
  await expect
    .poll(() => services.calls.some((call) => call.includes('/mockup-generator/create-task/')))
    .toBe(true);

  const exited = app.waitForEvent('close');
  await app.evaluate(({ app: electron }) => {
    electron.quit();
  });
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((window) => window.getTitle()),
      ),
    )
    .toContain('Finishing work…');
  services.mockups.held = false;
  await exited;
  const restarted = await shop.restart();

  const { job } = await invoke<BatchStatusDto>(restarted.window, 'batch:status');
  expect(job?.state).toBe('paused');
  expect(job?.stepCounts.mockups).toMatchObject({ done: 1 });
  await restarted.window.getByRole('button', { name: /^Preparation:/ }).click();
  await expect(restarted.window.getByRole('button', { name: 'Resume' })).toBeVisible();
});
