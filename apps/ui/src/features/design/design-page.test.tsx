import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi, designDto } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';

describe('design page', () => {
  it('shows details, progress and history of a design', async () => {
    const { api } = createFakeApi([designDto('01-mug', 'Lantern Harbor')]);
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByRole('heading', { name: '01-mug' })).toBeInTheDocument();
    expect(screen.getByText('3,840 × 1,648 px')).toBeInTheDocument();
    expect(screen.getByText('9.4 MB')).toBeInTheDocument();
    expect(screen.getByText('Revision 1, Oct 21, 2026')).toBeInTheDocument();
    expect(screen.getByText('Lantern Harbor · Mug')).toBeInTheDocument();
    const source = screen.getByText('designs/01-mug.png');
    expect(source).toHaveAttribute('title', '/designs/01-mug.png');
    const next = within(await screen.findByRole('list', { name: 'Next steps' }));
    expect(next.getAllByRole('listitem').map((step) => step.textContent)).toEqual(['Mockups']);
    const done = within(screen.getByRole('list', { name: 'Finished steps' }));
    expect(done.getAllByRole('listitem').map((step) => step.textContent)).toEqual([
      'Design',
      'Print check',
    ]);
    const later = within(
      screen.getByRole('list', { name: 'Later steps, once the ones before are done' }),
    );
    const upcoming = later.getAllByRole('listitem').map((step) => step.textContent);
    expect(upcoming).toHaveLength(5);
    expect(upcoming[0]).toBe('4. Listing text');
    expect(upcoming.at(-1)).toBe('8. Pinterest');
  });

  it('loads the design again after a failure', async () => {
    const { api } = createFakeApi([designDto('01-mug')]);
    api.getDesign.mockRejectedValueOnce(new Error('offline'));
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: '01-mug' })).toBeInTheDocument();
  });

  it('reports a design that no longer exists, without a useless retry', async () => {
    const { api } = createFakeApi([]);
    api.getDesign.mockRejectedValueOnce(
      new ApiError({ code: 'NOT_FOUND', message: 'x', details: {} }),
    );
    await renderApp(api, '/designs/missing');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design not found' }),
    ).toBeVisible();
    expect(document.title).toMatch(/^Design not found - /);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All designs' })).toHaveAttribute('href', '#/');
  });

  it('keeps a page heading while showing other errors', async () => {
    const { api } = createFakeApi([designDto('01-mug')]);
    api.getDesign.mockRejectedValueOnce(new Error('offline'));
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByRole('heading', { level: 1, name: 'Design' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('focuses the heading after opening a design from the catalog', async () => {
    const { api } = createFakeApi([designDto('01-mug', 'Tulip')]);
    const { user } = await renderApp(api);

    await user.click(await screen.findByRole('link', { name: /01-mug/ }));

    const heading = await screen.findByRole('heading', { level: 1, name: '01-mug' });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(document.title).toBe('01-mug - POD Pipeline');
  });

  it('focuses a heading that shows at once, and leaves the search field alone while typing', async () => {
    const { api } = createFakeApi([designDto('01-mug', 'Tulip')]);
    const { user } = await renderApp(api, '/settings');

    await user.click(await screen.findByRole('link', { name: 'Designs' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Designs' });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    const search = screen.getByRole('searchbox');
    await user.type(search, 'gh');

    await waitFor(() => {
      expect(api.listDesigns).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'gh' }));
    });
    expect(search).toHaveFocus();
  });
});
