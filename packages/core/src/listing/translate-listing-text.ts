import { familyProfileOf, MAX_TRANSLATIONS, type ListingTextRules } from '@pod/rules';
import type { ProductFamilyId } from '../catalog/product-family.js';
import { ValidationError } from '../errors.js';
import type { ListingCopywriter } from '../ports/copywriter.js';
import { finishWrittenText, listingWords, type HumanizerReport } from './finish-written-text.js';
import { normalizeListingText, type ListingText, type Translation } from './listing-text.js';

export interface HumanizedTranslation extends Translation {
  readonly humanizer: HumanizerReport;
}

export interface TranslatedListingText {
  readonly translations: readonly HumanizedTranslation[];
  /** Languages that could not be translated, for the seller to try again. */
  readonly failed: readonly string[];
}

/** Has the copywriter rewrite a listing for buyers of other languages, fitted to the marketplace's rules. */
export class TranslateListingText {
  constructor(
    private readonly writer: Pick<ListingCopywriter, 'translate' | 'revise'>,
    private readonly rules: ListingTextRules,
  ) {}

  /**
   * Languages that fail are reported rather than thrown, so the paid-for ones
   * are kept; when all fail, the first failure is thrown. With the product's
   * family, a translation naming a brand the product is not made for is revised.
   */
  async execute(
    text: ListingText,
    languages: readonly string[],
    familyId?: ProductFamilyId,
  ): Promise<TranslatedListingText> {
    const wanted = [...new Set(languages)];
    if (wanted.length > MAX_TRANSLATIONS) {
      throw new ValidationError('languages', `choose at most ${MAX_TRANSLATIONS}`);
    }
    const source = normalizeListingText(text, this.rules);
    const otherBrands = familyId === undefined ? [] : familyProfileOf(familyId).otherBrands;
    const results = await Promise.allSettled(
      wanted.map(async (language): Promise<HumanizedTranslation> => {
        const translated = await this.writer.translate(source, language);
        // The design's name is known only in the source's words, so the check has none.
        const finished = await finishWrittenText(
          translated,
          // A translation may name only the materials the listing it came from names.
          {
            rules: this.rules,
            language,
            designWords: [],
            otherBrands,
            facts: listingWords(source),
          },
          (problems) => this.writer.revise(translated, problems, language),
        );
        return { language, ...finished };
      }),
    );
    const translations = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (translations.length === 0 && failure) throw failure.reason;
    return {
      translations,
      failed: wanted.filter((_, index) => results[index]?.status === 'rejected'),
    };
  }
}
