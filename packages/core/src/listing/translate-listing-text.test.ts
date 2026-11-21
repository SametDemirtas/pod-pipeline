import { beforeEach, describe, expect, it } from 'vitest';
import { LISTING_RULES } from '@pod/rules';
import { productFamilyId } from '../catalog/product-family.js';
import { ValidationError } from '../errors.js';
import { FakeCopywriter } from '../testing/index.js';
import { TranslateListingText } from './translate-listing-text.js';

const text = { title: 'Tulip Mug', description: 'Nice.', tags: ['tulip'] };

describe('TranslateListingText', () => {
  let writer: FakeCopywriter;
  let translate: TranslateListingText;

  beforeEach(() => {
    writer = new FakeCopywriter();
    translate = new TranslateListingText(writer, LISTING_RULES);
  });

  it('translates into each language once', async () => {
    expect(await translate.execute(text, ['de', 'fr', 'de'])).toEqual({
      translations: [
        {
          language: 'de',
          text: { title: '[de] Tulip Mug', description: '[de] Nice.', tags: ['tulip'] },
          humanizer: { fixed: 0, left: [] },
        },
        {
          language: 'fr',
          text: { title: '[fr] Tulip Mug', description: '[fr] Nice.', tags: ['tulip'] },
          humanizer: { fixed: 0, left: [] },
        },
      ],
      failed: [],
    });
    await expect(
      translate.execute(
        text,
        Array.from({ length: 11 }, (_, i) => `l${i}`),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('asks for a revision in the same language when a tag got too long', async () => {
    writer.translate = () => Promise.resolve({ ...text, tags: ['Gespensterkaffeebecher'] });

    await translate.execute(text, ['de']);

    expect(writer.revisions[0]).toMatchObject({
      language: 'de',
      problems: expect.arrayContaining([
        expect.stringContaining('"Gespensterkaffeebecher"') as string,
      ]) as string[],
    });
  });

  it('asks for a revision when a translation names a brand the product is not made for', async () => {
    writer.translate = () =>
      Promise.resolve({ ...text, description: 'Passt auf jedes Samsung Galaxy.' });

    await translate.execute(text, ['de'], productFamilyId('phone-case'));
    await translate.execute(text, ['de'], productFamilyId('samsung-case'));

    const [phoneCase, samsungCase] = writer.revisions.map(({ problems }) => problems.join(' '));
    expect(phoneCase).toContain('names Samsung');
    expect(samsungCase).not.toContain('Samsung');
  });

  it('asks for a revision when a translation names a material the listing does not', async () => {
    const source = { ...text, description: 'A throw of 100% polyester.' };
    writer.translate = () =>
      Promise.resolve({ ...text, description: 'Eine Fleecedecke aus 100% Polyester.' });

    await translate.execute(source, ['de']);

    expect(writer.revisions[0]?.problems.join(' ')).toContain('"Fleecedecke"');
    expect(writer.revisions[0]?.problems.join(' ')).not.toContain('Polyester');
  });

  it('reports the languages that failed and keeps the others', async () => {
    const translateOne = writer.translate.bind(writer);
    writer.translate = (source, language) =>
      language === 'fr' ? Promise.reject(new Error('declined')) : translateOne(source, language);

    const result = await translate.execute(text, ['de', 'fr']);

    expect(result.translations.map((translation) => translation.language)).toEqual(['de']);
    expect(result.failed).toEqual(['fr']);
    await expect(translate.execute(text, ['fr'])).rejects.toThrow('declined');
  });
});
