import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError, type MockupDto, type SceneCheckDto } from '@pod/contracts/client';
import { withPhotos } from '../../../testing/scenes.js';
import { renderApp } from '../../../testing/render-app.js';

describe('scene review', () => {
  const scene = (overrides: Partial<MockupDto>): MockupDto => ({
    id: 'scene-1',
    designRevision: 1,
    variantId: '1320',
    printArea: 'default',
    view: 'Scene',
    scenePrompt:
      'On a sunny windowsill next to a stack of old books and a sleepy cat in the morning',
    sceneLook: { shape: '4:3' },
    sceneCheck: null,
    printConfirmed: false,
    canCheckAgain: false,
    asset: {
      storageKey: 'ab/scene-1.png',
      sha256: 'scene-1',
      mimeType: 'image/jpeg',
      width: 4096,
      height: 3072,
      byteSize: 3_000_000,
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    ...overrides,
  });

  async function galleryWith(photo: MockupDto) {
    const api = await withPhotos();
    api.listMockups.mockResolvedValue([photo, ...(await api.listMockups({ id: 'id-01-mug' }))]);
    const view = await renderApp(api, '/designs/id-01-mug');
    const gallery = within(await screen.findByRole('list', { name: 'Mockups' }));
    return { ...view, api, gallery };
  }

  it('shows a short caption with the whole prompt in its title', async () => {
    const { gallery } = await galleryWith(scene({}));

    const caption = gallery.getByText(
      'White Glossy Mug 11 oz · On a sunny windowsill next to a stack of old books and a…',
    );
    expect(caption).toHaveAttribute('title', scene({}).scenePrompt);
    expect(
      gallery.getByRole('button', { name: `Remove ${caption.textContent}` }),
    ).toBeInTheDocument();
  });

  it.each<[string, SceneCheckDto | null, string, string[]]>([
    ['not checked', null, 'Not checked by AI', []],
    ['the same', { same: true, issues: [], unverifiable: [] }, 'AI check: print matches', []],
    [
      'the same, with details it could not see',
      { same: true, issues: [], unverifiable: ['2: the small text is blurred'] },
      'AI check: some details unclear',
      ['2: the small text is blurred'],
    ],
    [
      'different',
      {
        same: false,
        issues: ['3: the print is mirrored', '3: the print is mirrored'],
        unverifiable: ['4: the handle hides an edge'],
      },
      'AI check: print differs',
      ['4: the handle hides an edge'],
    ],
  ])('marks a scene the check found %s', async (_case, sceneCheck, badge, notes) => {
    const { gallery } = await galleryWith(scene({ sceneCheck }));

    const status = gallery.getByText(badge).closest('[role="status"]');
    expect(status).not.toBeNull();
    for (const note of notes) expect(gallery.getByText(note)).toBeInTheDocument();
    expect(gallery.queryAllByText('3: the print is mirrored')).toHaveLength(
      sceneCheck?.same === false ? 2 : 0,
    );
  });

  it("records the seller's check of the print", async () => {
    const { api, gallery, user } = await galleryWith(scene({}));
    api.confirmScenePrint.mockResolvedValueOnce(scene({ printConfirmed: true }));

    const confirm = gallery.getByRole('checkbox', { name: 'I checked the print' });
    expect(confirm).not.toBeChecked();
    await user.click(confirm);

    expect(api.confirmScenePrint).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      mockupId: 'scene-1',
      confirmed: true,
    });
    await waitFor(() => {
      expect(confirm).toBeChecked();
    });
  });

  it('checks a scene again, and asks for a new confirmation when the print changed', async () => {
    const { api, gallery, user } = await galleryWith(
      scene({ canCheckAgain: true, printConfirmed: true }),
    );
    api.checkSceneAgain.mockResolvedValueOnce(
      scene({
        canCheckAgain: true,
        sceneCheck: { same: false, issues: ['3: the print is mirrored'], unverifiable: [] },
      }),
    );

    await user.click(gallery.getByRole('button', { name: 'Check again' }));

    expect(api.checkSceneAgain).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      mockupId: 'scene-1',
    });
    expect(await gallery.findByText('AI check: print differs')).toBeInTheDocument();
    expect(gallery.getByText('3: the print is mirrored')).toBeInTheDocument();
    expect(gallery.getByRole('checkbox', { name: 'I checked the print' })).not.toBeChecked();
  });

  it('clears the error of the other action once the seller starts one', async () => {
    const { api, gallery, user } = await galleryWith(scene({ canCheckAgain: true }));
    api.confirmScenePrint.mockRejectedValueOnce(
      new ApiError({ code: 'NOT_FOUND', message: 'x', details: {} }),
    );
    api.checkSceneAgain.mockReturnValueOnce(new Promise(() => undefined));

    await user.click(gallery.getByRole('checkbox', { name: 'I checked the print' }));
    expect(await gallery.findByText('This item no longer exists.')).toBeInTheDocument();
    const again = gallery.getByRole('button', { name: 'Check again' });
    await user.click(again);

    expect(gallery.queryByText('This item no longer exists.')).not.toBeInTheDocument();
    expect(again).toHaveFocus();
    expect(again).toHaveAttribute('aria-disabled', 'true');
  });

  it('points to the settings when the checking service cannot check again', async () => {
    const { api, gallery, user } = await galleryWith(scene({ canCheckAgain: true }));
    api.checkSceneAgain.mockRejectedValueOnce(
      new ApiError({ code: 'AI_NOT_CONNECTED', message: 'x', details: { service: 'Claude' } }),
    );

    await user.click(gallery.getByRole('button', { name: 'Check again' }));

    expect(await gallery.findByRole('link', { name: 'Open settings' })).toBeInTheDocument();
    expect(gallery.getByText('Not checked by AI')).toBeInTheDocument();
  });

  it('offers no new check for a scene whose photo is not known', async () => {
    const { gallery } = await galleryWith(scene({}));

    expect(gallery.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument();
  });
});
