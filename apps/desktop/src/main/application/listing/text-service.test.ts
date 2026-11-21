import { LISTING_RULES } from '@pod/rules';
import { describe, expect, it } from 'vitest';
import { MARKETS, TranslateListingText, WriteListingText } from '@pod/core';
import { sampleConcept, sampleDesign } from '@pod/core/testing/contract';
import {
  FakeCopywriter,
  FakeImagePreviews,
  FakePrintCatalog,
  FakeProductFacts,
  InMemoryCatalog,
} from '@pod/core/testing';
import { TextService } from './text-service.js';

/** A writer that declines to translate into the languages given. */
async function setUp(declined: readonly string[] = []) {
  const catalog = new InMemoryCatalog();
  await catalog.concepts.save(sampleConcept('01', 'Lantern Harbor'));
  await catalog.designs.save(sampleDesign('01-mug'));
  const writer = new FakeCopywriter();
  const translate = writer.translate.bind(writer);
  writer.translate = (text, language) =>
    declined.includes(language) ? Promise.reject(new Error('declined')) : translate(text, language);
  const service = new TextService(
    new WriteListingText({
      query: catalog,
      printCatalog: new FakePrintCatalog(),
      previews: new FakeImagePreviews(),
      facts: new FakeProductFacts(),
      writer,
      rules: LISTING_RULES,
    }),
    new TranslateListingText(writer, LISTING_RULES),
  );
  return { service, writer };
}

const TEXT = {
  title: 'Lantern Harbor mug',
  description: 'A mug with Lantern Harbor.',
  tags: ['mug'],
};

describe('TextService', () => {
  it('writes listing text as a plain DTO', async () => {
    const { service } = await setUp();

    expect(
      await service.writeListingText({ designId: 'design-01-mug', language: 'en-US' }),
    ).toMatchObject({ title: 'Lantern Harbor mug', humanizer: { fixed: 0, left: [] } });
  });

  it('tells the writer the language a researched word is in, not its market', async () => {
    const { service, writer } = await setUp();

    await service.writeListingText({
      designId: 'design-01-mug',
      language: 'en-US',
      keywords: [
        { term: 'geister tasse', market: 'DE', shops: 3 },
        { term: 'tulip cup', market: 'GB' },
        { term: 'tea' },
      ],
    });

    expect(writer.briefs[0]?.keywords).toEqual([
      { term: 'geister tasse', language: MARKETS.DE.language, shops: 3 },
      { term: 'tulip cup', language: MARKETS.GB.language },
      { term: 'tea' },
    ]);
  });

  it('keeps the translations made and names the languages that failed', async () => {
    const { service } = await setUp(['fr']);

    expect(await service.translateListingText({ ...TEXT, languages: ['de', 'fr'] })).toEqual({
      translations: [
        {
          language: 'de',
          title: '[de] Lantern Harbor mug',
          description: '[de] A mug with Lantern Harbor.',
          tags: ['mug'],
          humanizer: { fixed: 0, left: [] },
        },
      ],
      failed: ['fr'],
    });
  });

  it('has a translation naming a brand the product is not made for revised', async () => {
    const { service, writer } = await setUp();
    writer.translate = (text) =>
      Promise.resolve({ ...text, description: 'Passt auf jedes Samsung Galaxy.' });

    await service.translateListingText({ ...TEXT, languages: ['de'], familyId: 'phone-case' });
    await service.translateListingText({ ...TEXT, languages: ['de'], familyId: 'samsung-case' });

    const [phoneCase, samsungCase] = writer.revisions.map(({ problems }) => problems.join(' '));
    expect(phoneCase).toContain('names Samsung');
    expect(samsungCase ?? '').not.toContain('Samsung');
  });

  it('passes the failure on when no language could be translated', async () => {
    const { service } = await setUp(['de', 'fr']);

    await expect(
      service.translateListingText({ ...TEXT, languages: ['de', 'fr'] }),
    ).rejects.toThrow('declined');
  });

  it('finds trademarks and machine-written phrases, but not in the design name', async () => {
    const { service } = await setUp();

    expect(
      await service.checkListingText({
        language: 'en-US',
        title: 'Zelda Mug, Perfect Day',
        description: 'Elevate your tea.',
        tags: ['nfl gift'],
        designName: 'Perfect Day',
      }),
    ).toEqual({
      trademarks: ['Zelda', 'NFL'],
      aiTells: [{ category: 'hype', field: 'description', match: 'Elevate your' }],
    });
    expect(
      await service.checkListingText({
        language: 'en',
        title: 'Mug, perfect',
        description: 'A mug.',
        tags: [],
      }),
    ).toEqual({
      trademarks: [],
      aiTells: [{ category: 'vague-praise', field: 'title', match: 'perfect' }],
    });
  });

  it('finds nothing in plain text', async () => {
    const { service } = await setUp();

    expect(await service.checkListingText({ language: 'en', ...TEXT })).toEqual({
      trademarks: [],
      aiTells: [],
    });
  });
});
