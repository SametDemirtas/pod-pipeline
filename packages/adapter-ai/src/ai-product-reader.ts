import type { PreviewImage, ProductDetails, ProductReader } from '@pod/core';
import { answerOf, seeingModel, type Expected } from './answers.js';
import type { ModelChoice } from './json-model.js';
import { PRODUCT_READER_SYSTEM, PRODUCT_SCHEMA } from './product-prompts.js';
import { isTextList } from './text-list.js';

/** More colours than this blur into "colourful" for the scene model. */
const MAX_PRINT_COLORS = 5;

/** A few words are asked for; a longer answer is cut after its last whole word that fits. */
const MAX_PHRASE_LENGTH = 80;

/**
 * Digits, quotation marks and trademark signs come with sizes, model numbers,
 * brands or the print's own words, which the scene model would draw.
 */
const NOT_GENERIC = /[\d"“”„«»™®©]/;

/** The phrase in plain words, or `undefined` when it is empty or not generic. */
function phrase(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!text || NOT_GENERIC.test(text)) return undefined;
  if (text.length <= MAX_PHRASE_LENGTH) return text;
  const head = text.slice(0, MAX_PHRASE_LENGTH + 1);
  const space = head.lastIndexOf(' ');
  return space > 0 ? head.slice(0, space) : head.slice(0, MAX_PHRASE_LENGTH);
}

/** Every colour as a phrase, or `undefined` when any is not one. */
function colorsOf(value: unknown): string[] | undefined {
  if (!isTextList(value) || value.length === 0) return undefined;
  const colors = value.slice(0, MAX_PRINT_COLORS).map(phrase);
  return colors.every((color) => color !== undefined) ? colors : undefined;
}

const PRODUCT_DETAILS: Expected<ProductDetails> = {
  subject: 'product description',
  item: 'a product description',
  read: (fields) => {
    const product = phrase(fields['product']);
    const material = phrase(fields['material']);
    const printPlacement = phrase(fields['print_placement']);
    const notMistakenFor = phrase(fields['not_mistaken_for']);
    const printColors = colorsOf(fields['print_colors']);
    const lettering = fields['print_has_lettering'];
    if (!product || !material || !printPlacement || !notMistakenFor) return undefined;
    if (typeof lettering !== 'boolean' || !printColors) return undefined;
    return {
      product,
      material,
      printPlacement,
      printHasLettering: lettering,
      printColors,
      notMistakenFor,
    };
  },
};

/**
 * Describes the product in a print provider's photo with a model that reads
 * images. An answer that names a brand, model or size, or quotes the print, is
 * refused like a malformed one, so the scene goes without details.
 */
export class AiProductReader implements ProductReader {
  constructor(private readonly models: ModelChoice) {}

  async read(photo: PreviewImage, productType: string): Promise<ProductDetails> {
    const question = {
      system: PRODUCT_READER_SYSTEM,
      parts: [{ image: photo }, { text: `OUR_PRODUCT_TYPE: ${productType}` }],
      effort: 'low',
      schema: PRODUCT_SCHEMA,
    } as const;
    return answerOf(await seeingModel(this.models), question, PRODUCT_DETAILS);
  }
}
