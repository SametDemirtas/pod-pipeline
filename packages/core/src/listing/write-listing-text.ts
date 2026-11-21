import { characterCount, familyProfileOf, type ListingTextRules } from '@pod/rules';
import { requireDesign } from '../catalog/catalog-queries.js';
import { uprightAsset, type ImageAsset } from '../catalog/model.js';
import { productTypeOf } from '../catalog/product-family.js';
import { ValidationError } from '../errors.js';
import type { CatalogQuery } from '../ports/catalog-repositories.js';
import type { ListingCopywriter, ProductFactsSource, SearchWord } from '../ports/copywriter.js';
import type { ImagePreviews, PreviewImage } from '../ports/previews.js';
import type { PrintCatalog } from '../ports/print-provider.js';
import { withListedSizes } from './dimensions.js';
import { finishWrittenText, type FinishedText } from './finish-written-text.js';
import { distinctValues } from './listing-rules.js';

export const MAX_KEYWORDS = 20;
export const MAX_NOTES_LENGTH = 1000;

export interface WriteListingTextInput {
  readonly designId: string;
  readonly language: string;
  /** The variants the listing sells; all of the product's when left out. */
  readonly variantIds?: readonly string[] | undefined;
  readonly keywords?: readonly SearchWord[] | undefined;
  readonly notes?: string | undefined;
}

export interface WriteListingTextDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly printCatalog: PrintCatalog;
  readonly previews: ImagePreviews;
  readonly facts: ProductFactsSource;
  readonly writer: Pick<ListingCopywriter, 'write' | 'revise'>;
  /** What the marketplace allows in the words. */
  readonly rules: ListingTextRules;
}

/**
 * Has the copywriter draft a listing's title, description and tags, fitted to
 * the marketplace's rules and checked for phrases that read as machine-written.
 */
export class WriteListingText {
  constructor(private readonly deps: WriteListingTextDeps) {}

  async execute(input: WriteListingTextInput): Promise<FinishedText> {
    const keywords = (input.keywords ?? [])
      .map((word) => ({ ...word, term: word.term.trim() }))
      .filter((word) => word.term);
    const notes = (input.notes ?? '').trim();
    if (keywords.length > MAX_KEYWORDS) {
      throw new ValidationError('keywords', `use at most ${MAX_KEYWORDS}`);
    }
    if (characterCount(notes) > MAX_NOTES_LENGTH) {
      throw new ValidationError('notes', `is longer than ${MAX_NOTES_LENGTH} characters`);
    }

    const { writer } = this.deps;
    const { design, revisions } = await requireDesign(this.deps.query, input.designId);
    // Product details only sharpen the text, so it is written without them when unavailable.
    const [product, image, facts] = await Promise.all([
      this.deps.printCatalog.findProduct(design.familyId).catch(() => undefined),
      this.preview(uprightAsset(design, revisions)),
      this.deps.facts.factsFor(design.familyId),
    ]);
    const chosen = input.variantIds && new Set(input.variantIds);
    const variants = (product?.variants ?? []).filter(
      (variant) => !chosen || chosen.has(variant.id),
    );
    const sizes = distinctValues(variants.map((variant) => variant.size));
    const listedFacts = withListedSizes(facts, sizes);
    const productType = productTypeOf(design.familyId);
    const written = await writer.write({
      conceptName: design.concept.name,
      image,
      productType,
      productName: product?.name ?? design.familyId,
      facts: listedFacts,
      colors: distinctValues(variants.map((variant) => variant.color)),
      sizes,
      keywords,
      notes,
      language: input.language,
    });
    const context = {
      rules: this.deps.rules,
      language: input.language,
      designWords: [design.concept.name],
      otherBrands: familyProfileOf(design.familyId).otherBrands,
      // Only the facts, and the product's own name such as a sherpa blanket's, may name
      // what it is made of; never a guess from the kind of product it is.
      facts: [
        listedFacts.material,
        listedFacts.care,
        listedFacts.fit,
        listedFacts.size,
        product?.name ?? '',
        productType,
      ].join('\n'),
    };
    return finishWrittenText(written, context, (problems) =>
      writer.revise(written, problems, input.language),
    );
  }

  /**
   * The artwork as buyers see it. A print file turned to fit the product is
   * never shown, as the writer would describe the turn instead of the print.
   * Without a preview the writer is told to keep to general words.
   */
  private preview(asset: ImageAsset | undefined): Promise<PreviewImage | undefined> {
    if (!asset) return Promise.resolve(undefined);
    return this.deps.previews.preview(asset).catch(() => undefined);
  }
}
