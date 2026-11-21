import de from './de.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import fr from './fr.json' with { type: 'json' };
import it from './it.json' with { type: 'json' };
import nl from './nl.json' with { type: 'json' };
import pt from './pt.json' with { type: 'json' };
import { parseTellList, type TellPattern } from './tell-patterns.js';

/**
 * Words and phrases that read as machine-written in a shop language, by its
 * primary subtag. Other languages are checked for marks only.
 */
const LISTS: ReadonlyMap<string, readonly TellPattern[]> = new Map(
  [de, en, es, fr, it, nl, pt].map((list) => [list.language, parseTellList(list)]),
);

export function languageTells(language: string): readonly TellPattern[] {
  return LISTS.get(language) ?? [];
}

/**
 * Languages whose lists were measured on human shop copy. There the lists
 * decide what is a sure sign, so marks by shape count only as weak ones.
 */
const MEASURED: ReadonlySet<string> = new Set(['es', 'it', 'nl']);

export const isMeasured = (language: string): boolean => MEASURED.has(language);
