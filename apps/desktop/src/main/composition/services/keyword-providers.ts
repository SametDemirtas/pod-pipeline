import { SqliteKeywordLists } from '@pod/adapter-sqlite';
import { ImportKeywordList } from '@pod/core';
import { KeywordListService } from '../../application/research/keyword-list-service.js';
import { readSmallFile } from '../../files/read-small-file.js';
import type { SharedParts } from '../shared-parts.js';

/** Keyword lists imported from files the seller exported from a keyword tool. */
export function createKeywordListService(
  parts: Pick<SharedParts, 'database' | 'clock' | 'ids' | 'options'>,
): KeywordListService {
  const lists = new SqliteKeywordLists(parts.database);
  return new KeywordListService({
    importList: new ImportKeywordList({ lists, clock: parts.clock, ids: parts.ids }),
    lists,
    pickFile: parts.options.pickKeywordFile,
    readFile: readSmallFile,
  });
}
