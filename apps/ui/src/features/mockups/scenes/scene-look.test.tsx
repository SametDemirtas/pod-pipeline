import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { openDialog, withPhotos } from '../../../testing/scenes.js';

describe('scene look', () => {
  const CONTROLS = [
    'Shape',
    'Shot size',
    'Camera height',
    'Lighting',
    'Time of day',
    'Season',
    'Backdrop color',
    'Background blur',
    'Color grade',
    'Props',
  ];

  async function choose(
    view: Awaited<ReturnType<typeof openDialog>>,
    control: string,
    option: string,
  ) {
    await view.user.click(view.dialog.getByRole('combobox', { name: control }));
    await view.user.click(await screen.findByRole('option', { name: option }));
  }

  it('stays folded and asks for nothing until opened, then opens from the keyboard', async () => {
    const api = await withPhotos();
    const view = await openDialog(api);
    const toggle = view.dialog.getByRole('button', { name: /^Look/ });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Optional, all on Auto');
    expect(view.dialog.queryByRole('combobox')).not.toBeInTheDocument();
    expect(api.previewSceneLook).not.toHaveBeenCalled();

    toggle.focus();
    await view.user.keyboard('{Enter}');

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(panel).toBeInTheDocument();
    const selects = await view.dialog.findAllByRole('combobox');
    expect(selects).toHaveLength(CONTROLS.length);
    for (const [index, name] of CONTROLS.entries()) {
      expect(selects[index]).toHaveAccessibleName(name);
      expect(selects[index]).toHaveTextContent(index === 0 ? '4:3 landscape (Etsy)' : 'Auto');
    }
    expect(view.dialog.getByLabelText('Added after your description')).toHaveTextContent(
      'Nothing yet: every setting is on Auto.',
    );
    expect(api.previewSceneLook).toHaveBeenCalledWith({ familyId: 'mug', look: { shape: '4:3' } });
  });

  it('previews the chosen options, and leaves out one set back to Auto', async () => {
    const api = await withPhotos();
    const view = await openDialog(api);
    await view.user.click(view.dialog.getByRole('button', { name: /^Look/ }));

    await choose(view, 'Lighting', 'Moody');
    await choose(view, 'Props', 'None');
    await choose(view, 'Props', 'Auto');

    await waitFor(() => {
      expect(view.dialog.getByLabelText('Added after your description')).toHaveTextContent(
        'Look: moody.',
      );
    });
    expect(view.dialog.getByRole('button', { name: /^Look/ })).toHaveTextContent('1 set');
  }, 10_000);

  it('makes the scene in the chosen shape and look', async () => {
    const api = await withPhotos();
    const view = await openDialog(api);
    await view.user.click(view.dialog.getByRole('button', { name: /^Look/ }));

    await choose(view, 'Shape', '1:1 square');
    await choose(view, 'Lighting', 'Moody');
    await view.user.click(view.dialog.getByRole('button', { name: 'Kitchen' }));
    await view.user.click(view.dialog.getByRole('button', { name: 'Make scene' }));

    expect(api.createScene).toHaveBeenCalledWith(
      expect.objectContaining({ look: { shape: '1:1', lighting: 'moody' } }),
    );
  }, 10_000);

  it('offers no time of day under studio light, and says how Etsy crops another shape', async () => {
    const api = await withPhotos();
    const view = await openDialog(api);
    await view.user.click(view.dialog.getByRole('button', { name: /^Look/ }));
    await choose(view, 'Time of day', 'Morning');
    await choose(view, 'Lighting', 'Bright studio');
    await choose(view, 'Shape', '3:4 portrait');

    const time = view.dialog.getByRole('combobox', { name: 'Time of day' });
    await waitFor(() => {
      expect(time).toBeDisabled();
    });
    expect(time).toHaveTextContent('Auto');
    expect(view.dialog.getByRole('combobox', { name: 'Shape' })).toHaveAccessibleDescription(
      'Etsy crops search thumbnails to 4:3, so the edges of this shape may be cut off there.',
    );
  }, 10_000);

  it('offers a top-down view only for a product that lies flat', async () => {
    const mug = await openDialog(await withPhotos());
    await mug.user.click(mug.dialog.getByRole('button', { name: /^Look/ }));
    await mug.user.click(await mug.dialog.findByRole('combobox', { name: 'Camera height' }));

    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'Auto',
      'Eye level',
      'Slightly above',
    ]);
  });

  it('takes the look options a described photo showed, keeping the shape', async () => {
    const api = await withPhotos();
    api.describeSceneStyle.mockResolvedValueOnce({
      found: true,
      description: 'On a linen cloth.',
      look: { lighting: 'softDaylight', props: 'minimal' },
    });
    const view = await openDialog(api);
    await view.user.click(view.dialog.getByRole('button', { name: /^Look/ }));
    await choose(view, 'Shape', '3:4 portrait');
    await choose(view, 'Season', 'Winter holidays');

    await view.user.click(view.dialog.getByRole('button', { name: 'Choose a photo' }));

    await waitFor(() => {
      expect(view.dialog.getByRole('combobox', { name: 'Lighting' })).toHaveTextContent(
        'Soft daylight',
      );
    });
    expect(view.dialog.getByRole('combobox', { name: 'Shape' })).toHaveTextContent('3:4 portrait');
    expect(view.dialog.getByRole('combobox', { name: 'Season' })).toHaveTextContent('Auto');
    expect(view.dialog.getByRole('combobox', { name: 'Props' })).toHaveTextContent('One or two');
  }, 10_000);
});
