import { describe, expect, it, vi } from 'vitest';
import { InMemoryBatches, InMemoryDraftChecks } from '@pod/core/testing';
import { shopOptionsDto } from '../../testing/batch-fixtures.js';
import { systemTimers } from '../../testing/system-timers.js';
import { BatchInProgressError, ShopSetupMissingError } from '../errors/batch-errors.js';
import { WorkStoppedError } from '../errors/work-stopped.js';
import { waitWith } from './busy-waits.js';
import type { StepRunner } from './step-runner.js';
import { ALL, heldStep, setUp, settled } from '../../testing/batch-service-setup.js';

describe('BatchService runs', () => {
  it('runs every step of each design in order and reports how far it got', async () => {
    const { service, steps, statuses } = setUp();

    const started = await service.startBatch(ALL);
    expect(started.job).toMatchObject({
      state: 'running',
      steps: ['print', 'mockups', 'text', 'draft'],
    });
    const job = await settled(service);

    expect(steps.mock.calls.map(([item]) => item.designKey)).toEqual(
      ['01-mug', '01-blanket', '02-mug'].flatMap((key) => [key, key, key, key]),
    );
    expect(job).toMatchObject({
      designs: 3,
      settledDesigns: 3,
      finishedAt: '2026-10-28T09:00:00.000Z',
      failures: [],
    });
    expect(job?.stepCounts.draft).toMatchObject({ done: 3, pending: 0 });
    expect(statuses.some((status) => status.job?.current?.step === 'mockups')).toBe(true);
  });

  it('records skipped steps and keeps what steps prepared for later ones', async () => {
    const keywords = [{ term: 'meadow bees mug', market: 'US', suggested: true }] as const;
    const { service, jobs } = setUp({
      mockups: () => Promise.resolve({ state: 'skipped' }),
      research: () => Promise.resolve({ state: 'done', prepared: { keywords } }),
    });

    await service.startBatch({ ...ALL, steps: ['mockups', 'research'] });
    const job = await settled(service);

    expect(job?.stepCounts.mockups).toMatchObject({ skipped: 3 });
    expect((await jobs.current())?.items[0]).toMatchObject({
      steps: { mockups: 'skipped', research: 'done' },
      keywords,
    });
  });

  it('stops a design at a failed step with a readable reason and carries on with the next', async () => {
    const mockups = vi.fn<StepRunner>((item) =>
      item.designKey === '01-blanket'
        ? Promise.reject(new ShopSetupMissingError())
        : Promise.resolve({ state: 'done' }),
    );
    const text = vi.fn<StepRunner>(() => Promise.resolve({ state: 'done' }));
    const { service } = setUp({ mockups, text });

    await service.startBatch(ALL);
    const job = await settled(service);

    expect(text.mock.calls.map(([item]) => item.designKey)).toEqual(['01-mug', '02-mug']);
    expect(job?.failures).toEqual([
      {
        designId: 'id-01-blanket',
        designKey: '01-blanket',
        step: 'mockups',
        error: expect.objectContaining({ code: 'SHOP_SETUP_MISSING' }) as unknown,
        draftCheck: null,
      },
    ]);
    expect(job?.stepCounts.text).toMatchObject({ done: 2, blocked: 1 });
    expect(job?.stepCounts.draft).toMatchObject({ done: 2, blocked: 1 });
  });

  it('keeps what a failing step prepared, and runs failed steps again on retry', async () => {
    const text = {
      language: 'en-US',
      text: { title: 'T', description: 'D', tags: [] },
      translations: [],
    };
    let fails = true;
    const textStep = vi.fn<StepRunner>((item) =>
      Promise.resolve(
        fails
          ? { state: 'failed', error: new Error('translation broke'), prepared: { text } }
          : { state: 'done', prepared: { text: item.text ?? text } },
      ),
    );
    const { service, jobs, logError } = setUp({ text: textStep });

    await service.startBatch({ ...ALL, steps: ['mockups', 'text', 'draft'] });
    expect(await settled(service)).toMatchObject({ failures: [{}, {}, {}] });
    expect((await jobs.current())?.items[0]?.text).toEqual(text);
    expect(logError).toHaveBeenCalled();

    fails = false;
    await service.retryBatch();
    const job = await settled(service);

    expect(job?.failures).toEqual([]);
    expect(job?.stepCounts.draft).toMatchObject({ done: 3 });
    expect(job?.stepCounts.mockups).toMatchObject({ done: 3 });
    expect(textStep).toHaveBeenLastCalledWith(
      expect.objectContaining({ text }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('runs one job at a time', async () => {
    const held = heldStep();
    const { service } = setUp({ print: held.runner });

    await service.startBatch(ALL);
    await expect(service.startBatch(ALL)).rejects.toBeInstanceOf(BatchInProgressError);
    await expect(service.resumeBatch()).rejects.toBeInstanceOf(BatchInProgressError);
    await expect(service.retryBatch()).rejects.toBeInstanceOf(BatchInProgressError);
    held.release();
    await vi.waitFor(() => {
      expect(held.runner).toHaveBeenCalledTimes(2);
    });
    held.release();
    await vi.waitFor(() => {
      expect(held.runner).toHaveBeenCalledTimes(3);
    });
    held.release();
    await settled(service);
  });

  it('cancels after the step running now and resumes with the designs left', async () => {
    const held = heldStep();
    const { service, steps } = setUp({ print: held.runner });

    await service.startBatch(ALL);
    await vi.waitFor(() => {
      expect(held.runner).toHaveBeenCalledTimes(1);
    });
    const cancelling = await service.cancelBatch();
    expect(cancelling.job).toMatchObject({ state: 'cancelled', current: { designKey: '01-mug' } });
    held.release();
    const cancelled = await settled(service, 'cancelled');

    expect(cancelled?.stepCounts.print).toMatchObject({ done: 1, pending: 2 });
    expect(steps).not.toHaveBeenCalled();
    expect((await service.cancelBatch()).job?.state).toBe('cancelled');

    held.runner.mockResolvedValue({ state: 'done' });
    await service.resumeBatch();
    expect(await settled(service)).toMatchObject({ settledDesigns: 3 });
  });

  it('finishes a job cancelled during its last step once that step is done', async () => {
    const held = heldStep();
    const { service } = setUp({ print: held.runner });

    await service.startBatch({
      ...ALL,
      selection: { kind: 'designs', designIds: ['id-01-mug'] },
      steps: ['print'],
    });
    await vi.waitFor(() => {
      expect(held.runner).toHaveBeenCalledOnce();
    });
    await service.cancelBatch();
    held.release();

    expect(await settled(service)).toMatchObject({ settledDesigns: 1 });
  });

  it('keeps a cancelled job cancelled when storing its last step fails', async () => {
    const held = heldStep();
    const jobs = new InMemoryBatches();
    const { service, logError } = setUp({ print: held.runner }, jobs);

    await service.startBatch(ALL);
    await vi.waitFor(() => {
      expect(held.runner).toHaveBeenCalledOnce();
    });
    await service.cancelBatch();
    vi.spyOn(jobs, 'saveItem').mockRejectedValue(new Error('disk full'));
    held.release();

    await vi.waitFor(() => {
      expect(logError).toHaveBeenCalledWith(new Error('disk full'));
    });
    expect(await settled(service, 'cancelled')).toMatchObject({ state: 'cancelled' });
    expect((await jobs.current())?.job.state).toBe('cancelled');
  });

  it('leaves a step that was waiting to run again when the job is cancelled', async () => {
    const waiting = vi.fn<StepRunner>(async (_item, _job, signal) => {
      await waitWith(systemTimers)(60_000, signal);
      return { state: 'done' };
    });
    const { service } = setUp({ print: waiting });

    await service.startBatch(ALL);
    await vi.waitFor(() => {
      expect(waiting).toHaveBeenCalled();
    });
    await service.cancelBatch();
    const job = await settled(service, 'cancelled');

    expect(job?.stepCounts.print).toMatchObject({ pending: 3, failed: 0 });
  });

  it('runs a step again that an engine stopped when the job was cancelled', async () => {
    const engine = vi.fn<StepRunner>(
      (_item, _job, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new WorkStoppedError('Upscaling was stopped'));
          });
        }),
    );
    const { service } = setUp({ print: engine });

    await service.startBatch(ALL);
    await vi.waitFor(() => {
      expect(engine).toHaveBeenCalled();
    });
    await service.cancelBatch();
    const job = await settled(service, 'cancelled');

    expect(job?.stepCounts.print).toMatchObject({ pending: 3, failed: 0 });
  });

  it("reads the shop's options once for the whole run", async () => {
    const shopStep = vi.fn<StepRunner>(async (_item, run) => {
      await run.shop();
      await run.shop();
      return { state: 'done' };
    });
    const { service, catalog } = setUp({ text: shopStep, draft: shopStep });
    catalog.getShopOptions.mockResolvedValue(shopOptionsDto());

    await service.startBatch({ ...ALL, steps: ['mockups', 'text', 'draft'] });
    await settled(service);

    expect(shopStep).toHaveBeenCalledTimes(6);
    expect(catalog.getShopOptions).toHaveBeenCalledTimes(1);
  });

  it('keeps a finished job as it is after a restart', async () => {
    const jobs = new InMemoryBatches();
    const checks = new InMemoryDraftChecks();
    const first = setUp({}, jobs, checks);
    await first.service.startBatch(ALL);
    await settled(first.service);

    const restarted = setUp({}, jobs, checks);
    await restarted.service.recover();

    expect((await restarted.service.getBatchStatus()).job?.state).toBe('finished');
  });

  it('starts anew with the text an earlier job wrote for the same revision', async () => {
    const text = {
      language: 'en-US',
      text: { title: 'T', description: 'D', tags: [] },
      translations: [],
    };
    const textStep = vi.fn<StepRunner>(() =>
      Promise.resolve({ state: 'done', prepared: { text } }),
    );
    const { service } = setUp({ text: textStep });
    await service.startBatch({ ...ALL, steps: ['text'] });
    await settled(service);

    await service.startBatch({ ...ALL, steps: ['text'] });
    await settled(service);

    expect(textStep).toHaveBeenLastCalledWith(
      expect.objectContaining({ text }),
      expect.objectContaining({ job: expect.objectContaining({ id: 'job-0002' }) as unknown }),
      expect.anything(),
    );
  });

  it('gives the window the text a job wrote for a design, after a restart too', async () => {
    const text = {
      language: 'en-US',
      text: { title: 'Meadow Bees Mug', description: 'A mug.', tags: ['fall mug'] },
      translations: [
        { language: 'de', text: { title: 'Tasse', description: 'Eine.', tags: ['herbst'] } },
      ],
    };
    const textStep = vi.fn<StepRunner>((item) =>
      Promise.resolve(
        item.designKey === '01-mug' ? { state: 'done', prepared: { text } } : { state: 'done' },
      ),
    );
    const jobs = new InMemoryBatches();
    const checks = new InMemoryDraftChecks();
    const first = setUp({ text: textStep }, jobs, checks);
    expect(await first.service.getBatchListingText({ id: 'id-01-mug' })).toBeNull();
    await first.service.startBatch({ ...ALL, steps: ['text'] });
    await settled(first.service);

    const restarted = setUp({}, jobs, checks);
    await restarted.service.recover();

    expect(await restarted.service.getBatchListingText({ id: 'id-01-mug' })).toEqual({
      language: 'en-US',
      title: 'Meadow Bees Mug',
      description: 'A mug.',
      tags: ['fall mug'],
      translations: [{ language: 'de', title: 'Tasse', description: 'Eine.', tags: ['herbst'] }],
    });
    expect(await restarted.service.getBatchListingText({ id: 'id-02-mug' })).toBeNull();
    expect(await restarted.service.getBatchListingText({ id: 'id-unknown' })).toBeNull();
  });

  it('has nothing to resume or retry before the first job', async () => {
    const { service } = setUp();

    expect(await service.getBatchStatus()).toEqual({ job: null });
    await expect(service.resumeBatch()).rejects.toThrow(/not found/);
    expect(await service.cancelBatch()).toEqual({ job: null });
  });
});
