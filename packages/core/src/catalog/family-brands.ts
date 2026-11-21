import { foldLetters } from './text-folding.js';
import { literalPattern } from '../literal-pattern.js';

/**
 * Endings a brand is written with in listings: a model number (`iPhone17`,
 * `iPhone17Pro`), a plural, or a joined product or model word (`iphonecase`,
 * `SamsungGalaxy`). Other letters make another word, such as `Samsungish`.
 */
const ENDINGS = String.raw`(?:\d[\p{L}\p{N}]*|e?s|cases?|galaxy[\p{L}\p{N}]*)?`;

function brandPattern(brand: string): RegExp {
  return new RegExp(
    String.raw`(?:^|[^\p{L}\p{N}])${literalPattern(foldLetters(brand))}${ENDINGS}(?![\p{L}\p{N}])`,
    'u',
  );
}

/** The brands of `brands` that `text` names, however it is spelt or joined. */
export function brandsNamedIn(text: string, brands: readonly string[]): string[] {
  const words = foldLetters(text);
  return brands.filter((brand) => brandPattern(brand).test(words));
}
