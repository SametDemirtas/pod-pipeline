import { z } from 'zod';
import { RESEARCH_MARKETS } from '../dto.js';
import { fields } from '../fields.js';
import { LISTING_WRITER_LIMITS, MAX_TRANSLATIONS } from '../limits.js';
import { designIdRequest } from './catalog-requests.js';

const { listingText, listingItems: items, shopId, language } = fields;
const listingWords = {
  title: listingText,
  description: listingText,
  tags: items(listingText),
};
/** A listing's words in one of the shop's other languages. */
export const translationRequest = z.object({ language, ...listingWords }).strict();

export const createListingRequest = z
  .object({
    designId: fields.designId,
    printArea: fields.printArea.optional(),
    fit: fields.fit,
    /** The shop's main language, which the words are in; the first of the shop's languages. */
    language,
    ...listingWords,
    /** Price of every variant without a size price. */
    price: fields.price,
    sizePrices: fields.sizePrices.optional(),
    /** The shop currency the prices are in; refused once the shop uses another. */
    currency: fields.currency,
    variantIds: items(fields.variantId),
    /** Photos in the order buyers see them; the first is the main photo. */
    mockupIds: items(fields.mockupId),
    shippingProfileId: shopId,
    readinessStateId: shopId,
    returnPolicyId: shopId.optional(),
    productionPartnerIds: items(shopId),
    /** The words in the shop's other languages. */
    translations: z.array(translationRequest).max(MAX_TRANSLATIONS).optional(),
  })
  .strict();
export type CreateListingRequest = z.infer<typeof createListingRequest>;

/** A word for the language model to use, with what research found about it. */
const searchWord = z
  .object({
    term: listingText,
    /** The Etsy market it was found in, whose language it is in. */
    market: z.enum(RESEARCH_MARKETS).optional(),
    suggested: z.boolean().optional(),
    shops: z.number().int().min(0).optional(),
    /** From the seller's keyword tool export. */
    searches: z.number().min(0).optional(),
  })
  .strict();

export const writeListingTextRequest = z
  .object({
    designId: fields.designId,
    language,
    /** The variants the listing sells, so the text is about those. */
    variantIds: items(fields.variantId).optional(),
    /** Most important first; blank ones are left out, as the app does. */
    keywords: items(searchWord)
      .refine(
        (words) => words.filter(({ term }) => term.trim()).length <= LISTING_WRITER_LIMITS.keywords,
        {
          message: `At most ${LISTING_WRITER_LIMITS.keywords} keywords`,
        },
      )
      .optional(),
    /** Counted without the spaces at its ends, as the app counts it. */
    notes: z
      .string()
      .refine((value) => Array.from(value.trim()).length <= LISTING_WRITER_LIMITS.notes, {
        message: `Too long; at most ${LISTING_WRITER_LIMITS.notes} characters`,
      })
      .optional(),
  })
  .strict();
export type WriteListingTextRequest = z.infer<typeof writeListingTextRequest>;
export type SearchWordRequest = z.infer<typeof searchWord>;

export const checkListingTextRequest = z
  .object({
    language,
    ...listingWords,
    /** The design's name, whose words are the print's own and may stand as they are. */
    designName: listingText.optional(),
  })
  .strict();
export type CheckListingTextRequest = z.infer<typeof checkListingTextRequest>;

export const translateListingTextRequest = z
  .object({
    ...listingWords,
    languages: z.array(language).max(MAX_TRANSLATIONS),
    /** The product the text sells, so translations naming another brand are revised. */
    familyId: fields.familyId.optional(),
  })
  .strict();
export type TranslateListingTextRequest = z.infer<typeof translateListingTextRequest>;

/** `again` links a listing already linked to its current revision, to repair what Printful lost. */
export const linkListingRequest = designIdRequest
  .extend({ again: z.boolean().optional() })
  .strict();
export type LinkListingRequest = z.infer<typeof linkListingRequest>;

/**
 * Replaces every photo of the design's unpublished Etsy draft with these, in
 * the order buyers see them; the first is the main photo.
 */
export const replaceListingPhotosRequest = z
  .object({ designId: fields.designId, mockupIds: items(fields.mockupId) })
  .strict();
export type ReplaceListingPhotosRequest = z.infer<typeof replaceListingPhotosRequest>;
