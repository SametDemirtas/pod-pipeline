import { describe, expect, it } from 'vitest';
import type { UpscaleModelDto } from '@pod/contracts';
import { ArtworkTooSmallEvenUpscaledError } from '@pod/core';
import { designDto, printCheckDto } from '../../../testing/batch-fixtures.js';
import { UpscaleInProgressError } from '../../errors/print-errors.js';
import { setUp } from '../../../testing/batch-steps-setup.js';

describe('upscale step', () => {
  const blurry = printCheckDto({ quality: 'poor', effectiveDpi: 90 });

  it('makes artwork larger that would print blurred, and later steps use the larger revision', async () => {
    const { catalog, upscale, run } = setUp();
    catalog.checkPrint.mockResolvedValue(blurry);

    expect(await run('upscale')).toEqual({ state: 'done', prepared: { designRevision: 2 } });
    expect(upscale.upscaleDesign).toHaveBeenCalledWith(
      { id: 'id-01-mug' },
      expect.any(AbortSignal),
    );
  });

  it('leaves sharp artwork, and makes a copy again that is too small for a size listed since', async () => {
    const { catalog, upscale, run } = setUp();

    expect(await run('upscale')).toEqual({ state: 'skipped' });
    catalog.getDesign.mockResolvedValue({ ...designDto('01-mug'), upscaleModel: 'illustration' });
    expect(await run('upscale')).toEqual({ state: 'skipped' });
    expect(upscale.upscaleDesign).not.toHaveBeenCalled();
    catalog.checkPrint.mockResolvedValue(blurry);
    expect(await run('upscale')).toEqual({ state: 'done', prepared: { designRevision: 2 } });
  });

  it('lets later steps use artwork the window made larger since the run started', async () => {
    const { catalog, upscale, run } = setUp();
    const history = (...models: (UpscaleModelDto | null)[]) => {
      const design = designDto('01-mug');
      const revisions = models.map((upscaleModel, index) => ({
        revision: index + 1,
        asset: design.asset,
        sourcePath: design.sourcePath,
        upscaleModel,
        rotation: null,
        recordedAt: design.updatedAt,
      }));
      return {
        ...design,
        revision: models.length,
        upscaleModel: models.at(-1) ?? null,
        revisions: revisions.reverse(),
      };
    };

    catalog.getDesign.mockResolvedValue(history(null, 'photo'));
    expect(await run('upscale')).toEqual({ state: 'skipped', prepared: { designRevision: 2 } });
    catalog.getDesign.mockResolvedValue(history(null, 'photo', 'illustration'));
    expect(await run('upscale')).toEqual({ state: 'skipped', prepared: { designRevision: 3 } });
    catalog.getDesign.mockResolvedValue(history(null, 'photo', null));
    await expect(run('upscale')).rejects.toMatchObject({ code: 'BATCH_DESIGN_CHANGED' });
    expect(upscale.upscaleDesign).not.toHaveBeenCalled();
  });

  it('leaves artwork as large as upscaling makes it to the print step', async () => {
    const { catalog, upscale, run } = setUp();
    catalog.checkPrint.mockResolvedValue(blurry);
    upscale.upscaleDesign.mockRejectedValue(
      new ArtworkTooSmallEvenUpscaledError({ width: 9000, height: 3863 }),
    );

    expect(await run('upscale')).toEqual({ state: 'skipped' });
    upscale.upscaleDesign.mockRejectedValue(new Error('GPU lost'));
    await expect(run('upscale')).rejects.toThrow('GPU lost');
  });

  it('waits while the window makes other artwork larger', async () => {
    const { catalog, upscale, wait, run } = setUp();
    catalog.checkPrint.mockResolvedValue(blurry);
    upscale.upscaleDesign.mockRejectedValueOnce(new UpscaleInProgressError());

    expect(await run('upscale')).toMatchObject({ state: 'done' });
    expect(wait).toHaveBeenCalledOnce();
    expect(upscale.upscaleDesign).toHaveBeenCalledTimes(2);
  });

  it('refuses a design imported again since the run started', async () => {
    const { catalog, run } = setUp();
    catalog.getDesign.mockResolvedValue({ ...designDto('01-mug'), revision: 3 });

    await expect(run('upscale')).rejects.toMatchObject({ code: 'BATCH_DESIGN_CHANGED' });
  });

  it('turns blanket artwork after making it larger, and later steps use the turned revision', async () => {
    const { catalog, upscale, rotation, run } = setUp();
    catalog.getDesign.mockResolvedValue(designDto('01-blanket'));
    catalog.checkPrint.mockResolvedValue(blurry);
    rotation.rotateDesign.mockResolvedValue({
      status: 'rotated',
      reason: 'The deer stands upright.',
      design: { ...designDto('01-blanket'), revision: 3, rotation: 90 },
    });

    expect(await run('upscale')).toEqual({ state: 'done', prepared: { designRevision: 3 } });
    expect(upscale.upscaleDesign).toHaveBeenCalledOnce();
    expect(rotation.rotateDesign).toHaveBeenCalledWith(
      { id: 'id-01-mug' },
      expect.any(AbortSignal),
    );
  });

  it('keeps what making it larger did when the artwork is not turned', async () => {
    const { catalog, rotation, run } = setUp();
    catalog.getDesign.mockResolvedValue(designDto('01-blanket'));
    rotation.rotateDesign.mockResolvedValue({
      status: 'kept',
      reason: 'A pattern with no top.',
      design: designDto('01-blanket'),
    });

    expect(await run('upscale')).toEqual({ state: 'skipped' });
    expect(rotation.rotateDesign).toHaveBeenCalledOnce();
  });

  it('keeps what making it larger did when turning is not needed, such as for a mug', async () => {
    const { rotation, run } = setUp();

    expect(await run('upscale')).toEqual({ state: 'skipped' });
    expect(rotation.rotateDesign).toHaveBeenCalledOnce();
  });

  it('lets later steps use artwork the window turned since the run started', async () => {
    const { catalog, run } = setUp();
    const imported = designDto('01-blanket');
    const revision = (number: number, rotation: 90 | null) => ({
      revision: number,
      asset: imported.asset,
      sourcePath: imported.sourcePath,
      upscaleModel: null,
      rotation,
      recordedAt: imported.updatedAt,
    });
    catalog.getDesign.mockResolvedValue({
      ...imported,
      revision: 2,
      rotation: 90,
      revisions: [revision(2, 90), revision(1, null)],
    });

    expect(await run('upscale')).toEqual({ state: 'skipped', prepared: { designRevision: 2 } });
  });
});
