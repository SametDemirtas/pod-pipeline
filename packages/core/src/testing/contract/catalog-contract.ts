import { describe } from 'vitest';
import { describeConceptContract } from './concept-contract.js';
import { useContractStore, type PersistenceFactory } from './contract-store.js';
import { describeDesignContract } from './design-contract.js';
import { describeListingContract } from './listing-contract.js';
import { describeUnitOfWorkContract } from './unit-of-work-contract.js';

export type { CatalogPersistence, PersistenceFactory } from './contract-store.js';

/**
 * Behaviour every catalog implementation must share. Call it from the
 * adapter's test file with a factory that returns a fresh, empty store.
 */
export function describeCatalogContract(name: string, createPersistence: PersistenceFactory): void {
  describe(`${name} catalog contract`, () => {
    const store = useContractStore(createPersistence);
    describeConceptContract(store);
    describeDesignContract(store);
    describeListingContract(store);
    describeUnitOfWorkContract(store);
  });
}
