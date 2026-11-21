import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi, designDto, previewDto } from '../../testing/fake-api.js';
import { openWizard } from '../../testing/import.js';

describe('import wizard', () => {
  it('checks a folder, shows what will change and imports on confirmation', async () => {
    const { api } = createFakeApi([]);
    const { user } = await openWizard(api);

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    const dialog = await screen.findByRole('dialog', { name: 'Import designs' });
    expect(await within(dialog).findByText('Designs')).toHaveAttribute(
      'title',
      '/Users/me/Designs',
    );
    expect(screen.getByText('New: 1')).toBeInTheDocument();
    expect(screen.queryByText(/^Changed:/)).not.toBeInTheDocument();
    expect(screen.getByText('Frost Garden')).toBeInTheDocument();
    expect(screen.getByText('Not a PNG or JPEG file')).toBeInTheDocument();
    expect(api.previewImport).toHaveBeenCalledWith({ rootPath: '/Users/me/Designs' });

    api.listDesigns.mockResolvedValue({ items: [designDto('01-mug')], nextCursor: null, total: 1 });
    await user.click(screen.getByRole('button', { name: 'Import 1 design' }));

    expect(await screen.findByText('1 design added and 1 file skipped')).toBeInTheDocument();
    expect(api.runImport).toHaveBeenCalledWith({
      rootPath: '/Users/me/Designs',
      fingerprint: 'fp-1',
    });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('01-mug')).toBeInTheDocument();
  });

  it('names the image limits the import applies', async () => {
    const { api } = createFakeApi([]);
    api.previewImport.mockResolvedValueOnce(
      previewDto({ skipped: [{ relativePath: 'huge.png', reason: 'image-too-large' }] }),
    );
    const { user } = await openWizard(api);

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    expect(
      await screen.findByText(
        'The image is too large (over 30,000 pixels on a side or 150 megapixels)',
      ),
    ).toBeInTheDocument();
  });

  it('says how many Samsung cases come from iPhone case files', async () => {
    const { api } = createFakeApi([]);
    const item = previewDto().items[0];
    if (!item) throw new Error('a preview item expected');
    api.previewImport.mockResolvedValueOnce(
      previewDto({
        items: [
          { ...item, designKey: '01-phone-case', familyId: 'phone-case' },
          { ...item, designKey: '01-samsung-case', familyId: 'samsung-case', borrowed: true },
        ],
      }),
    );
    const { user } = await openWizard(api);

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    expect(
      await screen.findByText(
        '1 Samsung case is made from an iPhone case file. You can turn this off in the settings.',
      ),
    ).toBeInTheDocument();
  });

  it('shows progress while the folder is read', async () => {
    const { api, emitProgress } = createFakeApi([]);
    let finish: (value: ReturnType<typeof previewDto>) => void = () => undefined;
    api.previewImport.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { user } = await openWizard(api);

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));
    expect(await screen.findByText('Looking through the folder')).toBeInTheDocument();
    act(() => {
      emitProgress({ operation: 'preview', phase: 'reading', done: 3, total: 75 });
    });
    expect(screen.getByText('Reading files: 3 of 75')).toBeInTheDocument();

    act(() => {
      finish(previewDto());
    });
    expect(await screen.findByText('New: 1')).toBeInTheDocument();
  });

  it('stays on the first step when the folder picker is cancelled', async () => {
    const { api } = createFakeApi([]);
    api.pickFolder.mockResolvedValueOnce(null);
    const { user } = await openWizard(api);

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    expect(api.previewImport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Choose folder' })).toBeInTheDocument();
  });

  it('keeps the focus on the folder button when the folder picker fails', async () => {
    const { api } = createFakeApi([]);
    api.pickFolder.mockRejectedValueOnce(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    const { user } = await openWizard(api);
    const choose = screen.getByRole('button', { name: 'Choose folder' });

    await user.click(choose);

    expect(await screen.findByRole('button', { name: 'Choose another folder' })).toBe(choose);
    expect(choose).toHaveFocus();
  });

  it('offers no import when nothing changed', async () => {
    const { api } = createFakeApi([]);
    api.previewImport.mockResolvedValueOnce(
      previewDto({ counts: { new: 0, changed: 0, unchanged: 1, skipped: 0 }, skipped: [] }),
    );
    const { user } = await openWizard(api);

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    expect(
      await screen.findByText('Everything in this folder is already in your catalog.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Import \d/ })).not.toBeInTheDocument();
  });

  it('explains a changed folder and lets the user check it again', async () => {
    const { api } = createFakeApi([]);
    api.runImport.mockRejectedValueOnce(
      new ApiError({ code: 'IMPORT_PLAN_CHANGED', message: 'x', details: {} }),
    );
    const { user } = await openWizard(api);
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));
    await user.click(await screen.findByRole('button', { name: 'Import 1 design' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Files changed after the check');
    await user.click(screen.getByRole('button', { name: 'Check the folder again' }));

    await waitFor(() => {
      expect(api.previewImport).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole('button', { name: 'Import 1 design' })).toBeInTheDocument();
  });

  it('lists concept renames and offers to apply them alone', async () => {
    const { api } = createFakeApi([]);
    api.previewImport.mockResolvedValueOnce(
      previewDto({
        counts: { new: 0, changed: 0, unchanged: 1, skipped: 0 },
        conceptRenames: [{ conceptKey: '01', from: 'Frost', to: 'Snowy Garden' }],
      }),
    );
    const { user } = await openWizard(api);

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    expect(await screen.findByText('01: “Frost” becomes “Snowy Garden”')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply name changes' })).toBeInTheDocument();
  });

  it('names a concept that had no name before', async () => {
    const { api } = createFakeApi([]);
    api.previewImport.mockResolvedValueOnce(
      previewDto({ conceptRenames: [{ conceptKey: '03', from: null, to: 'Night Owls' }] }),
    );
    const { user } = await openWizard(api);

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    expect(await screen.findByText('03: named “Night Owls”')).toBeInTheDocument();
  });

  it('says the folder is checked again while importing', async () => {
    const { api, emitProgress } = createFakeApi([]);
    api.runImport.mockReturnValueOnce(new Promise(() => undefined));
    const { user } = await openWizard(api);
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));
    await user.click(await screen.findByRole('button', { name: 'Import 1 design' }));

    act(() => {
      emitProgress({ operation: 'import', phase: 'reading', done: 2, total: 5 });
    });
    expect(screen.getByText('Checking the files again: 2 of 5')).toBeInTheDocument();
    act(() => {
      emitProgress({ operation: 'import', phase: 'copying', done: 1, total: 1 });
    });
    expect(screen.getByText('Copying files: 1 of 1')).toBeInTheDocument();
  });
});
