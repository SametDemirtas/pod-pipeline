import { characterCount, type ListingTextRules } from '@pod/rules';
import { ValidationError } from '../errors.js';
import { aiTellProblems } from './ai-tells/ai-tell-problems.js';
import { aiTellsNotIn, findAiTells, type AiTell } from './ai-tells/find-ai-tells.js';
import { matchable } from './ai-tells/tell-patterns.js';
import { fitListingText } from './fit-listing-text.js';
import {
  isCapitalWord,
  normalizeListingText,
  uniqueTags,
  type ListingText,
} from './listing-text.js';
import { inventedMaterials } from './material-check.js';
import { findListingTrademarks } from './trademarks.js';
import { brandsNamedIn } from '../catalog/family-brands.js';

/**
 * What fitting would hide in written text by cutting, lowering or dropping
 * words, in words the writer can act on. Empty when the text is fine.
 */
export function writtenTextProblems(written: ListingText, rules: ListingTextRules): string[] {
  const problems: string[] = [];
  const title = written.title.replace(/\s+/g, ' ').trim();
  if (characterCount(title) > rules.titleLength) {
    problems.push(
      `The title has ${characterCount(title)} characters; the marketplace allows ${rules.titleLength}.`,
    );
  }
  const capitals = title.split(' ').filter(isCapitalWord).length;
  if (capitals > rules.capitalWords) {
    problems.push(
      `The title has ${capitals} words in capitals; use capitals only for short acronyms, ` +
        `at most ${rules.capitalWords}.`,
    );
  }
  const long = uniqueTags(written.tags).filter((tag) => characterCount(tag) > rules.tagLength);
  if (long.length > 0) {
    problems.push(
      `These tags are longer than ${rules.tagLength} characters: ` +
        `${long.map((tag) => `"${tag}"`).join(', ')}. Use shorter phrases instead.`,
    );
  }
  const fit = fitListingText(written, rules);
  if (fit.tags.length < rules.tags) {
    problems.push(`Only ${fit.tags.length} tags are usable; give exactly ${rules.tags}.`);
  }
  const trademarks = findListingTrademarks(written);
  if (trademarks.length > 0) {
    problems.push(
      `The title or tags name trademarks: ${trademarks.join(', ')}. Use generic words instead.`,
    );
  }
  try {
    normalizeListingText(fit, rules);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    problems.push(`${error.message}.`);
  }
  return problems;
}

/** Every word of the listing in one string, to look for names in. */
export function listingWords(text: ListingText): string {
  return [text.title, text.description, ...text.tags].join('\n');
}

const fitted = (text: ListingText, rules: ListingTextRules) =>
  normalizeListingText(fitListingText(text, rules), rules);

/** What the humanizer found: the tells the revision took out, and those still in the text. */
export interface HumanizerReport {
  readonly fixed: number;
  readonly left: readonly AiTell[];
}

export interface FinishedText {
  readonly text: ListingText;
  readonly humanizer: HumanizerReport;
}

/** What the words are checked against. */
export interface WritingContext {
  /** What the marketplace allows in the words. */
  readonly rules: ListingTextRules;
  readonly language: string;
  /** The design's own words, such as its name, which may stand as they are. */
  readonly designWords: readonly (string | null)[];
  /** Brands the product is not made for, which the text must not name. */
  readonly otherBrands?: readonly string[] | undefined;
  /**
   * The words the product's materials may be named from, e.g. its facts; a
   * fabric they do not name is a problem to fix. Left out, materials are not checked.
   */
  readonly facts?: string | undefined;
}

interface Review {
  readonly text: ListingText;
  /** Breaches of the marketplace's rules, which weigh more than tells. */
  readonly rules: readonly string[];
  readonly tells: readonly AiTell[];
}

/** The brands the text names that the product is not made for, as problems to fix. */
function brandProblems(text: ListingText, brands: readonly string[]): string[] {
  const named = brandsNamedIn(listingWords(text), brands);
  return named.map(
    (brand) => `The text names ${brand}, which this product is not made for. Leave it out.`,
  );
}

/** The materials the text names that the facts do not, as problems to fix. */
function materialProblems(text: ListingText, context: WritingContext): string[] {
  if (context.facts === undefined) return [];
  const designWords = context.designWords.filter((words) => words !== null);
  const invented = inventedMaterials(
    listingWords(text),
    context.facts,
    context.language,
    designWords,
  );
  return invented.map(
    (word) =>
      `The text says "${word}", a material the product facts do not state. ` +
      'Leave it out, or name only the material the facts give.',
  );
}

function review(text: ListingText, context: WritingContext): Review {
  return {
    text,
    rules: [
      ...writtenTextProblems(text, context.rules),
      ...brandProblems(text, context.otherBrands ?? []),
      ...materialProblems(text, context),
    ],
    tells: findAiTells(text, context.language, context.designWords),
  };
}

/** Lower case words with single spaces, to compare phrases. */
const plain = (text: string) => matchable(text).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The title's phrase before its first separator, which holds the main search
 * phrase, without the tells in it that the revision was asked to take out.
 */
function leadingPhrase({ text, tells }: Review): string {
  const lead = String(text.title.split(/[,|:–—]| - /u)[0]);
  const words = tells
    .filter((tell) => tell.field === 'title')
    .reduce((phrase, tell) => phrase.replaceAll(plain(tell.match), ' '), plain(lead));
  return plain(words);
}

/**
 * Whether the revision is better: it breaks fewer of the marketplace's rules, or as few
 * with fewer tells. It must not bring in a trademark, and when it only had
 * tells to fix, it must keep the title's search phrase.
 */
function better(revised: Review, first: Review): boolean {
  const branded = (words: Review) => findListingTrademarks(words.text).length > 0;
  if (branded(revised) && !branded(first)) return false;
  if (revised.rules.length !== first.rules.length) return revised.rules.length < first.rules.length;
  const tellsOnly = first.rules.length === 0;
  return (
    revised.tells.length < first.tells.length &&
    (!tellsOnly || plain(revised.text.title).includes(leadingPhrase(first)))
  );
}

/**
 * Fits written text to the marketplace's rules. When fitting would hide a problem, or the
 * text reads as machine-written, the writer gets one chance to fix it first,
 * so a cut title or a dropped tag is the exception rather than the rule. The
 * revision is kept only when it is better and fits; otherwise the first text,
 * already paid for, is fitted instead. Tells never stop a listing; the seller
 * sees those left.
 */
export async function finishWrittenText(
  written: ListingText,
  context: WritingContext,
  revise: (problems: readonly string[]) => Promise<ListingText>,
): Promise<FinishedText> {
  const first = review(written, context);
  const finished = (text: ListingText, fixed: readonly AiTell[]): FinishedText => ({
    text,
    humanizer: {
      fixed: fixed.length,
      left: findAiTells(text, context.language, context.designWords),
    },
  });
  if (first.rules.length === 0 && first.tells.length === 0)
    return finished(fitted(written, context.rules), []);
  const revised = await revise([...first.rules, ...aiTellProblems(first.tells)]).catch(
    () => undefined,
  );
  const second = revised && review(revised, context);
  if (second && better(second, first)) {
    try {
      // Both drafts are compared as written, before fitting.
      return finished(fitted(second.text, context.rules), aiTellsNotIn(first.tells, second.tells));
    } catch {
      // A revision the marketplace would refuse is no better than the first text.
    }
  }
  return finished(fitted(written, context.rules), []);
}
