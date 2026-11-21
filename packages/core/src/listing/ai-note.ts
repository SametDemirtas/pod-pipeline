import { characterCount, type AiUse, type ListingTextRules } from '@pod/rules';
import { ValidationError } from '../errors.js';
import { primaryLanguage } from './language.js';
import { type ListingText } from './listing-text.js';

type Notes = Readonly<Record<string, string>>;

/**
 * The notes are fixed text rather than written, so they are always there and
 * always say the same; by the language's primary subtag, English for any
 * other. When both apply, one sentence says both.
 */
const SCENES: Notes = {
  en: 'Some photos are AI-generated scenes. Props in them are not included.',
  de:
    'Einige Fotos sind KI-generierte Szenen. Die Dekoration darin ist nicht im ' +
    'Lieferumfang enthalten.',
  es: 'Algunas fotos son escenas generadas con IA. La decoración que aparece no está incluida.',
  fr:
    'Certaines photos sont des scènes générées par IA. Les accessoires de décor ne sont ' +
    'pas inclus.',
  it: 'Alcune foto sono scene generate con IA. Gli oggetti di scena non sono inclusi.',
  ja: '一部の写真はAIで生成したシーンです。写真内の小物は商品に含まれません。',
  nl: 'Sommige foto’s zijn met AI gemaakte scènes. De decoratie daarin wordt niet meegeleverd.',
  pl:
    'Niektóre zdjęcia to sceny wygenerowane przez AI. Rekwizyty na nich nie wchodzą w ' +
    'skład zamówienia.',
  pt: 'Algumas fotos são cenas geradas por IA. Os objetos de decoração nelas não estão incluídos.',
  ru: 'Некоторые фото — сцены, созданные ИИ. Предметы декора на них не входят в комплект.',
};
const DESIGNS: Notes = {
  en: 'This design was created with the help of AI tools from my own ideas and prompts.',
  de: 'Dieses Design wurde mit Hilfe von KI-Tools nach meinen eigenen Ideen und Vorgaben erstellt.',
  es:
    'Este diseño se creó con ayuda de herramientas de IA a partir de mis propias ideas e ' +
    'indicaciones.',
  fr: 'Ce design a été créé à l’aide d’outils d’IA à partir de mes propres idées et consignes.',
  it:
    'Questo design è stato creato con l’aiuto di strumenti di IA a partire dalle mie idee ' +
    'e indicazioni.',
  ja: 'このデザインは、私自身のアイデアと指示をもとにAIツールを使って制作しました。',
  nl: 'Dit ontwerp is gemaakt met behulp van AI-tools, op basis van mijn eigen ideeën en prompts.',
  pl: 'Ten projekt powstał przy użyciu narzędzi AI na podstawie moich własnych pomysłów i poleceń.',
  pt:
    'Este design foi criado com a ajuda de ferramentas de IA a partir das minhas próprias ' +
    'ideias e instruções.',
  ru: 'Этот дизайн создан с помощью инструментов ИИ по моим собственным идеям и запросам.',
};
const BOTH: Notes = {
  en:
    'This design was created with the help of AI tools from my own ideas and prompts, and ' +
    'some photos are AI-generated scenes whose props are not included.',
  de:
    'Dieses Design wurde mit Hilfe von KI-Tools nach meinen eigenen Ideen und Vorgaben ' +
    'erstellt, und einige Fotos sind KI-generierte Szenen, deren Dekoration nicht im ' +
    'Lieferumfang enthalten ist.',
  es:
    'Este diseño se creó con ayuda de herramientas de IA a partir de mis propias ideas e ' +
    'indicaciones, y algunas fotos son escenas generadas con IA cuya decoración no está incluida.',
  fr:
    'Ce design a été créé à l’aide d’outils d’IA à partir de mes propres idées et consignes, ' +
    'et certaines photos sont des scènes générées par IA dont les accessoires de décor ne sont ' +
    'pas inclus.',
  it:
    'Questo design è stato creato con l’aiuto di strumenti di IA a partire dalle mie idee e ' +
    'indicazioni, e alcune foto sono scene generate con IA i cui oggetti di scena non sono inclusi.',
  ja:
    'このデザインは私自身のアイデアと指示をもとにAIツールを使って制作したもので、' +
    '一部の写真はAIで生成したシーンのため、写真内の小物は商品に含まれません。',
  nl:
    'Dit ontwerp is gemaakt met behulp van AI-tools op basis van mijn eigen ideeën en prompts, ' +
    'en sommige foto’s zijn met AI gemaakte scènes waarvan de decoratie niet wordt meegeleverd.',
  pl:
    'Ten projekt powstał przy użyciu narzędzi AI na podstawie moich własnych pomysłów i ' +
    'poleceń, a niektóre zdjęcia to sceny wygenerowane przez AI, których rekwizyty nie ' +
    'wchodzą w skład zamówienia.',
  pt:
    'Este design foi criado com a ajuda de ferramentas de IA a partir das minhas próprias ' +
    'ideias e instruções, e algumas fotos são cenas geradas por IA cujos objetos de ' +
    'decoração não estão incluídos.',
  ru:
    'Этот дизайн создан с помощью инструментов ИИ по моим собственным идеям и запросам, а ' +
    'некоторые фото — сцены, созданные ИИ, предметы декора на которых не входят в комплект.',
};
const SEPARATOR = '\n\n';
/** Longest first, so a note is never taken for part of a longer one. */
const ALL_NOTES = [BOTH, DESIGNS, SCENES]
  .flatMap((notes) => Object.values(notes))
  .sort((a, b) => b.length - a.length);

/** Characters a note takes in any language, which a description must leave free. */
export const AI_NOTE_ROOM = Math.max(...ALL_NOTES.map((note) => characterCount(SEPARATOR + note)));

/** The note for `use` in `language`, e.g. `de` or `en-US`; `null` when nothing needs telling. */
function aiNote(language: string, use: AiUse): string | null {
  const notes = use.designs ? (use.scenes ? BOTH : DESIGNS) : use.scenes ? SCENES : null;
  return notes && (notes[primaryLanguage(language)] ?? String(notes['en']));
}

/** The description without any note in any language, for checks of the words written for it. */
export function withoutAiNotes(description: string): string {
  return ALL_NOTES.reduce((text, note) => text.replaceAll(note, ''), description);
}

/**
 * The text with the note for `use` as the description's last paragraph, in
 * place of any note it held. The seller's words are never cut to make room.
 */
export function withAiNote(
  text: ListingText,
  language: string,
  use: AiUse,
  rules: Pick<ListingTextRules, 'descriptionLength'>,
): ListingText {
  const note = aiNote(language, use);
  if (note === null) return text;
  const description = withoutAiNotes(text.description).trimEnd();
  const room = rules.descriptionLength - characterCount(SEPARATOR + note);
  if (characterCount(description) > room) {
    throw new ValidationError(
      'description',
      `leave room for the note about AI in this listing: at most ${room} characters`,
    );
  }
  return { ...text, description: `${description}${SEPARATOR}${note}` };
}
