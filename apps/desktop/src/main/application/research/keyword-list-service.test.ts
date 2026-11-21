import { describe, expect, it, vi } from 'vitest';
import { ImportKeywordList, MAX_KEYWORD_FILE_BYTES } from '@pod/core';
import { FixedClock, InMemoryKeywordLists, SequentialIds } from '@pod/core/testing';
import { KeywordListService } from './keyword-list-service.js';

function setUp(picked: string | null, bytes: Uint8Array | null = null) {
  const lists = new InMemoryKeywordLists();
  const readFile = vi.fn(() => Promise.resolve(bytes));
  const service = new KeywordListService({
    importList: new ImportKeywordList({
      lists,
      clock: new FixedClock(new Date('2026-11-04T10:00:00.000Z')),
      ids: new SequentialIds('list'),
    }),
    lists,
    pickFile: () => Promise.resolve(picked),
    readFile,
  });
  return { service, readFile };
}

describe('KeywordListService', () => {
  it('imports the picked file under its name, then lists, reads and removes it', async () => {
    const { service, readFile } = setUp(
      '/Users/me/erank.csv',
      new TextEncoder().encode('Keyword\ntulip mug\nspooky cup\n'),
    );

    const list = await service.importKeywordList({ market: 'DE' });

    expect(readFile).toHaveBeenCalledWith('/Users/me/erank.csv', MAX_KEYWORD_FILE_BYTES);
    expect(list).toMatchObject({ fileName: 'erank.csv', market: 'DE' });
    expect(list?.keywords).toHaveLength(2);
    expect(await service.listKeywordLists()).toEqual([
      expect.objectContaining({ id: list?.id, fileName: 'erank.csv', keywordCount: 2 }),
    ]);
    expect(await service.getKeywordList({ id: list?.id ?? '' })).toEqual(list);
    expect(await service.removeKeywordList({ id: list?.id ?? '' })).toEqual([]);
    await expect(service.getKeywordList({ id: list?.id ?? '' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('does nothing when the seller cancels the picker', async () => {
    const { service, readFile } = setUp(null);

    expect(await service.importKeywordList({})).toBeNull();
    expect(await service.listKeywordLists()).toEqual([]);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('refuses a file too large to be a keyword list', async () => {
    const { service } = setUp('/Users/me/huge.csv', null);

    await expect(service.importKeywordList({})).rejects.toMatchObject({
      code: 'KEYWORD_FILE_UNREADABLE',
    });
  });
});
