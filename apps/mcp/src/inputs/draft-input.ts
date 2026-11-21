import { MAX_TRANSLATIONS, translationRequest, type CreateListingRequest } from '@pod/contracts';
import { LISTING_LIMITS } from '@pod/rules';
import { z } from 'zod';
import { PRINT_INPUT } from './print-input.js';
import { DESIGN, inputs } from '../schemas.js';

const usd = (amount: number) =>
  amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    trailingZeroDisplay: 'stripIfInteger',
  });

/** What `create_etsy_draft` tells an assistant: Etsy's rules and how to write like a shop. */
export const DRAFT_DESCRIPTION =
  'Creates an unpublished Etsy listing for a design, with one variation per chosen ' +
  'Printful variant and the chosen mockups as photos. Nothing becomes public and Etsy ' +
  'charges nothing for drafts. Text rules: the title is one readable phrase that starts ' +
  `with the main search phrase, at most ${String(LISTING_LIMITS.title)} characters and ` +
  `at most ${String(LISTING_LIMITS.capitalWords)} words in capitals; use all ` +
  `${String(LISTING_LIMITS.tags)} tags (at most ${String(LISTING_LIMITS.tags)}), each of 2 ` +
  `to 4 words, or one long compound noun in German, and at most ` +
  `${String(LISTING_LIMITS.tagLength)} characters; no brand, ` +
  'character, franchise, celebrity or sports league names in the title or tags; state ' +
  'only the productFacts from check_print and invent none. The description is plain ' +
  'text: no Markdown, HTML or emoji, and no list of colours or sizes (buyers pick them). ' +
  'When a photo is an AI scene, or the user said in the app that their designs are made ' +
  'with AI tools, the app adds a note saying so to every description; leave ' +
  `${String(LISTING_LIMITS.aiNote)} characters free for it. Text that breaks ` +
  "Etsy's rules is refused, not shortened. Write like a small shop owner: plain " +
  'sentences about what the item is and shows, one form of address, no dashes between ' +
  'words, no questions to the buyer, no contrast nobody raised, no list of the buyers it ' +
  'might suit, no promise of a better life, no invented urgency (items are printed to ' +
  'order) and no closing sales line; words printed on the design may stand as they are. ' +
  "The result's trademarks lists names Etsy may remove the listing for, and " +
  'aiTells phrases that read as machine-written, by language and field; tell the user ' +
  'so they can change them on Etsy. Show the title, ' +
  'price and variants to the user before calling. Afterwards call link_printful; only ' +
  'the user can publish, in the app.';

/** What `create_etsy_draft` takes, in the app's own request fields. */
export const DRAFT_INPUT = {
  ...DESIGN,
  print_area: inputs.printArea
    .optional()
    .describe('Print area from check_print, e.g. front; the main area when left out'),
  fit: PRINT_INPUT.fit,
  language: inputs.language.describe(
    "The shop's main language, which title and description are in: the first of " +
      'languages from get_shop_options',
  ),
  title: inputs.listingText,
  description: inputs.listingText,
  tags: inputs
    .listingItems(inputs.listingText)
    .describe(
      `Up to ${String(LISTING_LIMITS.tags)} tags of up to ${String(LISTING_LIMITS.tagLength)} ` +
        "characters; letters, numbers, spaces, - and '",
    ),
  price: inputs.price.describe(
    'Price of every variant as a whole number in the minor unit of the shop currency: ' +
      'the price times 10 to the power of currencyDigits from get_shop_options, e.g. ' +
      '2499 for 24.99 USD or 2500 for 2500 JPY. Etsy accepts ' +
      `${usd(LISTING_LIMITS.minPriceUsd)} to ${usd(LISTING_LIMITS.maxPriceUsd)} USD ` +
      'or the same amount in the shop currency',
  ),
  currency: inputs.currency.describe(
    'The shop currency from get_shop_options that the prices are in; Etsy is not ' +
      'asked when the shop uses another by now',
  ),
  size_prices: inputs.sizePrices
    .optional()
    .describe(
      'Other prices for some sizes in the same unit, e.g. {"2XL": 2699}; sizes as in check_print',
    ),
  variant_ids: inputs
    .listingItems(inputs.variantId)
    .describe('Variant ids from check_print; buyers choose among them'),
  mockup_ids: inputs
    .listingItems(inputs.mockupId)
    .describe(
      `Up to ${String(LISTING_LIMITS.photos)} mockup ids from list_mockups, main photo first. ` +
        'An AI scene is accepted only with printConfirmed true, which the user sets in the app.',
    ),
  shipping_profile_id: inputs.shopId.describe('Shipping profile id from get_shop_options'),
  readiness_state_id: inputs.shopId.describe('Processing time id from get_shop_options'),
  return_policy_id: inputs.shopId
    .optional()
    .describe('Return policy id from get_shop_options; none when left out'),
  translations: z
    .array(translationRequest)
    .max(MAX_TRANSLATIONS)
    .optional()
    .describe(
      'The listing in other shop languages (get_shop_options lists them; the first is ' +
        'the main one the title is in), under the same Etsy rules',
    ),
  production_partner_ids: inputs
    .listingItems(inputs.shopId)
    .describe('Usually Printful, from get_shop_options'),
};

export type DraftToolInput = z.infer<z.ZodObject<typeof DRAFT_INPUT>>;

export function draftRequestOf(input: DraftToolInput): CreateListingRequest {
  return {
    designId: input.design_id,
    printArea: input.print_area,
    fit: input.fit,
    language: input.language,
    title: input.title,
    description: input.description,
    tags: input.tags,
    price: input.price,
    currency: input.currency,
    sizePrices: input.size_prices,
    variantIds: input.variant_ids,
    mockupIds: input.mockup_ids,
    shippingProfileId: input.shipping_profile_id,
    readinessStateId: input.readiness_state_id,
    returnPolicyId: input.return_policy_id,
    productionPartnerIds: input.production_partner_ids,
    translations: input.translations,
  };
}
