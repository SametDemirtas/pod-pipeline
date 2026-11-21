/**
 * The matching rules of the humanizer-lists project (its src/matcher.mjs),
 * written out separately so the parity test can hold this detector to them.
 */

interface ListEntry {
  readonly id: string;
  readonly kind: string;
  readonly match: string;
}

export interface ReferenceList {
  readonly foldDiacritics?: boolean;
  readonly patterns: readonly ListEntry[];
}

export interface ReferenceHit {
  readonly id: string;
  readonly index: number;
  readonly length: number;
}

const foldChar = (char: string) => {
  const parts = char.normalize('NFD');
  if (/^[nN]\u0303$/u.test(parts)) return char;
  const base = parts.replace(/\p{M}/gu, '');
  return base.length === char.length ? base : char;
};

function normalize(text: string, fold: boolean): string {
  const plain = text
    .normalize('NFC')
    .replace(/[\u2018\u2019\u00B4]/g, "'")
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  return fold ? plain.replace(/[^\p{ASCII}]/gu, foldChar) : plain;
}

const BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const AFTER = String.raw`(?![\p{L}\p{N}])`;
const GAP = `${AFTER}[^.!?\\n]{1,60}?${BEFORE}`;

function source(entry: ListEntry, fold: boolean): string {
  const normal = normalize(entry.match, fold);
  if (entry.kind === 'regex') return normal;
  const body = normal
    .split('…')
    .map((part) =>
      part
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
        .replace(/\s+/g, String.raw`\s+`),
    )
    .join(GAP);
  return BEFORE + body + AFTER;
}

/** Every match of the list in `text`, by entry, position and length. */
export function referenceHits(list: ReferenceList, text: string): ReferenceHit[] {
  const fold = list.foldDiacritics !== false;
  const normal = normalize(text, fold);
  return list.patterns.flatMap((entry) =>
    [...normal.matchAll(new RegExp(source(entry, fold), 'giu'))].map((found) => ({
      id: entry.id,
      index: found.index,
      length: found[0].length,
    })),
  );
}
