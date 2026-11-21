import { literalPattern } from '../../literal-pattern.js';
/** What kind of AI tell a pattern finds; each kind gets its own advice to the writer. */
export const AI_TELL_CATEGORIES = [
  'false-contrast',
  'cliche-opener',
  'cliche-closer',
  'rhetorical-question',
  'hype',
  'vague-praise',
  'urgency',
  'filler',
  'structure',
  'punctuation',
] as const;
export type AiTellCategory = (typeof AI_TELL_CATEGORIES)[number];

/** `high` patterns count on one sighting, `medium` ones only together with others. */
export type TellPrecision = 'high' | 'medium';

export interface TellPattern {
  readonly id: string;
  readonly category: AiTellCategory;
  readonly precision: TellPrecision;
  readonly pattern: RegExp;
  /** Whether the pattern sees the text without diacritics, as its list asks. */
  readonly foldsDiacritics: boolean;
}

/** One place a pattern matched, as the text has it. */
export interface TellHit {
  /** The list entry that matched; marks found by shape have none. */
  readonly id?: string;
  readonly category: AiTellCategory;
  readonly precision: TellPrecision;
  readonly match: string;
  /** Where the match starts in the text checked. */
  readonly index: number;
}

const KINDS = ['word', 'phrase', 'regex'] as const;

/** Up to 60 characters within one sentence, starting and ending between words, for a `…`. */
const GAP = String.raw`(?![\p{L}\p{N}])[^.!?\n]{1,60}?(?<![\p{L}\p{N}])`;

/** A `…` with no words on one side, which would match half a word. */
const OPEN_GAP = /^\s*…|…\s*$/u;

/**
 * Text as patterns are matched against it: composed accents, typographic
 * apostrophes as plain ones and wide spaces as plain ones, each still one
 * character so matches keep their place.
 */
export function matchable(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’´]/g, "'")
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
}

/** The tilde of ñ, which Spanish treats as a letter of its own. */
const TILDE_N = /^[nN]\u0303$/u;

/** A letter without its diacritics, unless that would change its length. */
function bareLetter(letter: string): string {
  const parts = letter.normalize('NFD');
  if (TILDE_N.test(parts)) return letter;
  const bare = parts.replace(/\p{M}/gu, '');
  return bare.length === letter.length ? bare : letter;
}

/** `matchable` text without diacritics but with ñ, so é matches e in the same place. */
export function withoutDiacritics(text: string): string {
  return text.replace(/[^\p{ASCII}]/gu, bareLetter);
}

/** A phrase as a pattern: whole words in any spacing, `…` standing for a few words. */
export function phraseSource(phrase: string): string {
  const words = matchable(phrase)
    .split('…')
    .map((part) => literalPattern(part.trim()).replace(/\s+/g, String.raw`\s+`))
    .join(GAP);
  // `\b` knows no accents, so a word ends where letters and digits do.
  return String.raw`(?<![\p{L}\p{N}])${words}(?![\p{L}\p{N}])`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const oneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  options.includes(value as T);

function parsePattern(entry: unknown, language: string, foldsDiacritics: boolean): TellPattern {
  if (!isRecord(entry)) throw new Error(`${language}: a pattern is not an object`);
  const { id, kind, match, category, precision } = entry;
  if (
    typeof id !== 'string' ||
    typeof match !== 'string' ||
    !match.trim() ||
    (kind !== 'regex' && OPEN_GAP.test(match)) ||
    !oneOf(KINDS, kind) ||
    !oneOf(AI_TELL_CATEGORIES, category) ||
    !oneOf(['high', 'medium'] as const, precision)
  ) {
    throw new Error(`${language}: pattern ${JSON.stringify(id)} is incomplete`);
  }
  const source = kind === 'regex' ? matchable(match) : phraseSource(match);
  const seen = foldsDiacritics ? withoutDiacritics(source) : source;
  return { id, category, precision, pattern: new RegExp(seen, 'giu'), foldsDiacritics };
}

/**
 * The patterns of one language's list, as published in the humanizer lists
 * format: `{ language, version, foldDiacritics?, patterns: [{ id, kind, match,
 * category, precision, why, example, rewrite, falsePositives }] }`. Words and
 * phrases match whole words in any case; `…` in a phrase stands for a few
 * words. Diacritics are ignored, but for the tilde of ñ, unless the list sets
 * `foldDiacritics` to false.
 */
export function parseTellList(list: unknown): TellPattern[] {
  if (!isRecord(list) || typeof list['language'] !== 'string') {
    throw new Error('A tell list names no language');
  }
  const { language, patterns, foldDiacritics = true } = list;
  if (!Array.isArray(patterns)) throw new Error(`${language}: the list has no patterns`);
  if (typeof foldDiacritics !== 'boolean') {
    throw new Error(`${language}: foldDiacritics is not true or false`);
  }
  return patterns.map((entry) => parsePattern(entry, language, foldDiacritics));
}

/** Every match of the patterns in `text`, which must be `matchable`, as the text has it. */
export function findTellHits(text: string, patterns: readonly TellPattern[]): TellHit[] {
  const folded = withoutDiacritics(text);
  return patterns.flatMap(({ id, category, precision, pattern, foldsDiacritics }) =>
    [...(foldsDiacritics ? folded : text).matchAll(pattern)].map(({ 0: found, index }) => ({
      id,
      category,
      precision,
      match: text.slice(index, index + found.length),
      index,
    })),
  );
}
