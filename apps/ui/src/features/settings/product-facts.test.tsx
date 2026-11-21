import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../api/query-keys.js';
import { createFakeApi } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';

describe('product facts setting', () => {
  it('edits the facts of one product and keeps the others', async () => {
    const { api } = createFakeApi([]);
    const { user, queryClient } = await renderApp(api, '/settings');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const form = within(await screen.findByRole('form', { name: 'Product facts' }));

    expect(form.getByLabelText('Material')).toHaveValue('White ceramic');
    expect(form.getByLabelText('Care')).toHaveAttribute('maxlength', '500');
    await user.clear(form.getByLabelText('Care'));
    await user.type(form.getByLabelText('Care'), 'Hand wash');
    await user.click(form.getByRole('button', { name: 'Save facts' }));

    expect(api.updateSettings).toHaveBeenCalledWith({
      productFacts: { mug: { material: 'White ceramic', care: 'Hand wash', fit: '', size: '' } },
    });
    expect(await form.findByText('Saved')).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.printChecks });

    await user.click(screen.getByRole('combobox', { name: 'Product' }));
    await user.click(await screen.findByRole('option', { name: 'T-shirt' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Material')).toHaveValue('100% cotton');
    });
    expect(screen.getByLabelText('Fit')).toHaveValue('Unisex fit');
  });
});
