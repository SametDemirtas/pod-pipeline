import type {
  HumanizerDto,
  MockupDto,
  ShopOptionsDto,
  TranslationDto,
  WrittenListingTextDto,
} from '@pod/contracts/client';
import { isPublishablePhoto } from '@pod/rules';
import { formatTags, parseTags } from '../../shared/tags.js';

export const DRAFT_FIELDS = [
  'title',
  'description',
  'tags',
  'price',
  'sizePrices',
  'variants',
  'photos',
  'shippingProfile',
  'readinessState',
] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];

/** What the seller is filling in, kept as typed until the draft is created. */
export interface ListingDraft {
  readonly title: string;
  readonly description: string;
  readonly tags: string;
  readonly price: string;
  /** Prices typed for single sizes; empty ones use `price`. */
  readonly sizePrices: Readonly<Record<string, string>>;
  readonly variantIds: readonly string[];
  /** In the order buyers see them. */
  readonly mockupIds: readonly string[];
  readonly shippingProfileId: string;
  readonly readinessStateId: string;
  /** Empty for none. */
  readonly returnPolicyId: string;
  readonly productionPartnerIds: readonly string[];
  /** Other shop languages to translate into. */
  readonly languages: readonly string[];
  readonly translations: readonly DraftTranslation[];
  /** The main text the translations were made from, to notice later edits. */
  readonly translatedFrom: string;
}

/**
 * A translation as the form holds it. `humanizer` is `null` for one a batch
 * job wrote, whose words were not checked for machine-sounding phrases.
 */
export type DraftTranslation = Omit<TranslationDto, 'humanizer'> & {
  readonly humanizer: HumanizerDto | null;
};

/** The language listings are written in: the shop's first. */
export function mainLanguage(shop: Pick<ShopOptionsDto, 'languages'>): string {
  return shop.languages[0] ?? 'en-US';
}

/** The draft without photos removed, or no longer confirmed, since they were picked. */
export function withLivePhotos(draft: ListingDraft, mockups: readonly MockupDto[]): ListingDraft {
  const live = new Set(mockups.filter(isPublishablePhoto).map((mockup) => mockup.id));
  return { ...draft, mockupIds: draft.mockupIds.filter((id) => live.has(id)) };
}

/**
 * Whether the title, description or tags hold words the seller wrote or
 * changed, rather than the title the form started with or the text last written for them.
 */
export function hasOwnWords(
  draft: Pick<ListingDraft, 'title' | 'description' | 'tags'>,
  startTitle: string,
  written: WrittenListingTextDto | null,
): boolean {
  const title = written?.title ?? startTitle;
  const description = written?.description ?? '';
  const tags = written?.tags ?? [];
  return (
    draft.title.trim() !== title.trim() ||
    draft.description.trim() !== description.trim() ||
    formatTags(parseTags(draft.tags)) !== formatTags(tags)
  );
}

/** The main text in one string, so translations can tell when it changed. */
export function textKeyOf(draft: Pick<ListingDraft, 'title' | 'description' | 'tags'>): string {
  return JSON.stringify([draft.title.trim(), draft.description.trim(), parseTags(draft.tags)]);
}
