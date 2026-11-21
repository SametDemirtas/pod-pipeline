import { describe, expect, it } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import {
  checkedItem,
  interrupted,
  keptText,
  draftMayExist,
  failedItem,
  newBatchItem,
  nextStep,
  retriedItem,
  withStepState,
  type BatchItem,
} from './batch-job.js';

const design = { id: 'd1' as DesignId, designKey: '01-mug', revision: 2, importedRevision: 2 };
const text = {
  language: 'en-US',
  text: { title: 'Tulip Mug', description: 'A mug.', tags: [] },
  translations: [],
};
const failure = {
  step: 'research',
  code: 'RESEARCH_BLOCKED',
  message: 'blocked',
  details: {},
} as const;

describe('batch items', () => {
  it('start with every step of the job waiting, in the order steps run', () => {
    const item = newBatchItem(design, ['text', 'print', 'research'], undefined, null);

    expect(item).toMatchObject({
      designId: 'd1',
      designRevision: 2,
      steps: { print: 'pending', research: 'pending', text: 'pending' },
      failure: null,
      draftCheck: null,
      keywords: null,
      text: null,
    });
    expect(nextStep(item)).toBe('print');
    expect(nextStep(withStepState(item, 'print', 'done'))).toBe('research');
  });

  it('keep the text an earlier job wrote for the same revision only, not its words', () => {
    const earlier: BatchItem = {
      ...newBatchItem(design, ['text'], undefined, null),
      keywords: [{ term: 'tulip mug', market: 'US', suggested: true }],
      text,
    };

    expect(newBatchItem(design, ['text'], earlier, null)).toMatchObject({ text, keywords: null });
    const reimported = { ...design, revision: 3, importedRevision: 3 };
    expect(newBatchItem(reimported, ['text'], earlier, null)).toMatchObject({
      text: null,
      keywords: null,
    });
  });

  it('keep the text once the artwork was only made larger or turned since', () => {
    const earlier: BatchItem = { ...newBatchItem(design, ['text'], undefined, null), text };
    const larger = { ...design, revision: 4, importedRevision: 2 };

    expect(keptText(larger, earlier)).toBe(text);
    expect(keptText({ ...larger, importedRevision: 3 }, earlier)).toBeNull();
    expect(keptText({ ...design, revision: 1, importedRevision: 1 }, earlier)).toBeNull();
    expect(keptText(design, undefined)).toBeNull();
  });

  it('block no steps for a failure of a step the job does not run', () => {
    const item = failedItem(newBatchItem(design, ['print', 'text'], undefined, null), {
      ...failure,
      step: 'draft',
    });

    expect(item.steps).toEqual({ print: 'pending', text: 'pending' });
    expect(item.failure).toMatchObject({ step: 'draft' });
  });

  it('keep a draft that may be on Etsy failed until the seller has checked', () => {
    const unconfirmed = { ...failure, step: 'draft', code: 'DRAFT_UNCONFIRMED' } as const;
    const steps = ['print', 'text', 'draft'] as const;
    const earlier = failedItem(
      newBatchItem(design, ['text', 'draft'], undefined, null),
      unconfirmed,
    );
    expect(retriedItem(earlier).steps.draft).toBe('failed');

    let item = newBatchItem(
      { ...design, revision: 3, importedRevision: 3 },
      steps,
      earlier,
      earlier.draftCheck,
    );
    expect(item).toMatchObject({
      failure: null,
      draftCheck: unconfirmed,
      steps: { print: 'pending', text: 'pending', draft: 'failed' },
    });
    item = failedItem(item, { ...failure, step: 'print' });
    expect(item.steps).toEqual({ print: 'failed', text: 'blocked', draft: 'failed' });
    item = retriedItem(item);
    expect(item.steps).toEqual({ print: 'pending', text: 'pending', draft: 'failed' });
    item = newBatchItem(design, steps, item, item.draftCheck);
    expect(draftMayExist(item)).toBe(true);
    expect(item.steps.draft).toBe('failed');
    expect(newBatchItem(design, ['print'], item, item.draftCheck).steps).toEqual({
      print: 'pending',
    });
  });

  it('let the draft run again once the seller checked, after any other failure', () => {
    const unconfirmed = { ...failure, step: 'draft', code: 'DRAFT_LEFT_BEHIND' } as const;
    const stopped = failedItem(
      newBatchItem(design, ['text', 'draft'], undefined, null),
      unconfirmed,
    );

    expect(checkedItem(stopped)).toMatchObject({
      failure: null,
      draftCheck: null,
      steps: { draft: 'pending' },
    });
    const carried = failedItem(
      newBatchItem(design, ['text', 'draft'], stopped, stopped.draftCheck),
      {
        ...failure,
        step: 'text',
      },
    );
    const checked = checkedItem(carried);
    expect(checked).toMatchObject({ failure: { step: 'text' }, steps: { draft: 'blocked' } });
    expect(retriedItem(checked).steps).toEqual({ text: 'pending', draft: 'pending' });
    expect(checkedItem(newBatchItem(design, ['print'], stopped, stopped.draftCheck)).steps).toEqual(
      {
        print: 'pending',
      },
    );
  });

  it('block the steps after a failed one and run them again on retry', () => {
    const started = withStepState(
      newBatchItem(design, ['print', 'research', 'text', 'draft'], undefined, null),
      'print',
      'skipped',
    );

    const failed = failedItem(started, failure);
    expect(failed.steps).toEqual({
      print: 'skipped',
      research: 'failed',
      text: 'blocked',
      draft: 'blocked',
    });
    expect(failed.failure).toBe(failure);
    expect(nextStep(failed)).toBeUndefined();

    const retried = retriedItem(failed);
    expect(retried.steps).toEqual({
      print: 'skipped',
      research: 'pending',
      text: 'pending',
      draft: 'pending',
    });
    expect(retried.failure).toBeNull();
  });

  it('run a step the app stopped during again, but a draft, which may be on Etsy', () => {
    const unconfirmed = { ...failure, step: 'draft', code: 'DRAFT_UNCONFIRMED' } as const;
    const item = newBatchItem(design, ['print', 'draft'], undefined, null);

    expect(interrupted(withStepState(item, 'print', 'running'), unconfirmed).steps).toEqual({
      print: 'pending',
      draft: 'pending',
    });
    expect(interrupted(withStepState(item, 'draft', 'running'), unconfirmed)).toMatchObject({
      draftCheck: unconfirmed,
      steps: { draft: 'failed' },
    });
    expect(interrupted(item, unconfirmed)).toBe(item);
  });
});
