import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError, MAX_REFERENCE_IMAGE_BYTES, type SceneStyleDto } from '@pod/contracts/client';
import { FAMILY_PROFILES } from '@pod/rules';
import { MAKE_FROM_FRONT, openDialog, withPhotos } from '../../../testing/scenes.js';

describe('scene dialog', () => {
  it("offers the family's ready-made scenes and counts the description", async () => {
    const api = await withPhotos();
    const { user, dialog } = await openDialog(api);

    expect(
      dialog
        .getAllByRole('button')
        .map((button) => button.textContent)
        .slice(0, 4),
    ).toEqual(['Kitchen', 'In hand', 'Still life', 'Gift']);
    const prompt = dialog.getByLabelText('Describe the setting');
    expect(prompt).toHaveAttribute('maxLength', '1000');
    expect(prompt).toHaveAccessibleDescription('0 of 1,000 characters');
    await user.click(dialog.getByRole('button', { name: 'In hand' }));

    expect(prompt).toHaveValue(FAMILY_PROFILES.mug.scenes.product.inHand);
    expect(prompt).toHaveAccessibleDescription(
      `${FAMILY_PROFILES.mug.scenes.product.inHand.length} of 1,000 characters`,
    );
  });

  it('switches between product, marketing and model scenes', async () => {
    const api = await withPhotos();
    const { user, dialog } = await openDialog(api);
    const kinds = within(dialog.getByRole('tablist', { name: 'Scene type' }));
    const prompt = dialog.getByLabelText('Describe the setting');
    // Radix draws each tab's label twice, one copy hidden by CSS that jsdom does not load.
    const presetNames = (kind: string) =>
      within(dialog.getByRole('tabpanel', { name: new RegExp(`^${kind}`) }))
        .getAllByRole('button')
        .map((button) => button.textContent);

    expect(kinds.getByRole('tab', { name: /^Product/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(kinds.getByRole('tab', { name: /^Marketing/ }));
    expect(presetNames('Marketing')).toEqual(['Studio', 'On a plinth', 'Color block']);
    await user.click(dialog.getByRole('button', { name: 'On a plinth' }));
    expect(prompt).toHaveValue(FAMILY_PROFILES.mug.scenes.marketing.spotlight);

    await user.click(kinds.getByRole('tab', { name: /^Model/ }));
    expect(presetNames('Model')).toEqual(['Held by a model', 'At a café']);
    expect(dialog.queryByRole('button', { name: 'Kitchen' })).not.toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'At a café' }));
    expect(prompt).toHaveValue(FAMILY_PROFILES.mug.scenes.model.cafe);
  });

  it('offers no model scenes for a family that cannot be worn or held', async () => {
    const { dialog } = await openDialog(await withPhotos('03-poster'), '03-poster');

    const kinds = within(dialog.getByRole('tablist', { name: 'Scene type' }));
    expect(kinds.getAllByRole('tab')).toHaveLength(2);
    expect(kinds.getByRole('tab', { name: /^Marketing/ })).toBeInTheDocument();
    expect(kinds.queryByRole('tab', { name: /^Model/ })).not.toBeInTheDocument();
  });

  it('offers no ready-made scenes for a family the app has none for', async () => {
    const { dialog } = await openDialog(await withPhotos('04-pillow'), '04-pillow');

    expect(dialog.queryByRole('tablist')).not.toBeInTheDocument();
    expect(dialog.getByLabelText('Describe the setting')).toHaveValue('');
  });

  it('takes the style of a chosen photo into the description', async () => {
    const api = await withPhotos();
    const { user, dialog } = await openDialog(api);

    await user.click(dialog.getByRole('button', { name: 'Choose a photo' }));

    expect(api.describeSceneStyle).toHaveBeenCalledWith({ designId: 'id-01-mug' });
    await waitFor(() => {
      expect(dialog.getByLabelText('Describe the setting')).toHaveValue(
        'Place the mug from the photo on a marble counter with a lemon.',
      );
    });
    expect(dialog.getByText('Claude has described the style of the photo.')).toBeInTheDocument();
  });

  it('asks before replacing a description the seller already wrote', async () => {
    const api = await withPhotos();
    const { user, dialog } = await openDialog(api);
    const prompt = dialog.getByLabelText('Describe the setting');
    await user.type(prompt, 'On my own desk');
    const described = 'Place the mug from the photo on a marble counter with a lemon.';

    await user.click(dialog.getByRole('button', { name: 'Choose a photo' }));
    await user.click(await dialog.findByRole('button', { name: 'Keep mine' }));
    expect(prompt).toHaveValue('On my own desk');
    await user.click(dialog.getByRole('button', { name: 'Choose a photo' }));
    await user.click(await dialog.findByRole('button', { name: 'Replace' }));

    expect(prompt).toHaveValue(described);
    expect(dialog.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument();
  });

  it('asks about a description that arrives after the seller started typing', async () => {
    const api = await withPhotos();
    let describe: (style: SceneStyleDto) => void = () => undefined;
    api.describeSceneStyle.mockReturnValueOnce(new Promise((resolve) => (describe = resolve)));
    const { user, dialog } = await openDialog(api);
    const prompt = dialog.getByLabelText('Describe the setting');

    await user.click(dialog.getByRole('button', { name: 'Choose a photo' }));
    await user.type(prompt, 'On my own desk');
    act(() => {
      describe({ found: true, description: 'On a marble counter.', look: {} });
    });

    expect(await dialog.findByText(/Replace what you wrote with it\?/)).toBeInTheDocument();
    expect(prompt).toHaveValue('On my own desk');
  });

  it('stays open while Claude reads a photo, and forgets an unanswered offer', async () => {
    const api = await withPhotos();
    let describe: (style: SceneStyleDto) => void = () => undefined;
    api.describeSceneStyle.mockReturnValueOnce(new Promise((resolve) => (describe = resolve)));
    const { user, dialog, gallery } = await openDialog(api);
    await user.type(dialog.getByLabelText('Describe the setting'), 'Mine');

    await user.click(dialog.getByRole('button', { name: 'Choose a photo' }));
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Make a scene' })).toBeInTheDocument();
    act(() => {
      describe({ found: true, description: 'On a marble counter.', look: {} });
    });
    expect(await dialog.findByRole('button', { name: 'Keep mine' })).toBeInTheDocument();

    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await user.click(gallery.getByRole('button', { name: MAKE_FROM_FRONT }));
    const reopened = within(await screen.findByRole('dialog', { name: 'Make a scene' }));
    expect(reopened.queryByRole('button', { name: 'Keep mine' })).not.toBeInTheDocument();
  });

  it('reads a dropped photo, and names a file it cannot use without sending it', async () => {
    const api = await withPhotos();
    const { dialog } = await openDialog(api);
    const dropZone = dialog.getByText(/^Pick or drop a PNG or JPEG photo/).parentElement;
    const drop = (file: File) => {
      fireEvent.drop(dropZone as HTMLElement, { dataTransfer: { files: [file] } });
    };

    drop(new File([new Uint8Array([137, 80, 78, 71])], 'cafe.png', { type: 'image/png' }));
    await waitFor(() => {
      expect(api.describeSceneStyle).toHaveBeenCalledWith({
        designId: 'id-01-mug',
        image: 'iVBORw==',
      });
    });
    drop(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    drop(
      new File([new Uint8Array(MAX_REFERENCE_IMAGE_BYTES + 1)], 'huge.jpg', {
        type: 'image/jpeg',
      }),
    );

    expect(await dialog.findByText(/^This file cannot be used/)).toBeInTheDocument();
    expect(api.describeSceneStyle).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['repeated words from the photo', 'copiedText', /^The description repeated words/],
    ['found no setting', 'nothingUsable', /^Claude found no setting/],
  ] as const)('says when the description %s', async (_case, reason, message) => {
    const api = await withPhotos();
    api.describeSceneStyle.mockResolvedValueOnce({ found: false, reason });
    const { user, dialog } = await openDialog(api);

    await user.click(dialog.getByRole('button', { name: 'Choose a photo' }));

    expect(await dialog.findByText(message)).toBeInTheDocument();
    expect(dialog.getByLabelText('Describe the setting')).toHaveValue('');
  });

  it('leaves the description alone when the seller cancels choosing a photo', async () => {
    const api = await withPhotos();
    api.describeSceneStyle.mockResolvedValueOnce(null);
    const { user, dialog } = await openDialog(api);
    await user.click(dialog.getByRole('button', { name: 'Kitchen' }));

    await user.click(dialog.getByRole('button', { name: 'Choose a photo' }));

    await waitFor(() => {
      expect(api.describeSceneStyle).toHaveBeenCalled();
    });
    expect(dialog.getByLabelText('Describe the setting')).toHaveValue(
      FAMILY_PROFILES.mug.scenes.product.kitchen,
    );
    expect(
      dialog.queryByText('Claude has described the style of the photo.'),
    ).not.toBeInTheDocument();
  });

  it('points to the settings when the text or image service is not connected', async () => {
    const api = await withPhotos();
    const notConnected = (service: string) =>
      new ApiError({ code: 'AI_NOT_CONNECTED', message: 'x', details: { service } });
    api.describeSceneStyle.mockRejectedValueOnce(notConnected('Claude'));
    api.createScene.mockRejectedValueOnce(notConnected('Gemini'));
    const { user, dialog } = await openDialog(api);

    await user.click(dialog.getByRole('button', { name: 'Choose a photo' }));
    expect(await dialog.findByText(/^Claude has no working key/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Kitchen' }));
    await user.click(dialog.getByRole('button', { name: 'Make scene' }));

    expect(await dialog.findByText(/^Gemini has no working key/)).toBeInTheDocument();
    expect(dialog.getAllByRole('link', { name: 'Open settings' })).toHaveLength(2);
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
  });
});
