import { primaryLanguage } from '../listing/language.js';

/** What a language's titles hold that says nothing about the product. */
export interface TitleWords {
  readonly stopWords: ReadonlySet<string>;
  /** A phrase never starts with one, and ends with one only after `forWord`, as in `gift for her`. */
  readonly pronouns: ReadonlySet<string>;
  readonly forWord: string;
  /** Plural endings, tried in order, with what the singular ends in instead. */
  readonly plurals: readonly (readonly [string, string])[];
  /**
   * A single word that says enough to be a tag, as a long German compound
   * such as `katzentasse` does; `null` where single words never do.
   */
  readonly compound: RegExp | null;
}

const words = (list: string) => new Set(list.split(' '));

const ENGLISH: TitleWords = {
  stopWords: words(
    'a an and are as at be by for from in is it of on or our the this to with you your',
  ),
  pronouns: words('her him his hers them she he me my'),
  forWord: 'for',
  plurals: [
    ['ies', 'y'],
    ['es', ''],
    ['s', ''],
  ],
  compound: null,
};

const GERMAN: TitleWords = {
  stopWords: words(
    'der die das den dem des ein eine einen einem einer eines und oder mit für von vom zu zum zur im in am an auf aus bei als ist sind wie dein deine mein meine',
  ),
  pronouns: words('sie ihn ihm ihr ihre mich dich'),
  forWord: 'für',
  plurals: [
    ['en', ''],
    ['n', ''],
    ['e', ''],
    ['s', ''],
  ],
  // Ten letters or more, and no adjective such as `personalisiert` or `weihnachtlich`.
  compound: /^(?!\p{L}*(?:iert|isch|lich|ig)e?[nrs]?$)\p{L}{10,}$/u,
};

/** The rules for a BCP 47 language; English for any other. */
export function titleWordsFor(language: string): TitleWords {
  return primaryLanguage(language) === 'de' ? GERMAN : ENGLISH;
}

/**
 * Sizes and counts with their unit, e.g. `11oz`, `330ml` or `3x4`, and units
 * on their own; they describe a variant, not what buyers search.
 */
export function isMeasure(word: string): boolean {
  return /^(?:\p{N}+(?:[.,]\p{N}+)?)?(?:oz|ml|cl|cm|mm|inch|ft|pcs?)$|^\p{N}+(?:[.,]\p{N}+)?(?:l|m|in|x\p{N}+)$/u.test(
    word,
  );
}
