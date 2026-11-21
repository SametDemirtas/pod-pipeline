import { describe, expect, it } from 'vitest';
import { LISTING_RULES } from '@pod/rules';
import { withAiNote } from '../ai-note.js';
import type { ListingText } from '../listing-text.js';
import { findAiTells } from './find-ai-tells.js';

const described = (description: string, title = 'Tulip Mug'): ListingText => ({
  title,
  description,
  tags: ['tulip mug', 'halloween cup'],
});

const matches = (text: ListingText, language: string) =>
  findAiTells(text, language).map((tell) => tell.match);

const SHOP_LANGUAGES = ['en', 'de', 'es', 'fr', 'it', 'ja', 'nl', 'pl', 'pt', 'ru'];

describe('findAiTells', () => {
  const uses = [
    { scenes: true, designs: false },
    { scenes: false, designs: true },
    { scenes: true, designs: true },
  ];
  it.each(SHOP_LANGUAGES)('skips the notes about AI in %s', (language) => {
    for (const use of uses) {
      const noted = withAiNote(described('A mug with three tulips.'), language, use, LISTING_RULES);

      expect(findAiTells(noted, language)).toEqual([]);
    }
  });

  it('finds sure signs on their own, by category, field and wording', () => {
    expect(
      findAiTells(
        {
          title: 'Tulip Mug!',
          description: 'This is not just a mug, but a friend. Selling fast — order soon.',
          tags: ['handmade mug'],
        },
        'en-US',
      ),
    ).toEqual([
      { category: 'punctuation', field: 'description', match: 'fast — order' },
      { category: 'punctuation', field: 'title', match: 'Mug!' },
      { category: 'false-contrast', field: 'description', match: 'not just a mug, but' },
      { category: 'urgency', field: 'description', match: 'Selling fast' },
      { category: 'hype', field: 'tags', match: 'handmade' },
    ]);
  });

  it('counts a weak sign only with another sign', () => {
    expect(matches(described('A timeless print of a lighthouse.'), 'en')).toEqual([]);
    expect(matches(described('A timeless, stunning print of a lighthouse.'), 'en')).toEqual([
      'stunning',
      'timeless',
    ]);
    expect(matches(described('A timeless print. Look no further.'), 'en')).toEqual([
      'Look no further',
      'timeless',
    ]);
  });

  it('takes an opinion word in the title as a sure sign, as Etsy asks for none there', () => {
    expect(matches(described('A mug.', 'Tulip Mug, perfect for tea'), 'en')).toEqual(['perfect']);
    expect(matches(described('The perfect mug for tea.'), 'en')).toEqual([]);
  });

  it('leaves the design’s own words alone, and a title-case name in the title', () => {
    const sunflower = {
      title: 'Perfect Day Sunflower T-Shirt, Retro Floral Graphic Tee',
      description: 'A cotton t-shirt with a sunflower print that says Perfect Day.',
      tags: ['sunflower shirt'],
    };
    const mug = {
      title: 'Wonderful Life Christmas Mug, Vintage Holiday Coffee Cup',
      description: 'A white ceramic mug with a snowy village print.',
      tags: ['christmas mug'],
    };

    expect(findAiTells(sunflower, 'en', ['Perfect Day'])).toEqual([]);
    expect(findAiTells(mug, 'en', ['Wonderful Life'])).toEqual([]);
    expect(findAiTells(mug, 'en')).toEqual([]);
  });

  it('leaves the print’s quoted words alone', () => {
    const quoted = described(
      'A mug that says "Not just a mug, but a lifestyle" and „Nicht nur Kaffee, sondern Liebe“.',
    );

    expect(findAiTells(quoted, 'en')).toEqual([]);
    expect(findAiTells(quoted, 'de')).toEqual([]);
  });

  it('matches whole words in any case, with accents and typographic apostrophes', () => {
    expect(matches(described('WHETHER YOU’RE A CAT OR A DOG PERSON.'), 'en')).toContain(
      "WHETHER YOU'RE A CAT OR",
    );
    expect(matches(described('Une sublimation de couleurs.'), 'fr')).toEqual([]);
    expect(matches(described('Mit Liebe gemacht.'), 'de-AT')).toEqual(['Mit Liebe gemacht']);
  });

  it('treats dashes by the language’s own punctuation', () => {
    const spaced = described('A mug with tulips – and a pumpkin.');
    const em = described('Eine Tasse mit Geistern — und einem Kürbis.');

    expect(matches(spaced, 'en')).toEqual(['tulips – and']);
    expect(matches({ ...spaced, title: 'Mug – Tulip' }, 'de')).toEqual([
      'Mug – Tulip',
      'tulips – and',
    ]);
    expect(matches(em, 'de')).toEqual(['Geistern — und']);
    expect(matches(em, 'ru')).toEqual([]);
  });

  it('finds the marks of chat and of Markdown in any language', () => {
    expect(matches(described('**Spooky** mug 👻 for #halloween fans!!\n## Details'), 'ja')).toEqual(
      ['👻', '**Spooky**', '## Details', '#halloween', 'fans!!'],
    );
    expect(matches(described('A mug™ by Bella+Canvas® © 2024.'), 'en')).toEqual([]);
  });

  it('finds a question as the first sentence, and questions or exclamations in a row', () => {
    expect(matches(described('Need a mug? This one has tulips.'), 'en')).toEqual(['Need a mug?']);
    expect(
      matches(described('A mug. Do you love tulips? Do you love tea? It has both of them.'), 'en'),
    ).toEqual(['Do you love tulips?', 'Do you love tea?']);
    expect(matches(described('A mug with tulips! Great for tea!'), 'en')).toEqual([
      'A mug with tulips!',
      'Great for tea!',
    ]);
    expect(matches(described('A mug with tulips! For tea.'), 'en')).toEqual([]);
  });

  it('finds words in capitals and strings of fragments, but not sizes', () => {
    expect(
      matches(described('A shirt in sizes up to XXXL. It is SO SOFT and VERY WARM.'), 'en'),
    ).toEqual(['SO SOFT', 'VERY WARM']);
    expect(
      matches(described('PLEASE NOTE: colours may vary. A SOFT tee in UNISEX sizes.'), 'en'),
    ).toEqual([]);
    expect(matches(described('A tulip shirt. Soft. Warm. Yours.'), 'en')).toEqual([]);
    expect(
      matches(
        described('A shirt with a tulip. Soft. Warm. Yours. Truly a classic - honestly.'),
        'en',
      ),
    ).toEqual(['Soft. Warm. Yours.', 'classic - honestly']);
    expect(
      matches(described('A shirt.\n\nDetails\n- Cotton - soft\n- Printed to order'), 'en'),
    ).toEqual([]);
  });

  it('takes size and number ranges for ranges, not for dashes', () => {
    expect(
      matches(described('Available in S – 3XL. Sizes S - XL. Holds 11 – 15 oz.'), 'en'),
    ).toEqual([]);
  });

  it('counts a sign once wherever it stands, and not inside a sure sign', () => {
    expect(matches(described('A timeless mug.', 'Timeless Tulip Mug'), 'en')).toEqual([]);
    expect(matches(described('A cheerful print, perfect for any occasion.'), 'en')).toEqual([
      'perfect for any occasion',
    ]);
  });

  it('counts a list entry once however it is worded, as the lists were measured', () => {
    expect(matches(described('Per chi ama i gatti e per gli amanti dei libri.'), 'it')).toEqual([]);
    expect(matches(described('Per chi ama i gatti. Il regalo perfetto.'), 'it')).toEqual([
      'Il regalo perfetto',
      'Per chi ama',
    ]);
  });

  it('matches Spanish and Dutch lists without accents, and Italian with them', () => {
    expect(matches(described('Más que una simple taza.'), 'es')).toEqual(['Más que una simple']);
    expect(matches(described('Het is belangrijk om op te merken dat…'), 'nl')).toEqual([
      'Het is belangrijk om op te merken',
    ]);
    expect(matches(described('Perche la amerai: è leggera.'), 'it')).toEqual([]);
  });

  it('lets a list measured on human copy decide about dashes, emoji and questions', () => {
    expect(matches(described('¿Te gustan los gatos? Taza de 330 ml.'), 'es')).toEqual([]);
    expect(matches(described('Tazza in ceramica — stampa fronte e retro.'), 'it')).toEqual([]);
    expect(matches(described('Lámina A4 – papel mate 🌿'), 'es')).toEqual([]);
    expect(
      matches(described('Tazza in ceramica.', 'Tazza gatto, idea regalo originale'), 'it'),
    ).toEqual([]);
  });

  it('reports a tell inside another once, as the larger one', () => {
    expect(matches(described('Un tocco di magia per la cucina! Ordina ora!'), 'it')).toEqual([
      'Un tocco di magia per la cucina!',
      'Ordina ora!',
    ]);
  });

  it('checks tags only for claims and urgency', () => {
    expect(
      findAiTells(
        { title: 'Tulip Mug', description: 'A mug.', tags: ['stunning mug', 'timeless gift'] },
        'en',
      ),
    ).toEqual([]);
    expect(matches(described('A mug.', 'Tulip Mug'), 'en')).toEqual([]);
  });

  it('takes a colour code for a colour, not a hashtag', () => {
    expect(matches(described('Colour #FFCC00 print on a tee. Also in #fff.'), 'en')).toEqual([]);
  });

  it('checks only marks in a language without a list', () => {
    expect(matches(described('Nicht nur ein Becher, sondern ein Freund.'), 'sv')).toEqual([]);
  });
});
