import type { AiUse, ListingTextRules } from '@pod/rules';
import { NotFoundError, ValidationError } from '../errors.js';
import type { CreatedProduct } from '../ports/marketplace.js';
import type { PrintProduct, PrintVariant } from '../print/print-product.js';
import { withAiNote } from './ai-note.js';
import { findAiTells, type AiTell } from './ai-tells/find-ai-tells.js';
import type { ListingProductLink } from './listing.js';
import { skuOf } from './listing-products.js';
import type { ListingText, Translation } from './listing-text.js';
import { findListingTrademarks } from './trademarks.js';

/** A listing's words in its main language and its translations. */
export interface ListingWords {
  readonly text: ListingText;
  readonly translations: readonly Translation[];
}

export interface LanguageAiTell extends AiTell {
  readonly language: string;
}

/** What the seller should look at in a draft: trademarks and machine-written phrases. */
export interface DraftReport {
  readonly trademarks: readonly string[];
  readonly aiTells: readonly LanguageAiTell[];
}

export function withAiNotes(
  words: ListingWords,
  language: string,
  use: AiUse,
  rules: Pick<ListingTextRules, 'descriptionLength'>,
): ListingWords {
  return {
    text: withAiNote(words.text, language, use, rules),
    translations: words.translations.map((translation) => ({
      language: translation.language,
      text: withAiNote(translation.text, translation.language, use, rules),
    })),
  };
}

/** The variants chosen, each printable on `printArea`. */
export function chosenVariants(
  product: PrintProduct,
  ids: readonly string[],
  printArea: string,
): PrintVariant[] {
  return ids.map((id): PrintVariant => {
    const variant = product.variants.find((candidate) => candidate.id === id);
    if (!variant) throw new NotFoundError('Variant', id);
    if (!variant.areas.some((area) => area.placement === printArea)) {
      throw new ValidationError('variantIds', `${variant.name} cannot be printed on ${printArea}`);
    }
    return variant;
  });
}

/** A price for a size none of the variants has would quietly not apply. */
export function checkSizePrices(
  variants: readonly PrintVariant[],
  sizePrices: Readonly<Record<string, number>> | undefined,
): void {
  const sizes = new Set(variants.map((variant) => variant.size));
  for (const size of Object.keys(sizePrices ?? {})) {
    if (!sizes.has(size)) {
      throw new ValidationError(`sizePrices.${size}`, 'no chosen variant has this size');
    }
  }
}

export function productLinks(
  variants: readonly PrintVariant[],
  created: readonly CreatedProduct[],
): ListingProductLink[] {
  return variants.map((variant) => {
    const sku = skuOf(variant);
    const match = created.find((product) => product.sku === sku);
    if (!match) throw new ValidationError('products', `the marketplace did not create ${sku}`);
    return { sku, productId: match.productId, variantId: variant.id };
  });
}

/** The trademarks and tells in every language of the draft, the design's name left out. */
export function draftReport(
  words: ListingWords,
  language: string,
  designName: string | null,
): DraftReport {
  const languages = [{ language, text: words.text }, ...words.translations];
  return {
    trademarks: [...new Set(languages.flatMap((each) => findListingTrademarks(each.text)))],
    aiTells: languages.flatMap((each) =>
      findAiTells(each.text, each.language, [designName]).map((tell) => ({
        ...tell,
        language: each.language,
      })),
    ),
  };
}
