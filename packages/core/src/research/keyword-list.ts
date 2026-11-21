import type { KeywordFile } from './keyword-file.js';
import type { MarketRegion } from './market.js';

export type KeywordListId = string & { readonly __brand: 'KeywordListId' };

/** Keywords the seller exported from a keyword tool and imported, kept to reuse in listings. */
export interface KeywordList extends KeywordFile {
  readonly id: KeywordListId;
  /** The file it came from, which also names the list. */
  readonly fileName: string;
  /** The Etsy market the seller exported it for, whose language its keywords are in. */
  readonly market: MarketRegion;
  readonly importedAt: Date;
}

/** A list without its keywords, for choosing one. */
export interface KeywordListSummary extends Pick<
  KeywordList,
  'id' | 'fileName' | 'market' | 'importedAt'
> {
  readonly keywordCount: number;
}
