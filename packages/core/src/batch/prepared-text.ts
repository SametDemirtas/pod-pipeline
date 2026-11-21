import type { PreparedText } from './batch-job.js';

/** What of a design's text is still to be paid for in the shop's languages. */
export interface MissingText {
  /** The shop's main language, which the text is written in; English when it names none. */
  readonly language: string;
  /** Text written before in that language; `null` when it must be written. */
  readonly kept: PreparedText | null;
  /** The shop's other languages with no translation yet. */
  readonly translations: readonly string[];
}

export function missingText(
  prepared: PreparedText | null,
  languages: readonly string[],
): MissingText {
  const [language = 'en-US', ...others] = languages;
  const kept = prepared?.language === language ? prepared : null;
  return {
    language,
    kept,
    translations: others.filter(
      (other) => !kept?.translations.some((translation) => translation.language === other),
    ),
  };
}
