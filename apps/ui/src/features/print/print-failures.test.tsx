import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, designDto, printCheckDto } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { mug, apiError } from '../../testing/print.js';

describe('print check failures', () => {
  it('offers a retry when the check fails for another reason', async () => {
    const { api } = createFakeApi([mug()]);
    api.checkPrint.mockRejectedValue(apiError('PROVIDER_FAILED', { reason: 'busy' }));
    const { user } = await renderApp(api, '/designs/id-01-mug');

    const alert = await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Create mockups' })).toHaveAccessibleDescription(
      'Mockups need a working print check first.',
    );
    api.checkPrint.mockReset();
    api.checkPrint.mockResolvedValue(printCheckDto());
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('470 DPI')).toBeInTheDocument();
    const next = within(screen.getByRole('list', { name: 'Next steps' }));
    expect(next.getAllByRole('listitem').map((step) => step.textContent)).toEqual(['Mockups']);
  }, 10_000);

  it('explains when the product cannot be printed yet, without mockups', async () => {
    const { api } = createFakeApi([designDto('01-blanket')]);
    api.checkPrint.mockRejectedValue(apiError('PRINT_PRODUCT_UNAVAILABLE'));
    await renderApp(api, '/designs/id-01-blanket');

    expect(
      await screen.findByText('This product type cannot be printed with Printful yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create mockups' })).not.toBeInTheDocument();
    expect(api.checkPrint).toHaveBeenCalledTimes(1);
  });

  it('calmly asks to connect Printful and still shows stored mockups', async () => {
    const { api } = createFakeApi([mug()]);
    await api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
    api.checkPrint.mockRejectedValue(apiError('PRINTFUL_NOT_CONNECTED'));
    await api.connectSignIn({ service: 'pinterest', appId: '1', appSecret: 's' });
    const { user } = await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText('Connect Printful in the settings first.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Mockups' })).toBeInTheDocument();
    expect(screen.getByText('1320 · Front')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new mockups' })).toBeDisabled();
    const next = within(screen.getByRole('list', { name: 'Next steps' }));
    // Without Printful neither a print check nor new mockups can be made yet.
    expect(next.getAllByRole('listitem').map((step) => step.textContent)).toEqual([
      'Listing text',
      'Etsy draft',
      'Pinterest',
    ]);

    await user.click(screen.getByRole('link', { name: 'Open settings' }));
    expect(await screen.findByLabelText('Printful API token')).toBeInTheDocument();
  });

  it('does not count a blurry print as checked', async () => {
    const { api } = createFakeApi([mug()]);
    api.checkPrint.mockResolvedValue(printCheckDto({ quality: 'poor', effectiveDpi: 120 }));
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText('May look blurry')).toBeInTheDocument();
    const next = within(screen.getByRole('list', { name: 'Next steps' }));
    expect(next.getAllByRole('listitem').map((step) => step.textContent)).toEqual([
      'Print check',
      'Mockups',
    ]);
  });

  it('checks prints again after a connection changes', async () => {
    const { api } = createFakeApi([mug()]);
    const { user, queryClient } = await renderApp(api, '/settings');
    queryClient.setQueryData(
      ['designs', 'print', { designId: 'x', fit: 'contain' }],
      printCheckDto(),
    );

    await user.type(await screen.findByLabelText('Printful API token'), 'token');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Connected to the store Example Store');

    expect(
      queryClient.getQueryState(['designs', 'print', { designId: 'x', fit: 'contain' }])
        ?.isInvalidated,
    ).toBe(true);
  });
});
