import { describe, expect, it } from 'vitest';
import type { Design, DesignId } from '../../catalog/model.js';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import type { ContractStore } from './contract-store.js';
import { sampleConcept as concept, sampleDesign as design } from './samples.js';

export function describeDesignContract(store: ContractStore): void {
  describe('designs', () => {
    describeRevisions(store);
    describeRevisionNotes(store);
    describeKeys(store);
    describeInvalidDesigns(store);
    describeReads(store);
  });
}

/** Designs and their revisions. */
function describeRevisions(store: ContractStore): void {
  it('finds a saved design by key', async () => {
    await store.seed(['01-mug']);

    expect(await store.current.designs.findByKey('01-mug')).toEqual(design('01-mug'));
    expect(await store.current.designs.findByKey('01-blanket')).toBeUndefined();
  });

  it('keeps every revision, exposes the latest and keeps the first creation date', async () => {
    await store.seed(['01-mug']);
    const second = design('01-mug', {
      revision: 2,
      asset: { ...design('01-mug').asset, sha256: 'sha-new', storageKey: 'assets/sha-new' },
      createdAt: new Date('2030-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T10:00:00.000Z'),
    });

    await store.current.designs.save(second);

    const current = await store.current.designs.findByKey('01-mug');
    expect(current).toEqual({ ...second, createdAt: design('01-mug').createdAt });
    const details = await store.current.query.getDesign(second.id);
    expect(details?.design.revision).toBe(2);
    expect(details?.revisions.map((entry) => [entry.revision, entry.asset.sha256])).toEqual([
      [2, 'sha-new'],
      [1, 'sha-01-mug'],
    ]);
    expect(details?.revisions.every((entry) => entry.id === second.id)).toBe(true);
  });
}

/** What a revision remembers about how it was made from the artwork. */
function describeRevisionNotes(store: ContractStore): void {
  it('remembers which revision is a larger copy and of which artwork', async () => {
    await store.seed(['01-mug']);
    const larger = design('01-mug', {
      revision: 2,
      asset: { ...design('01-mug').asset, sha256: 'sha-big', storageKey: 'assets/sha-big' },
      upscale: { model: 'photo', originalSha256: 'sha-01-mug' },
    });

    await store.current.designs.save(larger);

    expect(await store.current.designs.findByKey('01-mug')).toEqual(larger);
    const details = await store.current.query.getDesign(larger.id);
    expect(details?.design.upscale).toEqual(larger.upscale);
    expect(details?.revisions.map((entry) => entry.upscale)).toEqual([larger.upscale, undefined]);
  });

  it('remembers which revision is turned to fit the print area, how far and why', async () => {
    await store.seed(['01-mug']);
    const turned = design('01-mug', {
      revision: 2,
      asset: { ...design('01-mug').asset, sha256: 'sha-turned', storageKey: 'assets/sha-turned' },
      rotation: { degrees: 270, originalSha256: 'sha-01-mug', reason: 'Reads upright.' },
    });

    await store.current.designs.save(turned);

    expect(await store.current.designs.findByKey('01-mug')).toEqual(turned);
    const details = await store.current.query.getDesign(turned.id);
    expect(details?.design.rotation).toEqual(turned.rotation);
    expect(details?.revisions.map((entry) => entry.rotation)).toEqual([turned.rotation, undefined]);
  });

  it('remembers artwork left unturned for the design, across later revisions', async () => {
    await store.seed(['01-blanket']);
    const kept = { sha256: 'sha-01-blanket', reason: 'The words read across.' };

    await store.current.designs.keepOrientation(design('01-blanket').id, kept);

    expect(await store.current.designs.findByKey('01-blanket')).toEqual({
      ...design('01-blanket'),
      keptOrientation: kept,
    });
    const larger = design('01-blanket', {
      revision: 2,
      asset: { ...design('01-blanket').asset, sha256: 'sha-big', storageKey: 'assets/sha-big' },
      upscale: { model: 'photo', originalSha256: 'sha-01-blanket' },
    });
    await store.current.designs.save(larger);
    const details = await store.current.query.getDesign(larger.id);
    expect(details?.design.keptOrientation).toEqual(kept);
    expect(details?.revisions.map((entry) => entry.keptOrientation)).toEqual([
      undefined,
      undefined,
    ]);
    await expect(
      store.current.designs.keepOrientation('design-none' as DesignId, kept),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
}

/** Revision numbers and design keys that are refused. */
function describeKeys(store: ContractStore): void {
  it('only accepts the next revision number', async () => {
    await store.current.concepts.save(concept('01'));
    const save = (revision: number) => store.current.designs.save(design('01-mug', { revision }));

    await expect(save(2)).rejects.toBeInstanceOf(ConflictError);
    await save(1);
    await expect(save(1)).rejects.toBeInstanceOf(ConflictError);
    await expect(save(3)).rejects.toBeInstanceOf(ConflictError);
    expect((await store.current.designs.findByKey('01-mug'))?.revision).toBe(1);
    const details = await store.current.query.getDesign(design('01-mug').id);
    expect(details?.revisions).toHaveLength(1);
  });

  it('refuses a design key that belongs to another design', async () => {
    await store.seed(['01-mug']);

    await expect(
      store.current.designs.save(design('01-mug', { id: 'other' as DesignId, revision: 2 })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses to move a design to another key', async () => {
    await store.seed(['01-mug', '01-blanket']);

    await expect(
      store.current.designs.save({
        ...design('01-mug', { revision: 2 }),
        designKey: '01-phone-case',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await store.current.designs.findByKey('01-phone-case')).toBeUndefined();
  });

  it('refuses a design whose concept does not exist', async () => {
    await expect(store.current.designs.save(design('01-mug'))).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await store.current.designs.findByKey('01-mug')).toBeUndefined();
  });
}

/** Designs with invalid fields. */
function describeInvalidDesigns(store: ContractStore): void {
  it.each([
    '1-mug',
    '1000-mug',
    '01B',
    '01',
    '01-',
    '01-Mug',
    '01--mug',
    '01-tote bag',
    ' 07-mug',
    '+07-mug',
    '01-mug😀',
  ])('refuses the design key %j', async (designKey) => {
    await store.current.concepts.save(concept('01'));

    await expect(
      store.current.designs.save({ ...design('01-mug'), designKey }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([
    ['a zero width', { width: 0 }],
    ['a fractional height', { height: 10.5 }],
    ['a negative byte size', { byteSize: -1 }],
    ['an unsupported type', { mimeType: 'image/gif' }],
  ])('refuses an asset with %s', async (_case, change) => {
    await store.current.concepts.save(concept('01'));
    const asset = { ...design('01-mug').asset, ...change } as Design['asset'];

    await expect(store.current.designs.save(design('01-mug', { asset }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await store.current.designs.findByKey('01-mug')).toBeUndefined();
  });

  it('refuses a turn that is not a quarter', async () => {
    await store.current.concepts.save(concept('01'));
    const rotation = {
      degrees: 45,
      originalSha256: 'sha',
      reason: '',
    } as unknown as Design['rotation'];

    await expect(store.current.designs.save(design('01-mug', { rotation }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses a design with an invalid date', async () => {
    await store.current.concepts.save(concept('01'));

    await expect(
      store.current.designs.save(design('01-mug', { updatedAt: new Date('not a date') })),
    ).rejects.toBeInstanceOf(ValidationError);
  });
}

/** What reading a design hands back. */
function describeReads(store: ContractStore): void {
  it('does not share stored objects with callers', async () => {
    await store.current.concepts.save(concept('01'));
    const saved = design('01-mug');
    await store.current.designs.save(saved);
    (saved.asset as { width: number }).width = 1;
    saved.createdAt.setFullYear(1999);

    const found = await store.current.designs.findByKey('01-mug');
    if (!found) throw new Error('The saved design was not found');
    (found.asset as { width: number }).width = 2;
    found.updatedAt.setFullYear(1998);

    expect(await store.current.designs.findByKey('01-mug')).toEqual(design('01-mug'));
  });

  it('returns a design together with its concept and history', async () => {
    await store.seed(['01-mug'], { '01': 'Lantern Harbor' });

    const details = await store.current.query.getDesign(design('01-mug').id);

    expect(details).toEqual({
      design: { ...design('01-mug'), concept: concept('01', 'Lantern Harbor') },
      revisions: [design('01-mug')],
    });
    expect(await store.current.query.getDesign('missing' as DesignId)).toBeUndefined();
  });
}
