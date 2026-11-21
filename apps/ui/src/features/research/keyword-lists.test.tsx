import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi, keywordListDto } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { queryKeys } from '../../api/query-keys.js';

describe('keyword lists', () => {
  it('pages through a long keyword list and says when the file was cut short', async () => {
    const { api } = createFakeApi([]);
    const list = keywordListDto('list-9');
    const keywords = Array.from({ length: 450 }, (_, index) => ({
      term: `keyword ${String(index + 1)}`,
      trademark: false,
      searches: index,
      clicks: null,
      ctr: null,
      competition: null,
    }));
    api.getKeywordList.mockResolvedValue({ ...list, keywords, truncated: true });
    const { user } = await renderApp(api, `/research/lists/${list.id}`);

    expect(await screen.findByText(/so only the first 5,000 were kept/)).toBeInTheDocument();
    const rows = () => within(screen.getByRole('table')).getAllByRole('row').length - 1;
    expect(rows()).toBe(200);
    expect(screen.getByText('Showing 200 of 450')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(rows()).toBe(450);
    expect(screen.getByText('Showing 450 of 450')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('imports a keyword list and shows its figures as the export gives them', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/research');

    expect(await screen.findByText('No keyword lists yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import keyword list' }));

    expect(
      await screen.findByRole('heading', { name: 'Keywords from erank-tulip-mug.csv' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/the app has not counted or checked them/)).toBeInTheDocument();
    const table = within(screen.getByRole('table'));
    expect(table.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Keyword',
      'Searches',
      'Clicks',
      'CTR',
      'Competition',
    ]);
    const row = table.getByRole('row', { name: /tulip mug gift/ });
    expect(row).toHaveTextContent('12,345');
    expect(row).toHaveTextContent('45.5');
    expect(
      within(table.getByRole('row', { name: /disney mug/ })).getByText('Trademark'),
    ).toBeVisible();
    expect(table.getByRole('row', { name: /spooky mug/ })).toHaveTextContent('–');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'erank-tulip-mug.csv' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
    expect(screen.getByText(/^3 keywords, /)).toBeInTheDocument();
  });

  it('imports a list for the market chosen, and deletes it after asking', async () => {
    const { api } = createFakeApi([]);
    const { user, queryClient } = await renderApp(api, '/research');

    await user.click(await screen.findByRole('combobox', { name: 'Market of the list' }));
    await user.click(await screen.findByRole('option', { name: 'Germany (beta)' }));
    await user.click(screen.getByRole('button', { name: 'Import keyword list' }));

    expect(api.importKeywordList).toHaveBeenCalledWith({ market: 'DE' });
    expect(await screen.findByText(/^Imported on .* for Germany\./)).toBeInTheDocument();
    expect(screen.getByText(/^3 keywords, Germany, /)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete list' }));
    const dialog = within(await screen.findByRole('alertdialog'));
    expect(dialog.getByText(/erank-tulip-mug.csv are removed from the app/)).toBeVisible();
    const reads = api.getKeywordList.mock.calls.length;
    await user.click(dialog.getByRole('button', { name: 'Delete list' }));

    expect(api.removeKeywordList).toHaveBeenCalledWith({ id: 'list-1' });
    expect(await screen.findByText('No keyword lists yet.')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/research');
    expect(api.getKeywordList).toHaveBeenCalledTimes(reads);
    await waitFor(() => {
      const removed = queryClient
        .getQueryCache()
        .find({ queryKey: queryKeys.keywordList('list-1') });
      expect(removed?.getObserversCount() ?? 0).toBe(0);
    });
  });

  it('stays put when the file choice is cancelled, and explains a file it cannot read', async () => {
    const { api } = createFakeApi([]);
    api.importKeywordList
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(
        new ApiError({ code: 'KEYWORD_FILE_UNREADABLE', message: 'x', details: {} }),
      );
    const { user } = await renderApp(api, '/research');

    await user.click(await screen.findByRole('button', { name: 'Import keyword list' }));
    expect(await screen.findByText('No keyword lists yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import keyword list' }));

    expect(await screen.findByText(/cannot be used as a keyword list/)).toHaveTextContent(
      'at most 2 MB',
    );
    expect(screen.getByText(/^A CSV file of at most 2 MB/)).toBeVisible();
  });

  it('says so when a keyword list cannot be read', async () => {
    const { api } = createFakeApi([]);
    await renderApp(api, '/research/lists/gone');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
