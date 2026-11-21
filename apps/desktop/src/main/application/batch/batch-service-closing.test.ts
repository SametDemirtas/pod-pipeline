import { describe, expect, it, vi } from 'vitest';
import { InMemoryBatches, InMemoryDraftChecks } from '@pod/core/testing';
import { ShopSetupMissingError } from '../errors/batch-errors.js';
import { AppClosingError } from '../../shared/app-error.js';
import type { StepRunner } from './step-runner.js';
import { ALL, gate, heldStep, setUp, settled } from '../../testing/batch-service-setup.js';

describe('BatchService closing', () => {
  it('waits on closing for the step running now and then takes no new job', async () => {
    const held = heldStep();
    const { service, jobs } = setUp({ draft: held.runner });

    await service.startBatch({ ...ALL, steps: ['mockups', 'text', 'draft'] });
    await vi.waitFor(() => {
      expect(held.runner).toHaveBeenCalled();
    });
    let closed = false;
    const closing = service.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    held.release();
    await closing;

    const stored = await jobs.current();
    expect(stored?.job.state).toBe('running');
    expect(stored?.items[0]?.steps.draft).toBe('done');
    expect(stored?.items[1]?.steps.mockups).toBe('pending');
    await expect(service.startBatch(ALL)).rejects.toBeInstanceOf(AppClosingError);
  });

  it('treats a step cut off by closing services as not run', async () => {
    const { service } = setUp({ text: () => Promise.reject(new AppClosingError()) });

    await service.startBatch({ ...ALL, steps: ['text'] });
    await vi.waitFor(async () => {
      expect((await service.getBatchStatus()).job?.stepCounts.text).toMatchObject({ pending: 3 });
    });
    await service.close();
    expect((await service.getBatchStatus()).job?.failures).toEqual([]);
  });

  it('resumes after a restart, leaving a draft that was being made for the seller to check', async () => {
    const jobs = new InMemoryBatches();
    const checks = new InMemoryDraftChecks();
    const held = heldStep();
    const first = setUp({ draft: held.runner }, jobs, checks);
    await first.service.startBatch({ ...ALL, steps: ['mockups', 'text', 'draft'] });
    await vi.waitFor(() => {
      expect(held.runner).toHaveBeenCalled();
    });
    // The app ends here without closing, so the draft step stays stored as running.

    const draft = vi.fn<StepRunner>(() => Promise.resolve({ state: 'done' }));
    const second = setUp({ draft }, jobs, checks);
    await second.service.recover();
    const paused = (await second.service.getBatchStatus()).job;
    expect(paused).toMatchObject({
      state: 'paused',
      failures: [{ designKey: '01-mug', step: 'draft', error: { code: 'DRAFT_UNCONFIRMED' } }],
    });

    await second.service.resumeBatch();
    const job = await settled(second.service);
    expect(draft.mock.calls.map(([item]) => item.designKey)).toEqual(['01-blanket', '02-mug']);
    expect(job?.stepCounts.draft).toMatchObject({ done: 2, failed: 1 });

    // Retrying could make a second draft on Etsy, so that design waits for the seller.
    await second.service.retryBatch();
    expect(await settled(second.service)).toMatchObject({ failures: [{ designKey: '01-mug' }] });
    expect(draft).toHaveBeenCalledTimes(2);
    held.release();
  });

  it('runs a step the app closed during again after a restart', async () => {
    const jobs = new InMemoryBatches();
    const checks = new InMemoryDraftChecks();
    const held = heldStep();
    await setUp({ mockups: held.runner }, jobs, checks).service.startBatch(ALL);
    await vi.waitFor(() => {
      expect(held.runner).toHaveBeenCalled();
    });

    const restarted = setUp({}, jobs, checks);
    await restarted.service.recover();

    expect((await jobs.current())?.items[0]?.steps).toMatchObject({
      print: 'done',
      mockups: 'pending',
    });
    await restarted.service.resumeBatch();
    expect(await settled(restarted.service)).toMatchObject({ failures: [] });
    held.release();
  });

  it('runs a step again that the app closed during while a cancelled job finished it', async () => {
    const jobs = new InMemoryBatches();
    const checks = new InMemoryDraftChecks();
    const held = heldStep();
    const first = setUp({ mockups: held.runner }, jobs, checks);
    await first.service.startBatch(ALL);
    await vi.waitFor(() => {
      expect(held.runner).toHaveBeenCalled();
    });
    await first.service.cancelBatch();

    const restarted = setUp({}, jobs, checks);
    await restarted.service.recover();

    expect((await jobs.current())?.job.state).toBe('cancelled');
    expect((await jobs.current())?.items[0]?.steps.mockups).toBe('pending');
    held.release();
  });

  it('refuses to start once the app began closing while the designs were read', async () => {
    const { service } = setUp();

    const started = service.startBatch(ALL);
    await service.close();

    await expect(started).rejects.toBeInstanceOf(AppClosingError);
    expect((await service.getBatchStatus()).job).toBeNull();
  });

  it('pauses the job when the run breaks off, so the seller can resume it', async () => {
    const jobs = new InMemoryBatches();
    const checks = new InMemoryDraftChecks();
    const saveItem = jobs.saveItem.bind(jobs);
    const failing = vi.spyOn(jobs, 'saveItem').mockRejectedValue(new Error('disk full'));
    const saveJob = vi.spyOn(jobs, 'saveJob');
    const { service, logError } = setUp({}, jobs, checks);

    await service.startBatch(ALL);
    const paused = await settled(service, 'paused');

    expect(logError).toHaveBeenCalledWith(new Error('disk full'));
    expect(paused).toMatchObject({ state: 'paused', current: null });
    failing.mockImplementation(saveItem);
    await service.resumeBatch();
    expect(await settled(service)).toMatchObject({ settledDesigns: 3 });

    failing.mockRejectedValue(new Error('disk full'));
    saveJob.mockRejectedValue(new Error('locked'));
    await service.retryBatch().catch(() => undefined);
    await service.startBatch(ALL).catch(() => undefined);
    await vi.waitFor(() => {
      expect(logError).toHaveBeenCalledWith(new Error('locked'));
    });
  });

  it('cancels a job no run is going on for, and a run still being started', async () => {
    const { service, steps } = setUp();
    const starting = service.startBatch(ALL);
    await service.cancelBatch();
    await starting;

    expect((await service.getBatchStatus()).job?.state).toBe('cancelled');
    expect(steps).not.toHaveBeenCalled();

    const closing = setUp();
    const started = closing.service.startBatch(ALL);
    await closing.service.close();
    await expect(started).rejects.toBeInstanceOf(AppClosingError);
    expect((await closing.service.getBatchStatus()).job).toBeNull();
  });

  it('refuses to start, resume, retry or cancel once closed', async () => {
    const { service } = setUp();
    await service.startBatch({ ...ALL, steps: ['text'] });
    await settled(service);
    await service.close();

    await expect(service.startBatch(ALL)).rejects.toBeInstanceOf(AppClosingError);
    await expect(service.resumeBatch()).rejects.toBeInstanceOf(AppClosingError);
    await expect(service.retryBatch()).rejects.toBeInstanceOf(AppClosingError);
    await expect(service.cancelBatch()).rejects.toBeInstanceOf(AppClosingError);
  });

  it('refuses a start asked for while closing waits for the one being started', async () => {
    const { service, jobs } = setUp();
    const stored = gate();
    const replace = jobs.replace.bind(jobs);
    vi.spyOn(jobs, 'replace').mockImplementation(async (batch) => {
      await stored.opened;
      return replace(batch);
    });
    const first = service.startBatch(ALL);
    await Promise.resolve();
    const closing = service.close();
    const second = service.startBatch(ALL);
    stored.open();

    await expect(second).rejects.toBeInstanceOf(AppClosingError);
    await expect(first).rejects.toBeInstanceOf(AppClosingError);
    await closing;
  });

  it('takes no draft check once closing', async () => {
    const { service } = setUp();
    await service.close();

    await expect(service.confirmDraftsChecked({ id: 'id-01-mug' })).rejects.toBeInstanceOf(
      AppClosingError,
    );
  });

  it('takes no new run once closing began while the job was stored', async () => {
    for (const change of ['start', 'resume', 'retry'] as const) {
      const jobs = new InMemoryBatches();
      const checks = new InMemoryDraftChecks();
      const first = setUp(
        { print: () => Promise.reject(new ShopSetupMissingError()) },
        jobs,
        checks,
      );
      await first.service.startBatch({ ...ALL, steps: ['print'] });
      await settled(first.service);
      const stored = gate();
      const replace = jobs.replace.bind(jobs);
      const saveJob = jobs.saveJob.bind(jobs);
      vi.spyOn(jobs, 'replace').mockImplementation(async (batch) => {
        await stored.opened;
        return replace(batch);
      });
      vi.spyOn(jobs, 'saveJob').mockImplementation(async (job) => {
        await stored.opened;
        return saveJob(job);
      });
      const run =
        change === 'start'
          ? first.service.startBatch(ALL)
          : change === 'resume'
            ? first.service.resumeBatch()
            : first.service.retryBatch();
      await Promise.resolve();
      const closing = first.service.close();
      stored.open();

      await expect(run).rejects.toBeInstanceOf(AppClosingError);
      await closing;
      expect(first.steps).not.toHaveBeenCalled();
    }
  });
});
