import { MAX_TRANSLATIONS, type ListingRules } from '@pod/rules';
import { primaryLanguage } from './language.js';
import type { PrintVariant } from '../print/print-product.js';
import { ValidationError } from '../errors.js';
import { normalizeListingText, type ListingText, type Translation } from './listing-text.js';

export interface ListingInput {
  /** The language of `text`, which no translation may repeat. */
  readonly language: string;
  readonly text: ListingText;
  readonly translations?: readonly Translation[] | undefined;
  readonly price: number;
  readonly sizePrices?: Readonly<Record<string, number>> | undefined;
  readonly variantIds: readonly string[];
  readonly mockupIds: readonly string[];
}

/**
 * Checks a listing against the marketplace's rules before anything is asked of
 * it, and returns its words and translations in the form it stores them.
 */
export function checkListingInput(
  input: ListingInput,
  rules: ListingRules,
): {
  readonly text: ListingText;
  readonly translations: readonly Translation[];
} {
  const text = normalizeListingText(input.text, rules);
  const translations = (input.translations ?? []).map(({ language, text: words }) => ({
    language,
    text: normalizeListingText(words, rules),
  }));
  if (translations.length > MAX_TRANSLATIONS) {
    throw new ValidationError('translations', `at most ${MAX_TRANSLATIONS} languages`);
  }
  if (
    new Set(translations.map((translation) => translation.language)).size !== translations.length
  ) {
    throw new ValidationError('translations', 'lists a language twice');
  }
  const main = primaryLanguage(input.language);
  if (translations.some(({ language }) => primaryLanguage(language) === main)) {
    throw new ValidationError(
      'translations',
      `repeat the listing's own language ${input.language}`,
    );
  }
  checkPrice('price', input.price);
  for (const [size, price] of Object.entries(input.sizePrices ?? {})) {
    checkPrice(`sizePrices.${size}`, price);
  }
  checkCount('variantIds', input.variantIds, rules.variants);
  checkCount('mockupIds', input.mockupIds, rules.photos);
  return { text, translations };
}

/**
 * The marketplace's range is set in US dollars and converted at the day's rate
 * for other currencies, so only the marketplace can tell whether a price is in it.
 */
function checkPrice(field: string, price: number): void {
  if (!Number.isInteger(price) || price < 1) {
    throw new ValidationError(field, 'must be a whole number above zero');
  }
}

function checkCount(field: string, ids: readonly string[], max: number): void {
  if (ids.length === 0) throw new ValidationError(field, 'choose at least one');
  if (ids.length > max) throw new ValidationError(field, `choose at most ${max}`);
  if (new Set(ids).size !== ids.length) throw new ValidationError(field, 'lists an id twice');
}

/** The values given, each once, leaving out those missing. */
export function distinctValues(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

/** Refuses variants one of whose variations, such as phone model, has more options than the marketplace takes. */
export function checkVariationOptions(
  variants: readonly PrintVariant[],
  rules: Pick<ListingRules, 'variationOptions'>,
): void {
  const options = Math.max(
    distinctValues(variants.map((variant) => variant.color)).length,
    distinctValues(variants.map((variant) => variant.size)).length,
  );
  if (options > rules.variationOptions) {
    throw new ValidationError(
      'variantIds',
      `The marketplace takes at most ${rules.variationOptions} options for one variation, such as phone models`,
    );
  }
}
