import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';

describe('settings page', () => {
  it('switches the interface language, saves it and confirms', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');

    await user.click(await screen.findByRole('combobox', { name: /Interface language/ }));
    await user.click(await screen.findByRole('option', { name: 'Deutsch' }));

    expect(await screen.findByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument();
    expect(api.updateSettings).toHaveBeenCalledWith({ language: 'de' });
    expect(screen.getByText('Gespeichert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Designs' })).toBeInTheDocument();
  });

  it('lists approved import folders and removes one', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');

    const list = await screen.findByRole('list', { name: 'Import folders' });
    expect(within(list).getByText('Designs')).toHaveAttribute('title', '/Users/me/Designs');

    await user.click(screen.getByRole('button', { name: 'Remove Designs' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove Designs?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(api.removeImportFolder).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove Designs' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );

    expect(api.removeImportFolder).toHaveBeenCalledWith({ folder: '/Users/me/Designs' });
    expect(
      await screen.findByText('No folders yet. Choose a folder in the import window to add it.'),
    ).toBeInTheDocument();
  });

  it('shows the import folders loading, and offers a retry when they cannot be read', async () => {
    const { api } = createFakeApi([]);
    api.listImportFolders.mockRejectedValueOnce(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/settings');

    const section = () =>
      within(screen.getByRole('heading', { name: 'Import folders' }).parentElement as HTMLElement);
    await user.click(await section().findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('list', { name: 'Import folders' })).toBeInTheDocument();
  });

  it('explains why the AI models cannot be chosen when the settings cannot be read', async () => {
    const { api } = createFakeApi([]);
    await api.connectAi({ provider: 'anthropic', apiKey: 'k' });
    const settings = await api.getSettings();
    api.getSettings.mockRejectedValue(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/settings');

    const retry = await screen.findAllByRole('button', { name: 'Try again' });
    expect(screen.queryByRole('combobox', { name: 'Writing model' })).not.toBeInTheDocument();
    api.getSettings.mockReset();
    api.getSettings.mockResolvedValue(settings);
    await user.click(retry.at(-1) as HTMLElement);

    expect(await screen.findByRole('combobox', { name: 'Writing model' })).toBeEnabled();
  });
});
