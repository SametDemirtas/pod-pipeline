import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi, designDto, listingDto } from '../../testing/fake-api.js';
import { withMockups } from '../../testing/listing.js';
import { mug } from '../../testing/print.js';
import { renderApp } from '../../testing/render-app.js';

describe('Etsy listing status', () => {
  it('asks to connect Etsy first', async () => {
    const { api } = await withMockups();
    api.getShopOptions.mockRejectedValue(
      new ApiError({ code: 'ETSY_NOT_CONNECTED', message: 'x', details: {} }),
    );
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText('Connect Etsy in the settings first.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Etsy draft' })).not.toBeInTheDocument();
  });

  it('links Printful, then publishes only after the seller confirms', async () => {
    const { api } = await withMockups();
    await api.createListing({
      designId: 'id-01-mug',
      fit: 'contain',
      language: 'en-US',
      title: 'T',
      description: 'D',
      tags: [],
      price: 1999,
      currency: 'USD',
      variantIds: ['1320'],
      mockupIds: ['m-front'],
      shippingProfileId: '316',
      readinessStateId: '151',
      productionPartnerIds: [],
    });
    const { user } = await renderApp(api, '/designs/id-01-mug');

    const publish = await screen.findByRole('button', { name: 'Publish' });
    expect(publish).toHaveAttribute('aria-disabled', 'true');
    expect(publish).toHaveAccessibleDescription(/Printful does not know yet/);
    await user.click(publish);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Link to Printful' }));
    expect(await screen.findByText(/Linked to Printful on/)).toBeInTheDocument();
    expect(api.linkListing).toHaveBeenCalledWith({ id: 'id-01-mug' });

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = within(await screen.findByRole('alertdialog'));
    expect(dialog.getByText(/listing fee \(USD 0.20\)/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(api.publishListing).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Publish' }),
    );

    expect(api.publishListing).toHaveBeenCalledWith({ id: 'id-01-mug' });
    expect(await screen.findByText('Published')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    // Only pinning is left once the listing is public.
    await waitFor(() => {
      const next = within(screen.getByRole('list', { name: 'Next steps' }));
      expect(next.getAllByRole('listitem').map((step) => step.textContent)).toEqual(['Pinterest']);
    });
  });

  it('says when Printful has not picked up the draft yet', async () => {
    const { api } = createFakeApi([mug()]);
    api.getListing.mockResolvedValue(listingDto());
    api.linkListing.mockRejectedValueOnce(
      new ApiError({ code: 'LISTING_NOT_SYNCED', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Link to Printful' }));

    expect(
      await screen.findByText(/Printful has not picked up the listing yet/),
    ).toBeInTheDocument();
  });

  it('offers a retry when the listing cannot be read', async () => {
    const { api } = createFakeApi([mug()]);
    api.getListing.mockRejectedValueOnce(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');

    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('form', { name: 'Etsy draft' })).toBeInTheDocument();
  });

  it('shows when the shop settings cannot be read', async () => {
    const { api } = createFakeApi([mug()]);
    api.getShopOptions.mockRejectedValue(
      new ApiError({ code: 'PROVIDER_FAILED', message: 'x', details: { reason: 'Etsy is down' } }),
    );
    await renderApp(api, '/designs/id-01-mug');

    // The shop settings are asked for twice more before the failure shows.
    expect(await screen.findByText(/Etsy is down/)).toBeInTheDocument();
    expect(api.getShopOptions).toHaveBeenCalledTimes(3);
  });

  it('points to the print check when it needs Printful', async () => {
    const { api } = createFakeApi([mug()]);
    api.checkPrint.mockRejectedValue(
      new ApiError({ code: 'PRINTFUL_NOT_CONNECTED', message: 'x', details: {} }),
    );
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText('Connect Printful in the settings first.')).toBeInTheDocument();
    expect(screen.getByText('A listing needs a working print check first.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Etsy draft' })).not.toBeInTheDocument();
  });

  it('says a product that cannot be printed cannot be listed', async () => {
    const { api } = createFakeApi([designDto('01-blanket')]);
    api.checkPrint.mockRejectedValue(
      new ApiError({ code: 'PRINT_PRODUCT_UNAVAILABLE', message: 'x', details: {} }),
    );
    await renderApp(api, '/designs/id-01-blanket');

    expect(
      await screen.findByText('A listing needs a working print check first.'),
    ).toBeInTheDocument();
  });

  it('takes over a pause or deletion done on Etsy', async () => {
    const { api } = createFakeApi([mug()]);
    api.getListing.mockResolvedValue(listingDto({ designId: 'id-01-mug' }));
    api.refreshListing
      .mockResolvedValueOnce(listingDto({ state: 'inactive' }))
      .mockResolvedValueOnce(null);
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Check on Etsy' }));
    expect(await screen.findByText('Inactive on Etsy')).toBeInTheDocument();

    api.getListing.mockResolvedValue(null);
    await user.click(screen.getByRole('button', { name: 'Check on Etsy' }));
    expect(await screen.findByRole('form', { name: 'Etsy draft' })).toBeInTheDocument();
  });

  it('offers to activate an inactive listing again', async () => {
    const { api } = createFakeApi([mug()]);
    api.getListing.mockResolvedValue(
      listingDto({ state: 'inactive', linkedAt: '2026-10-24T11:00:00.000Z', linkCurrent: true }),
    );
    await renderApp(api, '/designs/id-01-mug');

    expect(
      await screen.findByRole('button', { name: 'Activate on Etsy again' }),
    ).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('asks to link again once the design changed after linking, and links even a current one', async () => {
    const { api } = createFakeApi([mug()]);
    api.getListing.mockResolvedValue(
      listingDto({ linkedAt: '2026-10-24T11:00:00.000Z', linkCurrent: false }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');

    const publish = await screen.findByRole('button', { name: 'Publish' });
    expect(publish).toHaveAttribute('aria-disabled', 'true');
    expect(publish).toHaveAccessibleDescription(
      'The design has changed since it was linked. Link it to Printful again before publishing.',
    );
    expect(screen.queryByText(/Linked to Printful on/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Link to Printful again' }));
    expect(api.linkListing).toHaveBeenCalledWith({ id: 'id-01-mug', again: true });
  });
});
