import { describe, expect, it, vi } from 'vitest';
import type { BatchRequest, ListingDto } from '@pod/contracts';
import type { DesignId } from '@pod/core';
import { InMemoryBatches, InMemoryDraftChecks } from '@pod/core/testing';
import { ShopSetupMissingError } from '../errors/batch-errors.js';
import { DraftMayExistError } from '../errors/listing-errors.js';
import type { StepRunner } from './step-runner.js';
import {
  ALL,
  unconfirmedDraft,
  heldStep,
  setUp,
  settled,
} from '../../testing/batch-service-setup.js';

describe('BatchService drafts that may be on Etsy', () => {
  it('runs a step again on resume when storing its outcome failed', async () => {
    const jobs = new InMemoryBatches();
    const checks = new InMemoryDraftChecks();
    const saveItem = jobs.saveItem.bind(jobs);
    let failSave = true;
    vi.spyOn(jobs, 'saveItem').mockImplementation((jobId, item) => {
      if (failSave && item.steps.print === 'running') {
        failSave = false;
        return Promise.reject(new Error('disk full'));
      }
      return saveItem(jobId, item);
    });
    const { service, logError } = setUp({}, jobs, checks);

    await service.startBatch({ ...ALL, steps: ['print'] });
    await vi.waitFor(() => {
      expect(logError).toHaveBeenCalled();
    });
    await vi.waitFor(async () => {
      expect((await service.getBatchStatus()).job?.current).toBeNull();
    });
    expect((await service.getBatchStatus()).job?.stepCounts.print).toMatchObject({ running: 1 });
    await service.resumeBatch();

    expect(await settled(service)).toMatchObject({ settledDesigns: 3, failures: [] });
  });

  it('stores on resume an outcome that was held but could not be stored', async () => {
    const jobs = new InMemoryBatches();
    const saveItem = jobs.saveItem.bind(jobs);
    let failSave = true;
    vi.spyOn(jobs, 'saveItem').mockImplementation((jobId, item) => {
      if (failSave && item.steps.print === 'done') {
        failSave = false;
        return Promise.reject(new Error('disk full'));
      }
      return saveItem(jobId, item);
    });
    const { service, logError } = setUp({}, jobs);

    await service.startBatch({ ...ALL, steps: ['print'] });
    await vi.waitFor(() => {
      expect(logError).toHaveBeenCalled();
    });
    await vi.waitFor(async () => {
      expect((await service.getBatchStatus()).job?.state).toBe('paused');
    });
    await service.resumeBatch();
    await settled(service);

    const stored = await jobs.current();
    expect(stored?.items.map((item) => item.steps.print)).toEqual(['done', 'done', 'done']);
  });

  it('keeps a draft that may be on Etsy failed in a new run until the seller has checked', async () => {
    const jobs = new InMemoryBatches();
    const checks = new InMemoryDraftChecks();
    const held = heldStep();
    const first = setUp({ draft: held.runner }, jobs, checks);
    await first.service.startBatch({ ...ALL, steps: ['mockups', 'text', 'draft'] });
    await vi.waitFor(() => {
      expect(held.runner).toHaveBeenCalled();
    });

    const draft = vi.fn<StepRunner>(() => Promise.resolve({ state: 'done' }));
    const second = setUp({ draft }, jobs, checks);
    await second.service.recover();
    await second.service.startBatch({
      ...ALL,
      selection: { kind: 'designs', designIds: ['id-01-mug'] },
    });
    const job = await settled(second.service);

    expect(draft).not.toHaveBeenCalled();
    expect(job).toMatchObject({
      failures: [{ designKey: '01-mug', error: { code: 'DRAFT_UNCONFIRMED' } }],
    });
    expect(job?.stepCounts.text).toMatchObject({ done: 1 });

    await second.service.confirmDraftsChecked({ id: 'id-01-mug' });
    await second.service.resumeBatch();
    expect(await settled(second.service)).toMatchObject({ failures: [] });
    expect(draft).toHaveBeenCalledTimes(1);
    held.release();
  });

  it('never makes the draft again while unchecked, whatever else fails or is retried', async () => {
    const jobs = new InMemoryBatches();
    const checks = new InMemoryDraftChecks();
    const unconfirmed = setUp(
      { draft: () => Promise.reject(new DraftMayExistError()) },
      jobs,
      checks,
    );
    const one = { ...ALL, steps: ['print', 'mockups', 'text', 'draft'] as BatchRequest['steps'] };
    const mug = { ...one, selection: { kind: 'designs' as const, designIds: ['id-01-mug'] } };
    await unconfirmed.service.startBatch(mug);
    await settled(unconfirmed.service);

    const draft = vi.fn<StepRunner>(() => Promise.resolve({ state: 'done' }));
    let printFails = true;
    const print = vi.fn<StepRunner>(() =>
      printFails ? Promise.reject(new ShopSetupMissingError()) : Promise.resolve({ state: 'done' }),
    );
    const later = setUp({ draft, print }, jobs, checks);
    await later.service.recover();
    await later.service.startBatch(mug);
    const failed = await settled(later.service);
    expect(failed?.failures).toMatchObject([
      {
        error: { code: 'SHOP_SETUP_MISSING' },
        draftCheck: { code: 'DRAFT_UNCONFIRMED' },
      },
    ]);

    printFails = false;
    await later.service.retryBatch();
    await settled(later.service);
    await later.service.startBatch(mug);
    const again = await settled(later.service);

    expect(draft).not.toHaveBeenCalled();
    // The first run's step wrote no mark, so the earlier job's is kept apart for later runs.
    expect([...(await checks.all()).keys()]).toEqual(['id-01-mug']);
    expect(again?.stepCounts.draft).toMatchObject({ failed: 1 });
    expect(again?.failures).toMatchObject([{ draftCheck: { code: 'DRAFT_UNCONFIRMED' } }]);
  });

  it('keeps a check of the drafts made while an earlier step of the design ran', async () => {
    const jobs = new InMemoryBatches();
    const checks = new InMemoryDraftChecks();
    const first = setUp({ draft: () => Promise.reject(new DraftMayExistError()) }, jobs, checks);
    const mug = {
      ...ALL,
      steps: ['mockups', 'text', 'draft'] as BatchRequest['steps'],
      selection: { kind: 'designs' as const, designIds: ['id-01-mug'] },
    };
    await first.service.startBatch(mug);
    await settled(first.service);
    const held = heldStep();
    const draft = vi.fn<StepRunner>(() => Promise.resolve({ state: 'done' }));
    const second = setUp({ text: held.runner, draft }, first.jobs, first.draftChecks);
    await second.service.recover();
    await second.service.startBatch(mug);
    await vi.waitFor(() => {
      expect(held.runner).toHaveBeenCalled();
    });

    await second.service.confirmDraftsChecked({ id: 'id-01-mug' });
    held.release();
    const job = await settled(second.service);

    expect(draft).toHaveBeenCalledTimes(1);
    expect(job).toMatchObject({ failures: [], settledDesigns: 1 });
  });

  it('holds a draft that may be on Etsy across runs that leave the design out', async () => {
    const checks = new InMemoryDraftChecks();
    const mugOnly = {
      ...ALL,
      steps: ['mockups', 'text', 'draft'] as BatchRequest['steps'],
      selection: { kind: 'designs' as const, designIds: ['id-01-mug'] },
    };
    const first = setUp({ draft: unconfirmedDraft(checks) }, new InMemoryBatches(), checks);
    await first.service.startBatch(mugOnly);
    await settled(first.service);
    const draft = vi.fn<StepRunner>(() => Promise.resolve({ state: 'done' }));
    const later = setUp({ draft }, new InMemoryBatches(), checks);
    await later.service.startBatch({
      ...mugOnly,
      selection: { kind: 'designs', designIds: ['id-01-blanket'] },
    });
    await settled(later.service);

    await later.service.startBatch(mugOnly);
    const job = await settled(later.service);

    expect(draft.mock.calls.map(([item]) => item.designKey)).toEqual(['01-blanket']);
    expect(job?.failures).toMatchObject([{ draftCheck: { code: 'DRAFT_UNCONFIRMED' } }]);
  });

  it('holds a draft that may be on Etsy when the stored job cannot be read', async () => {
    const checks = new InMemoryDraftChecks();
    const first = setUp({ draft: unconfirmedDraft(checks) }, new InMemoryBatches(), checks);
    await first.service.startBatch({ ...ALL, steps: ['mockups', 'text', 'draft'] });
    await settled(first.service);
    const unreadable = new InMemoryBatches();
    vi.spyOn(unreadable, 'current').mockRejectedValue(new Error('unknown market'));
    const draft = vi.fn<StepRunner>(() => Promise.resolve({ state: 'done' }));
    const restarted = setUp({ draft }, unreadable, checks);

    await expect(restarted.service.recover()).rejects.toThrow('unknown market');
    await restarted.service.startBatch({ ...ALL, steps: ['mockups', 'text', 'draft'] });
    await settled(restarted.service);

    expect(draft).not.toHaveBeenCalled();
  });

  it("retries a design's other failure while its draft waits for the check", async () => {
    const checks = new InMemoryDraftChecks();
    const first = setUp({ draft: unconfirmedDraft(checks) }, new InMemoryBatches(), checks);
    const mug = {
      ...ALL,
      steps: ['print', 'text', 'draft'] as BatchRequest['steps'],
      selection: { kind: 'designs' as const, designIds: ['id-01-mug'] },
    };
    await first.service.startBatch(mug);
    await settled(first.service);
    let fails = true;
    const print = vi.fn<StepRunner>(() =>
      fails ? Promise.reject(new ShopSetupMissingError()) : Promise.resolve({ state: 'done' }),
    );
    const draft = vi.fn<StepRunner>(() => Promise.resolve({ state: 'done' }));
    const later = setUp({ print, draft }, new InMemoryBatches(), checks);
    await later.service.startBatch(mug);
    await settled(later.service);

    fails = false;
    await later.service.retryBatch();
    const job = await settled(later.service);

    expect(print).toHaveBeenCalledTimes(2);
    expect(job?.stepCounts.text).toMatchObject({ done: 1 });
    expect(job?.stepCounts.draft).toMatchObject({ failed: 1 });
    expect(draft).not.toHaveBeenCalled();
  });

  it('takes the seller’s check of the drafts also for a design outside the run', async () => {
    const { service, draftChecks } = setUp({
      print: () => Promise.reject(new ShopSetupMissingError()),
    });
    await draftChecks.set('id-02-mug' as DesignId, {
      step: 'draft',
      code: 'DRAFT_UNCONFIRMED',
      message: 'm',
      details: {},
    });
    await service.startBatch({
      ...ALL,
      steps: ['print'],
      selection: { kind: 'designs', designIds: ['id-01-mug'] },
    });
    const before = await settled(service);

    await service.confirmDraftsChecked({ id: 'id-02-mug' });
    await service.confirmDraftsChecked({ id: 'id-01-mug' });

    expect(await draftChecks.all()).toEqual(new Map());
    expect((await service.getBatchStatus()).job?.failures).toEqual(before?.failures);
  });

  it('drops the mark of a design whose listing was stored after all', async () => {
    const draft = vi.fn<StepRunner>(() => Promise.resolve({ state: 'done' }));
    const { service, draftChecks, catalog } = setUp({ draft });
    await draftChecks.set('id-01-mug' as DesignId, {
      step: 'draft',
      code: 'DRAFT_UNCONFIRMED',
      message: 'm',
      details: {},
    });
    catalog.getListing.mockImplementation(({ id }) =>
      Promise.resolve(id === 'id-01-mug' ? ({} as ListingDto) : null),
    );

    await service.estimateBatch(ALL);
    expect([...(await draftChecks.all()).keys()]).toEqual(['id-01-mug']);
    await service.recover();

    expect(await draftChecks.all()).toEqual(new Map());
    await service.startBatch({ ...ALL, steps: ['mockups', 'text', 'draft'] });
    expect(await settled(service)).toMatchObject({ failures: [] });
    expect(draft).toHaveBeenCalledTimes(3);
  });

  it('holds no draft in a new run for a design whose listing was stored since the last run', async () => {
    const draftChecks = new InMemoryDraftChecks();
    const draft = vi
      .fn<StepRunner>(() => Promise.resolve({ state: 'done' }))
      .mockImplementationOnce(unconfirmedDraft(draftChecks));
    const first = setUp({ draft }, new InMemoryBatches(), draftChecks);
    const mug = {
      ...ALL,
      steps: ['draft'] as BatchRequest['steps'],
      selection: { kind: 'designs' as const, designIds: ['id-01-mug'] },
    };
    await first.service.startBatch(mug);
    expect((await settled(first.service))?.failures).toHaveLength(1);
    first.catalog.getListing.mockResolvedValue({} as ListingDto);

    await first.service.startBatch(mug);

    expect(await settled(first.service)).toMatchObject({ failures: [] });
    expect(draft).toHaveBeenCalledTimes(2);
  });
});
