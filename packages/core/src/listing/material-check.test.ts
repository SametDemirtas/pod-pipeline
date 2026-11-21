import { describe, expect, it } from 'vitest';
import { inventedMaterials } from './material-check.js';

const SILK_TOUCH = '100% polyester, silk-touch';

describe('inventedMaterials', () => {
  it('names fabrics the product facts do not state', () => {
    expect(
      inventedMaterials(
        'A cosy fleece-style throw, soft as Sherpa, with a minky back.',
        SILK_TOUCH,
        'en-US',
      ),
    ).toEqual(['fleece', 'Sherpa', 'minky']);
  });

  it('lets the materials the facts state stand, in any form of their words', () => {
    expect(inventedMaterials('A silk-touch throw of 100% polyester.', SILK_TOUCH, 'en-US')).toEqual(
      [],
    );
    expect(inventedMaterials('Soft cotton tee.', 'Cotton jersey', 'en')).toEqual([]);
  });

  it('knows the words of the listing’s language and joined German nouns', () => {
    expect(inventedMaterials('Eine kuschelige Fleecedecke.', SILK_TOUCH, 'de')).toEqual([
      'Fleecedecke',
    ]);
    expect(inventedMaterials('Eine Decke aus Baumwolle.', SILK_TOUCH, 'de-DE')).toEqual([
      'Baumwolle',
    ]);
    expect(inventedMaterials('Une couverture en laine.', SILK_TOUCH, 'fr')).toEqual(['laine']);
    expect(inventedMaterials('Yumuşak polar battaniye.', SILK_TOUCH, 'tr')).toEqual(['polar']);
  });

  it('takes facts written in another language than the text', () => {
    expect(inventedMaterials('Ein Shirt aus Baumwolle.', '100% cotton', 'de')).toEqual([]);
  });

  it('leaves words alone that only start like a material or mean something else', () => {
    expect(inventedMaterials('A polar bear on a line of washing.', '', 'en')).toEqual([]);
    expect(inventedMaterials('Für alle, die es gemütlich haben wollen.', '', 'de')).toEqual([]);
  });

  it('leaves alone words that only share a material’s spelling in another sense', () => {
    expect(inventedMaterials('Un ours polaire sur une chenille verte.', '', 'fr')).toEqual([]);
    expect(inventedMaterials('Een kussen, aan één zijde bedrukt.', '', 'nl')).toEqual([]);
    expect(inventedMaterials('Ein Seidel für Bier.', '', 'de')).toEqual([]);
    expect(inventedMaterials('Une couverture polaire douce.', '', 'fr')).toEqual([
      'couverture polaire',
    ]);
  });

  it('lets the design’s own words name a material', () => {
    expect(
      inventedMaterials('Cotton Candy Dreams blanket.', SILK_TOUCH, 'en', ['Cotton Candy Dreams']),
    ).toEqual([]);
  });
});
