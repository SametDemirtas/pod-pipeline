import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, designDto, mockupDto } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { TOMORROW, withPhotos, pinsList, findPins } from '../../testing/pins.js';
import { localDateTime } from './pin-form.js';

describe('Pinterest pins', () => {
  it('asks to connect Pinterest first', async () => {
    const { api } = await withPhotos(false);
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText('Connect Pinterest in the settings first.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New pin' })).not.toBeInTheDocument();
    expect(api.listBoards).not.toHaveBeenCalled();
  });

  it('plans a pin, publishes it now and removes it after asking', async () => {
    const { api } = await withPhotos();
    const { user } = await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText('No pins yet.')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'New pin' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Plan a pin' }));
    expect(dialog.getByLabelText('Title')).toHaveValue('Lantern Harbor');
    await user.clear(dialog.getByLabelText('Title'));
    await user.click(dialog.getByRole('button', { name: 'Plan pin' }));
    expect(dialog.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    const problems = dialog.getByRole('alert');
    expect(problems).toHaveTextContent('Enter a title of up to 100 characters.');
    await waitFor(() => {
      expect(problems).toHaveFocus();
    });
    expect(api.planPin).not.toHaveBeenCalled();

    await user.type(dialog.getByLabelText('Title'), 'Tulip mug for readers');
    await user.type(dialog.getByLabelText('Words on the pin'), 'Spooky reads');
    await user.click(dialog.getByRole('radio', { name: 'Photo 2' }));
    await user.click(dialog.getByRole('combobox', { name: 'Board' }));
    await user.click(await screen.findByRole('option', { name: 'Cozy gifts' }));
    const publishAt = dialog.getByLabelText('Publish at');
    const typed = localDateTime(new Date(Date.now() + 2 * 86_400_000));
    await user.clear(publishAt);
    await user.type(publishAt, typed);
    await user.click(dialog.getByRole('button', { name: 'Plan pin' }));

    expect(api.planPin).toHaveBeenCalledWith(
      expect.objectContaining({
        designId: 'id-01-mug',
        mockupId: 'm-left',
        boardId: '5002',
        title: 'Tulip mug for readers',
        headline: 'Spooky reads',
        publishAt: new Date(typed).toISOString(),
      }),
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(await pinsList().findByText('Planned')).toBeInTheDocument();
    expect(pinsList().getByText(/^Cozy gifts, /)).toBeInTheDocument();

    await user.click(pinsList().getByRole('button', { name: 'Publish now' }));
    expect(await pinsList().findByText('Published')).toBeInTheDocument();
    expect(pinsList().getByRole('link', { name: 'Open on Pinterest' })).toHaveAttribute(
      'href',
      'https://www.pinterest.com/pin/987/',
    );

    await user.click(
      pinsList().getByRole('button', { name: 'Remove the pin Tulip mug for readers' }),
    );
    const confirm = within(await screen.findByRole('alertdialog', { name: 'Remove this pin?' }));
    expect(confirm.getByText(/stays on Pinterest/)).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('No pins yet.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Pinterest' })).toHaveFocus();
    });
  });

  it('keeps the focus on the pins list after removing one of several pins', async () => {
    const { api } = await withPhotos();
    for (const title of ['First pin', 'Second pin']) {
      await api.planPin({
        designId: 'id-01-mug',
        mockupId: 'm-front',
        title,
        description: '',
        altText: '',
        headline: '',
        boardId: '5001',
        publishAt: TOMORROW,
      });
    }
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click((await findPins()).getByRole('button', { name: 'Remove the pin First pin' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('list', { name: 'Pins' })).toHaveFocus();
    });
    expect(pinsList().getAllByRole('listitem')).toHaveLength(1);
  });

  it('lets the seller approve a pin an assistant proposed', async () => {
    const { api } = await withPhotos();
    await api.proposePin({
      designId: 'id-01-mug',
      mockupId: 'm-front',
      title: 'Proposed pin',
      description: '',
      altText: '',
      headline: '',
      boardId: '5001',
      publishAt: TOMORROW,
    });
    const { user } = await renderApp(api, '/designs/id-01-mug');

    expect(await (await findPins()).findByText('Waiting for approval')).toBeInTheDocument();
    expect(pinsList().queryByRole('button', { name: 'Publish now' })).not.toBeInTheDocument();
    await user.click(pinsList().getByRole('button', { name: 'Approve' }));

    expect(api.approvePin).toHaveBeenCalledWith({ id: 'pin-1' });
    expect(await pinsList().findByText('Planned')).toBeInTheDocument();
    expect(pinsList().getByRole('listitem')).toHaveFocus();
  });

  it('asks for photos before pins can be made', async () => {
    const { api } = createFakeApi([designDto('01-mug')]);
    await api.connectSignIn({ service: 'pinterest', appId: '1', appSecret: 's' });
    await renderApp(api, '/designs/id-01-mug');

    expect(
      await screen.findByText('Create mockups above first; pins are made from them.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New pin' })).not.toBeInTheDocument();
  });

  it('offers only scenes whose print the seller confirmed', async () => {
    const { api } = await withPhotos();
    const photos = await api.listMockups({ id: 'id-01-mug' });
    const scene = (id: string, printConfirmed: boolean) => ({
      ...mockupDto(id, 'Scene'),
      scenePrompt: 'On a desk',
      printConfirmed,
    });
    api.listMockups.mockResolvedValue([...photos, scene('s-ok', true), scene('s-new', false)]);
    const { user } = await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText('No pins yet.')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'New pin' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Plan a pin' }));

    expect(dialog.getAllByRole('radio')).toHaveLength(photos.length + 1);
    expect(dialog.getAllByRole('radio', { name: /a scene$/ })).toHaveLength(1);
  });

  it('starts the title with the product for an unnamed concept', async () => {
    const fake = createFakeApi([designDto('01-mug', null)]);
    await fake.api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
    await fake.api.connectSignIn({ service: 'pinterest', appId: '1', appSecret: 's' });
    const { user } = await renderApp(fake.api, '/designs/id-01-mug');

    expect(await screen.findByText('No pins yet.')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'New pin' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Plan a pin' }));
    expect(dialog.getByLabelText('Title')).toHaveValue('Mug');
  });

  it('says a late proposal goes out right after approval', async () => {
    const { api } = await withPhotos();
    await api.proposePin({
      designId: 'id-01-mug',
      mockupId: 'm-front',
      title: 'Late proposal',
      description: '',
      altText: '',
      headline: '',
      boardId: '5001',
      publishAt: '2020-01-01T00:00:00.000Z',
    });
    await renderApp(api, '/designs/id-01-mug');

    expect(
      await (await findPins()).findByText(/approving publishes it within a minute/),
    ).toBeInTheDocument();
  });
});
