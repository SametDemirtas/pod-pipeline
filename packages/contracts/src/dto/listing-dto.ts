import type { FitModeDto } from './print-dto.js';

/** A draft is hidden; inactive listings were paused, expired or sold out on Etsy. */
export const LISTING_STATES = ['draft', 'active', 'inactive'] as const;
export type ListingState = (typeof LISTING_STATES)[number];

export interface ShopOptionDto {
  readonly id: string;
  readonly label: string;
}

/** Settings of the connected Etsy shop that a new listing refers to. */
export interface ShopOptionsDto {
  readonly shopName: string;
  /** ISO 4217 code; prices are in its minor unit. */
  readonly currency: string;
  /** Decimal places of the currency, e.g. 2 for USD and 0 for JPY. */
  readonly currencyDigits: number;
  readonly shippingProfiles: readonly ShopOptionDto[];
  readonly readinessStates: readonly ShopOptionDto[];
  readonly returnPolicies: readonly ShopOptionDto[];
  readonly productionPartners: readonly ShopOptionDto[];
  /** Languages buyers can read the shop in; the first is the one listings are written in. */
  readonly languages: readonly string[];
  /** Where the seller finds the shop's drafts on the marketplace. */
  readonly draftsUrl: string;
}

export interface ListingProductDto {
  readonly sku: string;
  readonly variantId: string;
}

/** A design's Etsy listing as this app created it. */
export interface ListingDto {
  readonly designId: string;
  readonly listingId: string;
  /** `inactive` covers listings paused, expired or sold out on Etsy. */
  readonly state: ListingState;
  /** Where the seller edits the listing on Etsy. */
  readonly editUrl: string;
  readonly printArea: string;
  readonly fit: FitModeDto;
  readonly products: readonly ListingProductDto[];
  /** When the print provider was told what to make for each variant; `null` until then. */
  readonly linkedAt: string | null;
  /** Whether the print provider has the design's current revision; a changed design is linked again. */
  readonly linkCurrent: boolean;
  readonly createdAt: string;
  readonly publishedAt: string | null;
}

/** A photo the marketplace listing shows now. */
export interface LiveMarketplacePhotoDto {
  /** The full-size photo on the marketplace. */
  readonly url: string;
  /**
   * A small copy as a data URL, so the window shows it without reaching the marketplace
   * itself; empty when it could not be downloaded.
   */
  readonly image: string;
  readonly width: number | null;
  readonly height: number | null;
}

/** A picture the print provider keeps of a file linked to the listing. */
export interface LivePrintPreviewDto {
  /** The print provider's name for it, e.g. `default` for the print file, `preview` for a product picture. */
  readonly kind: string;
  readonly url: string;
  /** A small copy as a data URL; empty when it could not be downloaded. */
  readonly image: string;
}

/** What the marketplace and the print provider show for the listing now, read from them. */
export interface LiveListingPhotosDto {
  readonly marketplace: readonly LiveMarketplacePhotoDto[];
  /** `null` while the print provider has not imported the listing yet. */
  readonly print: readonly LivePrintPreviewDto[] | null;
}

export interface CreatedListingDto extends ListingDto {
  /** Trademarks the title or tags name, which Etsy may remove the listing for. */
  readonly trademarks: readonly string[];
  /** Phrases that read as machine-written, in each of the listing's languages. */
  readonly aiTells: readonly ListingAiTellDto[];
}

/** A listing's words as Etsy stores them. */
export interface ListingTextDto {
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
}

/** Kinds of phrases and marks that read as machine-written. */
export const AI_TELL_CATEGORIES = [
  'false-contrast',
  'cliche-opener',
  'cliche-closer',
  'rhetorical-question',
  'hype',
  'vague-praise',
  'urgency',
  'filler',
  'structure',
  'punctuation',
] as const;
export type AiTellCategoryDto = (typeof AI_TELL_CATEGORIES)[number];

/** A phrase or mark in a listing that reads as machine-written. */
export interface AiTellDto {
  readonly category: AiTellCategoryDto;
  readonly field: 'title' | 'description' | 'tags';
  /** As the text has it, so the seller can find it. */
  readonly match: string;
}

export interface ListingAiTellDto extends AiTellDto {
  /** The language of the words it is in, e.g. `de`. */
  readonly language: string;
}

/** What the humanizer did with words the language model wrote. */
export interface HumanizerDto {
  /** Phrases that read as machine-written and that the model's revision took out. */
  readonly fixed: number;
  /** Those still in the words, for the seller to rewrite by hand. */
  readonly left: readonly AiTellDto[];
}

export interface WrittenListingTextDto extends ListingTextDto {
  readonly humanizer: HumanizerDto;
}

export interface TranslationDto extends WrittenListingTextDto {
  /** A language of the shop, e.g. `de`. */
  readonly language: string;
}

/** What the seller's words name or sound like, checked as they edit them. */
export interface ListingTextCheckDto {
  /** Trademarks the title or tags name, which Etsy may remove the listing for. */
  readonly trademarks: readonly string[];
  readonly aiTells: readonly AiTellDto[];
}

export interface TranslationsDto {
  readonly translations: readonly TranslationDto[];
  /** Languages that could not be translated this time. */
  readonly failed: readonly string[];
}
