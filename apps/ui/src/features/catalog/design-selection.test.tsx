import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE } from '@pod/contracts/client';
import { renderApp } from '../../testing/render-app.js';
import { connectedApi, toolbar } from '../../testing/batch.js';

describe('picking designs', () => {
  it('picks cards one by one, all on the page or all the filter matches', async () => {
    const { api } = await connectedApi(DEFAULT_PAGE_SIZE + 6);
    const { user } = await renderApp(api);
    await screen.findByText('01-mug');

    expect(toolbar().getByText('0 designs selected')).toBeInTheDocument();
    expect(toolbar().getByRole('button', { name: 'Prepare listings' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Select 01-mug, Concept 1 Mug' }));
    expect(toolbar().getByText('1 design selected')).toBeInTheDocument();

    await user.click(toolbar().getByRole('button', { name: 'Select all on this page' }));
    expect(
      toolbar().getByText(`${String(DEFAULT_PAGE_SIZE)} designs selected`),
    ).toBeInTheDocument();

    await user.click(toolbar().getByRole('button', { name: 'Select all 30 matching' }));
    expect(toolbar().getByText('30 designs selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Select 02-mug/ })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: /Select 02-mug/ }));
    expect(toolbar().getByText('29 designs selected')).toBeInTheDocument();
    await user.click(toolbar().getByRole('button', { name: 'Select all on this page' }));
    expect(toolbar().getByText('29 designs selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Select 02-mug/ })).not.toBeChecked();

    await user.click(toolbar().getByRole('button', { name: 'Prepare listings' }));
    await screen.findByRole('dialog', { name: 'Prepare listings' });
    expect(api.estimateBatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ selection: { kind: 'filter', excludeIds: ['id-02-mug'] } }),
    );
    await user.keyboard('{Escape}');

    await user.click(toolbar().getByRole('button', { name: 'Clear selection' }));
    expect(toolbar().getByText('0 designs selected')).toBeInTheDocument();
  });

  it('waits with picking until the designs of a new search have loaded', async () => {
    const { api } = await connectedApi();
    const { user } = await renderApp(api);
    await screen.findByText('01-mug');
    const list = api.listDesigns.getMockImplementation();
    let answer: () => void = () => undefined;
    // Only the finished search waits, whichever earlier searches the typing sends.
    api.listDesigns.mockImplementation((request) => {
      const listed = list?.(request) ?? Promise.reject(new Error('no designs'));
      if (request.search !== 'Concept 1') return listed;
      return new Promise((resolve) => {
        answer = () => {
          resolve(listed);
        };
      });
    });

    await user.type(screen.getByRole('searchbox'), 'Concept 1');

    await waitFor(() => {
      expect(api.listDesigns).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Concept 1' }),
      );
    });
    await waitFor(() => {
      expect(toolbar().getByRole('button', { name: 'Select all on this page' })).toBeDisabled();
    });
    expect(toolbar().getByRole('button', { name: 'Prepare listings' })).toBeDisabled();
    answer();
    await waitFor(() => {
      expect(toolbar().getByRole('button', { name: 'Select all on this page' })).toBeEnabled();
    });
  });
});
