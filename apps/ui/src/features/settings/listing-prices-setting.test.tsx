import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi, shopOptionsDto } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { queryKeys } from '../../api/query-keys.js';

describe('listing prices setting', () => {
  it('saves a price per product in the shop currency, and none for blank ones', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');
    const form = within(
      await screen.findByRole('form', { name: 'Prices and shipping for prepared listings' }),
    );

    await user.type(form.getByLabelText('Mug (USD)'), '18.99');
    await user.type(form.getByLabelText('Blanket (USD)'), '0');
    await user.click(form.getByRole('button', { name: 'Save prices' }));
    expect(form.getByText('Enter a price above zero, for example 24.99.')).toBeInTheDocument();
    expect(api.updateSettings).not.toHaveBeenCalled();

    await user.clear(form.getByLabelText('Blanket (USD)'));
    await user.click(form.getByRole('button', { name: 'Save prices' }));

    expect(api.updateSettings).toHaveBeenCalledWith({
      listingPrices: { mug: { amount: 1899, currency: 'USD' }, blanket: null },
      shippingProfiles: {},
    });
    expect(await form.findByText('Saved')).toBeInTheDocument();
  });

  it('shows saved prices, asks again for one in another currency and keeps it until then', async () => {
    const { api } = createFakeApi([]);
    await api.updateSettings({
      listingPrices: {
        mug: { amount: 1899, currency: 'USD' },
        blanket: { amount: 4500, currency: 'EUR' },
      },
    });
    const { user } = await renderApp(api, '/settings');
    const form = within(
      await screen.findByRole('form', { name: 'Prices and shipping for prepared listings' }),
    );

    expect(form.getByLabelText('Mug (USD)')).toHaveValue('18.99');
    expect(form.getByLabelText('Blanket (USD)')).toHaveValue('');
    expect(form.getByLabelText('Blanket (USD)')).toHaveAccessibleDescription(
      'Set in EUR; enter it again in your shop’s currency.',
    );

    await user.type(form.getByLabelText('iPhone case (USD)'), '21');
    await user.click(form.getByRole('button', { name: 'Save prices' }));

    expect(api.updateSettings).toHaveBeenLastCalledWith({
      listingPrices: { 'phone-case': { amount: 2100, currency: 'USD' } },
      shippingProfiles: {},
    });
    expect((await api.getSettings()).listingPrices['blanket']).toEqual({
      amount: 4500,
      currency: 'EUR',
    });
  });

  it('drops prices typed in a currency the shop no longer uses', async () => {
    const { api } = createFakeApi([]);
    const { user, queryClient } = await renderApp(api, '/settings');
    const form = () =>
      within(screen.getByRole('form', { name: 'Prices and shipping for prepared listings' }));
    await screen.findByRole('form', { name: 'Prices and shipping for prepared listings' });
    await user.type(form().getByLabelText('Mug (USD)'), '18.99');

    api.getShopOptions.mockResolvedValue(shopOptionsDto({ currency: 'EUR' }));
    await queryClient.invalidateQueries({ queryKey: queryKeys.shopOptions });

    expect(await screen.findByLabelText('Mug (EUR)')).toHaveValue('');
  });

  it('saves a shipping profile per product and goes back to the first one', async () => {
    const { api } = createFakeApi([]);
    api.getShopOptions.mockResolvedValue(
      shopOptionsDto({
        shippingProfiles: [
          { id: '316', label: 'Free everywhere' },
          { id: '412', label: 'Free US, paid UK and EU' },
        ],
      }),
    );
    await api.updateSettings({ shippingProfiles: { mug: '316', blanket: '999' } });
    const { user } = await renderApp(api, '/settings');
    const form = within(
      await screen.findByRole('form', { name: 'Prices and shipping for prepared listings' }),
    );

    expect(form.getByRole('combobox', { name: 'Shipping profile for Mug' })).toHaveTextContent(
      'Free everywhere',
    );
    expect(
      form.getByText(/The profile chosen before is no longer in your shop/),
    ).toBeInTheDocument();
    await user.click(form.getByRole('combobox', { name: 'Shipping profile for iPhone case' }));
    await user.click(await screen.findByRole('option', { name: 'Free US, paid UK and EU' }));
    await user.click(form.getByRole('combobox', { name: 'Shipping profile for Mug' }));
    await user.click(await screen.findByRole('option', { name: 'The shop’s first profile' }));
    await user.click(form.getByRole('button', { name: 'Save prices' }));

    expect(api.updateSettings).toHaveBeenLastCalledWith({
      listingPrices: {},
      shippingProfiles: { 'phone-case': '412', mug: null },
    });
    expect((await api.getSettings()).shippingProfiles).toEqual({
      'phone-case': '412',
      blanket: '999',
    });
  });

  it('asks for Etsy first, since prices are in the shop currency', async () => {
    const { api } = createFakeApi([]);
    api.getShopOptions.mockRejectedValue(
      new ApiError({ code: 'ETSY_NOT_CONNECTED', message: 'connect', details: {} }),
    );
    await renderApp(api, '/settings');

    expect(
      await screen.findByText('Connect Etsy to set prices in your shop’s currency.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'Prices and shipping for prepared listings' }),
    ).toBeNull();
  });

  it('offers to try again when the shop cannot be read', async () => {
    const { api } = createFakeApi([]);
    api.getShopOptions.mockRejectedValue(new Error('offline'));
    const { user } = await renderApp(api, '/settings');
    const retry = await screen.findByRole('button', { name: 'Try again' });
    api.getShopOptions.mockResolvedValue(shopOptionsDto());

    await user.click(retry);

    expect(
      await screen.findByRole('form', { name: 'Prices and shipping for prepared listings' }),
    ).toBeInTheDocument();
  });
});
