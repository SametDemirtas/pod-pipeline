import { describe, expect, it } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import { InMemoryDraftChecks } from '../testing/index.js';
import { ConflictError, DraftsNotCheckedError, DraftUnconfirmedError } from '../errors.js';
import { DraftGuard, draftMade, nothingLeft } from './draft-guard.js';

const MUG = 'design-01-mug' as DesignId;

describe('DraftGuard', () => {
  it('keeps the mark after an error, naming why when Etsy may hold the draft', async () => {
    const checks = new InMemoryDraftChecks();
    const guard = new DraftGuard(checks, () => undefined);

    await expect(guard.run(MUG, () => Promise.reject(new Error('broke off')))).rejects.toThrow(
      'broke off',
    );
    expect((await checks.all()).get(MUG)).toMatchObject({ code: 'DRAFT_UNCONFIRMED' });

    const left = Object.assign(new Error('left'), {
      code: 'DRAFT_LEFT_BEHIND',
      details: { marketplaceId: '77' },
    });
    await expect(guard.run(MUG, () => Promise.reject(left))).rejects.toBe(left);
    expect((await checks.all()).get(MUG)).toMatchObject({ details: { marketplaceId: '77' } });

    const unconfirmed = new DraftUnconfirmedError();
    await expect(guard.run(MUG, () => Promise.reject(unconfirmed))).rejects.toBe(unconfirmed);
    expect((await checks.all()).get(MUG)).toMatchObject({
      code: 'DRAFT_UNCONFIRMED',
      message: unconfirmed.message,
    });
  });

  it('drops the mark once the draft was made or nothing was left on Etsy', async () => {
    const checks = new InMemoryDraftChecks();
    const guard = new DraftGuard(checks, () => undefined);

    await expect(guard.run(MUG, () => Promise.resolve(draftMade('made')))).resolves.toBe('made');
    expect(await checks.all()).toEqual(new Map());

    await expect(
      guard.run(MUG, () => Promise.resolve(nothingLeft(new Error('refused')))),
    ).rejects.toThrow('refused');
    expect(await checks.all()).toEqual(new Map());
  });

  it('reports a mark it could not update and still the outcome of the draft', async () => {
    const checks = new InMemoryDraftChecks();
    const markErrors: unknown[] = [];
    const guard = new DraftGuard(checks, (error) => markErrors.push(error));
    checks.clear = () => Promise.reject(new Error('locked'));

    await expect(guard.run(MUG, () => Promise.resolve(draftMade('made')))).resolves.toBe('made');
    await expect(
      guard.run(MUG, () => Promise.resolve(nothingLeft(new Error('refused')))),
    ).rejects.toThrow('refused');
    expect(markErrors).toEqual([new Error('locked'), new Error('locked')]);
  });

  it('refuses a design until the seller checked, naming what Etsy may hold', async () => {
    const checks = new InMemoryDraftChecks();
    const guard = new DraftGuard(checks, () => undefined);
    await checks.set(MUG, {
      step: 'draft',
      code: 'DRAFT_LEFT_BEHIND',
      message: 'm',
      details: { marketplaceId: '77' },
    });

    const refused = guard.assertChecked(MUG);

    await expect(refused).rejects.toBeInstanceOf(DraftsNotCheckedError);
    await expect(refused).rejects.toMatchObject({
      code: 'DRAFTS_NOT_CHECKED',
      details: { marketplaceId: '77' },
    });
  });

  it('does the work for one design at a time', async () => {
    const guard = new DraftGuard(new InMemoryDraftChecks(), () => undefined);
    let finish: (value: string) => void = () => undefined;
    const first = guard.exclusive(MUG, () => new Promise<string>((resolve) => (finish = resolve)));

    await expect(guard.exclusive(MUG, () => Promise.resolve('second'))).rejects.toBeInstanceOf(
      ConflictError,
    );
    finish('first');
    await expect(first).resolves.toBe('first');
    await expect(guard.exclusive(MUG, () => Promise.resolve('again'))).resolves.toBe('again');
  });

  it('lets the design go again once its work failed', async () => {
    const guard = new DraftGuard(new InMemoryDraftChecks(), () => undefined);

    await expect(
      guard.exclusive(MUG, () => Promise.reject(new Error('broke off'))),
    ).rejects.toThrow('broke off');
    await expect(guard.exclusive(MUG, () => Promise.resolve('again'))).resolves.toBe('again');
  });
});
