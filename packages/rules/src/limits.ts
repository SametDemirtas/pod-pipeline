/** Pinterest's limits, and a headline short enough to read on a phone. */
export const PIN_TEXT_LIMITS = {
  title: 100,
  description: 800,
  altText: 500,
  headline: 60,
} as const;
/** Searches in the Research page start at least this far apart, like a person searching. */
export const RESEARCH_GAP_MS = 15_000;
/** Searches started in any hour at most. */
export const RESEARCH_PER_HOUR = 30;

/** A pin time this far back is taken as now; an older one is refused. */
export const PIN_TIME_GRACE_MS = 5 * 60_000;

/** Etsy's rules for a listing, shown while typing and checked again before Etsy is asked. */
export const LISTING_LIMITS = {
  title: 140,
  tags: 13,
  tagLength: 20,
  /** Words in capitals a title may have. */
  capitalWords: 3,
  photos: 10,
  variants: 100,
  /** Options of one variation, such as phone model. */
  variationOptions: 70,
  description: 10_000,
  /**
   * Characters a description leaves free for the note that the design is made with AI tools
   * or that some photos are AI scenes.
   */
  aiNote: 196,
  /**
   * Etsy's price range in US dollars. Shops in other currencies get the same
   * range at the day's exchange rate, so only Etsy can check it there.
   */
  minPriceUsd: 0.2,
  maxPriceUsd: 50_000,
} as const;

/** Characters a field may hold, as the body of a regular-expression class and in words. */
export interface AllowedCharacters {
  /** e.g. `\p{L}\p{N}\s`, read with the `u` flag. */
  readonly pattern: string;
  /** What the pattern allows, said to the seller, e.g. `letters, numbers and spaces`. */
  readonly words: string;
}

/** What a marketplace allows in a listing's title, description and tags. */
export interface ListingTextRules {
  readonly titleLength: number;
  readonly descriptionLength: number;
  readonly tags: number;
  readonly tagLength: number;
  /** Words in capitals a title may have. */
  readonly capitalWords: number;
  /** Characters a title may use at most once. */
  readonly onceInTitle: readonly string[];
  readonly titleCharacters: AllowedCharacters;
  readonly tagCharacters: AllowedCharacters;
}

/** What a marketplace allows in a listing: its words, photos and variants. */
export interface ListingRules extends ListingTextRules {
  readonly photos: number;
  readonly variants: number;
  /** Options of one variation, such as phone model. */
  readonly variationOptions: number;
}

/** Etsy's rules for a listing; it refuses e.g. `$` or `^` in a title. */
export const LISTING_RULES: ListingRules = {
  titleLength: LISTING_LIMITS.title,
  descriptionLength: LISTING_LIMITS.description,
  tags: LISTING_LIMITS.tags,
  tagLength: LISTING_LIMITS.tagLength,
  capitalWords: LISTING_LIMITS.capitalWords,
  onceInTitle: ['%', ':', '&', '+'],
  titleCharacters: {
    pattern: String.raw`\p{L}\p{Nd}\p{P}\p{Sm}\p{Zs}™©®`,
    words: 'letters, numbers, punctuation, maths signs, spaces and ™©®',
  },
  tagCharacters: {
    pattern: String.raw`\p{L}\p{N}\s\-'™©®`,
    words: "letters, numbers, spaces, -, ' and ™©®",
  },
  photos: LISTING_LIMITS.photos,
  variants: LISTING_LIMITS.variants,
  variationOptions: LISTING_LIMITS.variationOptions,
};
