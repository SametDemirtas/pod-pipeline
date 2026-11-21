import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { fillDraft, withMockups } from '../../testing/listing.js';
import { renderApp } from '../../testing/render-app.js';

describe('drafts that may be on Etsy', () => {
  it('asks whether the Etsy drafts were checked before trying again', async () => {
    const { api } = await withMockups();
    api.createListing.mockRejectedValueOnce(
      new ApiError({ code: 'DRAFT_UNCONFIRMED', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await fillDraft(user);
    const create = () => form.getByRole('button', { name: 'Create Etsy draft' });

    await user.click(create());
    expect(await screen.findByText(/check your drafts on Etsy/)).toBeInTheDocument();
    expect(form.getByRole('link', { name: 'Open your drafts on Etsy' })).toHaveAttribute(
      'href',
      'https://www.etsy.com/your/shops/me/tools/listings/state:draft',
    );

    await user.click(create());
    const ask = await screen.findByRole('alertdialog', { name: 'Did you check your Etsy drafts?' });
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(api.createListing).toHaveBeenCalledTimes(1);

    await user.click(create());
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'I checked my Etsy drafts',
      }),
    );
    expect(await screen.findByText('Listing 1234567890')).toBeInTheDocument();
    expect(api.confirmDraftsChecked).toHaveBeenCalledWith({ id: 'id-01-mug' });
    expect(api.createListing).toHaveBeenCalledTimes(2);
  });

  it('holds the draft back until the app stored that the drafts were checked', async () => {
    const { api } = await withMockups();
    api.createListing.mockRejectedValueOnce(
      new ApiError({ code: 'DRAFT_UNCONFIRMED', message: 'x', details: {} }),
    );
    let answer: () => void = () => undefined;
    api.confirmDraftsChecked
      .mockRejectedValueOnce(new ApiError({ code: 'INTERNAL', message: 'x', details: {} }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = () => {
              resolve({ job: null });
            };
          }),
      );
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await fillDraft(user);
    const create = () => form.getByRole('button', { name: 'Create Etsy draft' });
    const confirm = async () => {
      await user.click(create());
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'I checked my Etsy drafts',
        }),
      );
    };
    await user.click(create());
    await screen.findByText(/check your drafts on Etsy/);

    await confirm();
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
    expect(api.createListing).toHaveBeenCalledTimes(1);

    await confirm();
    await waitFor(() => {
      expect(create()).toHaveAttribute('aria-disabled', 'true');
    });
    await user.click(create());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.createListing).toHaveBeenCalledTimes(1);

    answer();
    expect(await screen.findByText('Listing 1234567890')).toBeInTheDocument();
    expect(api.createListing).toHaveBeenCalledTimes(2);
  });

  it('refuses a design whose draft may be on Etsy until the seller checked', async () => {
    const { api, markDraftUnchecked } = await withMockups();
    markDraftUnchecked('id-01-mug');
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await fillDraft(user);
    const create = () => form.getByRole('button', { name: 'Create Etsy draft' });

    await user.click(create());
    expect(
      await screen.findByText(/A draft of this design may already be on Etsy/),
    ).toBeInTheDocument();
    await user.click(create());
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'I checked my Etsy drafts',
      }),
    );

    expect(await screen.findByText('Listing 1234567890')).toBeInTheDocument();
    expect(api.confirmDraftsChecked).toHaveBeenCalledWith({ id: 'id-01-mug' });
  });

  it('names the draft left on Etsy and links to the drafts', async () => {
    const { api } = await withMockups();
    api.createListing.mockRejectedValueOnce(
      new ApiError({
        code: 'DRAFT_LEFT_BEHIND',
        message: 'x',
        details: { marketplaceId: '4455667788' },
      }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await fillDraft(user);

    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    expect(
      await screen.findByText(
        'Draft 4455667788 was left on Etsy because removing it failed. Delete it on Etsy, then try again.',
      ),
    ).toBeInTheDocument();
    expect(form.getByRole('link', { name: 'Open your drafts on Etsy' })).toBeInTheDocument();
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });
});
