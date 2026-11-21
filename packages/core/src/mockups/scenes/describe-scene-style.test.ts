import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../errors.js';
import type { PreviewImage } from '../../ports/previews.js';
import { sampleConcept, sampleDesign } from '../../testing/contract/index.js';
import { FakeStyleReader, InMemoryCatalog } from '../../testing/index.js';
import { DescribeSceneStyle, MAX_STYLE_LENGTH } from './describe-scene-style.js';
import type { LookChoices } from './scene-look.js';

const reference: PreviewImage = { data: new Uint8Array([255, 216]), mimeType: 'image/jpeg' };

describe('DescribeSceneStyle', () => {
  let reader: FakeStyleReader;
  let describeStyle: DescribeSceneStyle;

  const run = (designId = 'design-01-phone-case') => describeStyle.execute({ designId, reference });
  const answer = (
    description: string | null,
    visibleWords: string[] = [],
    look: LookChoices = {},
  ) => ({ description, visibleWords, look });

  beforeEach(async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-phone-case'));
    reader = new FakeStyleReader();
    describeStyle = new DescribeSceneStyle({ query: catalog, reader });
  });

  it("asks once for the style for the design's product and tidies the description", async () => {
    reader.answers = [answer('  Place the phone case from the photo   on a linen cloth.  ')];

    expect(await run()).toEqual({
      found: true,
      description: 'Place the phone case from the photo on a linen cloth.',
      look: {},
    });
    expect(reader.requests).toEqual([{ reference, productType: 'phone case', avoid: [] }]);
  });

  it('says when the reference shows nothing usable', async () => {
    reader.answers = [answer(null, ['SALE'])];

    expect(await run()).toEqual({ found: false, reason: 'nothingUsable' });
    expect(reader.requests).toHaveLength(1);
  });

  it.each([
    ['two words in a row', 'Place it by a sign reading open daily.', ['OPEN DAILY'], 'open daily'],
    ['a name', 'Place it beside a Moonbrew mug.', ['MOONBREW Coffee Co.'], 'moonbrew'],
    ['a word no scene needs', 'Place it near moonbrew beans.', ['Moonbrew'], 'moonbrew'],
    [
      'a two-word name made of scene words',
      'Place it next to a Blue Day sign.',
      ['BLUE DAY roasters'],
      'blue day',
    ],
    ['a quoted slogan', 'Place it under a banner saying “hello”.', [], '“'],
    ['a trademark sign', 'Place it next to a Cola® bottle.', [], '®'],
  ])(
    'asks again without %s, then drops a description that still has it',
    async (_case, text, seen, word) => {
      reader.answers = [answer(text, seen)];

      expect(await run()).toEqual({ found: false, reason: 'copiedText' });
      expect(reader.requests.map((request) => request.avoid)).toEqual([
        [],
        expect.arrayContaining([word]) as string[],
      ]);
    },
  );

  it('keeps the second description when it no longer repeats the words', async () => {
    reader.answers = [
      answer('Place it beside a Moonbrew mug.', ['MOONBREW']),
      answer('Place it beside a plain mug.', ['MOONBREW']),
    ];

    expect(await run()).toEqual({
      found: true,
      description: 'Place it beside a plain mug.',
      look: {},
    });
  });

  it('allows plain scene words, common words and the product type the reference also shows', async () => {
    reader.answers = [
      answer('Coffee beans lie next to the phone case on a wooden table with a plant.', [
        'The Phone Case Shop',
        'coffee',
        'with love',
      ]),
    ];

    expect(await run()).toMatchObject({ found: true });
    expect(reader.requests).toHaveLength(1);
  });

  it('allows a holiday word the reference shows, even capitalised', async () => {
    reader.answers = [
      answer('Place the phone case beside a Christmas tree with warm fairy lights.', [
        'Merry Christmas',
      ]),
    ];

    expect(await run()).toMatchObject({ found: true });
    expect(reader.requests).toHaveLength(1);
  });

  it('shortens a long description to its last whole sentence or word', async () => {
    const sentence = 'Soft window light falls on the desk. ';
    reader.answers = [answer(sentence.repeat(30))];
    const shortened = await run();
    reader.answers = [answer('word '.repeat(200))];
    const cut = await run();
    reader.answers = [answer('x'.repeat(700))];
    const unbroken = await run();

    expect(shortened).toEqual({
      found: true,
      description: sentence.repeat(16).trimEnd(),
      look: {},
    });
    for (const result of [shortened, cut, unbroken]) {
      expect(result.found && result.description.length).toBeLessThanOrEqual(MAX_STYLE_LENGTH);
    }
    expect(cut.found && cut.description.endsWith('word')).toBe(true);
  });

  it("suggests the look the reader saw, without a view the product's family is not offered", async () => {
    const look = { lighting: 'softDaylight', cameraHeight: 'topDown' } as const;
    reader.answers = [answer('Place the phone case on a linen cloth.', [], look)];

    expect(await run()).toMatchObject({ look });

    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-mug'));
    const forMug = new DescribeSceneStyle({ query: catalog, reader });
    const mug = await forMug.execute({ designId: 'design-01-mug', reference });
    expect(mug.found && mug.look).toEqual({ lighting: 'softDaylight' });
  });

  it('refuses an unknown design', async () => {
    await expect(run('design-99-mug')).rejects.toBeInstanceOf(NotFoundError);
  });
});
