import { basename } from 'node:path';
import type {
  ImportKeywordListRequest,
  KeywordListDto,
  KeywordListIdRequest,
  KeywordListSummaryDto,
} from '@pod/contracts';
import {
  DEFAULT_MARKET,
  KeywordFileUnreadableError,
  MAX_KEYWORD_FILE_BYTES,
  NotFoundError,
  type ImportKeywordList,
  type KeywordListId,
  type KeywordListRepository,
} from '@pod/core';
import { toKeywordListDto, toKeywordListSummaryDto } from '../dto/research-dtos.js';
import { decodeText } from './decode-text.js';

export interface KeywordListServiceDeps {
  readonly importList: Pick<ImportKeywordList, 'execute'>;
  readonly lists: Pick<KeywordListRepository, 'get' | 'list' | 'remove'>;
  /** Shows the system file picker for a keyword file; `null` when the seller cancels. */
  readonly pickFile: () => Promise<string | null>;
  /** The file's bytes; `null`, read no further, when it is larger than `maxBytes`. */
  readonly readFile: (path: string, maxBytes: number) => Promise<Uint8Array | null>;
}

/** Keyword lists the seller exported from tools such as eRank; only the window offers them. */
export class KeywordListService {
  constructor(private readonly deps: KeywordListServiceDeps) {}

  async importKeywordList(request: ImportKeywordListRequest): Promise<KeywordListDto | null> {
    const path = await this.deps.pickFile();
    if (path === null) return null;
    const list = await this.deps.importList.execute({
      name: basename(path),
      text: await this.readText(path),
      market: request.market ?? DEFAULT_MARKET,
    });
    return toKeywordListDto(list);
  }

  async listKeywordLists(): Promise<readonly KeywordListSummaryDto[]> {
    return (await this.deps.lists.list()).map(toKeywordListSummaryDto);
  }

  async getKeywordList(request: KeywordListIdRequest): Promise<KeywordListDto> {
    const list = await this.deps.lists.get(request.id as KeywordListId);
    if (!list) throw new NotFoundError('Keyword list', request.id);
    return toKeywordListDto(list);
  }

  async removeKeywordList(
    request: KeywordListIdRequest,
  ): Promise<readonly KeywordListSummaryDto[]> {
    await this.deps.lists.remove(request.id as KeywordListId);
    return this.listKeywordLists();
  }

  /** The file as text, refused before reading when it is too large to be a keyword list. */
  private async readText(path: string): Promise<string> {
    const bytes = await this.deps.readFile(path, MAX_KEYWORD_FILE_BYTES);
    if (bytes === null) throw new KeywordFileUnreadableError('tooLarge');
    return decodeText(bytes);
  }
}
