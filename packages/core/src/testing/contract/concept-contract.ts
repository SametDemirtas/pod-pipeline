import { describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '../../errors.js';
import type { ContractStore } from './contract-store.js';
import { sampleConcept as concept } from './samples.js';

export function describeConceptContract(store: ContractStore): void {
  describe('concepts', () => {
    it('finds a saved concept by key', async () => {
      await store.current.concepts.save(concept('01', 'Lantern Harbor'));

      expect(await store.current.concepts.findByKey('01')).toEqual(concept('01', 'Lantern Harbor'));
      expect(await store.current.concepts.findByKey('02')).toBeUndefined();
    });

    it('renames a concept saved again with the same id and key', async () => {
      await store.current.concepts.save(concept('01', 'Old name'));
      await store.current.concepts.save({
        ...concept('01', 'New name'),
        createdAt: new Date('2030-01-01T00:00:00.000Z'),
      });

      expect(await store.current.concepts.findByKey('01')).toEqual(concept('01', 'New name'));
    });

    it('refuses a key that belongs to another concept', async () => {
      await store.current.concepts.save(concept('01'));

      await expect(
        store.current.concepts.save({ ...concept('01'), id: concept('99').id }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('refuses to move a concept to another key', async () => {
      await store.current.concepts.save(concept('01'));

      await expect(
        store.current.concepts.save({ ...concept('01'), key: '02' }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await store.current.concepts.findByKey('02')).toBeUndefined();
    });

    it.each(['1', '1000', 'ab', '01 ', ' 01', '+01'])('refuses the key %j', async (key) => {
      await expect(store.current.concepts.save({ ...concept('01'), key })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('does not share stored objects with callers', async () => {
      const saved = concept('01', 'Original');
      await store.current.concepts.save(saved);
      saved.createdAt.setFullYear(1999);

      const found = await store.current.concepts.findByKey('01');
      found?.createdAt.setFullYear(1998);

      expect(await store.current.concepts.findByKey('01')).toEqual(concept('01', 'Original'));
    });
  });
}
