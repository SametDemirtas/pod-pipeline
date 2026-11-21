import type { KeywordListRepository } from '../ports/keyword-lists.js';
import type { Clock, IdGenerator } from '../ports/system.js';
import { readKeywordFile } from './keyword-file.js';
import type { KeywordList, KeywordListId } from './keyword-list.js';
import type { MarketRegion } from './market.js';

export interface ImportKeywordListDeps {
  readonly lists: Pick<KeywordListRepository, 'save'>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** Keeps the keywords of a file exported from a keyword tool for a market, under the file's name. */
export class ImportKeywordList {
  constructor(private readonly deps: ImportKeywordListDeps) {}

  async execute(file: {
    readonly name: string;
    readonly text: string;
    readonly market: MarketRegion;
  }): Promise<KeywordList> {
    const list: KeywordList = {
      id: this.deps.ids.next() as KeywordListId,
      fileName: file.name,
      market: file.market,
      importedAt: this.deps.clock.now(),
      ...readKeywordFile(file.text),
    };
    await this.deps.lists.save(list);
    return list;
  }
}
