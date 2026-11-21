import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi, shopOptionsDto } from '../../testing/fake-api.js';
import { withMockups } from '../../testing/listing.js';
import { mug } from '../../testing/print.js';
import { renderApp } from '../../testing/render-app.js';

describe('draft problems', () => {
  it("counts the description against Etsy's limit", async () => {
    const { api } = await withMockups();
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    const description = form.getByLabelText('Description');

    await user.click(description);
    await user.paste('x'.repeat(10_001));

    expect(form.getByText('10,001 of 10,000 characters')).toBeInTheDocument();
    expect(description).toHaveAttribute('aria-invalid', 'true');
  });

  it('explains Etsy rules the app refused', async () => {
    const { api } = await withMockups();
    api.createListing.mockRejectedValueOnce(
      new ApiError({
        code: 'VALIDATION',
        message: 'x',
        details: { field: 'tags', reason: '"mug!" may only use letters' },
      }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    await user.type(form.getByLabelText('Description'), 'Nice.');
    await user.type(form.getByLabelText('Price (USD)'), '20');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('tags: "mug!" may only use letters')).toBeInTheDocument();
  });

  it('warns about missing shop settings and photos', async () => {
    const { api } = createFakeApi([mug()]);
    api.getShopOptions.mockResolvedValue(
      shopOptionsDto({ shippingProfiles: [], productionPartners: [], returnPolicies: [] }),
    );
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText(/no shipping profile yet/)).toBeInTheDocument();
    expect(screen.getByText(/production partner in your Etsy shop/)).toBeInTheDocument();
    expect(screen.getByText(/Create mockups above first/)).toBeInTheDocument();
  });

  it('lists every rule the draft breaks before asking Etsy', async () => {
    const { api } = createFakeApi([mug()]);
    api.getShopOptions.mockResolvedValue(shopOptionsDto({ shippingProfiles: [] }));
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    await user.clear(form.getByLabelText('Title'));
    await user.type(form.getByLabelText('Tags'), 'a really long tag over twenty');
    await user.type(form.getByLabelText('Price (USD)'), '0.10');
    await user.click(form.getByRole('checkbox', { name: 'White Glossy Mug 11 oz' }));
    await user.click(form.getByRole('checkbox', { name: 'White Glossy Mug 15 oz' }));
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    const problems = within(await screen.findByRole('alert'));
    expect(problems.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Enter a title of up to 140 characters.',
      'Enter a description of up to 10,000 characters.',
      'Use up to 13 tags of up to 20 characters each.',
      'Enter a price from $0.20 to $50,000.',
      'Choose between 1 and 100 variants, with at most 70 options of one kind, such as phone models.',
      'Choose at least one photo.',
      'Choose a shipping profile.',
    ]);
    expect(api.createListing).not.toHaveBeenCalled();
  });
});
