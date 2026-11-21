import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type {
  TranslateListingTextRequest,
  TranslationDto,
  WriteListingTextRequest,
  WrittenListingTextDto,
} from '@pod/contracts/client';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';
import { parseTags } from '../../shared/tags.js';

const useListingTextApi = scopedApi<
  'checkListingText' | 'getBatchListingText' | 'translateListingText' | 'writeListingText'
>();

/** Title, description and tags as typed, the tags comma separated. */
export interface ListingWords {
  readonly title: string;
  readonly description: string;
  readonly tags: string;
}

export function useWriteListingText(onWritten: (text: WrittenListingTextDto) => void) {
  const api = useListingTextApi();
  return useMutation({
    mutationFn: (request: WriteListingTextRequest) => api.writeListingText(request),
    onSuccess: onWritten,
  });
}

/** The text a translation was asked for, by its key, so later edits mark it outdated. */
export interface TranslationSource {
  readonly key: string;
  readonly request: TranslateListingTextRequest;
}

export function useTranslateListingText(
  onTranslated: (translations: readonly TranslationDto[], key: string) => void,
) {
  const api = useListingTextApi();
  return useMutation({
    mutationFn: async (source: TranslationSource) => ({
      translations: (await api.translateListingText(source.request)).translations,
      key: source.key,
    }),
    onSuccess: ({ translations, key }) => {
      onTranslated(translations, key);
    },
  });
}

/**
 * The text a batch job wrote for the design, read afresh each time the form
 * opens, so text written since is not missed.
 */
export function useBatchListingText(designId: string) {
  const api = useListingTextApi();
  return useQuery({
    queryKey: queryKeys.batchListingText(designId),
    queryFn: () => api.getBatchListingText({ id: designId }),
    staleTime: 0,
    gcTime: 0,
  });
}

/** Trademarks and machine-sounding phrases in the words; asked only once there are some. */
export function useListingTextCheck(
  language: string,
  designName: string | null,
  words: ListingWords,
) {
  const api = useListingTextApi();
  return useQuery({
    queryKey: queryKeys.listingTextCheck(language, designName, words),
    queryFn: () =>
      api.checkListingText({
        language,
        title: words.title,
        description: words.description,
        tags: parseTags(words.tags),
        ...(designName === null ? {} : { designName }),
      }),
    enabled: Boolean(words.title.trim() || words.description.trim() || words.tags.trim()),
    placeholderData: keepPreviousData,
  });
}
