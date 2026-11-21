import { isMeasured } from './language-tells.js';
import type { AiTellCategory, TellHit, TellPrecision } from './tell-patterns.js';

export type ListingField = 'title' | 'description' | 'tags';

export type FieldHit = TellHit & { readonly field: ListingField };

/** The words to check, the tags one per line. */
export type CheckedFields = Readonly<Record<ListingField, string>>;

/** Languages whose own punctuation puts dashes between words, so they say nothing there. */
const DASH_LANGUAGES = new Set(['ja', 'pl', 'ru']);

interface MarkCheck {
  readonly category: AiTellCategory;
  readonly fields: readonly ListingField[];
  readonly pattern: RegExp;
}

const TEXT: readonly ListingField[] = ['title', 'description'];
const ALL: readonly ListingField[] = ['title', 'description', 'tags'];

/** A dash with the words on either side, so the seller can find it. */
const dashed = (dash: string) => new RegExp(String.raw`[^\s—–]*\s*${dash}\s*[^\s—–]*`, 'gu');

const EM_DASH: MarkCheck = { category: 'punctuation', fields: TEXT, pattern: dashed('—') };
const SPACED_EN_DASH: MarkCheck = {
  category: 'punctuation',
  fields: TEXT,
  pattern: /\S+\s–\s\S+/gu,
};

// Etsy allows ™©® in a title, though Unicode counts them as pictographs.
const EMOJI: MarkCheck = {
  category: 'punctuation',
  fields: ALL,
  pattern: /(?![©®™])\p{Extended_Pictographic}/gu,
};

/** Marks no seller types into an Etsy listing, which shows them as typed. */
const HIGH_CHECKS: readonly MarkCheck[] = [
  { category: 'punctuation', fields: ['description'], pattern: /\S+\s--\s\S+/gu },
  {
    category: 'punctuation',
    fields: ['description'],
    pattern: /\*\*[^*\n]+\*\*|__[^_\n]+__|^#{1,6} .*$|\[[^\]\n]+\]\([^)\n]+\)/gmu,
  },
  {
    category: 'punctuation',
    fields: ['description'],
    // A colour such as #FFCC00 is no hashtag.
    pattern: /(?<![\p{L}\p{N}&])#(?!(?:\p{AHex}{3}){1,2}(?![\p{L}\p{N}_]))\p{L}[\p{L}\p{N}_]*/gu,
  },
  { category: 'punctuation', fields: ALL, pattern: /\S*(?:!!|!\?|\?!)[!?]*/gu },
  { category: 'punctuation', fields: ['title'], pattern: /\S*!+/gu },
];

/** A size or a number, the ends of a range such as `S – 3XL` or `11 – 15 oz`. */
const RANGE_END = /^(?:\d+(?:[.,]\d+)?|\d*X{0,4}[SML])$/iu;

/** A dash between two sizes or numbers, which is a range rather than a pause. */
function isRange(match: string): boolean {
  const ends = /^(\S+?)\s*[—–-]{1,2}\s*(\S+?)[.,;:!?)]*$/u.exec(match);
  return ends !== null && RANGE_END.test(String(ends[1])) && RANGE_END.test(String(ends[2]));
}

function markHits(fields: CheckedFields, check: MarkCheck, precision: TellPrecision): FieldHit[] {
  return check.fields.flatMap((field) =>
    [...fields[field].matchAll(check.pattern)]
      .filter(([match]) => !isRange(match.trim()))
      .map(({ 0: match, index }) => ({
        category: check.category,
        precision,
        field,
        match: match.trim(),
        index: index + match.length - match.trimStart().length,
      })),
  );
}

/** A sentence of the description and where it starts there. */
interface Sentence {
  readonly text: string;
  readonly index: number;
}

/** Sentences of the description's prose, without its `- ` list lines. */
function proseSentences(description: string): Sentence[] {
  const sentences: Sentence[] = [];
  let offset = 0;
  for (const line of description.split('\n')) {
    if (!line.trimStart().startsWith('- ')) {
      let at = offset;
      for (const part of line.split(/((?<=[.!?…])\s+)/u)) {
        const text = part.trim();
        if (text) sentences.push({ text, index: at + part.length - part.trimStart().length });
        at += part.length;
      }
    }
    offset += line.length + 1;
  }
  return sentences;
}

const wordCount = (sentence: string) => sentence.split(/\s+/).length;

/** Three or more sentences of one to three words in a row, e.g. `Soft. Warm. Yours.` */
function fragmentRuns(description: string, sentences: readonly Sentence[]): Sentence[] {
  const runs: Sentence[] = [];
  let run: Sentence[] = [];
  for (const sentence of [...sentences, undefined]) {
    if (sentence && wordCount(sentence.text) <= 3 && /[.!?…]$/.test(sentence.text)) {
      run.push(sentence);
      continue;
    }
    const [first] = run;
    const last = run.at(-1);
    if (run.length >= 3 && first && last) {
      const text = description.slice(first.index, last.index + last.text.length);
      runs.push({ text, index: first.index });
    }
    run = [];
  }
  return runs;
}

/** Words a shop writes in capitals as a matter of course, and sizes such as XXL. */
const SHOP_CAPITALS = new Set([
  'NOTE',
  'PLEASE',
  'IMPORTANT',
  'UNISEX',
  'COTTON',
  'SIZE',
  'SIZES',
  'CARE',
  'WASH',
  'DETAILS',
  'HINWEIS',
  'BITTE',
  'ACHTUNG',
  'WICHTIG',
  'LGBTQ',
  'LGBTQIA',
]);
const isShouted = (word: string) =>
  word.length >= 4 && !SHOP_CAPITALS.has(word) && !/^\d*X+[SL]$/u.test(word);

/** The matches of `pattern` in each sentence, placed in the description. */
function matchesIn(
  sentences: readonly Sentence[],
  pattern: RegExp,
  from: (text: string) => number = () => 0,
): Sentence[] {
  return sentences.flatMap((sentence) => {
    const start = from(sentence.text);
    return [...sentence.text.slice(start).matchAll(pattern)].map(({ 0: text, index }) => ({
      text,
      index: sentence.index + start + index,
    }));
  });
}

/** Runs of words in capitals, one per run, leaving out a label such as `PLEASE NOTE:`. */
function capitalRuns(sentences: readonly Sentence[]): Sentence[] {
  return matchesIn(
    sentences,
    /(?<![\p{L}\p{N}])\p{Lu}{2,}(?:\s+\p{Lu}{2,})*(?![\p{L}\p{N}])/gu,
    (text) => /^[\p{Lu}\s]+:/u.exec(text)?.[0].length ?? 0,
  ).filter(({ text }) => text.split(/\s+/).some(isShouted));
}

function sentenceHits(description: string, withOpening: boolean): FieldHit[] {
  const hit = (
    category: AiTellCategory,
    precision: TellPrecision,
    { text, index }: Sentence,
  ): FieldHit => ({ category, precision, field: 'description', match: text, index });
  const sentences = proseSentences(description);
  const questions = sentences.filter(({ text }) => text.endsWith('?'));
  const exclaimed = sentences.filter(({ text }) => text.endsWith('!'));
  const [opening] = sentences;
  return [
    // The first sentence carries the search phrase and shows in search results.
    ...(withOpening && opening?.text.endsWith('?')
      ? [hit('rhetorical-question', 'high', opening)]
      : []),
    ...(questions.length >= 2
      ? questions.map((question) => hit('rhetorical-question', 'medium', question))
      : []),
    ...(exclaimed.length >= 2
      ? exclaimed.map((sentence) => hit('punctuation', 'medium', sentence))
      : []),
    ...capitalRuns(sentences).map((run) => hit('structure', 'medium', run)),
    ...fragmentRuns(description, sentences).map((run) => hit('structure', 'medium', run)),
    ...matchesIn(sentences, /\p{L}+ - \p{L}+/gu)
      .filter(({ text }) => !isRange(text))
      .map((match) => hit('punctuation', 'medium', match)),
  ];
}

/**
 * Tells in the marks and shape of the text rather than its words, the same in
 * every language: dashes between words, emoji, Markdown, hashtags, runs of `!`
 * and `?`, questions to the buyer, words in capitals and strings of fragments.
 * Where a list was measured on human copy, it decides about dashes, emoji and
 * an opening question: it keeps them as its own entries or found that people
 * write them too.
 */
export function markTells(fields: CheckedFields, language: string): FieldHit[] {
  const listDecides = isMeasured(language);
  const dashes =
    DASH_LANGUAGES.has(language) || listDecides
      ? []
      : [
          ...markHits(fields, EM_DASH, 'high'),
          // A spaced en dash is the German or French dash, but English has none.
          ...markHits(fields, SPACED_EN_DASH, language === 'en' ? 'high' : 'medium'),
        ];
  return [
    ...dashes,
    ...(listDecides ? [] : markHits(fields, EMOJI, 'high')),
    ...HIGH_CHECKS.flatMap((check) => markHits(fields, check, 'high')),
    ...sentenceHits(fields.description, !listDecides),
  ];
}
