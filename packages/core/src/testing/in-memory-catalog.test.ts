import { describeCatalogContract } from './contract/index.js';
import { InMemoryCatalog } from './in-memory-catalog.js';

describeCatalogContract('InMemoryCatalog', () => {
  const catalog = new InMemoryCatalog();
  return {
    concepts: catalog.concepts,
    designs: catalog.designs,
    query: catalog,
    unitOfWork: catalog,
  };
});
