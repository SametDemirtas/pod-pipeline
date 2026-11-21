import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { batchJobDto } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { connectedApi } from '../../testing/batch.js';

describe('progress panel', () => {
  it('follows the run, says why designs stopped and retries them', async () => {
    const { api, emitBatchChanged } = await connectedApi();
    const { user } = await renderApp(api);
    await screen.findByText('01-mug');
    expect(screen.queryByRole('button', { name: /^Preparation/ })).not.toBeInTheDocument();

    emitBatchChanged({ job: batchJobDto() });
    await user.click(await screen.findByRole('button', { name: 'Preparation: 1 of 3' }));
    const panel = within(await screen.findByRole('dialog', { name: 'Listing preparation' }));
    expect(panel.getByRole('progressbar', { name: '1 of 3 designs through' })).toBeInTheDocument();
    expect(panel.getByRole('status')).toHaveTextContent('Now: 02-mug, Printful mockups');
    expect(
      panel.getByText(/2 done, 0 already there, 0 failed, 0 stopped, 1 waiting/),
    ).toBeInTheDocument();
    expect(panel.getByText('No design has stopped.')).toBeInTheDocument();

    emitBatchChanged({
      job: batchJobDto({
        state: 'finished',
        current: null,
        settledDesigns: 3,
        failures: [
          {
            designId: 'id-01-mug',
            designKey: '01-mug',
            step: 'draft',
            error: { code: 'LISTING_PRICE_MISSING', message: 'm', details: { familyId: 'mug' } },
            draftCheck: null,
          },
          {
            designId: 'id-02-mug',
            designKey: '02-mug',
            step: 'print',
            error: {
              code: 'PRINT_QUALITY_POOR',
              message: 'm',
              details: { effectiveDpi: 90, size: '60″×80″' },
            },
            draftCheck: null,
          },
        ],
      }),
    });

    const failures = within(await panel.findByRole('list', { name: 'Designs that stopped' }));
    expect(failures.getByRole('link', { name: '01-mug, Etsy draft' })).toHaveAttribute(
      'href',
      '#/designs/id-01-mug',
    );
    expect(
      failures.getByText('Set a price for Mug in the settings, then retry.'),
    ).toBeInTheDocument();
    expect(failures.getByText(/prints at only 90 DPI.*Size: 60″×80″/)).toBeInTheDocument();
    expect(panel.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();

    await user.click(panel.getByRole('button', { name: 'Retry failed' }));

    expect(api.retryBatch).toHaveBeenCalled();
    expect(await panel.findByText('Running')).toBeInTheDocument();
  });

  it('asks before the seller says a draft that may be on Etsy was checked', async () => {
    const { api, emitBatchChanged } = await connectedApi();
    const unconfirmed = { code: 'DRAFT_UNCONFIRMED' as const, message: 'm', details: {} };
    emitBatchChanged({
      job: batchJobDto({
        state: 'finished',
        current: null,
        failures: [
          {
            designId: 'id-01-mug',
            designKey: '01-mug',
            step: 'draft',
            error: unconfirmed,
            draftCheck: unconfirmed,
          },
        ],
      }),
    });
    const { user } = await renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Preparation: 1 of 3' }));
    const panel = within(await screen.findByRole('dialog', { name: 'Listing preparation' }));

    expect(panel.getAllByText(/check your drafts on Etsy before trying again/)).toHaveLength(1);
    expect(panel.queryByRole('button', { name: 'Retry failed' })).not.toBeInTheDocument();
    expect(await panel.findByRole('link', { name: 'Open your drafts on Etsy' })).toHaveAttribute(
      'href',
      'https://www.etsy.com/your/shops/me/tools/listings/state:draft',
    );
    await user.click(panel.getByRole('button', { name: 'I checked my drafts: 01-mug' }));
    expect(api.confirmDraftsChecked).not.toHaveBeenCalled();
    const confirm = within(await screen.findByRole('alertdialog'));
    expect(confirm.getByText(/creating another one now could leave two/)).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'I checked my Etsy drafts' }));

    expect(api.confirmDraftsChecked).toHaveBeenCalledWith({ id: 'id-01-mug' });
    expect(await panel.findByText('No design has stopped.')).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('shows a draft to check beside another failure of the same design', async () => {
    const { api, emitBatchChanged } = await connectedApi();
    emitBatchChanged({
      job: batchJobDto({
        state: 'finished',
        current: null,
        failures: [
          {
            designId: 'id-01-mug',
            designKey: '01-mug',
            step: 'print',
            error: { code: 'PRINT_QUALITY_POOR', message: 'm', details: { effectiveDpi: 90 } },
            draftCheck: {
              code: 'DRAFT_LEFT_BEHIND',
              message: 'm',
              details: { marketplaceId: '77' },
            },
          },
        ],
      }),
    });
    const { user } = await renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Preparation: 1 of 3' }));
    const panel = within(await screen.findByRole('dialog', { name: 'Listing preparation' }));

    expect(panel.getByText(/prints at only 90 DPI/)).toBeInTheDocument();
    expect(panel.getByText(/Draft 77 was left on Etsy/)).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Retry failed' })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'I checked my drafts: 01-mug' })).toBeInTheDocument();
  });

  it('cancels after asking, then offers to resume', async () => {
    const { api, emitBatchChanged } = await connectedApi();
    emitBatchChanged({ job: batchJobDto() });
    const { user } = await renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Preparation: 1 of 3' }));
    const panel = within(await screen.findByRole('dialog', { name: 'Listing preparation' }));

    await user.click(panel.getByRole('button', { name: 'Cancel run' }));
    const confirm = within(await screen.findByRole('alertdialog'));
    expect(confirm.getByText(/no draft is left half made/)).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'Cancel run' }));

    expect(api.cancelBatch).toHaveBeenCalled();
    expect(await panel.findByText('Stopping after the current step…')).toBeInTheDocument();
    emitBatchChanged({ job: batchJobDto({ state: 'cancelled', current: null }) });
    await user.click(await panel.findByRole('button', { name: 'Resume' }));
    expect(api.resumeBatch).toHaveBeenCalled();
  });

  it('drops the error of an earlier change once another one is made', async () => {
    const { api, emitBatchChanged } = await connectedApi();
    api.cancelBatch.mockRejectedValueOnce(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    emitBatchChanged({ job: batchJobDto() });
    const { user } = await renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Preparation: 1 of 3' }));
    const panel = within(await screen.findByRole('dialog', { name: 'Listing preparation' }));

    await user.click(panel.getByRole('button', { name: 'Cancel run' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel run' }),
    );
    expect(await panel.findByText(/Something went wrong/)).toBeInTheDocument();

    emitBatchChanged({ job: batchJobDto({ state: 'paused', current: null }) });
    await user.click(await panel.findByRole('button', { name: 'Resume' }));
    await waitFor(() => {
      expect(panel.queryByText(/Something went wrong/)).not.toBeInTheDocument();
    });
  });

  it('offers to resume a run the app was closed during', async () => {
    const { api, emitBatchChanged } = await connectedApi();
    emitBatchChanged({ job: batchJobDto({ state: 'paused', current: null }) });
    const { user } = await renderApp(api, '/', 'de');
    await user.click(await screen.findByRole('button', { name: 'Vorbereitung: 1 von 3' }));
    const panel = within(await screen.findByRole('dialog', { name: 'Angebotsvorbereitung' }));

    expect(panel.getByText('Pausiert. Setze fort, um weiterzumachen.')).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Fortsetzen' })).toBeInTheDocument();
  });
});
