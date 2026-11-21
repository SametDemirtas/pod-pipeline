import { expect, vi } from 'vitest';
import type { BatchRequest, BatchStatusDto } from '@pod/contracts';
import type { BatchStep } from '@pod/core';
import { FixedClock, InMemoryBatches, InMemoryDraftChecks, SequentialIds } from '@pod/core/testing';
import { toApiError } from '../api/to-api-error.js';
import { designDto } from './batch-fixtures.js';
import { fakeCatalog } from './fake-catalog.js';
import { DraftMayExistError } from '../application/errors/listing-errors.js';
import { BatchService } from '../application/batch/batch-service.js';
import { UncheckedDrafts } from '../application/batch/unchecked-drafts.js';
import type { BatchSteps, StepOutcome, StepRunner } from '../application/batch/step-runner.js';

const DESIGNS = ['01-mug', '01-blanket', '02-mug'].map((key) => designDto(key));
export const ALL: BatchRequest = {
  selection: { kind: 'designs', designIds: DESIGNS.map((design) => design.id) },
  steps: ['draft', 'print', 'mockups', 'text'],
  market: 'US',
};

/** A draft step that ends like creating a draft Etsy may hold: the design is marked first. */
export function unconfirmedDraft(checks: InMemoryDraftChecks): StepRunner {
  return async (item) => {
    const error = new DraftMayExistError();
    await checks.set(item.designId, { step: 'draft', ...toApiError(error, () => undefined) });
    throw error;
  };
}

/** A promise the test settles, to act while the code under test waits on it. */
export function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** A step that resolves when the test says so, to look at the job while it runs. */
export function heldStep() {
  let release: (outcome: StepOutcome) => void = () => undefined;
  const runner = vi.fn<StepRunner>(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  return {
    runner,
    release: (outcome: StepOutcome = { state: 'done' }) => {
      release(outcome);
    },
  };
}

export function setUp(
  overrides: Partial<Record<BatchStep, StepRunner>> = {},
  jobs = new InMemoryBatches(),
  draftChecks = new InMemoryDraftChecks(),
) {
  const done = vi.fn<StepRunner>(() => Promise.resolve({ state: 'done' }));
  const steps: BatchSteps = {
    upscale: done,
    print: done,
    mockups: done,
    research: done,
    text: done,
    draft: done,
    ...overrides,
  };
  const catalog = fakeCatalog();
  catalog.getDesign.mockImplementation(({ id }) => {
    const design = DESIGNS.find((candidate) => candidate.id === id);
    return design ? Promise.resolve(design) : Promise.reject(new Error(`no ${id}`));
  });
  const statuses: BatchStatusDto[] = [];
  const logError = vi.fn<(error: unknown) => void>();
  const service = new BatchService({
    jobs,
    drafts: new UncheckedDrafts({
      checks: draftChecks,
      catalog,
      unconfirmed: () => ({ step: 'draft', ...toApiError(new DraftMayExistError(), logError) }),
    }),
    catalog,
    steps,
    estimate: vi.fn(),
    clock: new FixedClock(new Date('2026-10-28T09:00:00.000Z')),
    ids: new SequentialIds('job'),
    describeError: (error) => toApiError(error, logError),
    events: { batchChanged: (status) => statuses.push(status) },
    logError,
  });
  return { service, jobs, draftChecks, catalog, steps: done, statuses, logError };
}

export async function settled(service: BatchService, state = 'finished') {
  await vi.waitFor(async () => {
    expect((await service.getBatchStatus()).job?.state).toBe(state);
    expect((await service.getBatchStatus()).job?.current).toBeNull();
  });
  return (await service.getBatchStatus()).job;
}
