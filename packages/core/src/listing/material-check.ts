import { primaryLanguage } from './language.js';

/**
 * Words for one material, by primary language. A word ending in `*` also
 * matches the words it starts, for languages that join nouns into one, e.g.
 * German `woll*` for `Wolldecke`; the others match whole words only.
 */
type MaterialWords = Readonly<Record<string, readonly string[]>>;

/**
 * Fabrics and materials a writer tends to guess from the product type, e.g.
 * fleece for a blanket. Words that also name a print's subject or style on
 * their own, such as bamboo or acrylic, are left out.
 */
const MATERIALS: readonly MaterialWords[] = [
  {
    en: ['fleece', 'fleecy'],
    de: ['fleece*'],
    // Not a bare `polaire`, which also means polar, as in ours polaire.
    fr: ['laine polaire', 'tissu polaire', 'plaid polaire', 'couverture polaire'],
    es: ['forro polar'],
    it: ['pile'],
    nl: ['fleece*'],
    tr: ['polar'],
  },
  { en: ['sherpa'], de: ['sherpa*'], nl: ['sherpa*'] },
  { en: ['minky'], de: ['minky*'], nl: ['minky*'] },
  {
    en: ['wool', 'woolen', 'woollen', 'woolly', 'merino'],
    // Not a bare `woll*`, which would take the verb wollen.
    de: ['wolle', 'schurwolle', 'wolldecke*', 'wollstoff*', 'merino*'],
    fr: ['laine'],
    es: ['lana'],
    it: ['lana'],
    nl: ['wol', 'wollen'],
    tr: ['yün'],
  },
  {
    en: ['cotton'],
    de: ['baumwoll*'],
    fr: ['coton'],
    es: ['algodón'],
    it: ['cotone'],
    nl: ['katoen*'],
    tr: ['pamuk', 'pamuklu'],
  },
  {
    en: ['flannel'],
    de: ['flanell*'],
    fr: ['flanelle'],
    es: ['franela'],
    it: ['flanella'],
    nl: ['flanel*'],
    tr: ['flanel', 'pazen'],
  },
  {
    en: ['cashmere'],
    de: ['kaschmir*'],
    fr: ['cachemire'],
    es: ['cachemira'],
    it: ['cashmere'],
    nl: ['kasjmier*'],
    tr: ['kaşmir'],
  },
  {
    en: ['linen'],
    de: ['leinen'],
    fr: ['lin'],
    es: ['lino'],
    it: ['lino'],
    nl: ['linnen'],
    tr: ['keten'],
  },
  {
    en: ['velvet', 'velour', 'velboa'],
    de: ['velours*'],
    fr: ['velours'],
    es: ['terciopelo'],
    it: ['velluto'],
    nl: ['fluweel*', 'fluwelen'],
    tr: ['kadife'],
  },
  { en: ['chenille'], de: ['chenille*'], nl: ['chenille*'] },
  {
    en: ['microfiber', 'microfibre'],
    de: ['mikrofaser*'],
    fr: ['microfibre'],
    es: ['microfibra'],
    it: ['microfibra'],
    nl: ['microvezel*'],
    tr: ['mikrofiber'],
  },
  {
    en: ['polyester'],
    de: ['polyester*'],
    fr: ['polyester'],
    es: ['poliéster'],
    it: ['poliestere'],
    nl: ['polyester*'],
    tr: ['polyester'],
  },
  {
    en: ['silk'],
    // Not `seide*`, which takes the beer mug Seidel.
    de: ['seide', 'seiden*', 'seidig*'],
    fr: ['soie'],
    es: ['seda'],
    it: ['seta'],
    // Not `zijde*`, which also means side.
    nl: ['zijden stof'],
    tr: ['ipek'],
  },
  {
    en: ['leather'],
    de: ['leder*'],
    fr: ['cuir'],
    es: ['cuero'],
    tr: ['deri'],
  },
];

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The word as a pattern that matches whole words only, or a joined noun it starts. */
function patternOf(word: string): RegExp {
  const joined = word.endsWith('*');
  const stem = escape(joined ? word.slice(0, -1) : word).replace(/ /g, '\\s+');
  // A joined noun matches to its end, so the whole word is named.
  const end = joined ? '\\p{L}*' : '(?![\\p{L}\\p{N}])';
  return new RegExp(`(?<![\\p{L}\\p{N}])${stem}${end}`, 'iu');
}

/** English material words that mean something else in a language, e.g. a caterpillar. */
const FALSE_FRIENDS: Readonly<Record<string, readonly string[]>> = {
  fr: ['chenille'],
};

/** The words a material goes by in English, which writers carry into any language, and in `language`. */
function wordsIn(material: MaterialWords, language: string): string[] {
  const english = (material['en'] ?? []).filter(
    (word) => !(FALSE_FRIENDS[language] ?? []).includes(word),
  );
  return [...new Set([...english, ...(material[language] ?? [])])];
}

/** Whether `text` names the material in any language the list knows. */
function namesMaterial(material: MaterialWords, text: string): boolean {
  return Object.values(material).some((words) => words.some((word) => patternOf(word).test(text)));
}

/**
 * The material words in `text`, written in `language`, that the product facts
 * do not name in any language, e.g. `fleece` for a blanket of polyester.
 * Words that are part of `allowed`, such as the design's name, may stand.
 */
export function inventedMaterials(
  text: string,
  facts: string,
  language: string,
  allowed: readonly string[] = [],
): string[] {
  const own = primaryLanguage(language);
  const found: string[] = [];
  for (const material of MATERIALS) {
    if (namesMaterial(material, facts)) continue;
    for (const word of wordsIn(material, own)) {
      const match = patternOf(word).exec(text);
      if (!match) continue;
      if (allowed.some((words) => patternOf(word).test(words))) continue;
      found.push(match[0]);
      break;
    }
  }
  return found;
}
