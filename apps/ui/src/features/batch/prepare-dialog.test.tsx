import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { batchEstimateDto, batchJobDto, createFakeApi } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { designs, connectedApi, toolbar } from '../../testing/batch.js';

describe('preparing listings', () => {
  it('ticks upscaling for a new run only when the settings say so', async () => {
    const { api } = await connectedApi();
    await api.updateSettings({ autoUpscale: true });
    const { user } = await renderApp(api);
    await user.click(await screen.findByRole('checkbox', { name: /Select 01-mug/ }));

    await user.click(toolbar().getByRole('button', { name: 'Prepare listings' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Prepare listings' }));
    const upscale = dialog.getByRole('checkbox', { name: /Upscale low-resolution artwork/ });

    expect(upscale).toBeChecked();
    expect(upscale).toHaveAccessibleDescription(/Only artwork that would print blurry/);
    await waitFor(() => {
      expect(api.estimateBatch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          steps: ['upscale', 'print', 'mockups', 'research', 'text', 'draft'],
        }),
      );
    });
    await user.click(upscale);
    expect(upscale).not.toBeChecked();
  });

  it('shows an honest estimate and starts only after the seller confirms', async () => {
    const { api } = await connectedApi();
    const { user } = await renderApp(api);
    await user.click(await screen.findByRole('checkbox', { name: /Select 01-mug/ }));
    await user.click(screen.getByRole('checkbox', { name: /Select 02-mug/ }));

    await user.click(toolbar().getByRole('button', { name: 'Prepare listings' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Prepare listings' }));

    expect(
      await dialog.findByText(
        'Keywords: from saved research and imported keyword lists, free. Etsy is not searched.',
      ),
    ).toBeInTheDocument();
    expect(
      dialog.getByText(/Requests to Claude \(claude-opus-5-5\): 675 to 1,350, billed to your key/),
    ).toBeInTheDocument();
    expect(dialog.getByText(/Written in: en-US, de, and fr/)).toBeInTheDocument();
    expect(dialog.getByText(/has no price list for this model/)).toBeInTheDocument();
    expect(dialog.getByText('Etsy drafts: 225, free until you publish them.')).toBeInTheDocument();
    expect(dialog.getByText('Shipping profiles: Mug: Printful: Mugs.')).toBeInTheDocument();
    expect(api.estimateBatch).toHaveBeenLastCalledWith({
      selection: { kind: 'designs', designIds: ['id-01-mug', 'id-02-mug'] },
      steps: ['print', 'mockups', 'research', 'text', 'draft'],
      market: 'US',
    });
    expect(api.startBatch).not.toHaveBeenCalled();

    await user.click(dialog.getByRole('checkbox', { name: /Listing text and translations/ }));
    expect(dialog.getByRole('checkbox', { name: /Etsy draft/ })).not.toBeChecked();
    await user.click(dialog.getByRole('checkbox', { name: /Keywords from your lists/ }));
    expect(dialog.queryByRole('combobox', { name: 'Research market' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(api.estimateBatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ steps: ['print', 'mockups'] }),
      );
    });

    await user.click(dialog.getByRole('button', { name: 'Start' }));

    expect(api.startBatch).toHaveBeenCalledWith({
      selection: { kind: 'designs', designIds: ['id-01-mug', 'id-02-mug'] },
      steps: ['print', 'mockups'],
      market: 'US',
    });
    const progress = within(await screen.findByRole('dialog', { name: 'Listing preparation' }));
    expect(progress.getByText('0 of 2 designs through')).toBeInTheDocument();
    await user.click(progress.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Preparation: 0 of 2' })).toBeInTheDocument();
  });

  it('prepares every design the filter matches, in the chosen market', async () => {
    const { api } = await connectedApi();
    api.estimateBatch.mockResolvedValue(
      batchEstimateDto({
        designs: 3,
        draftsWaiting: 2,
        missingPrices: [{ familyId: 'blanket', sizes: ['60″×80″'] }],
        shipping: [
          { familyId: 'mug', profile: null, missing: 'gone' },
          { familyId: 'phone-case', profile: 'Cases, small', missing: null },
        ],
      }),
    );
    const { user } = await renderApp(api, '/?family=mug');
    await screen.findByText('01-mug');
    await user.click(toolbar().getByRole('button', { name: 'Select all 3 matching' }));
    await user.click(toolbar().getByRole('button', { name: 'Prepare listings' }));
    const dialog = within(await screen.findByRole('dialog'));

    await user.click(dialog.getByRole('combobox', { name: 'Research market' }));
    await user.click(await screen.findByRole('option', { name: 'Germany (beta)' }));
    await dialog.findByText(/^What this will do: 3 designs/);
    expect(
      dialog.getByText(/Designs waiting until you check your Etsy drafts: 2/),
    ).toBeInTheDocument();
    expect(
      dialog.getByText(/Mug: chosen profile no longer on Etsy; iPhone case: Cases, small\./),
    ).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Start' }));

    expect(api.startBatch).toHaveBeenCalledWith(
      expect.objectContaining({ selection: { kind: 'filter', familyId: 'mug' }, market: 'DE' }),
    );
  });

  it('stays open while the run starts', async () => {
    const { api } = await connectedApi();
    let started: () => void = () => undefined;
    api.startBatch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          started = () => {
            resolve({ job: batchJobDto({ designs: 1, settledDesigns: 0 }) });
          };
        }),
    );
    const { user } = await renderApp(api);
    await user.click(await screen.findByRole('checkbox', { name: /Select 01-mug/ }));
    await user.click(toolbar().getByRole('button', { name: 'Prepare listings' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Prepare listings' }));
    await dialog.findByText(/^What this will do/);

    await user.click(dialog.getByRole('button', { name: 'Start' }));
    await user.keyboard('{Escape}');
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('dialog', { name: 'Prepare listings' })).toBeInTheDocument();
    started();
    expect(await screen.findByRole('dialog', { name: 'Listing preparation' })).toBeInTheDocument();
  });

  it('asks for the text AI key before a run that writes text', async () => {
    const { api } = createFakeApi(designs(2));
    const { user } = await renderApp(api);
    await user.click(await screen.findByRole('checkbox', { name: /Select 01-mug/ }));
    await user.click(toolbar().getByRole('button', { name: 'Prepare listings' }));
    const dialog = within(await screen.findByRole('dialog'));

    expect(
      await dialog.findByText(
        'Writing listing text needs a Claude key. Add it in the settings first.',
      ),
    ).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('shows why the estimate failed and does not start', async () => {
    const { api } = await connectedApi();
    api.estimateBatch.mockRejectedValue(new Error('no shop'));
    const { user } = await renderApp(api);
    await user.click(await screen.findByRole('checkbox', { name: /Select 01-mug/ }));
    await user.click(toolbar().getByRole('button', { name: 'Prepare listings' }));
    const dialog = within(await screen.findByRole('dialog'));

    expect(await dialog.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(dialog.getByRole('button', { name: 'Start' })).toBeDisabled();
  });
});
