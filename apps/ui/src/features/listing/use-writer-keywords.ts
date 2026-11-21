import { useState } from 'react';
import { LISTING_WRITER_LIMITS, type SearchWordRequest } from '@pod/contracts/client';
import { formatTags, mergeTerms, parseTags } from '../../shared/tags.js';

/** The search words for the listing writer, typed or picked from research. */
export function useWriterKeywords() {
  const [text, setText] = useState('');
  // What research found about picked words, so the writer learns it; typed words have none.
  const [found, setFound] = useState<ReadonlyMap<string, SearchWordRequest>>(new Map());
  const count = parseTags(text).length;

  return {
    text,
    setText,
    count,
    tooMany: count > LISTING_WRITER_LIMITS.keywords,
    /** Adds picked words after the typed ones, up to the writer's limit. */
    pick: (words: readonly SearchWordRequest[]) => {
      setFound(
        (current) =>
          new Map([...current, ...words.map((word) => [word.term.toLowerCase(), word] as const)]),
      );
      setText((current) =>
        formatTags(
          mergeTerms(
            parseTags(current),
            words.map((word) => word.term),
            LISTING_WRITER_LIMITS.keywords,
          ),
        ),
      );
    },
    /** The words to send, with what research found about each. */
    requested: (): SearchWordRequest[] =>
      parseTags(text).map((term) => ({ ...found.get(term.toLowerCase()), term })),
  };
}
