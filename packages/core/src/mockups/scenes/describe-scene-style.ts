import { requireDesign } from '../../catalog/catalog-queries.js';
import { productTypeOf } from '../../catalog/product-family.js';
import type { CatalogQuery } from '../../ports/catalog-repositories.js';
import type { PreviewImage } from '../../ports/previews.js';
import type { SceneStyleReader, StyleReading } from '../../ports/scene-style-reader.js';
import { characterCount, cutAtWord, firstCharacters } from '@pod/rules';
import { offeredLook, type LookChoices } from './scene-look.js';

/** Long enough for a setting, props, light, angle and mood; short enough to edit. */
export const MAX_STYLE_LENGTH = 600;

export type SceneStyle =
  | {
      readonly found: true;
      readonly description: string;
      /** Suggested look options, which the seller may change. */
      readonly look: LookChoices;
    }
  | { readonly found: false; readonly reason: 'nothingUsable' | 'copiedText' };

export interface DescribeSceneStyleInput {
  readonly designId: string;
  /** Someone else's product photo; only its style may be used. */
  readonly reference: PreviewImage;
}

export interface DescribeSceneStyleDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly reader: SceneStyleReader;
}

/** Words too common to show that a description copied text off the reference. */
const COMMON_WORDS: ReadonlySet<string> = new Set(
  (
    'a an and are as at be by for from has have in is it its of on or our the this to ' +
    'was with you your we my me all one new s t'
  ).split(' '),
);

/**
 * Words a scene is described with that a reference may also show in print,
 * e.g. on a café sign or a holiday mug; on their own they copy nothing, even
 * capitalised like "a Christmas tree".
 */
const SCENE_WORDS: ReadonlySet<string> = new Set(
  (
    'coffee tea latte cafe café kitchen home love morning evening summer winter autumn ' +
    'spring holiday gift fresh garden market beach sun light warm cosy cozy ' +
    'wood wooden oak marble linen plant plants flower flowers book books candle table desk ' +
    'natural vintage white black grey gray green blue red pink yellow brown cream gold ' +
    'christmas halloween easter valentine valentines thanksgiving hanukkah diwali birthday ' +
    'wedding mother mothers father fathers day'
  ).split(' '),
);

/** Quotation marks and trademark signs only appear when text was copied. */
const QUOTE_MARKS = /["“”„«»™®©]/g;

/**
 * Turns a reference photo into a scene description for the design's product.
 * Words read off the reference may be someone else's slogan or brand name, so
 * a description that repeats them is asked for once more without them, and
 * dropped when it still does.
 */
export class DescribeSceneStyle {
  constructor(private readonly deps: DescribeSceneStyleDeps) {}

  async execute(input: DescribeSceneStyleInput): Promise<SceneStyle> {
    const { design } = await requireDesign(this.deps.query, input.designId);
    const productType = productTypeOf(design.familyId);
    const read = (avoid: readonly string[]) =>
      this.deps.reader.read(input.reference, productType, avoid);

    let reading = await read([]);
    let copied = copiedWords(reading, productType);
    if (copied.length > 0) {
      reading = await read(copied);
      copied = copiedWords(reading, productType);
    }
    const description = tidy(reading.description);
    if (!description) return { found: false, reason: 'nothingUsable' };
    if (copied.length > 0) return { found: false, reason: 'copiedText' };
    return {
      found: true,
      description: shorten(description),
      look: offeredLook(design.familyId, reading.look),
    };
  }
}

function tidy(description: string | null): string {
  return description?.trim().replace(/\s+/g, ' ') ?? '';
}

/** The words of `text` in lower case, for comparing. */
function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * The words of the reference the description repeats: any two in a row, or
 * one that is not a plain scene word.
 */
function copiedWords(reading: StyleReading, productType: string): string[] {
  const description = tidy(reading.description);
  const used = wordsOf(description);
  const allowed = new Set([...COMMON_WORDS, ...wordsOf(productType)]);
  const copied = new Set(description.match(QUOTE_MARKS) ?? []);
  for (const entry of reading.visibleWords) {
    const seen = wordsOf(entry);
    seen.slice(1).forEach((key, at) => {
      const pair = [seen[at], key];
      if (pair.every((word) => word && allowed.has(word))) return;
      if (used.some((word, index) => word === pair[0] && used[index + 1] === key)) {
        copied.add(pair.join(' '));
      }
    });
    for (const key of seen) {
      if (allowed.has(key) || SCENE_WORDS.has(key)) continue;
      if (used.includes(key)) copied.add(key);
    }
  }
  return [...copied];
}

/** Cut after the last whole sentence that fits, or the last whole word. */
function shorten(text: string): string {
  if (characterCount(text) <= MAX_STYLE_LENGTH) return text;
  const sentence = firstCharacters(text, MAX_STYLE_LENGTH).lastIndexOf('. ');
  return sentence > 0 ? text.slice(0, sentence + 1) : cutAtWord(text, MAX_STYLE_LENGTH);
}
