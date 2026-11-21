import { describePinContract } from '../testing/contract/index.js';
import { InMemoryCatalog, InMemoryPins } from '../testing/index.js';

describePinContract('In-memory', () => ({
  catalog: new InMemoryCatalog(),
  pins: new InMemoryPins(),
}));
