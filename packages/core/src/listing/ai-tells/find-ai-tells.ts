import { withoutAiNotes } from '../ai-note.js';
import { primaryLanguage } from '../language.js';
import type { ListingText } from '../listing-text.js';
import { isMeasured, languageTells } from './language-tells.js';
import { markTells, type CheckedFields, type FieldHit, type ListingField } from './mark-tells.js';
import { outermost, twoSigns, within } from './signs.js';
import {
  findTellHits,
  matchable,
  phraseSource,
  type AiTellCategory,
  type TellHit,
  type TellPrecision,
} from './tell-patterns.js';

export type { ListingField } from './mark-tells.js';
export type { AiTellCategory } from './tell-patterns.js';

/** A phrase or mark in a listing that reads as machine-written. */
export interface AiTell {
  readonly category: AiTellCategory;
  readonly field: ListingField;
  /** As the text has it, with plain apostrophes, so the seller can find it. */
  readonly match: string;
}

/** Text in quotes, which is the print's own and must stay as it is. */
const QUOTED = /"[^"\n]*"|„[^“”\n]*[“”]|“[^”\n]*”|«[^»\n]*»|»[^«\n]*«|「[^」\n]*」/gu;

/** The design's own words, e.g. its name, wherever they stand, in any case. */
function designPattern(designWords: readonly (string | null)[]): RegExp | null {
  const sources = designWords
    .filter((words): words is string => Boolean(words?.trim()))
    .map(phraseSource);
  return sources.length > 0 ? new RegExp(sources.join('|'), 'giu') : null;
}

/** Lists that say something about a tag; the rest are about sentences. */
const TAG_CATEGORIES: ReadonlySet<AiTellCategory> = new Set(['hype', 'urgency']);

/**
 * Etsy asks for no opinion words in a title, but one that starts a title-case
 * name may be the print's. A measured list already set how sure its words are.
 */
function inTitle(hit: TellHit, title: string, language: string): TellPrecision {
  const named = /^\s+\p{Lu}/u.test(title.slice(hit.index + hit.match.length));
  const promoted = hit.category === 'vague-praise' && !named && !isMeasured(language);
  return promoted ? 'high' : hit.precision;
}

function wordHits(fields: CheckedFields, language: string): FieldHit[] {
  const patterns = languageTells(language);
  const tagPatterns = patterns.filter((pattern) => TAG_CATEGORIES.has(pattern.category));
  return [
    ...findTellHits(fields.title, patterns).map((hit) => ({
      ...hit,
      field: 'title' as const,
      precision: inTitle(hit, fields.title, language),
    })),
    ...findTellHits(fields.description, patterns).map((hit) => ({
      ...hit,
      field: 'description' as const,
    })),
    ...findTellHits(fields.tags, tagPatterns).map((hit) => ({ ...hit, field: 'tags' as const })),
  ];
}

const keyOf = (tell: AiTell) => `${tell.category} ${tell.field} ${tell.match.toLowerCase()}`;

function distinct<T extends AiTell>(tells: readonly T[]): T[] {
  return [...new Map(tells.map((tell) => [keyOf(tell), tell])).values()];
}

/**
 * The phrases and marks in a listing that read as machine-written, in the
 * listing's language. One sure sign is enough; weaker signs, which people
 * write too, count only when two of them stand on different words or a sure
 * sign is with them, and not when they are part of a sure sign. A tell inside
 * another is reported once, as the larger one. The note on AI scenes, anything
 * in quotes and the design's own words, such as its name, are not checked.
 */
export function findAiTells(
  text: ListingText,
  language: string,
  designWords: readonly (string | null)[] = [],
): AiTell[] {
  const primary = primaryLanguage(language);
  const design = designPattern(designWords);
  const checked = (words: string) => {
    const unquoted = matchable(words).replace(QUOTED, '""');
    return design ? unquoted.replace(design, '""') : unquoted;
  };
  const fields: CheckedFields = {
    title: checked(text.title),
    description: checked(withoutAiNotes(text.description)),
    tags: checked(text.tags.join('\n')),
  };
  const hits = [...markTells(fields, primary), ...wordHits(fields, primary)];
  const sure = hits.filter((hit) => hit.precision === 'high');
  const weak = hits.filter(
    (hit) => hit.precision === 'medium' && !sure.some((outer) => within(hit, outer)),
  );
  const counted =
    twoSigns(weak) || (weak.length > 0 && sure.length > 0) ? [...sure, ...weak] : sure;
  return distinct(
    outermost(counted).map(({ category, field, match }) => ({ category, field, match })),
  );
}

/** The tells of `tells` that `others` lacks, by kind, field and wording. */
export function aiTellsNotIn(tells: readonly AiTell[], others: readonly AiTell[]): AiTell[] {
  const known = new Set(others.map(keyOf));
  return tells.filter((tell) => !known.has(keyOf(tell)));
}
