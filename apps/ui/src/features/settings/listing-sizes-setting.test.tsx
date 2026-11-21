import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';

describe('sizes setting', () => {
  it('lists the default blanket size and saves both sizes with a price for the larger one', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');
    const form = within(await screen.findByRole('form', { name: 'Sizes for prepared listings' }));

    expect(form.getByRole('checkbox', { name: '50″×60″' })).toBeChecked();
    expect(form.getByRole('checkbox', { name: '60″×80″' })).not.toBeChecked();
    await user.click(form.getByRole('checkbox', { name: '60″×80″' }));
    await user.type(form.getByLabelText('Price of 60″×80″ (USD)'), '74.99');
    await user.click(form.getByRole('button', { name: 'Save sizes' }));

    expect(api.updateSettings).toHaveBeenLastCalledWith({
      listingSizes: { blanket: ['60″×80″', '50″×60″'] },
      sizePrices: { blanket: { '60″×80″': { amount: 7499, currency: 'USD' } } },
    });
    expect(await form.findByText('Saved')).toBeInTheDocument();
  });

  it('shows the sizes loading, and offers to try again when they cannot be read', async () => {
    const { api } = createFakeApi([]);
    let fail: () => void = () => undefined;
    api.listFamilySizes.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = () => {
            reject(new ApiError({ code: 'INTERNAL', message: 'x', details: {} }));
          };
        }),
    );
    const { user } = await renderApp(api, '/settings');
    const heading = await screen.findByRole('heading', { name: 'Sizes for prepared listings' });
    const section = within(heading.parentElement as HTMLElement);

    expect(await section.findByRole('status')).toHaveAttribute('aria-busy', 'true');
    fail();
    await user.click(await section.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('form', { name: 'Sizes for prepared listings' })).toBeVisible();
  });

  it('keeps at least one size and refuses a price of nothing', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');
    const form = within(await screen.findByRole('form', { name: 'Sizes for prepared listings' }));

    await user.click(form.getByRole('checkbox', { name: '50″×60″' }));
    await user.click(form.getByRole('button', { name: 'Save sizes' }));
    expect(form.getByText('Choose at least one size.')).toBeInTheDocument();
    await user.click(form.getByRole('checkbox', { name: '50″×60″' }));
    await user.type(form.getByLabelText('Price of 50″×60″ (USD)'), '0');
    await user.click(form.getByRole('button', { name: 'Save sizes' }));

    expect(form.getByText('Enter a price above zero, for example 24.99.')).toBeInTheDocument();
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it('says so for a product in one size', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');
    await screen.findByRole('form', { name: 'Sizes for prepared listings' });

    await user.click(screen.getByRole('combobox', { name: 'Product to choose sizes for' }));
    await user.click(await screen.findByRole('option', { name: 'Mug' }));

    expect(await screen.findByText('This product comes in one size.')).toBeInTheDocument();
  });
});
