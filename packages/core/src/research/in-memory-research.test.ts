import {
  describeKeywordListContract,
  describeResearchContract,
} from '../testing/contract/index.js';
import { InMemoryKeywordLists, InMemoryResearch } from '../testing/index.js';

describeResearchContract('In-memory', () => new InMemoryResearch());
describeKeywordListContract('In-memory', () => new InMemoryKeywordLists());
