import { describe, expect, it } from 'vitest';
import { LISTING_RULES } from '@pod/rules';
import { withAiNote } from './ai-note.js';
import { finishWrittenText, writtenTextProblems } from './finish-written-text.js';
import type { ListingText } from './listing-text.js';

const tags = Array.from({ length: 13 }, (_, i) => `tag ${i}`);
const clean = { fixed: 0, left: [] };
const en = { rules: LISTING_RULES, language: 'en', designWords: [] };

describe('writtenTextProblems', () => {
  it('names a title Etsy would cut and text Etsy would refuse', () => {
    expect(
      writtenTextProblems({ title: 'word '.repeat(30), description: ' ', tags }, LISTING_RULES),
    ).toEqual([
      'The title has 149 characters; the marketplace allows 140.',
      'description: is empty.',
    ]);
  });

  it('names trademarks in the title or tags as a problem', () => {
    expect(
      writtenTextProblems({ title: 'Star Wars Mug', description: 'A mug.', tags }, LISTING_RULES),
    ).toEqual(['The title or tags name trademarks: Star Wars. Use generic words instead.']);
  });
});

describe('finishWrittenText', () => {
  const never = () => Promise.reject(new Error('not asked'));

  it('keeps clean text and does not ask for a revision', async () => {
    const text = { title: 'Tulip Mug', description: 'A mug.', tags };

    expect(await finishWrittenText(text, en, never)).toEqual({ text, humanizer: clean });
  });

  it('cuts a long description so the note about AI still fits', async () => {
    const description = 'A tulip mug. '.repeat(780).trim();

    const { text } = await finishWrittenText({ title: 'Tulip Mug', description, tags }, en, () =>
      Promise.resolve({ title: 'Tulip Mug', description, tags }),
    );

    expect(() =>
      withAiNote(text, 'de', { designs: true, scenes: true }, LISTING_RULES),
    ).not.toThrow();
  });

  it('asks for a brand the product is not made for to be left out', async () => {
    const samsung = { title: 'Tulip Case', description: 'Fits iPhone 16 and Galaxy S25.', tags };
    const asked: (readonly string[])[] = [];

    const finished = await finishWrittenText(
      samsung,
      { ...en, otherBrands: ['iPhone'] },
      (problems) => {
        asked.push(problems);
        return Promise.resolve({ ...samsung, description: 'Fits the Galaxy S25.' });
      },
    );

    expect(asked).toEqual([
      ['The text names iPhone, which this product is not made for. Leave it out.'],
    ]);
    expect(finished.text.description).toBe('Fits the Galaxy S25.');
  });

  it('fits the revision', async () => {
    const revised = await finishWrittenText(
      { title: 'Tulip Mug', description: 'A mug.', tags: [] },
      en,
      () => Promise.resolve({ title: 'Tulip Mug $5', description: 'A mug.', tags }),
    );

    expect(revised.text.title).toBe('Tulip Mug 5');
  });

  it('fits the first text when the revision fails', async () => {
    const fitted = await finishWrittenText(
      { title: 'LANTERN HARBOR CAFE MUG', description: 'A mug.', tags },
      en,
      () => Promise.reject(new Error('overloaded')),
    );

    expect(fitted.text.title).toBe('LANTERN HARBOR CAFE Mug');
  });

  it('keeps the first text when the revision has as many problems or more', async () => {
    const first = { title: 'Tulip Mug', description: 'A mug.', tags: tags.slice(1) };
    const worse = { title: 'LANTERN HARBOR CAFE MUG', description: 'A mug.', tags: [] };

    expect((await finishWrittenText(first, en, () => Promise.resolve(worse))).text).toEqual(first);
  });

  it('keeps the first text when the revision is empty, though it names fewer problems', async () => {
    const first = {
      title: `${'word '.repeat(30)}MUG LANTERN HARBOR CAFE`,
      description: 'A mug.',
      tags: ['harry potter fan gift'],
    };
    const empty = { title: '', description: '', tags };

    const { text } = await finishWrittenText(first, en, () => Promise.resolve(empty));

    expect(text.description).toBe('A mug.');
    expect(text.tags).toEqual([]);
  });
});

describe('finishWrittenText with the humanizer', () => {
  const machine: ListingText = {
    title: 'Tulip Mug',
    description: 'Whether you’re a night owl or an early bird, this mug is for you — enjoy.',
    tags,
  };

  it('asks for the tells to be rewritten, one problem per kind, after the rules', async () => {
    let asked: readonly string[] = [];
    await finishWrittenText({ ...machine, tags: tags.slice(1) }, en, (problems) => {
      asked = problems;
      return Promise.resolve(machine);
    });

    expect(asked).toEqual([
      'Only 12 tags are usable; give exactly 13.',
      'These phrases read as machine-written because they open with a stock sales formula. ' +
        'Start with what the item is: "Whether you\'re a night owl or". Rewrite each sentence ' +
        'in your own plain words rather than swapping in a synonym.',
      'These phrases read as machine-written because they use marks a shop owner would not ' +
        'type. Use a comma, a full stop, a colon or brackets instead of dashes between words, ' +
        'and no emoji, Markdown, hashtags or runs of ! and ?: "you — enjoy.". Rewrite each ' +
        'sentence in your own plain words rather than swapping in a synonym.',
    ]);
  });

  it('keeps a revision with fewer tells and counts those it took out', async () => {
    const revised = { ...machine, description: 'A mug for night owls, with an owl — asleep.' };

    expect(await finishWrittenText(machine, en, () => Promise.resolve(revised))).toEqual({
      text: revised,
      humanizer: {
        // Both phrases of the first draft went; the dash is a new one.
        fixed: 2,
        left: [{ category: 'punctuation', field: 'description', match: 'owl — asleep.' }],
      },
    });
  });

  it('keeps the first text and its tells when the revision has as many', async () => {
    const swapped = { ...machine, description: 'Whether you’re tired or not, drink — now.' };

    const finished = await finishWrittenText(machine, en, () => Promise.resolve(swapped));

    expect(finished.text).toEqual(machine);
    expect(finished.humanizer.fixed).toBe(0);
    expect(finished.humanizer.left).toHaveLength(2);
  });

  it('keeps a revision that breaks fewer rules though it reads more machine-written', async () => {
    const first = { title: 'Tulip Mug', description: 'A mug.', tags: tags.slice(1) };

    const finished = await finishWrittenText(first, en, () => Promise.resolve(machine));

    expect(finished.text).toEqual(machine);
    expect(finished.humanizer).toMatchObject({ fixed: 0, left: [{}, {}] });
  });

  it('reports nothing fixed when the revision fails', async () => {
    const finished = await finishWrittenText(machine, en, () => Promise.reject(new Error('down')));

    expect(finished.text).toEqual(machine);
    expect(finished.humanizer).toMatchObject({ fixed: 0, left: [{}, {}] });
  });

  it('refuses a revision that brings in a trademark', async () => {
    const branded = { ...machine, description: 'A Star Wars mug.', title: 'Star Wars Tulip Mug' };

    const finished = await finishWrittenText(machine, en, () => Promise.resolve(branded));

    expect(finished.text).toEqual(machine);
    expect(finished.humanizer.fixed).toBe(0);
  });

  it('refuses a revision of tells only that drops the search phrase leading the title', async () => {
    const first = {
      title: 'Sunflower T-Shirt, Retro Floral Tee',
      description: 'Elevate your summer with a sunflower tee.',
      tags,
    };
    const lost = { ...first, title: 'Floral Tee', description: 'A tee with a sunflower.' };
    const kept = { ...first, title: 'Sunflower T-Shirt', description: 'A tee with a sunflower.' };

    expect((await finishWrittenText(first, en, () => Promise.resolve(lost))).text).toEqual(first);
    expect((await finishWrittenText(first, en, () => Promise.resolve(kept))).text).toEqual(kept);
  });

  it('lets a revision drop the tells that stood in the search phrase', async () => {
    const first = { title: 'Tulip Mug, perfect gift', description: 'A mug.', tags };
    const revised = { ...first, title: 'Tulip Mug, Halloween Cup' };

    expect(await finishWrittenText(first, en, () => Promise.resolve(revised))).toEqual({
      text: revised,
      humanizer: { fixed: 1, left: [] },
    });
  });

  it('never counts the design’s own words', async () => {
    const named = { title: 'Perfect Day Sunflower T-Shirt, perfect', description: 'A tee.', tags };

    const finished = await finishWrittenText(
      named,
      { ...en, designWords: ['Perfect Day', null] },
      () => Promise.resolve(named),
    );

    expect(finished.humanizer.left).toEqual([
      { category: 'vague-praise', field: 'title', match: 'perfect' },
    ]);
  });

  it('never blocks the text when the tells stay', async () => {
    const finished = await finishWrittenText(machine, en, () => Promise.resolve(machine));

    expect(finished.text).toEqual(machine);
  });
});
