import { expect, test } from '@playwright/test';
import { callApp, launchApp, type LaunchedApp } from './launch-app.js';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

test('keeps the page sandboxed, without Node and apart from the preload', async () => {
  // getLastWebPreferences is undocumented and untyped, but reports what the window was made with.
  const preferences = await launched.app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents as unknown as {
      getLastWebPreferences(): unknown;
    };
    return contents.getLastWebPreferences();
  });

  expect(preferences).toMatchObject({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
  });
  expect(
    await launched.window.evaluate(() => typeof (window as { require?: unknown }).require),
  ).toBe('undefined');
});

test('opens no window for a local file and stays on the app when the page navigates', async () => {
  const { app, window: page } = launched;
  const start = page.url();
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    const seen: { url: string; prevented: boolean }[] = [];
    (globalThis as { navigations?: typeof seen }).navigations = seen;
    contents?.on('will-navigate', (event, url) => {
      seen.push({ url, prevented: event.defaultPrevented });
    });
  });

  const opened = await page.evaluate(() => window.open('file:///etc/hosts') === null);
  await page.evaluate(() => {
    window.location.href = 'https://example.com/';
  });

  await expect
    .poll(() => app.evaluate(() => (globalThis as { navigations?: unknown[] }).navigations ?? []))
    .toEqual([{ url: 'https://example.com/', prevented: true }]);
  expect(opened).toBe(true);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  expect(page.url()).toBe(start);
});

test('refuses a channel that is not the app’s own', async () => {
  await expect(callApp(launched.window, 'fs:read-file', { path: '/etc/hosts' })).rejects.toThrow(
    'Unknown channel fs:read-file',
  );
});
