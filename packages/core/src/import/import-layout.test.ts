import { describe, expect, it } from 'vitest';
import { DEFAULT_PRODUCT_FAMILIES } from '../catalog/default-families.js';
import { ProductFamilyCatalog } from '../catalog/product-family.js';
import type { SourceFile } from '../ports/files.js';
import { ConceptFolderLayout } from './import-layout.js';

const layout = new ConceptFolderLayout(new ProductFamilyCatalog(DEFAULT_PRODUCT_FAMILIES));

function files(...relativePaths: string[]): SourceFile[] {
  return relativePaths.map((relativePath) => ({
    relativePath,
    absolutePath: `/root/${relativePath}`,
    byteSize: 10,
  }));
}

const SHARED = { shareArtwork: true };

function plannedOf(...relativePaths: string[]) {
  return layout
    .interpret(files(...relativePaths), SHARED)
    .planned.map((item) => [item.designKey, item.conceptKey, item.conceptName, item.family.id]);
}

describe('ConceptFolderLayout', () => {
  it('only looks one folder deep', () => {
    expect(layout.maxDepth).toBe(1);
  });

  it('maps concept folders and family file names to design keys', () => {
    const result = layout.interpret(
      files(
        '01. Tasarım - Lantern Harbor/Kupa.png',
        '01. Tasarım - Lantern Harbor/Telefon Kılıfı.png',
        '01. Tasarım - Lantern Harbor/Battaniye.PNG',
        '2 Frost Garden/mug.jpg',
      ),
      SHARED,
    );

    expect(result.skipped).toEqual([]);
    expect(
      result.planned.map((item) => [
        item.designKey,
        item.conceptKey,
        item.conceptName,
        item.family.id,
        item.file.relativePath,
      ]),
    ).toEqual([
      [
        '01-blanket',
        '01',
        'Lantern Harbor',
        'blanket',
        '01. Tasarım - Lantern Harbor/Battaniye.PNG',
      ],
      ['01-mug', '01', 'Lantern Harbor', 'mug', '01. Tasarım - Lantern Harbor/Kupa.png'],
      [
        '01-phone-case',
        '01',
        'Lantern Harbor',
        'phone-case',
        '01. Tasarım - Lantern Harbor/Telefon Kılıfı.png',
      ],
      [
        '01-samsung-case',
        '01',
        'Lantern Harbor',
        'samsung-case',
        '01. Tasarım - Lantern Harbor/Telefon Kılıfı.png',
      ],
      ['02-mug', '02', 'Frost Garden', 'mug', '2 Frost Garden/mug.jpg'],
    ]);
  });

  it.each([
    ['07) Snowy Night', 'Snowy Night'],
    ['07_Snowy   Night', 'Snowy Night'],
    ['007 - Label - Snowy Night', 'Label - Snowy Night'],
    ['07. Tulip - The Musical', 'Tulip - The Musical'],
    ['07 \u2013 Snowy Night', 'Snowy Night'],
    ['07. Design \u2013 Snowy Night', 'Snowy Night'],
    ['07. Tasarım \u2014 Snowy Night', 'Snowy Night'],
    ['07. Tulip \u2013 The Musical', 'Tulip \u2013 The Musical'],
    ['07. Konzept - Snowy Night', 'Konzept - Snowy Night'],
    ['07. Tasarım - Snowy Night', 'Snowy Night'],
    ['7. Design - Tulip - The Musical', 'Tulip - The Musical'],
    ['7', null],
    ['07.', null],
  ])('reads concept folder %j as name %j', (folder, name) => {
    expect(plannedOf(`${folder}/Mug.png`)).toEqual([['07-mug', '07', name, 'mug']]);
  });

  it.each(['2024 Winter', '12345 Foo', '01Tulip', '0. Zero', 'Tulip 01', ''])(
    'does not treat %j as a concept folder',
    (folder) => {
      const result = layout.interpret(files(`${folder}/Mug.png`), SHARED);

      expect(result.planned).toEqual([]);
      expect(result.skipped[0]?.reason).toBe(folder ? 'missing-concept-number' : 'invalid-path');
    },
  );

  it('normalises concept names to NFC', () => {
    const decomposed = '01. Karışık'.normalize('NFD');

    expect(plannedOf(`${decomposed}/Mug.png`, '01. Karışık/Decke.png')).toEqual([
      ['01-blanket', '01', 'Karışık', 'blanket'],
      ['01-mug', '01', 'Karışık', 'mug'],
    ]);
  });

  it('accepts flat files named with concept number and product name, without a concept name', () => {
    expect(
      plannedOf(
        '01 Kupa.png',
        '07-tshirt.jpg',
        '12_Decke.jpeg',
        '3 Telefon Kılıfı.PNG',
        '100 Mug.png',
      ),
    ).toEqual([
      ['01-mug', '01', null, 'mug'],
      ['03-phone-case', '03', null, 'phone-case'],
      ['03-samsung-case', '03', null, 'samsung-case'],
      ['07-t-shirt', '07', null, 't-shirt'],
      ['12-blanket', '12', null, 'blanket'],
      ['100-mug', '100', null, 'mug'],
    ]);
  });

  it('makes no Samsung case from a phone case file when the seller turned that off', () => {
    const result = layout.interpret(files('01. Tulip/Phone Case.png'), { shareArtwork: false });

    expect(result.planned.map((item) => item.designKey)).toEqual(['01-phone-case']);
  });

  it('names a shared file once when its designs clash with others', () => {
    const result = layout.interpret(files('01. Tulip/Phone Case.png', '01 Phone Case.png'), SHARED);

    expect(result.skipped).toEqual([
      { relativePath: '01 Phone Case.png', reason: 'duplicate-design-key' },
      { relativePath: '01. Tulip/Phone Case.png', reason: 'duplicate-design-key' },
    ]);
  });

  it('makes a Samsung case from its own file when the concept has one', () => {
    const result = layout.interpret(
      files('01. Tulip/Phone Case.png', '01. Tulip/Samsung Case.png'),
      SHARED,
    );

    expect(
      result.planned.map((item) => [item.designKey, item.file.relativePath, item.borrowed]),
    ).toEqual([
      ['01-phone-case', '01. Tulip/Phone Case.png', false],
      ['01-samsung-case', '01. Tulip/Samsung Case.png', false],
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('does not accept letter codes for products', () => {
    expect(layout.interpret(files('01B.png', '7A.JPG'), SHARED).skipped).toEqual([
      { relativePath: '01B.png', reason: 'missing-product-name' },
      { relativePath: '7A.JPG', reason: 'missing-product-name' },
    ]);
  });

  it('combines a named folder with flat files of the same concept', () => {
    expect(plannedOf('01. Tulip/Mug.png', '01-blanket.png')).toEqual([
      ['01-blanket', '01', null, 'blanket'],
      ['01-mug', '01', 'Tulip', 'mug'],
    ]);
  });

  it('explains why files were skipped', () => {
    const result = layout.interpret(
      files(
        'notes.txt',
        'Mug.png',
        '05 Lamp.png',
        '0 Mug.png',
        '1000 Mug.png',
        '.png',
        'README',
        'Extras/Mug.png',
        '01. Tulip/Lamp.png',
        '01. Tulip/old/Mug.png',
        '01. Tulip/.DS_Store',
        '01. Tulip/../Mug.png',
        '01. Tulip\\Mug.png',
        '01. Tulip//Mug.png',
      ),
      SHARED,
    );

    expect(result.planned).toEqual([]);
    expect(result.skipped).toEqual([
      { relativePath: '.png', reason: 'unsupported-extension' },
      { relativePath: '0 Mug.png', reason: 'missing-concept-number' },
      { relativePath: '01. Tulip/../Mug.png', reason: 'invalid-path' },
      { relativePath: '01. Tulip/.DS_Store', reason: 'unsupported-extension' },
      { relativePath: '01. Tulip//Mug.png', reason: 'invalid-path' },
      { relativePath: '01. Tulip/Lamp.png', reason: 'unknown-family' },
      { relativePath: '01. Tulip/old/Mug.png', reason: 'too-deep' },
      { relativePath: '01. Tulip\\Mug.png', reason: 'invalid-path' },
      { relativePath: '05 Lamp.png', reason: 'unknown-family' },
      { relativePath: '1000 Mug.png', reason: 'missing-concept-number' },
      { relativePath: 'Extras/Mug.png', reason: 'missing-concept-number' },
      { relativePath: 'Mug.png', reason: 'missing-concept-number' },
      { relativePath: 'README', reason: 'unsupported-extension' },
      { relativePath: 'notes.txt', reason: 'unsupported-extension' },
    ]);
  });

  it('skips every file that would produce the same design key', () => {
    const result = layout.interpret(
      files(
        '01. Tulip/Mug.png',
        '01. Tulip/Kupa.png',
        '01. Tulip/Decke.png',
        '1 Tasse.png',
        '001-mug.jpg',
      ),
      SHARED,
    );

    expect(result.planned.map((item) => item.designKey)).toEqual(['01-blanket']);
    expect(result.skipped).toEqual([
      { relativePath: '001-mug.jpg', reason: 'duplicate-design-key' },
      { relativePath: '01. Tulip/Kupa.png', reason: 'duplicate-design-key' },
      { relativePath: '01. Tulip/Mug.png', reason: 'duplicate-design-key' },
      { relativePath: '1 Tasse.png', reason: 'duplicate-design-key' },
    ]);
  });

  it('skips a concept number used by folders with different names', () => {
    const result = layout.interpret(
      files('01. Tulip/Mug.png', '1 Winter/Decke.png', '02-mug.png'),
      SHARED,
    );

    expect(result.planned.map((item) => item.designKey)).toEqual(['02-mug']);
    expect(result.skipped).toEqual([
      { relativePath: '01. Tulip/Mug.png', reason: 'conflicting-concept-name' },
      { relativePath: '1 Winter/Decke.png', reason: 'conflicting-concept-name' },
    ]);
  });
});
