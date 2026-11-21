import { InMemoryBatches, InMemoryDraftChecks } from './batch-fakes.js';
import { describeBatchContract, describeDraftCheckContract } from './contract/index.js';
import { InMemoryCatalog } from './in-memory-catalog.js';

describeBatchContract('InMemoryBatches', () => new InMemoryBatches());
describeDraftCheckContract('InMemoryDraftChecks', () => {
  const catalog = new InMemoryCatalog();
  return {
    catalog: { concepts: catalog.concepts, designs: catalog.designs },
    checks: new InMemoryDraftChecks(),
  };
});
