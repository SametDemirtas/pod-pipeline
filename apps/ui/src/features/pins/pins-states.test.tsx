import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { renderApp } from '../../testing/render-app.js';
import { withPhotos } from '../../testing/pins.js';

describe('pins section states', () => {
  it('says why the photos for pins cannot be shown', async () => {
    const { api } = await withPhotos();
    api.listMockups.mockRejectedValue(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    await renderApp(api, '/designs/id-01-mug');

    // The mockups section and the pins section each say so, with a retry.
    await waitFor(() => {
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'New pin' })).not.toBeInTheDocument();
    });
  });

  it('offers a retry when the pins or boards cannot be read', async () => {
    const { api } = await withPhotos();
    const failure = new ApiError({ code: 'INTERNAL', message: 'x', details: {} });
    api.listPins.mockRejectedValueOnce(failure);
    api.listBoards.mockRejectedValueOnce(failure);
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await waitFor(() => {
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });
    for (const alert of screen.getAllByRole('alert')) {
      await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    }

    expect(await screen.findByText('No pins yet.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'New pin' })).toBeInTheDocument();
  });

  it('offers a retry when the connections cannot be read', async () => {
    const { api } = await withPhotos();
    const read = api.getConnections.getMockImplementation();
    api.getConnections.mockRejectedValue(new Error('offline'));
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const heading = await screen.findByRole('heading', { name: 'Pinterest' });
    const section = within(heading.closest('div')?.parentElement as HTMLElement);
    const retry = await section.findByRole('button', { name: 'Try again' });
    if (read) api.getConnections.mockImplementation(read);

    await user.click(retry);

    expect(await section.findByText('No pins yet.')).toBeInTheDocument();
  });

  it('shows the new pin button as loading while the boards load', async () => {
    const { api } = await withPhotos();
    api.listBoards.mockReturnValue(new Promise(() => undefined));
    await renderApp(api, '/designs/id-01-mug');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'New pin' })).toBeDisabled();
    });
  });

  it('asks for a board when the account has none', async () => {
    const { api } = await withPhotos();
    api.listBoards.mockResolvedValue([]);
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText(/has no boards yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New pin' })).not.toBeInTheDocument();
  });
});
