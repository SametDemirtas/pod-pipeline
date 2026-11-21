import { describeMockupContract } from '../testing/contract/index.js';
import { InMemoryCatalog, InMemoryMockups } from '../testing/index.js';

describeMockupContract('In-memory', () => {
  const catalog = new InMemoryCatalog();
  return { catalog, mockups: new InMemoryMockups() };
});
