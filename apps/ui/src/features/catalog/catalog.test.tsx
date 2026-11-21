import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, DEFAULT_PAGE_SIZE } from '@pod/contracts/client';
import { createFakeApi, designDto } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { SEARCH_DELAY_MS } from './use-catalog-filters.js';

function designs(count: number) {
  return Array.from({ length: count }, (_, index) =>
    designDto(`${String(index + 1).padStart(2, '0')}-${index % 2 ? 'blanket' : 'mug'}`),
  );
}

const sample = () => [
  designDto('01-mug', 'Lantern Harbor'),
  designDto('01-blanket', 'Lantern Harbor'),
  designDto('02-mug', 'Frost Garden'),
];

afterEach(() => {
  vi.useRealTimers();
});

describe('catalog', () => {
  it('shows designs page by page and loads more on request', async () => {
    const { api } = createFakeApi(designs(DEFAULT_PAGE_SIZE + 5));
    const { user } = await renderApp(api);

    const list = await screen.findByRole('list', { name: 'Designs' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(screen.getByText(`Showing ${DEFAULT_PAGE_SIZE} of 29`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')).toHaveLength(DEFAULT_PAGE_SIZE + 5);
    });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(api.listDesigns).toHaveBeenLastCalledWith({ cursor: String(DEFAULT_PAGE_SIZE) });
  });

  it('takes the total from the newest page', async () => {
    const all = designs(DEFAULT_PAGE_SIZE + 5);
    const { api } = createFakeApi(all);
    api.listDesigns.mockResolvedValueOnce({
      items: all.slice(0, DEFAULT_PAGE_SIZE),
      nextCursor: String(DEFAULT_PAGE_SIZE),
      total: 20,
    });
    const { user } = await renderApp(api);

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Showing 29 of 29')).toBeInTheDocument();
  });

  it('filters by product and keeps the filter in the address', async () => {
    const { api } = createFakeApi(sample());
    const { user } = await renderApp(api);
    await screen.findByText('01-mug');

    await user.click(screen.getByRole('combobox', { name: 'Product' }));
    await user.click(await screen.findByRole('option', { name: 'Blanket' }));

    await waitFor(() => {
      expect(screen.queryByText('01-mug')).not.toBeInTheDocument();
    });
    expect(screen.getByText('01-blanket')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/?family=blanket');
  });

  it('shows all products while the product in the address is unknown', async () => {
    const { api } = createFakeApi(sample());
    await renderApp(api, '/?family=lamp');

    expect(await screen.findByRole('combobox', { name: 'Product' })).toHaveTextContent(
      'All products',
    );
    expect(await screen.findByText('01-mug')).toBeInTheDocument();
    expect(api.listDesigns).not.toHaveBeenCalledWith(expect.objectContaining({ familyId: 'lamp' }));
  });

  it('restores filters from the address', async () => {
    const { api } = createFakeApi(sample());
    await renderApp(api, '/?family=mug&q=frost');

    expect(await screen.findByText('02-mug')).toBeInTheDocument();
    expect(screen.queryByText('01-mug')).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('frost');
    expect(screen.getByRole('combobox', { name: 'Product' })).toHaveTextContent('Mug');
    expect(api.listDesigns).toHaveBeenCalledWith({ familyId: 'mug', search: 'frost' });
  });

  it('keeps the filters on the way back from a design, and follows the sidebar link', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = createFakeApi(sample());
    const { user } = await renderApp(api, '/?family=mug&q=frost', 'en', (ms) =>
      vi.advanceTimersByTime(ms),
    );

    await user.click(await screen.findByRole('link', { name: /^02-mug/ }));
    await user.click(await screen.findByRole('link', { name: 'All designs' }));

    expect(window.location.hash).toBe('#/?family=mug&q=frost');
    expect(await screen.findByRole('searchbox', { name: 'Search' })).toHaveValue('frost');

    await user.click(screen.getByRole('link', { name: 'Designs' }));

    expect(window.location.hash).toBe('#/');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
    expect(await screen.findByText('01-mug')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS + 50);
    });
    expect(window.location.hash).toBe('#/');
  });

  it('searches once typing pauses, with surrounding spaces removed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = createFakeApi(sample());
    const { user } = await renderApp(api, '/', 'en', (ms) => vi.advanceTimersByTime(ms));
    await screen.findByText('01-mug');
    api.listDesigns.mockClear();

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), '  frost  ');
    expect(api.listDesigns).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });

    await waitFor(() => {
      expect(screen.queryByText('01-blanket')).not.toBeInTheDocument();
    });
    expect(api.listDesigns.mock.calls.map(([request]) => request.search)).toEqual(['frost']);
    expect(window.location.hash).toBe('#/?q=frost');
  });

  it('invites the user to import when the catalog is empty', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api);

    expect(await screen.findByText('No designs yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Import designs' })).toHaveLength(1);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import designs' }));

    expect(await screen.findByRole('dialog', { name: 'Import designs' })).toBeInTheDocument();
  });

  it('offers to clear filters when nothing matches', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = createFakeApi(sample());
    const { user } = await renderApp(api, '/?q=nothing', 'en', (ms) => vi.advanceTimersByTime(ms));

    expect(await screen.findByText('No matching designs')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(await screen.findByText('01-mug')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
    expect(window.location.hash).toBe('#/');
    // The search typed before must not come back once its delay is over.
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS + 50);
    });
    expect(window.location.hash).toBe('#/');
    expect(api.listDesigns).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'nothing' }),
    );
  });

  it('refreshes when another client changes the catalog', async () => {
    const all = sample();
    const { api, emitCatalogChanged } = createFakeApi(all.slice(0, 1));
    await renderApp(api);
    await screen.findByText('01-mug');

    api.listDesigns.mockResolvedValue({ items: all, nextCursor: null, total: 3 });
    act(() => {
      emitCatalogChanged();
    });

    expect(await screen.findByText('02-mug')).toBeInTheDocument();
  });

  it('announces loading and shows a translated error with retry', async () => {
    const { api } = createFakeApi([designDto('01-mug')]);
    api.listDesigns.mockRejectedValueOnce(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/', 'tr');

    expect(await screen.findByRole('alert')).toHaveTextContent('Bir şeyler ters gitti');
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText('01-mug')).toBeInTheDocument();
  });

  it('names cards with design code, concept and product', async () => {
    const { api } = createFakeApi([designDto('01-blanket', 'Tulip'), designDto('02-mug', null)]);
    await renderApp(api);

    expect(await screen.findByRole('link', { name: '01-blanket, Tulip Blanket' })).toHaveAttribute(
      'href',
      '#/designs/id-01-blanket',
    );
    const unnamed = screen.getByRole('link', { name: '02-mug, Mug' });
    expect(within(unnamed).getByText('No concept name')).toBeInTheDocument();
    expect(document.title).toBe('Designs - POD Pipeline');
  });
});
