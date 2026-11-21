import type { ProductFacts } from '../catalog/product-facts.js';
import type { ProductFamilyId } from '../catalog/product-family.js';
import type { ListingText } from '../listing/listing-text.js';
import type { PreviewImage } from './previews.js';

export interface ProductFactsSource {
  factsFor(familyId: ProductFamilyId): Promise<ProductFacts>;
}

/** A word the seller wants used, with what is known about buyers searching it. */
export interface SearchWord {
  readonly term: string;
  /** BCP 47 tag of the language of the market it was found in; unknown for typed words. */
  readonly language?: string | undefined;
  /** Etsy suggests it as a search. */
  readonly suggested?: boolean | undefined;
  /** Shops on the first page of Etsy's results that use it. */
  readonly shops?: number | undefined;
  /** Searches the seller's keyword tool export gives for it. */
  readonly searches?: number | undefined;
}

/** What a listing is about, for whoever writes its words. */
export interface CopyBrief {
  /** The artwork's name, e.g. `Lantern Harbor`; `null` when the seller gave none. */
  readonly conceptName: string | null;
  /** The print itself; `undefined` when no preview could be made. */
  readonly image: PreviewImage | undefined;
  /** The kind of product in plain words, e.g. `t-shirt`. */
  readonly productType: string;
  /** The print provider's product, e.g. `Bella + Canvas 3001 Unisex T-Shirt`. */
  readonly productName: string;
  readonly facts: ProductFacts;
  /** Of the variants the listing sells. */
  readonly colors: readonly string[];
  readonly sizes: readonly string[];
  /** Words the seller wants used, most important first, e.g. found in market research. */
  readonly keywords: readonly SearchWord[];
  /** Anything else the seller wants said or avoided. */
  readonly notes: string;
  /** BCP 47 tag of the language to write in, e.g. `en-US`. */
  readonly language: string;
}

export interface ListingCopywriter {
  write(brief: CopyBrief): Promise<ListingText>;
  /** The same listing for buyers who read another language. */
  translate(text: ListingText, language: string): Promise<ListingText>;
  /** The text in `language` again, with only the named problems fixed. */
  revise(text: ListingText, problems: readonly string[], language: string): Promise<ListingText>;
}
