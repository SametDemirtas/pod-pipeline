import { describeShopListingContract } from '../testing/contract/index.js';
import { InMemoryCatalog, InMemoryListings } from '../testing/index.js';

describeShopListingContract('In-memory', () => ({
  catalog: new InMemoryCatalog(),
  listings: new InMemoryListings(),
}));
