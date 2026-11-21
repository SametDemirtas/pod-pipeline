import { KeywordFileUnreadableError } from '../errors.js';
import { findTrademarks } from '../listing/trademarks.js';
import { characterCount } from '@pod/rules';

/** Figures keyword tools such as eRank, Marmalead or EverBee export next to each keyword. */
const KEYWORD_FIGURES = ['searches', 'clicks', 'ctr', 'competition'] as const;
export type KeywordFigure = (typeof KEYWORD_FIGURES)[number];

/** One keyword of an exported list, with the figures as the file gives them. */
export interface KeywordEntry {
  readonly term: string;
  /** It names a trademark, so it must not end up in a listing. */
  readonly trademark: boolean;
  readonly searches: number | null;
  readonly clicks: number | null;
  readonly ctr: number | null;
  readonly competition: number | null;
}

export interface KeywordFile {
  /** The figures the file has a column for. */
  readonly figures: readonly KeywordFigure[];
  readonly keywords: readonly KeywordEntry[];
  /** The file held more keywords than a list keeps; only the first ones were kept. */
  readonly truncated: boolean;
}

/** Larger files are not keyword lists; the app reads them in one piece. */
export const MAX_KEYWORD_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_LIST_KEYWORDS = 5_000;
const MAX_TERM_LENGTH = 100;

const KEYWORD_HEADER =
  /^(?:keywords?|keyword phrases?|long tail keywords?|tags?|terms?|search terms?|quer(?:y|ies))$/;
/** Tried in this order, so `Click-through rate` is read as CTR and not as clicks. */
const FIGURE_HEADERS: readonly (readonly [KeywordFigure, RegExp])[] = [
  ['ctr', /\bctr\b|\bclick ?through\b/],
  ['clicks', /\bclicks?\b/],
  ['searches', /\bsearch(?:es| volume)\b|\bvolume\b/],
  ['competition', /\bcompetition\b/],
];

/** `Avg. Searches` as `avg searches`. */
function headerOf(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The separator the header row uses most, outside quotes. */
function separatorOf(text: string): string {
  const header = text.slice(0, text.search(/\r?\n|$/));
  const unquoted = header.replace(/"[^"]*"/g, '');
  const counts = [',', ';', '\t'].map(
    (separator) => [separator, unquoted.split(separator).length] as const,
  );
  return counts.sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',';
}

/**
 * Rows of cells. A cell that starts with a quote may hold separators, doubled
 * quotes and line breaks; a quote inside an unquoted cell is kept as written.
 */
function rowsOf(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index);
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      rows.push([...row, cell]);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  rows.push([...row, cell]);
  return rows;
}

/**
 * A number as keyword tools write it: `12,345`, `12.345`, `1,234.5`,
 * `1.234,5`, `0.125` or `45%`. Groups of exactly three digits after a lone
 * separator other than after a single zero are thousands, since the figures
 * are mostly counts.
 */
function figureOf(cell: string): number | null {
  const plain = cell.replace(/[\s%]/gu, '');
  // A leading zero never starts a thousands group: `0.125` is a share.
  if (/^0[.,]\d+$/.test(plain)) return Number(plain.replace(',', '.'));
  const grouped = /^\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*(?:([.,])(\d+))?$/.exec(plain);
  if (grouped && grouped[1] !== grouped[2]) {
    const whole = plain.slice(0, grouped[3] === undefined ? undefined : -grouped[3].length - 1);
    return Number(`${whole.replace(/[.,]/g, '')}.${grouped[3] ?? '0'}`);
  }
  if (/^\d+(?:[.,]\d+)?$/.test(plain)) return Number(plain.replace(',', '.'));
  return null;
}

/** The column of each figure; one named after Google is passed over for an Etsy one. */
function figureColumns(headers: readonly string[]): Map<KeywordFigure, number> {
  const columns = new Map<KeywordFigure, number>();
  const taken = new Set<number>();
  for (const [figure, pattern] of FIGURE_HEADERS) {
    const matching = headers
      .map((header, index) => [header, index] as const)
      .filter(([header, index]) => !taken.has(index) && pattern.test(header));
    const column = (matching.find(([header]) => !header.includes('google')) ?? matching[0])?.[1];
    if (column === undefined) continue;
    columns.set(figure, column);
    taken.add(column);
  }
  return columns;
}

/**
 * Reads a keyword list exported as CSV: the keyword column and any figures
 * are found by their headers, in any case, with `,`, `;` or tab between
 * cells. Each keyword is kept once, at most {@link MAX_LIST_KEYWORDS}.
 */
export function readKeywordFile(text: string): KeywordFile {
  const content = text.replace(/^\uFEFF/, '');
  const [header = [], ...rows] = rowsOf(content, separatorOf(content));
  const headers = header.map(headerOf);
  const keywordColumn = headers.findIndex((cell) => KEYWORD_HEADER.test(cell));
  if (keywordColumn < 0) throw new KeywordFileUnreadableError('noKeywordColumn');
  const columns = figureColumns(headers);
  const figures = KEYWORD_FIGURES.filter((figure) => columns.has(figure));
  const seen = new Set<string>();
  const keywords: KeywordEntry[] = [];
  let truncated = false;
  for (const row of rows) {
    const term = (row[keywordColumn] ?? '').trim().replace(/\s+/g, ' ');
    const key = term.toLowerCase();
    if (!term || characterCount(term) > MAX_TERM_LENGTH || seen.has(key)) continue;
    if (keywords.length === MAX_LIST_KEYWORDS) {
      truncated = true;
      break;
    }
    seen.add(key);
    const figure = (name: KeywordFigure) => {
      const column = columns.get(name);
      return column === undefined ? null : figureOf(row[column] ?? '');
    };
    keywords.push({
      term,
      trademark: findTrademarks(term).length > 0,
      searches: figure('searches'),
      clicks: figure('clicks'),
      ctr: figure('ctr'),
      competition: figure('competition'),
    });
  }
  if (keywords.length === 0) throw new KeywordFileUnreadableError('noKeywords');
  return { figures, keywords, truncated };
}
