import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import {
  createFakeApi,
  designDto,
  printCheckDto,
  shirtVariants,
  shopOptionsDto,
} from '../../testing/fake-api.js';
import { fillDraft, withMockups } from '../../testing/listing.js';
import { renderApp } from '../../testing/render-app.js';

describe('Etsy draft prices and variants', () => {
  it('lets the seller drop variants and reorder photos', async () => {
    const { api } = await withMockups();
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    await user.click(form.getByRole('checkbox', { name: 'White Glossy Mug 15 oz' }));
    await user.click(form.getByRole('checkbox', { name: /^Front/ }));
    await user.click(form.getByRole('checkbox', { name: /^Front/ }));
    await user.type(form.getByLabelText('Description'), 'Nice.');
    await user.type(form.getByLabelText('Price (USD)'), '20');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    expect(api.createListing).toHaveBeenCalledWith(
      expect.objectContaining({
        variantIds: ['1320'],
        mockupIds: ['m-left', 'm-front'],
        price: 2000,
      }),
    );
  });

  it('starts with the price the settings give the product, in the shop’s currency only', async () => {
    const { api } = await withMockups();
    await api.updateSettings({ listingPrices: { mug: { amount: 1999, currency: 'USD' } } });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    expect(form.getByLabelText('Price (USD)')).toHaveValue('19.99');
    await user.type(form.getByLabelText('Description'), 'Nice.');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));
    expect(api.createListing).toHaveBeenCalledWith(expect.objectContaining({ price: 1999 }));
  });

  it('leaves the price empty when the settings set it in another currency', async () => {
    const { api } = await withMockups();
    await api.updateSettings({ listingPrices: { mug: { amount: 1999, currency: 'EUR' } } });
    await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    expect(form.getByLabelText('Price (USD)')).toHaveValue('');
  });

  it('asks for the prices again once the shop changed its currency', async () => {
    const { api } = await withMockups();
    api.createListing.mockRejectedValueOnce(
      new ApiError({ code: 'SHOP_CURRENCY_CHANGED', message: 'x', details: { currency: 'EUR' } }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await fillDraft(user);
    api.getShopOptions.mockResolvedValue(shopOptionsDto({ currency: 'EUR' }));

    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    expect(
      await screen.findByText(
        'Your Etsy shop now uses EUR. Enter the prices again in EUR, then create the draft.',
      ),
    ).toBeInTheDocument();
    expect(await form.findByLabelText('Price (EUR)')).toHaveValue('');
    expect(form.getByLabelText('Description')).toHaveValue('A cosy mug for tulip lovers.');
  });

  it('marks a price that is not one', async () => {
    const { api } = await withMockups();
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    await user.type(form.getByLabelText('Price (USD)'), '12.345');

    expect(form.getByText('Enter a price such as 24.99.')).toBeInTheDocument();
    expect(form.getByLabelText('Price (USD)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses a price above what Etsy allows', async () => {
    const { api } = await withMockups();
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    await user.type(form.getByLabelText('Description'), 'Nice.');
    await user.type(form.getByLabelText('Price (USD)'), '50000.01');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    expect(await screen.findByText('Enter a price from $0.20 to $50,000.')).toBeInTheDocument();
    expect(api.createListing).not.toHaveBeenCalled();
  });

  it('takes prices in whole yen and leaves the range to Etsy', async () => {
    const { api } = await withMockups();
    api.getShopOptions.mockResolvedValue(shopOptionsDto({ currency: 'JPY', currencyDigits: 0 }));
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    const price = form.getByLabelText('Price (JPY)');

    expect(
      form.getByText(
        'One price for every variant, e.g. 2499. Etsy accepts the equivalent of $0.20 to $50,000.',
      ),
    ).toBeInTheDocument();
    await user.type(price, '24.99');
    expect(form.getByText('Enter a price such as 2499.')).toBeInTheDocument();
    await user.clear(price);
    await user.type(price, '0');
    await user.type(form.getByLabelText('Description'), 'Nice.');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));
    expect(await screen.findByText('Enter a price above zero.')).toBeInTheDocument();

    await user.clear(price);
    await user.type(price, '2500');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    expect(api.createListing).toHaveBeenCalledWith(expect.objectContaining({ price: 2500 }));
  });

  it('offers the colours and sizes of a shirt, starting with every size of the checked colour', async () => {
    const { api } = createFakeApi([designDto('01-t-shirt')]);
    api.checkPrint.mockResolvedValue(
      printCheckDto({ variants: shirtVariants(), variantId: '4000', printArea: 'front' }),
    );
    await api.createMockups({ designId: 'id-01-t-shirt', fit: 'contain' });
    const { user } = await renderApp(api, '/designs/id-01-t-shirt');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    const colours = within(form.getByRole('group', { name: 'Color' }));

    expect(colours.getByRole('checkbox', { name: 'Black' })).toBeChecked();
    expect(colours.getByRole('checkbox', { name: 'White' })).not.toBeChecked();
    expect(form.getByText('2 variants chosen, at most 100.')).toBeInTheDocument();
    await user.click(colours.getByRole('checkbox', { name: 'White' }));
    await user.click(
      within(form.getByRole('group', { name: 'Size' })).getByRole('checkbox', { name: 'M' }),
    );
    await user.type(form.getByLabelText('Description'), 'Tee.');
    await user.type(form.getByLabelText('Price (USD)'), '24.99');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    expect(api.createListing).toHaveBeenCalledWith(
      expect.objectContaining({ printArea: 'front', variantIds: ['4001', '4011'] }),
    );
  });

  it('offers every size again once a colour is picked after none was', async () => {
    const { api } = createFakeApi([designDto('01-t-shirt')]);
    api.checkPrint.mockResolvedValue(
      printCheckDto({ variants: shirtVariants(), variantId: '4000', printArea: 'front' }),
    );
    const { user } = await renderApp(api, '/designs/id-01-t-shirt');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    const colours = within(form.getByRole('group', { name: 'Color' }));

    await user.click(colours.getByRole('checkbox', { name: 'Black' }));
    expect(form.getByText('0 variants chosen, at most 100.')).toBeInTheDocument();
    await user.click(colours.getByRole('checkbox', { name: 'White' }));

    expect(form.getByText('2 variants chosen, at most 100.')).toBeInTheDocument();
  });

  it('takes a size ticked with no colour as that size in every colour', async () => {
    const { api } = createFakeApi([designDto('01-t-shirt')]);
    api.checkPrint.mockResolvedValue(
      printCheckDto({ variants: shirtVariants(), variantId: '4000', printArea: 'front' }),
    );
    const { user } = await renderApp(api, '/designs/id-01-t-shirt');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    await user.click(
      within(form.getByRole('group', { name: 'Color' })).getByRole('checkbox', { name: 'Black' }),
    );
    await user.click(
      within(form.getByRole('group', { name: 'Size' })).getByRole('checkbox', { name: 'L' }),
    );

    expect(form.getByText('2 variants chosen, at most 100.')).toBeInTheDocument();
  });

  it('charges more for the sizes the seller priced on their own', async () => {
    const { api } = createFakeApi([designDto('01-t-shirt')]);
    api.checkPrint.mockResolvedValue(
      printCheckDto({ variants: shirtVariants(), variantId: '4000', printArea: 'front' }),
    );
    await api.createMockups({ designId: 'id-01-t-shirt', fit: 'contain' });
    const { user } = await renderApp(api, '/designs/id-01-t-shirt');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    const sizes = within(form.getByRole('group', { name: 'Prices by size (USD), optional' }));

    await user.type(form.getByLabelText('Description'), 'Tee.');
    await user.type(form.getByLabelText('Price (USD)'), '24.99');
    await user.type(sizes.getByLabelText('L'), '0,1');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));
    expect(
      await screen.findByText('Enter size prices from $0.20 to $50,000, or leave them empty.'),
    ).toBeInTheDocument();

    await user.clear(sizes.getByLabelText('L'));
    await user.type(sizes.getByLabelText('L'), '26.99');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    expect(api.createListing).toHaveBeenCalledWith(
      expect.objectContaining({ price: 2499, sizePrices: { L: 2699 } }),
    );
  });

  it('forgets size prices of sizes no longer chosen', async () => {
    const { api } = createFakeApi([designDto('01-t-shirt')]);
    api.checkPrint.mockResolvedValue(
      printCheckDto({ variants: shirtVariants(), variantId: '4000', printArea: 'front' }),
    );
    await api.createMockups({ designId: 'id-01-t-shirt', fit: 'contain' });
    const { user } = await renderApp(api, '/designs/id-01-t-shirt');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    const sizes = within(form.getByRole('group', { name: 'Prices by size (USD), optional' }));

    await user.type(sizes.getByLabelText('L'), '26.99');
    await user.click(
      within(form.getByRole('group', { name: 'Size' })).getByRole('checkbox', { name: 'M' }),
    );
    await user.type(form.getByLabelText('Description'), 'Tee.');
    await user.type(form.getByLabelText('Price (USD)'), '24.99');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    expect(api.createListing.mock.calls[0]?.[0]).not.toHaveProperty('sizePrices');
  });
});
