import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';

describe('assistant setup', () => {
  it('shows how to connect an AI assistant, ready to copy', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    expect(await screen.findByRole('heading', { name: 'AI assistant' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy for Claude Code' }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('claude mcp add --scope user'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('asks to move the app to Applications first when macOS may run it from elsewhere', async () => {
    const { api } = createFakeApi([]);
    api.getMcpLaunch.mockResolvedValueOnce({
      command:
        '/private/var/folders/xy/AppTranslocation/POD Pipeline.app/Contents/MacOS/POD Pipeline',
      args: ['--mcp-server'],
      env: {},
      outsideApplicationsFolder: true,
    });
    await renderApp(api, '/settings');

    expect(await screen.findByText(/Move POD Pipeline to the Applications folder/)).toBeVisible();
  });

  it('says so when copying fails', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    try {
      await user.click(await screen.findByRole('button', { name: 'Copy for Claude Code' }));

      expect(await screen.findByRole('button', { name: 'Could not copy' })).toBeInTheDocument();
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('offers a retry when the assistant setup cannot be read', async () => {
    const { api } = createFakeApi([]);
    api.getMcpLaunch.mockRejectedValueOnce(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/settings');

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Copy for Claude Code' })).toBeInTheDocument();
  });
});
