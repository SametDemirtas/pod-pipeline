import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi, previewDto } from '../../testing/fake-api.js';
import { openWizard } from '../../testing/import.js';

describe('import wizard details', () => {
  it('focuses the main action when it opens', async () => {
    const { api } = createFakeApi([]);
    await openWizard(api);

    expect(screen.getByRole('button', { name: 'Choose folder' })).toHaveFocus();
  });

  it('cannot be closed while the folder is being read', async () => {
    const { api } = createFakeApi([]);
    let finish: (value: ReturnType<typeof previewDto>) => void = () => undefined;
    api.previewImport.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { user } = await openWizard(api);
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));
    await screen.findByText('Looking through the folder');

    await user.keyboard('{Escape}');

    expect(screen.getByRole('dialog', { name: 'Import designs' })).toBeInTheDocument();
    act(() => {
      finish(previewDto());
    });
    expect(await screen.findByText('New: 1')).toBeInTheDocument();
  });

  it('announces each step', async () => {
    const { api } = createFakeApi([]);
    const { user } = await openWizard(api);
    const dialog = screen.getByRole('dialog', { name: 'Import designs' });

    expect(within(dialog).getByText('Choose a folder')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    expect(await within(dialog).findByText('Review what will change')).toBeInTheDocument();
  });

  it('applies name changes on their own', async () => {
    const { api } = createFakeApi([]);
    api.previewImport.mockResolvedValueOnce(
      previewDto({
        counts: { new: 0, changed: 0, unchanged: 1, skipped: 0 },
        skipped: [],
        conceptRenames: [{ conceptKey: '01', from: 'Frost', to: 'Snowy Garden' }],
      }),
    );
    const { user } = await openWizard(api);
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    await user.click(await screen.findByRole('button', { name: 'Apply name changes' }));

    expect(api.runImport).toHaveBeenCalledWith({
      rootPath: '/Users/me/Designs',
      fingerprint: 'fp-1',
    });
    expect(await screen.findByText('1 design added and 1 file skipped')).toBeInTheDocument();
  });

  it('hides the skipped count when nothing was skipped', async () => {
    const { api } = createFakeApi([]);
    api.previewImport.mockResolvedValueOnce(
      previewDto({ skipped: [], counts: { new: 1, changed: 0, unchanged: 0, skipped: 0 } }),
    );
    const { user } = await openWizard(api);

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    expect(await screen.findByText('New: 1')).toBeInTheDocument();
    expect(screen.queryByText(/Skipped/)).not.toBeInTheDocument();
  });

  it('explains skip reasons using the product names', async () => {
    const { api } = createFakeApi([]);
    api.previewImport.mockResolvedValueOnce(
      previewDto({
        skipped: [
          { relativePath: '01. Tulip/Poster.png', reason: 'unknown-family' },
          { relativePath: 'huge.png', reason: 'image-too-large' },
        ],
        counts: { new: 1, changed: 0, unchanged: 0, skipped: 2 },
      }),
    );
    const { user } = await openWizard(api);

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    expect(
      await screen.findByText('File name does not match a product (iPhone case, Mug, or Blanket)'),
    ).toBeInTheDocument();
    expect(screen.getByText(/The image is too large/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Reason' })).toBeInTheDocument();
  });

  it('explains a folder that is not approved', async () => {
    const { api } = createFakeApi([]);
    api.previewImport.mockRejectedValueOnce(
      new ApiError({ code: 'IMPORT_FOLDER_NOT_APPROVED', message: 'x', details: {} }),
    );
    const { user } = await openWizard(api);

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This folder is not on your list of import folders.',
    );
  });
});
