import { beforeEach, describe, expect, it } from 'vitest';
import { LISTING_RULES } from '@pod/rules';
import { productFamilyId } from '../catalog/product-family.js';
import { ValidationError } from '../errors.js';
import { sampleConcept, sampleDesign } from '../testing/contract/index.js';
import {
  FakeCopywriter,
  FakeImagePreviews,
  FakePrintCatalog,
  FakeProductFacts,
  InMemoryCatalog,
  SAMPLE_FACTS,
  SAMPLE_MUG,
  SAMPLE_SHIRT,
} from '../testing/index.js';
import type { WriteListingTextDeps } from './write-listing-text.js';
import { WriteListingText } from './write-listing-text.js';

const THIRTEEN_TAGS = Array.from({ length: 13 }, (_, i) => `tulip tag ${i}`);

describe('WriteListingText', () => {
  let catalog: InMemoryCatalog;
  let writer: FakeCopywriter;
  let previews: FakeImagePreviews;
  let write: WriteListingText;

  const useCase = (deps: Partial<WriteListingTextDeps> = {}) =>
    new WriteListingText({
      query: catalog,
      printCatalog: new FakePrintCatalog([SAMPLE_MUG, SAMPLE_SHIRT]),
      previews,
      facts: new FakeProductFacts(),
      writer,
      rules: LISTING_RULES,
      ...deps,
    });

  beforeEach(async () => {
    catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01', 'Lantern Harbor'));
    await catalog.designs.save(sampleDesign('01-t-shirt'));
    await catalog.designs.save(sampleDesign('01-blanket'));
    await catalog.designs.save(sampleDesign('01-mug'));
    writer = new FakeCopywriter();
    previews = new FakeImagePreviews();
    write = useCase();
  });

  it('briefs the writer with the print, the product facts, the chosen variants and the notes', async () => {
    const written = await write.execute({
      designId: 'design-01-t-shirt',
      language: 'en-US',
      variantIds: ['4000', '4001'],
      keywords: [
        { term: ' halloween ', language: 'en-US', suggested: true, shops: 4 },
        { term: '' },
      ],
      notes: ' Mention soft cotton. ',
    });

    expect(writer.briefs).toEqual([
      {
        conceptName: 'Lantern Harbor',
        image: previews.image,
        productType: 't shirt',
        productName: 'Unisex Staple T-Shirt',
        facts: SAMPLE_FACTS,
        colors: ['Black'],
        sizes: ['M', 'L'],
        keywords: [{ term: 'halloween', language: 'en-US', suggested: true, shops: 4 }],
        notes: 'Mention soft cotton.',
        language: 'en-US',
      },
    ]);
    expect(written).toEqual({
      text: {
        title: 'Lantern Harbor t shirt',
        description: 'A t shirt with Lantern Harbor.',
        tags: ['t shirt', 'halloween'],
      },
      humanizer: { fixed: 0, left: [] },
    });
  });

  it('briefs every variant of the product when none are chosen', async () => {
    await write.execute({ designId: 'design-01-t-shirt', language: 'en-US' });

    expect(writer.briefs[0]).toMatchObject({ colors: ['Black', 'White'], sizes: ['M', 'L'] });
  });

  it('writes for a product the print provider does not make yet', async () => {
    await write.execute({ designId: 'design-01-blanket', language: 'en-US' });

    expect(writer.briefs[0]).toMatchObject({ productName: 'blanket', colors: [], sizes: [] });
  });

  it('writes without product details or a preview when they cannot be had', async () => {
    const offline = useCase({
      printCatalog: { findProduct: () => Promise.reject(new Error('Printful is not connected')) },
      previews: { preview: () => Promise.reject(new Error('Cannot decode')) },
    });

    await offline.execute({ designId: 'design-01-mug', language: 'en-US' });

    expect(writer.briefs[0]).toMatchObject({ productName: 'mug', sizes: [], image: undefined });
  });

  it('shows the writer the artwork upright, never the print file turned to fit', async () => {
    const upright = sampleDesign('01-blanket');
    const turned = sampleDesign('01-blanket', {
      revision: 2,
      asset: { ...upright.asset, sha256: 'sha-turned', storageKey: 'assets/sha-turned' },
      rotation: { degrees: 90, originalSha256: upright.asset.sha256, reason: 'The chair reads' },
    });
    await catalog.designs.save(turned);
    const seen: string[] = [];
    const sideways = useCase({
      previews: {
        preview: (asset) => {
          seen.push(asset.storageKey);
          return Promise.resolve(previews.image);
        },
      },
    });

    await sideways.execute({ designId: 'design-01-blanket', language: 'en-US' });

    expect(seen).toEqual([upright.asset.storageKey]);
    expect(writer.briefs[0]?.image).toEqual(previews.image);
  });

  it('finds the upright artwork behind a turned file that was made larger after', async () => {
    const upright = sampleDesign('01-blanket');
    const rotation = {
      degrees: 270,
      originalSha256: upright.asset.sha256,
      reason: 'Reads',
    } as const;
    const asset = (key: string) => ({ ...upright.asset, sha256: key, storageKey: key });
    await catalog.designs.save(
      sampleDesign('01-blanket', { revision: 2, asset: asset('turned'), rotation }),
    );
    await catalog.designs.save(
      sampleDesign('01-blanket', {
        revision: 3,
        asset: asset('larger'),
        rotation,
        upscale: { model: 'illustration', originalSha256: upright.asset.sha256 },
      }),
    );
    const seen: string[] = [];
    await useCase({
      previews: {
        preview: (shown) => {
          seen.push(shown.storageKey);
          return Promise.resolve(previews.image);
        },
      },
    }).execute({ designId: 'design-01-blanket', language: 'en-US' });

    expect(seen).toEqual([upright.asset.storageKey]);
  });

  it('asks once for a revision naming only the problems, then fits the answer', async () => {
    writer.write = () =>
      Promise.resolve({
        title: 'BEST TULIP MUG EVER',
        description: 'A mug.',
        tags: ['Geisterbecher Geschenk', ...THIRTEEN_TAGS.slice(1)],
      });

    const written = await write.execute({ designId: 'design-01-mug', language: 'de' });

    expect(writer.revisions).toEqual([
      {
        language: 'de',
        problems: [
          'The title has 4 words in capitals; use capitals only for short acronyms, at most 3.',
          'These tags are longer than 20 characters: "Geisterbecher Geschenk". Use shorter phrases instead.',
          'Only 12 tags are usable; give exactly 13.',
        ],
      },
    ]);
    expect(written.text.title).toBe('BEST TULIP MUG Ever');
    expect(written.text.tags).toHaveLength(12);
  });

  it('does not ask for a revision when the text keeps the rules', async () => {
    writer.write = () =>
      Promise.resolve({ title: 'Tulip Mug', description: 'A mug.', tags: THIRTEEN_TAGS });

    await write.execute({ designId: 'design-01-mug', language: 'en' });

    expect(writer.revisions).toEqual([]);
  });

  it('asks for trademarks to be replaced but leaves any that stay to the seller', async () => {
    writer.write = () =>
      Promise.resolve({
        title: 'Spooky Star Wars Mug',
        description: 'Printed on a Bella+Canvas blank.',
        tags: ['harry potter gift', 'NFL fan mug', ...THIRTEEN_TAGS.slice(2)],
      });

    const written = await write.execute({ designId: 'design-01-mug', language: 'en' });

    expect(writer.revisions[0]?.problems).toEqual([
      'The title or tags name trademarks: Star Wars, Harry Potter, NFL. Use generic words instead.',
    ]);
    expect(written.text.tags).toContain('harry potter gift');
  });

  it('states the blanket sizes the listing sells in inches and centimetres', async () => {
    const blanket = {
      familyId: productFamilyId('blanket'),
      productId: '395',
      name: 'Throw Blanket',
      variants: [
        { id: '13222', name: '60×80', color: null, size: '60″×80″', areas: [] },
        { id: '10986', name: '50×60', color: null, size: '50″×60″', areas: [] },
      ],
    };
    const sized = useCase({ printCatalog: new FakePrintCatalog([blanket]) });

    await sized.execute({ designId: 'design-01-blanket', language: 'en', variantIds: ['10986'] });
    await sized.execute({ designId: 'design-01-blanket', language: 'en' });

    expect(writer.briefs.map((brief) => brief.facts.size)).toEqual([
      '50″×60″ (127 × 152 cm)',
      '60″×80″ (152 × 203 cm), 50″×60″ (127 × 152 cm)',
    ]);
  });

  it('asks a Samsung case listing to leave out the iPhone', async () => {
    await catalog.designs.save(sampleDesign('01-samsung-case'));
    writer.write = () =>
      Promise.resolve({
        title: 'Lantern Harbor Samsung Case',
        description: 'Fits the Galaxy S25, like our iPhone case.',
        tags: THIRTEEN_TAGS,
      });

    await write.execute({ designId: 'design-01-samsung-case', language: 'en' });

    expect(writer.revisions[0]?.problems).toEqual([
      'The text names iPhone, which this product is not made for. Leave it out.',
    ]);
  });

  it('asks for a material the product facts do not state to be left out', async () => {
    const silky = useCase({
      facts: new FakeProductFacts({ ...SAMPLE_FACTS, material: '100% polyester, silk-touch' }),
    });
    writer.write = () =>
      Promise.resolve({
        title: 'Lantern Harbor Blanket',
        description: 'A silk-touch throw, fleece-style and soft.',
        tags: THIRTEEN_TAGS,
      });
    writer.revise = (text, problems, language) => {
      writer.revisions.push({ problems, language });
      return Promise.resolve({ ...text, description: 'A silk-touch throw, soft to the hand.' });
    };

    const written = await silky.execute({ designId: 'design-01-blanket', language: 'en-US' });

    expect(writer.revisions[0]?.problems).toEqual([
      'The text says "fleece", a material the product facts do not state. ' +
        'Leave it out, or name only the material the facts give.',
    ]);
    expect(written.text.description).toBe('A silk-touch throw, soft to the hand.');
  });

  it('lets the product’s own name state its material', async () => {
    const sherpa = useCase({
      printCatalog: new FakePrintCatalog([{ ...SAMPLE_MUG, name: 'Sherpa Fleece Mug' }]),
      facts: new FakeProductFacts({ ...SAMPLE_FACTS, material: '' }),
    });
    writer.write = () =>
      Promise.resolve({
        title: 'Lantern Harbor Mug',
        description: 'A sherpa fleece mug.',
        tags: THIRTEEN_TAGS,
      });

    await sherpa.execute({ designId: 'design-01-mug', language: 'en-US' });

    expect(writer.revisions).toEqual([]);
  });

  it('has phrases that read as machine-written rewritten and reports how many went', async () => {
    writer.write = () =>
      Promise.resolve({
        title: 'Tulip Mug',
        description: 'Elevate your mornings. This is not just a mug, but a friend.',
        tags: THIRTEEN_TAGS,
      });
    writer.revise = (text, problems, language) => {
      writer.revisions.push({ problems, language });
      return Promise.resolve({ ...text, description: 'A mug with a tulip, but a friendly one.' });
    };

    const written = await write.execute({ designId: 'design-01-mug', language: 'en-GB' });

    expect(writer.revisions[0]?.problems).toEqual([
      expect.stringContaining('"not just a mug, but"') as string,
      expect.stringContaining('"Elevate your"') as string,
    ]);
    expect(written.text.description).toBe('A mug with a tulip, but a friendly one.');
    expect(written.humanizer).toEqual({ fixed: 2, left: [] });
  });

  it('refuses too many keywords or long notes', async () => {
    const keywords = Array.from({ length: 21 }, (_, i) => ({ term: `k${i}` }));
    await expect(
      write.execute({ designId: 'design-01-t-shirt', language: 'en', keywords }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      write.execute({ designId: 'design-01-t-shirt', language: 'en', notes: 'x'.repeat(1001) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
