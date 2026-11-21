import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../errors.js';
import type { CatalogWriter } from '../../ports/catalog-repositories.js';
import { nextTurn, signal, type ContractStore } from './contract-store.js';
import { sampleConcept as concept, sampleDesign as design } from './samples.js';

const REENTRY = /inside another catalog operation/;

export function describeUnitOfWorkContract(store: ContractStore): void {
  describe('unit of work', () => {
    describeCommitAndRollback(store);
    describeWaiting(store);
    describeHandles(store);
    describeRefusals(store);
  });
}

/** Work that commits or rolls back as a whole. */
function describeCommitAndRollback(store: ContractStore): void {
  it('commits every write when the work succeeds', async () => {
    const result = await store.current.unitOfWork.run(async (tx) => {
      await tx.concepts.save(concept('01'));
      await tx.designs.save(design('01-mug'));
      return 'done';
    });

    expect(result).toBe('done');
    expect(await store.current.designs.findByKey('01-mug')).toEqual(design('01-mug'));
  });

  it('reads its own writes before committing', async () => {
    await store.current.unitOfWork.run(async (tx) => {
      await tx.concepts.save(concept('01'));
      expect(await tx.concepts.findByKey('01')).toEqual(concept('01'));
      await tx.designs.save(design('01-mug'));
      expect(await tx.designs.findByKey('01-mug')).toEqual(design('01-mug'));
    });
  });

  it('rolls back every write when the work fails', async () => {
    await expect(
      store.current.unitOfWork.run(async (tx) => {
        await tx.concepts.save(concept('01'));
        await tx.designs.save(design('01-mug'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await store.current.concepts.findByKey('01')).toBeUndefined();
    expect(await store.current.designs.findByKey('01-mug')).toBeUndefined();
  });

  it('rolls back earlier writes when a later save is refused', async () => {
    await expect(
      store.current.unitOfWork.run(async (tx) => {
        await tx.concepts.save(concept('01'));
        await tx.designs.save(design('02-mug'));
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await store.current.concepts.findByKey('01')).toBeUndefined();
  });
}

/** Other callers wait for the transaction. */
function describeWaiting(store: ContractStore): void {
  it('makes other callers wait instead of seeing uncommitted data', async () => {
    const written = signal();
    const release = signal();
    const transaction = store.current.unitOfWork.run(async (tx) => {
      await tx.concepts.save(concept('01'));
      written.fire();
      await release.fired;
      throw new Error('rolled back');
    });
    await written.fired;

    const read = store.current.concepts.findByKey('01');
    const write = store.current.concepts.save(concept('02'));
    release.fire();

    await expect(transaction).rejects.toThrow('rolled back');
    expect(await read).toBeUndefined();
    await write;
    expect(await store.current.concepts.findByKey('01')).toBeUndefined();
    expect(await store.current.concepts.findByKey('02')).toEqual(concept('02'));
  });

  it('runs overlapping transactions one after another', async () => {
    const events: string[] = [];
    const started = signal();
    const release = signal();
    const first = store.current.unitOfWork.run(async () => {
      events.push('first:start');
      started.fire();
      await release.fired;
      events.push('first:end');
    });
    const second = store.current.unitOfWork.run(() => {
      events.push('second');
      return Promise.resolve();
    });

    await started.fired;
    await nextTurn();
    expect(events).toEqual(['first:start']);
    release.fire();
    await Promise.all([first, second]);

    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });
}

/** Work started inside or outside a transaction. */
function describeHandles(store: ContractStore): void {
  it('queues work started from inside a finished transaction like any other caller', async () => {
    const laterMayRun = signal();
    let later: Promise<void> = Promise.resolve();
    await store.current.unitOfWork.run(() => {
      later = laterMayRun.fired.then(() => store.current.concepts.save(concept('03')));
      return Promise.resolve();
    });

    const written = signal();
    const release = signal();
    const failing = store.current.unitOfWork.run(async (tx) => {
      await tx.concepts.save(concept('04'));
      written.fire();
      await release.fired;
      throw new Error('rolled back');
    });
    await written.fired;
    laterMayRun.fire();
    await nextTurn();
    release.fire();

    await expect(failing).rejects.toThrow('rolled back');
    await later;
    expect(await store.current.concepts.findByKey('03')).toEqual(concept('03'));
    expect(await store.current.concepts.findByKey('04')).toBeUndefined();
  });

  it('accepts its handle from async work that began outside the transaction', async () => {
    const outside = AsyncLocalStorage.snapshot();

    await store.current.unitOfWork.run((tx) => outside(() => tx.concepts.save(concept('01'))));

    expect(await store.current.concepts.findByKey('01')).toEqual(concept('01'));
  });
}

/** Uses of a transaction that are refused. */
function describeRefusals(store: ContractStore): void {
  it('refuses to start a transaction inside another one', async () => {
    await expect(
      store.current.unitOfWork.run(async (tx) => {
        await tx.concepts.save(concept('01'));
        await store.current.unitOfWork.run(() => Promise.resolve());
      }),
    ).rejects.toThrow(REENTRY);
    expect(await store.current.concepts.findByKey('01')).toBeUndefined();
  });

  it("refuses the store's own repositories inside a transaction", async () => {
    await expect(
      store.current.unitOfWork.run(async () => {
        await store.current.concepts.findByKey('01');
      }),
    ).rejects.toThrow(REENTRY);
  });

  it('refuses a transaction handle used after the transaction settled', async () => {
    let leaked: CatalogWriter | undefined;
    await store.current.unitOfWork.run((tx) => {
      leaked = tx;
      return Promise.resolve();
    });

    await expect(leaked?.concepts.save(concept('01'))).rejects.toThrow(/already finished/);
    await expect(leaked?.designs.findByKey('01-mug')).rejects.toThrow(/already finished/);
    expect(await store.current.concepts.findByKey('01')).toBeUndefined();
  });
}
