import { z } from 'zod';
import { FIT_MODES } from './dto.js';
import {
  SCENE_LOOK_OPTIONS,
  SCENE_SHAPES,
  type SceneLookControl,
  type SceneLookDto,
} from './dto/scene-look.js';
import {
  MAX_BOARD_ID_LENGTH,
  MAX_CURSOR_LENGTH,
  MAX_DESIGN_ID_LENGTH,
  MAX_FAMILY_ID_LENGTH,
  MAX_FINGERPRINT_LENGTH,
  MAX_KEYWORD_LIST_ID_LENGTH,
  MAX_LANGUAGE_LENGTH,
  MAX_LISTING_ITEMS,
  MAX_LISTING_TEXT_LENGTH,
  MAX_MOCKUP_ID_LENGTH,
  MAX_PATH_LENGTH,
  MAX_PIN_ID_LENGTH,
  MAX_PIN_TEXT_LENGTH,
  MAX_PRINT_AREA_LENGTH,
  MAX_RESEARCH_ID_LENGTH,
  MAX_SHOP_ID_LENGTH,
  MAX_SIZE_LENGTH,
  MAX_VARIANT_ID_LENGTH,
} from './field-limits.js';
import {
  MAX_MODEL_ID_LENGTH,
  MAX_PAGE_SIZE,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_RESEARCH_QUERY_LENGTH,
  MAX_SCENE_PROMPT_LENGTH,
  MAX_SEARCH_CHARACTERS,
  MODEL_ID_PATTERN,
} from './limits.js';

const text = (max: number) => z.string().min(1).max(max);

/** One look control's options; left out, it is Auto. */
const lookChoice = <C extends SceneLookControl>(control: C) =>
  z.enum(SCENE_LOOK_OPTIONS[control]).optional();
const digits = (max: number) => z.string().regex(/^\d+$/).max(max);

/**
 * The fields requests are made of. The MCP server builds its tool inputs from
 * the same schemas, so both sides accept exactly the same values.
 */
export const fields = {
  familyId: text(MAX_FAMILY_ID_LENGTH),
  designId: text(MAX_DESIGN_ID_LENGTH),
  variantId: text(MAX_VARIANT_ID_LENGTH),
  printArea: text(MAX_PRINT_AREA_LENGTH),
  mockupId: text(MAX_MOCKUP_ID_LENGTH),
  researchId: text(MAX_RESEARCH_ID_LENGTH),
  keywordListId: text(MAX_KEYWORD_LIST_ID_LENGTH),
  pinId: text(MAX_PIN_ID_LENGTH),
  folder: text(MAX_PATH_LENGTH),
  fingerprint: text(MAX_FINGERPRINT_LENGTH),
  fit: z.enum(FIT_MODES),
  search: z
    .string()
    .trim()
    .refine((value) => Array.from(value).length <= MAX_SEARCH_CHARACTERS, {
      message: `Too long; at most ${MAX_SEARCH_CHARACTERS} characters`,
    }),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE),
  cursor: text(MAX_CURSOR_LENGTH),
  listingText: z.string().max(MAX_LISTING_TEXT_LENGTH),
  /** A list in a listing: tags, variants, photos, languages. */
  listingItems: <T extends z.ZodType>(item: T): z.ZodArray<T> =>
    z.array(item).max(MAX_LISTING_ITEMS),
  /**
   * In the shop currency's minor unit: cents for USD, whole yen for JPY. Etsy
   * checks its range, which is set in US dollars.
   */
  price: z.number().int().positive(),
  /** ISO 4217 code, e.g. `USD`. */
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** A variant's size or model as the print provider names it, e.g. `50″×60″`. */
  size: text(MAX_SIZE_LENGTH),
  /** Prices by size, e.g. `{ "2XL": 2699 }`, in the same unit. */
  sizePrices: z
    .record(text(MAX_SIZE_LENGTH), z.number().int().positive())
    .refine((prices) => Object.keys(prices).length <= MAX_LISTING_ITEMS, {
      message: `At most ${MAX_LISTING_ITEMS} sizes`,
    }),
  shopId: digits(MAX_SHOP_ID_LENGTH),
  /** A BCP 47 tag, e.g. `de` or `en-US`. */
  language: text(MAX_LANGUAGE_LENGTH).regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/),
  researchQuery: z.string().trim().min(1).max(MAX_RESEARCH_QUERY_LENGTH),
  scenePrompt: z.string().trim().min(1).max(MAX_SCENE_PROMPT_LENGTH),
  sceneLook: z
    .object({
      shape: z.enum(SCENE_SHAPES),
      shotSize: lookChoice('shotSize'),
      cameraHeight: lookChoice('cameraHeight'),
      lighting: lookChoice('lighting'),
      timeOfDay: lookChoice('timeOfDay'),
      season: lookChoice('season'),
      backdrop: lookChoice('backdrop'),
      blur: lookChoice('blur'),
      grade: lookChoice('grade'),
      props: lookChoice('props'),
    })
    .strict() satisfies z.ZodType<SceneLookDto>,
  modelId: z.string().trim().max(MAX_MODEL_ID_LENGTH).regex(MODEL_ID_PATTERN),
  /** An image's bytes as base64, at most {@link MAX_REFERENCE_IMAGE_BYTES} of them. */
  referenceImage: z.base64().max(Math.ceil(MAX_REFERENCE_IMAGE_BYTES / 3) * 4),
  boardId: digits(MAX_BOARD_ID_LENGTH),
  pinText: z.string().max(MAX_PIN_TEXT_LENGTH),
  publishAt: z.iso.datetime({ offset: true }),
};
