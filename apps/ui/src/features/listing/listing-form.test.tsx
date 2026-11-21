import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi, designDto, shopOptionsDto } from '../../testing/fake-api.js';
import { fillDraft, withMockups } from '../../testing/listing.js';
import { renderApp } from '../../testing/render-app.js';

describe('Etsy draft form', () => {
  it('creates a draft from the checked variants and the newest mockups', async () => {
    const { api } = await withMockups();
    const { user } = await renderApp(api, '/designs/id-01-mug');

    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    expect(form.getByLabelText('Title')).toHaveValue('Lantern Harbor Mug');
    expect(form.getByText('18 of 140 characters')).toBeInTheDocument();
    await user.type(form.getByLabelText('Title'), '!');
    expect(form.getByText('19 of 140 characters')).toBeInTheDocument();
    await user.type(form.getByLabelText('Title'), '{Backspace}');
    const create = form.getByRole('button', { name: 'Create Etsy draft' });
    await user.click(create);
    const problems = within(await screen.findByRole('alert'));
    expect(problems.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Enter a description of up to 10,000 characters.',
      'Enter a price from $0.20 to $50,000.',
    ]);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveFocus();
    });
    expect(form.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true');
    expect(api.createListing).not.toHaveBeenCalled();

    await user.type(form.getByLabelText('Description'), 'A cosy mug for tulip lovers.');
    await user.type(form.getByLabelText('Tags'), 'tulip mug, bird lover');
    await user.type(form.getByLabelText('Price (USD)'), '19,99');
    expect(form.getByText('2 of 13 tags', { exact: false })).toBeInTheDocument();
    await user.click(create);

    expect(api.createListing).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      printArea: 'default',
      language: 'en-US',
      fit: 'contain',
      title: 'Lantern Harbor Mug',
      description: 'A cosy mug for tulip lovers.',
      tags: ['tulip mug', 'bird lover'],
      price: 1999,
      currency: 'USD',
      variantIds: ['1320', '4830'],
      mockupIds: ['m-front', 'm-left'],
      shippingProfileId: '316',
      readinessStateId: '151',
      returnPolicyId: '1518',
      productionPartnerIds: ['77'],
    });
    expect(await screen.findByText('Listing 1234567890')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open on Etsy' })).toHaveAttribute(
      'href',
      'https://www.etsy.com/your/shops/me/listing-editor/edit/1234567890',
    );
  });

  it('waits for the settings before the form, and offers to read them again', async () => {
    const { api } = await withMockups();
    const settings = await api.getSettings();
    api.getSettings.mockRejectedValue(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');

    const retry = await screen.findAllByRole('button', { name: 'Try again' });
    expect(screen.queryByRole('form', { name: 'Etsy draft' })).not.toBeInTheDocument();
    api.getSettings.mockResolvedValue(settings);
    await user.click(retry.at(-1) as HTMLElement);

    expect(await screen.findByRole('form', { name: 'Etsy draft' })).toBeInTheDocument();
  });

  it('leaves out a photo removed after it was picked', async () => {
    const { api } = await withMockups();
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    const gallery = within(screen.getByRole('list', { name: 'Mockups' }));

    await user.click(gallery.getByRole('button', { name: 'Remove White Glossy Mug 11 oz · Left' }));
    await user.click(await screen.findByRole('button', { name: 'Remove photo' }));
    await waitFor(() => {
      expect(form.queryByRole('checkbox', { name: /^Left/ })).not.toBeInTheDocument();
    });
    await user.type(form.getByLabelText('Description'), 'Nice.');
    await user.type(form.getByLabelText('Price (USD)'), '20');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    expect(api.createListing).toHaveBeenCalledWith(
      expect.objectContaining({ mockupIds: ['m-front'] }),
    );
  });

  it('keeps the create button focused while the draft is made', async () => {
    const { api } = await withMockups();
    api.createListing.mockReturnValueOnce(new Promise(() => undefined));
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    await fillDraft(user);
    const create = form.getByRole('button', { name: 'Create Etsy draft' });

    await user.click(create);

    expect(await form.findByText(/Creating the draft/)).toBeInTheDocument();
    expect(create).not.toBeDisabled();
    expect(create).toHaveAttribute('aria-disabled', 'true');
    expect(create).toHaveFocus();
    await user.click(create);
    expect(api.createListing).toHaveBeenCalledTimes(1);
  });

  it('starts with the shipping profile chosen for the product, or says it left the shop', async () => {
    const { api } = await withMockups();
    api.getShopOptions.mockResolvedValue(
      shopOptionsDto({
        shippingProfiles: [
          { id: '316', label: 'Printful: Mugs' },
          { id: '412', label: 'Free everywhere' },
        ],
      }),
    );
    await api.updateSettings({ shippingProfiles: { mug: '412' } });
    const first = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    expect(form.getByRole('combobox', { name: 'Shipping profile' })).toHaveTextContent(
      'Free everywhere',
    );
    first.unmount();

    await api.updateSettings({ shippingProfiles: { mug: '999' } });
    await renderApp(api, '/designs/id-01-mug');
    const again = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    expect(
      again.getByText(
        /chosen for Mug in the settings is no longer in your Etsy shop. Pick another profile here/,
      ),
    ).toBeInTheDocument();
  });

  it('cuts a long default title by characters, never through an emoji', async () => {
    const { api } = createFakeApi([designDto('01-mug', `${'a'.repeat(138)}👻👻`)]);
    await api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
    await renderApp(api, '/designs/id-01-mug');

    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    expect(form.getByLabelText('Title')).toHaveValue(`${'a'.repeat(138)}👻👻`);
  });

  it('starts the title with the product alone for an unnamed concept', async () => {
    const { api } = createFakeApi([designDto('01-mug', null)]);
    await api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
    await renderApp(api, '/designs/id-01-mug');

    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));
    expect(form.getByLabelText('Title')).toHaveValue('Mug');
    expect(screen.getByRole('heading', { level: 1, name: '01-mug' })).toBeInTheDocument();
    expect(screen.queryByText(/· Mug$/)).not.toBeInTheDocument();
  });

  it('sends the shop settings the seller picked', async () => {
    const { api } = await withMockups();
    api.getShopOptions.mockResolvedValue(
      shopOptionsDto({
        shippingProfiles: [
          { id: '316', label: 'Printful: Mugs' },
          { id: '317', label: 'Printful: Shirts' },
        ],
        readinessStates: [
          { id: '151', label: 'made to order, 2-6 days' },
          { id: '152', label: 'ready to ship, 1 day' },
        ],
      }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const form = within(await screen.findByRole('form', { name: 'Etsy draft' }));

    await user.click(form.getByRole('combobox', { name: 'Shipping profile' }));
    await user.click(await screen.findByRole('option', { name: 'Printful: Shirts' }));
    await user.click(form.getByRole('combobox', { name: 'Processing time' }));
    await user.click(await screen.findByRole('option', { name: 'ready to ship, 1 day' }));
    await user.click(form.getByRole('combobox', { name: 'Return policy' }));
    await user.click(await screen.findByRole('option', { name: 'None' }));
    await user.click(form.getByRole('checkbox', { name: 'Printful' }));
    await user.type(form.getByLabelText('Description'), 'Nice.');
    await user.type(form.getByLabelText('Price (USD)'), '20');
    await user.click(form.getByRole('button', { name: 'Create Etsy draft' }));

    const sent = api.createListing.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      shippingProfileId: '317',
      readinessStateId: '152',
      productionPartnerIds: [],
    });
    expect(sent).not.toHaveProperty('returnPolicyId');
  });
});
