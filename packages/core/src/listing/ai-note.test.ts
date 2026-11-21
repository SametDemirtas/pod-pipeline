import { describe, expect, it } from 'vitest';
import { characterCount, LISTING_LIMITS, LISTING_RULES } from '@pod/rules';
import { ValidationError } from '../errors.js';
import { AI_NOTE_ROOM, withAiNote, withoutAiNotes } from './ai-note.js';

const text = { title: 'Tulip Mug', description: 'A mug.\n', tags: [] };
const SCENES = 'Some photos are AI-generated scenes. Props in them are not included.';
const DESIGNS = 'This design was created with the help of AI tools from my own ideas and prompts.';
const scenes = { scenes: true, designs: false };
const designs = { scenes: false, designs: true };
const both = { scenes: true, designs: true };
const LANGUAGES = ['en', 'de', 'es', 'fr', 'it', 'ja', 'nl', 'pl', 'pt', 'ru'];

/** The note added to an empty description. */
const noteIn = (language: string, use: typeof both) =>
  withAiNote({ ...text, description: '' }, language, use, LISTING_RULES).description.trim();

describe('withAiNote', () => {
  it('adds the note in the language once, in English for languages it lacks', () => {
    const noted = withAiNote(text, 'fr-FR', scenes, LISTING_RULES);

    expect(noted.description).toBe(
      'A mug.\n\nCertaines photos sont des scènes générées par IA. Les accessoires de décor ne sont pas inclus.',
    );
    expect(withAiNote(noted, 'fr', scenes, LISTING_RULES)).toEqual(noted);
    expect(withAiNote(text, 'sv', scenes, LISTING_RULES).description).toBe(`A mug.\n\n${SCENES}`);
    expect(withAiNote(text, 'en-GB', designs, LISTING_RULES).description).toBe(
      `A mug.\n\n${DESIGNS}`,
    );
  });

  it('puts the note needed now in place of one the description held', () => {
    const noted = withAiNote(text, 'en', scenes, LISTING_RULES);

    expect(withAiNote(noted, 'en', both, LISTING_RULES).description).toBe(
      `A mug.\n\n${withAiNote({ ...text, description: '' }, 'en', both, LISTING_RULES).description.trim()}`,
    );
  });

  it('leaves the text alone when nothing needs telling', () => {
    expect(withAiNote(text, 'en', { scenes: false, designs: false }, LISTING_RULES)).toBe(text);
  });

  it('says both in one sentence of its own in every shop language', () => {
    expect(noteIn('en', both)).toBe(
      'This design was created with the help of AI tools from my own ideas and prompts, and ' +
        'some photos are AI-generated scenes whose props are not included.',
    );
    for (const language of LANGUAGES) {
      const combined = noteIn(language, both);
      const separate = [noteIn(language, scenes), noteIn(language, designs)];

      expect(separate).not.toContain(combined);
      expect(separate.every((note) => !combined.includes(note))).toBe(true);
      // One sentence: a single full stop, at the end.
      expect(combined.match(/[.。]/g)).toHaveLength(1);
    }
  });

  it('has a note of its own in each shop language', () => {
    const notes = LANGUAGES.flatMap((language) =>
      [designs, both].map((use) => noteIn(language, use)),
    );

    expect(new Set(notes).size).toBe(notes.length);
  });

  it('reserves room for the longest note in any language, as the window does', () => {
    const longest = Math.max(
      ...LANGUAGES.flatMap((language) =>
        [scenes, designs, both].map((use) => characterCount(`\n\n${noteIn(language, use)}`)),
      ),
    );

    expect(AI_NOTE_ROOM).toBe(longest);
    expect(LISTING_LIMITS.aiNote).toBe(AI_NOTE_ROOM);
  });

  it('refuses a description with no room left for the note instead of cutting it', () => {
    const room = LISTING_LIMITS.description - DESIGNS.length - 2;
    const fits = { ...text, description: 'x'.repeat(room) };

    expect(withAiNote(fits, 'en', designs, LISTING_RULES).description).toHaveLength(
      LISTING_LIMITS.description,
    );
    expect(() =>
      withAiNote({ ...text, description: 'x'.repeat(room + 1) }, 'en', designs, LISTING_RULES),
    ).toThrow(ValidationError);
    expect(() =>
      withAiNote({ ...text, description: 'x'.repeat(room + 1) }, 'en', designs, LISTING_RULES),
    ).toThrow(`at most ${room} characters`);
  });
});

describe('withoutAiNotes', () => {
  it('takes every note out, the combined one whole', () => {
    for (const language of LANGUAGES) {
      for (const use of [scenes, designs, both]) {
        expect(
          withoutAiNotes(withAiNote(text, language, use, LISTING_RULES).description).trim(),
        ).toBe('A mug.');
      }
    }
  });
});
