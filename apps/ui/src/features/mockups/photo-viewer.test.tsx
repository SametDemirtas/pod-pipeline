import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { apiError, mug } from '../../testing/print.js';

async function openFront() {
  const { api } = createFakeApi([mug()]);
  const { user } = await renderApp(api, '/designs/id-01-mug');
  await user.click(await screen.findByRole('button', { name: 'Create mockups' }));
  const gallery = within(await screen.findByRole('list', { name: 'Mockups' }));
  await user.click(
    gallery.getByRole('button', { name: 'Show White Glossy Mug 11 oz · Front at full size' }),
  );
  const dialog = within(await screen.findByRole('dialog'));
  return { api, user, dialog };
}

describe('photo viewer', () => {
  it('shows the photo at full size and saves a copy', async () => {
    const { api, user, dialog } = await openFront();

    const image = dialog.getByRole('img', { name: 'Product image of 01-mug' });
    expect(image.getAttribute('src')).not.toContain('?w=');
    await user.click(dialog.getByRole('button', { name: 'Save full size' }));

    expect(api.savePhoto).toHaveBeenCalledWith({ designId: 'id-01-mug', mockupId: 'm-front' });
    expect(await dialog.findByRole('button', { name: 'Saved' })).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the save button when the dialog was cancelled and shows a failure', async () => {
    const { api, user, dialog } = await openFront();
    api.savePhoto.mockResolvedValueOnce(false);
    api.savePhoto.mockRejectedValueOnce(apiError('INTERNAL', 'disk full'));

    await user.click(dialog.getByRole('button', { name: 'Save full size' }));
    expect(await dialog.findByRole('button', { name: 'Save full size' })).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Save full size' }));

    expect(await dialog.findByRole('alert')).toBeInTheDocument();
  });
});
