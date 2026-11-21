import { act, screen } from '@testing-library/react';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopBridge } from '@pod/contracts/client';
import { startApp } from './start-app.js';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

async function start(bridge: DesktopBridge | undefined, browserLanguage: string) {
  const element = document.body.appendChild(document.createElement('div'));
  await act(async () => {
    root = await startApp(element, bridge, browserLanguage);
  });
}

describe('startApp', () => {
  it('says the app is not running, in the browser’s language, without the bridge', async () => {
    await start(undefined, 'de-DE');

    expect(screen.getByRole('alert')).toHaveTextContent('Die App läuft nicht');
    expect(document.documentElement.lang).toBe('de');
  });

  it('opens the app in the saved language through the bridge', async () => {
    const bridge: DesktopBridge = {
      invoke: vi.fn((channel: string) =>
        channel === 'settings:get'
          ? Promise.resolve({ ok: true, value: { language: 'tr' } })
          : new Promise(() => undefined),
      ) as DesktopBridge['invoke'],
      on: vi.fn(() => () => undefined),
    };
    await start(bridge, 'en-US');

    expect(await screen.findByRole('navigation', { name: 'Ana gezinme' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('tr');
  });
});
