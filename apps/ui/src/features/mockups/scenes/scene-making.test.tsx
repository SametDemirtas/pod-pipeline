import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi } from '../../../testing/fake-api.js';
import { renderApp } from '../../../testing/render-app.js';
import { mug } from '../../../testing/print.js';

describe('making scenes', () => {
  it('makes a scene from a Printful photo with a preset, then removes a photo', async () => {
    const { api } = createFakeApi([mug()]);
    await api.connectAi({ provider: 'gemini', apiKey: 'gk' });
    await api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const gallery = within(await screen.findByRole('list', { name: 'Mockups' }));

    await user.click(
      gallery.getByRole('button', { name: 'Make a scene from White Glossy Mug 11 oz · Front' }),
    );
    const dialog = within(await screen.findByRole('dialog', { name: 'Make a scene' }));
    expect(dialog.getByRole('button', { name: 'Make scene' })).toBeDisabled();
    await user.click(dialog.getByRole('button', { name: 'Kitchen' }));
    await user.click(dialog.getByRole('button', { name: 'Make scene' }));

    expect(api.createScene).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      mockupId: 'm-front',
      prompt: expect.stringContaining('light oak kitchen counter') as string,
      look: { shape: '4:3' },
      candidates: 1,
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(await gallery.findByText('Scene')).toBeInTheDocument();
    expect(
      gallery.queryByRole('button', { name: /^Make a scene from .*kitchen counter/ }),
    ).not.toBeInTheDocument();

    const removeLeft = gallery.getByRole('button', {
      name: 'Remove White Glossy Mug 11 oz · Left',
    });
    await user.click(removeLeft);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(api.removeMockup).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(removeLeft).toHaveFocus();
    });
    await user.click(removeLeft);
    const confirm = within(await screen.findByRole('alertdialog', { name: 'Remove this photo?' }));
    await user.click(confirm.getByRole('button', { name: 'Remove photo' }));
    expect(api.removeMockup).toHaveBeenCalledWith({ designId: 'id-01-mug', mockupId: 'm-left' });
    await waitFor(() => {
      expect(gallery.queryByText('White Glossy Mug 11 oz · Left')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('list', { name: 'Mockups' })).toHaveFocus();
  });

  it('asks for two candidates only for the scene the seller chose them for', async () => {
    const { api } = createFakeApi([mug()]);
    await api.connectAi({ provider: 'gemini', apiKey: 'gk' });
    await api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const gallery = within(await screen.findByRole('list', { name: 'Mockups' }));
    const makeScene = async () => {
      await user.click(
        gallery.getByRole('button', { name: 'Make a scene from White Glossy Mug 11 oz · Front' }),
      );
      return within(await screen.findByRole('dialog', { name: 'Make a scene' }));
    };

    let dialog = await makeScene();
    const choice = dialog.getByRole('checkbox', { name: 'Make two and keep the better one' });
    expect(choice).toHaveAccessibleDescription(/^Costs twice as much/);
    await user.click(choice);
    await user.click(dialog.getByRole('button', { name: 'Kitchen' }));
    await user.click(dialog.getByRole('button', { name: 'Make scene' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    dialog = await makeScene();

    expect(api.createScene).toHaveBeenLastCalledWith(expect.objectContaining({ candidates: 2 }));
    expect(
      dialog.getByRole('checkbox', { name: 'Make two and keep the better one' }),
    ).not.toBeChecked();
  });

  it('stays open to say when only one of two candidates could be made', async () => {
    const { api } = createFakeApi([mug()]);
    await api.connectAi({ provider: 'gemini', apiKey: 'gk' });
    await api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
    api.createScene.mockResolvedValueOnce({ scenes: [], candidateFailed: true });
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const gallery = within(await screen.findByRole('list', { name: 'Mockups' }));

    await user.click(
      gallery.getByRole('button', { name: 'Make a scene from White Glossy Mug 11 oz · Front' }),
    );
    const dialog = within(await screen.findByRole('dialog', { name: 'Make a scene' }));
    await user.click(dialog.getByRole('checkbox', { name: 'Make two and keep the better one' }));
    await user.click(dialog.getByRole('button', { name: 'Kitchen' }));
    await user.click(dialog.getByRole('button', { name: 'Make scene' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Only one of the two scenes could be made.',
    );
    expect(screen.getByRole('dialog', { name: 'Make a scene' })).toBeInTheDocument();
  });

  it('keeps the scene dialog open while Gemini is still working', async () => {
    const { api } = createFakeApi([mug()]);
    await api.connectAi({ provider: 'gemini', apiKey: 'gk' });
    await api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
    api.createScene.mockReturnValueOnce(new Promise(() => undefined));
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const gallery = within(await screen.findByRole('list', { name: 'Mockups' }));

    await user.click(
      gallery.getByRole('button', { name: 'Make a scene from White Glossy Mug 11 oz · Front' }),
    );
    const dialog = within(await screen.findByRole('dialog', { name: 'Make a scene' }));
    await user.click(dialog.getByRole('button', { name: 'Kitchen' }));
    await user.click(dialog.getByRole('button', { name: 'Make scene' }));
    await user.keyboard('{Escape}');

    expect(screen.getByRole('dialog', { name: 'Make a scene' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(dialog.getByText(/^Gemini is making the scene/)).toBeInTheDocument();
  });

  it('offers scenes only with a key for the image service and shows why one failed', async () => {
    const { api } = createFakeApi([mug()]);
    await api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
    const first = await renderApp(api, '/designs/id-01-mug');
    await screen.findByRole('list', { name: 'Mockups' });
    expect(screen.queryByRole('button', { name: /^Make a scene/ })).not.toBeInTheDocument();
    first.unmount();

    await api.connectAi({ provider: 'gemini', apiKey: 'gk' });
    api.createScene.mockRejectedValueOnce(
      new ApiError({ code: 'AI_NOT_CONNECTED', message: 'x', details: { service: 'Gemini' } }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');
    await user.click(
      (await screen.findAllByRole('button', { name: /^Make a scene from/ }))[0] as HTMLElement,
    );
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText('Describe the setting'), 'beach');
    await user.click(dialog.getByRole('button', { name: 'Make scene' }));

    expect(
      await dialog.findByText('Gemini has no working key. Add one in the settings first.'),
    ).toBeInTheDocument();
  });
});
